import { TimelineState } from 'superfly-timeline'
import {
	DeviceOptionsM2LX,
	DeviceType,
	MappingM2LX,
	MappingM2LXType,
	Mappings,
	M2LXOptions,
	M2LXTransitionType,
	ResolvedTimelineObjectInstanceExtended,
	TimelineContentTypeM2LX,
	TimelineObjM2LXAny,
	M2LXKeyType,
} from 'timeline-state-resolver-types'
import { DeviceStatus, DeviceWithState, StatusCode } from '../../devices/device'
import { DoOnTime, SendMode } from '../../devices/doOnTime'
import { IM2LXConnection, M2LXConnection, M2LX_AUTH_RENEWAL_MARGIN } from './connection'
import { M2LXCommand, M2LXSetKeyCommand } from './protocol'
import {
	assertNativeTransitionAutoPlayDisabled,
	diffM2LXStates,
	keyStateId,
	M2LXCommandWithContext,
	M2LXState,
	resourceStateId,
} from './state'

export interface DeviceOptionsM2LXInternal extends DeviceOptionsM2LX {
	connection?: IM2LXConnection
}

export class M2LXDevice extends DeviceWithState<M2LXState, DeviceOptionsM2LXInternal> {
	private readonly _doOnTime: DoOnTime
	private _connection?: IM2LXConnection
	private _initialized = false
	/** Production activity is a lifecycle decision, not whether mappings or commands happen to be present. */
	private _productionActive = false
	private _preparingForProduction?: Promise<void>
	private _commandGeneration = 0

	constructor(deviceId: string, deviceOptions: DeviceOptionsM2LXInternal, getCurrentTime: () => Promise<number>) {
		super(deviceId, deviceOptions, getCurrentTime)
		this._connection = deviceOptions.connection
		this._doOnTime = new DoOnTime(() => this.getCurrentTime(), SendMode.IN_ORDER, this._deviceOptions)
		this.handleDoOnTime(this._doOnTime, 'M2L-X')
	}

	async init(options: M2LXOptions): Promise<boolean> {
		if (!options?.baseUrl) throw new Error('M2L-X baseUrl is required')
		if (!options.password) throw new Error('M2L-X password is required')

		this._connection = this._connection ?? new M2LXConnection(options)
		this._connection.on('connected', () => {
			this._initialized = true
			this._commandGeneration++
			this._doOnTime.clearQueueNowAndAfter(0)
			this.clearStates()
			this.emit('connectionChanged', this.getStatus())
			this.emit('resetResolver')
		})
		this._connection.on('disconnected', (reason) => {
			this._initialized = false
			this._commandGeneration++
			this._doOnTime.clearQueueNowAndAfter(0)
			this.emit('warning', reason)
			this.emit('connectionChanged', this.getStatus())
		})
		this._connection.on('error', (error) => this.emit('error', 'M2LXConnection', error))
		this._connection.on('authenticationChanged', () => this.emit('connectionChanged', this.getStatus()))
		let playerErrors = '[]'
		this._connection.on('stateChanged', () => {
			const next = JSON.stringify(this._playerErrorMessages())
			if (next !== playerErrors) {
				playerErrors = next
				this.emit('connectionChanged', this.getStatus())
			}
		})

		await this._connection.connect()
		this._initialized = true
		return true
	}

	prepareForHandleState(newStateTime: number): void {
		this._doOnTime.clearQueueNowAndAfter(newStateTime)
		this.cleanUpStates(0, newStateTime)
	}

	handleState(newState: TimelineState, newMappings: Mappings): void {
		super.onHandleState(newState, newMappings)
		if (!this._initialized || !this._connection?.connected) {
			this.emit('warning', 'M2L-X is not ready')
			return
		}

		const mappings = this._filterMappings(newMappings)
		const previousStateTime = Math.max(this.getCurrentTime(), newState.time)
		const oldState = this.getStateBefore(previousStateTime)?.state ?? this._stateFromObserved(mappings)
		const nextState = this._convertTimelineState(newState, mappings)
		const target = nextState.mixer?.program
		if (
			target &&
			target !== oldState.mixer?.program &&
			oldState.mixer?.program !== undefined &&
			nextState.mixer?.transition === 'effect' &&
			nextState.players?.[target] &&
			this._connection.state.transition?.effect?.autoPlayEnabled !== false
		) {
			assertNativeTransitionAutoPlayDisabled(this._connection.state)
		}
		const commands = diffM2LXStates(oldState, nextState)

		this._doOnTime.clearQueueNowAndAfter(previousStateTime)
		const generation = this._commandGeneration
		let validated = false
		for (const command of commands) {
			// Keep predicates inside the worker; queue arguments cross the thread boundary.
			this._doOnTime.queue(
				newState.time,
				undefined,
				async () => {
					if (generation !== this._commandGeneration) {
						throw new Error('M2L-X scheduled command invalidated by a previous failure or lifecycle change')
					}
					try {
						if (!validated) {
							for (const entry of commands) this._validateCommand(entry.command, false)
							validated = true
						}
						await this._sendCommand(command, generation)
					} catch (error) {
						if (generation === this._commandGeneration) {
							this._commandGeneration++
							this._doOnTime.clearQueueNowAndAfter(0)
							this.clearStates()
						}
						throw error
					}
				},
				{ command: command.command, context: command.context, timelineObjId: command.timelineObjId }
			)
		}
		this.setState(nextState, newState.time)
	}

	clearFuture(clearAfterTime: number): void {
		this._doOnTime.clearQueueAfter(clearAfterTime)
	}

	async makeReady(_okToDestroyStuff?: boolean, _activeRundownId?: string): Promise<void> {
		if (!this._connection) throw new Error('M2L-X connection is not initialized')
		if (!this._preparingForProduction) {
			this._preparingForProduction = this._connection
				.ensureFreshAuthentication(!this._productionActive)
				.then(() => {
					this._productionActive = true
					this.emit('connectionChanged', this.getStatus())
				})
				.finally(() => {
					this._preparingForProduction = undefined
				})
		}
		await this._preparingForProduction
	}

	async standDown(_okToDestroyStuff?: boolean): Promise<void> {
		this._commandGeneration++
		this._doOnTime.clearQueueNowAndAfter(0)
		try {
			if (this._preparingForProduction) await this._preparingForProduction
		} finally {
			this._commandGeneration++
			this._doOnTime.clearQueueNowAndAfter(0)
			this.clearStates()
			this._productionActive = false
		}
	}

	async terminate(): Promise<boolean> {
		this._initialized = false
		this._commandGeneration++
		this._doOnTime.dispose()
		await this._connection?.disconnect()
		return true
	}

	getStatus(): DeviceStatus {
		const connected = this._initialized && this._connection?.connected
		const expiresAt = this._connection?.tokenExpiresAt
		const messages: string[] = []
		let statusCode = connected ? StatusCode.GOOD : StatusCode.BAD
		if (!connected) {
			messages.push('Not connected or waiting for M2L-X video status')
		} else if (expiresAt === undefined) {
			statusCode = StatusCode.WARNING_MAJOR
			messages.push('M2L-X token expiry is unknown; authenticate before the next activation')
		} else if (expiresAt <= Date.now()) {
			statusCode = StatusCode.BAD
			messages.push('M2L-X access token has expired; stand down before renewing the connection')
		} else if (expiresAt - Date.now() <= M2LX_AUTH_RENEWAL_MARGIN) {
			statusCode = StatusCode.WARNING_MAJOR
			messages.push('M2L-X access token expires soon; renewal is deferred until an inactive activation boundary')
		}
		if (connected) {
			const playerErrors = this._playerErrorMessages()
			if (playerErrors.length && statusCode === StatusCode.GOOD) statusCode = StatusCode.WARNING_MAJOR
			messages.push(...playerErrors)
		}
		return {
			statusCode,
			messages,
			active: this.isActive,
		}
	}

	get canConnect(): boolean {
		return true
	}

	get connected(): boolean {
		return this._connection?.connected ?? false
	}

	get deviceType(): DeviceType.M2LX {
		return DeviceType.M2LX
	}

	get deviceName(): string {
		return `Sony M2L-X ${this.deviceId}`
	}

	get queue() {
		return this._doOnTime.getQueue()
	}

	private _filterMappings(mappings: Mappings): Record<string, MappingM2LX> {
		const filtered: Record<string, MappingM2LX> = {}
		for (const layer of Object.keys(mappings)) {
			const mapping = mappings[layer]
			if (mapping.device === DeviceType.M2LX && mapping.deviceId === this.deviceId) {
				filtered[layer] = mapping as MappingM2LX
			}
		}
		return filtered
	}

	private _playerErrorMessages(): string[] {
		const messages: string[] = []
		for (const [node, player] of Object.entries(this._connection?.state.players ?? {})) {
			const error = player.error
			if (error && (error.code || (error.severity && error.severity !== 'none'))) {
				messages.push(`M2L-X player ${node}: ${error.code} ${error.message} (${error.severity})`)
			}
		}
		return messages
	}

	private _stateFromObserved(mappings: Record<string, MappingM2LX>): M2LXState {
		const observed = this._connection?.state
		const state: M2LXState = {
			mixer:
				observed?.program || observed?.preview
					? {
							program: observed.program,
							preview: observed.preview,
							effect: observed.transition?.effect,
							timelineObjId: '',
					  }
					: undefined,
			keys: {},
		}
		for (const mapping of Object.values(mappings)) {
			if (mapping.mappingType === MappingM2LXType.KEY) {
				const key =
					mapping.key.type === M2LXKeyType.DSK
						? observed?.downstreamKeys?.[mapping.bus][mapping.key.index]
						: observed?.keys[mapping.bus][mapping.key.index]
				const { source, sourceType, ...properties } = key ?? { visible: false }
				state.keys[keyStateId(mapping.bus, mapping.key.index, mapping.key.type === M2LXKeyType.DSK)] = {
					...properties,
					index: mapping.key.index,
					...(source !== undefined && sourceType ? { source: { name: source, type: sourceType } } : {}),
					keyType: mapping.key.type,
					bus: mapping.bus,
					timelineObjId: '',
				}
			} else if (mapping.mappingType === MappingM2LXType.AUDIO) {
				const node = mapping.node ?? 'audio_mixer'
				state.audio = state.audio ?? {}
				state.audio[resourceStateId(node, mapping.input)] = {
					...observed?.audio?.[node]?.[mapping.input],
					node,
					input: mapping.input,
					timelineObjId: '',
				}
			} else if (mapping.mappingType === MappingM2LXType.MEDIA_PLAYER) {
				const player = observed?.players?.[mapping.player]
				state.players = state.players ?? {}
				state.players[mapping.player] = {
					assetId: player?.loaded ? player.assetId : null,
					playing: player?.playing,
					loop: player?.loop,
					seek: player?.time,
					timelineObjId: '',
				}
			} else if (mapping.mappingType === MappingM2LXType.ROUTER) {
				const node = mapping.node ?? 'router'
				const input = observed?.routers?.[node]?.[mapping.output]
				if (input !== undefined) {
					state.routers = state.routers ?? {}
					state.routers[resourceStateId(node, mapping.output)] = {
						node,
						output: mapping.output,
						input,
						timelineObjId: '',
					}
				}
			}
		}
		return state
	}

	private _convertTimelineState(state: TimelineState, mappings: Record<string, MappingM2LX>): M2LXState {
		const result: M2LXState = { keys: {} }
		// The program of a lookahead mixer object is what comes next, so it is parked on preview.
		let lookaheadPreview: string | undefined

		for (const mapping of Object.values(mappings)) {
			if (mapping.mappingType === MappingM2LXType.KEY) {
				result.keys[keyStateId(mapping.bus, mapping.key.index, mapping.key.type === M2LXKeyType.DSK)] = {
					index: mapping.key.index,
					visible: false,
					keyType: mapping.key.type,
					bus: mapping.bus,
					timelineObjId: '',
				}
			}
		}

		for (const [layer, timelineObject] of Object.entries(state.layers)) {
			const timelineObjectExt = timelineObject as ResolvedTimelineObjectInstanceExtended
			const isLookahead = !!timelineObjectExt.isLookahead
			let mapping = mappings[layer]
			if (!mapping && isLookahead && timelineObjectExt.lookaheadForLayer) {
				mapping = mappings[timelineObjectExt.lookaheadForLayer]
			}
			if (!mapping) continue
			if (timelineObject.content.deviceType !== DeviceType.M2LX) continue
			const content = timelineObject.content as TimelineObjM2LXAny['content']

			if (mapping.mappingType === MappingM2LXType.MIXER && content.type === TimelineContentTypeM2LX.MIXER) {
				if (isLookahead) {
					lookaheadPreview = content.mixer.program ?? lookaheadPreview
					continue
				}
				result.mixer = {
					program: content.mixer.program,
					preview: content.mixer.preview,
					transition: content.mixer.transition?.type === M2LXTransitionType.EFFECT ? 'effect' : 'cut',
					effect: content.mixer.transition?.effect,
					timelineObjId: timelineObject.id,
				}
			} else if (
				mapping.mappingType === MappingM2LXType.KEY &&
				content.type === TimelineContentTypeM2LX.KEY &&
				!isLookahead
			) {
				result.keys[keyStateId(mapping.bus, mapping.key.index, mapping.key.type === M2LXKeyType.DSK)] = {
					...content.key,
					index: mapping.key.index,
					keyType: mapping.key.type,
					bus: mapping.bus,
					timelineObjId: timelineObject.id,
				}
			} else if (
				!isLookahead &&
				mapping.mappingType === MappingM2LXType.AUDIO &&
				content.type === TimelineContentTypeM2LX.AUDIO
			) {
				const node = mapping.node ?? 'audio_mixer'
				const id = resourceStateId(node, mapping.input)
				result.audio = result.audio ?? {}
				if (result.audio[id]) throw new Error(`Multiple M2L-X audio objects control ${node}/${mapping.input}`)
				result.audio[id] = { ...content.audio, node, input: mapping.input, timelineObjId: timelineObject.id }
			} else if (
				!isLookahead &&
				mapping.mappingType === MappingM2LXType.MEDIA_PLAYER &&
				content.type === TimelineContentTypeM2LX.MEDIA_PLAYER
			) {
				result.players = result.players ?? {}
				if (result.players[mapping.player])
					throw new Error(`Multiple M2L-X objects control media player ${mapping.player}`)
				const player = content.mediaPlayer
				result.players[mapping.player] = {
					...player,
					...(typeof player.assetId === 'string'
						? { playing: player.playing ?? false, loop: player.loop ?? false }
						: {}),
					timelineObjId: timelineObject.id,
					instanceStart: timelineObject.instance.start,
				}
			} else if (
				!isLookahead &&
				mapping.mappingType === MappingM2LXType.ROUTER &&
				content.type === TimelineContentTypeM2LX.ROUTER
			) {
				const node = mapping.node ?? 'router'
				const id = resourceStateId(node, mapping.output)
				result.routers = result.routers ?? {}
				if (result.routers[id]) throw new Error(`Multiple M2L-X routing objects control ${node}/${mapping.output}`)
				result.routers[id] = { node, output: mapping.output, input: content.input, timelineObjId: timelineObject.id }
			}
		}

		if (lookaheadPreview !== undefined) {
			if (!result.mixer) {
				result.mixer = { preview: lookaheadPreview, timelineObjId: '' }
			} else if (result.mixer.preview === undefined) {
				result.mixer.preview = lookaheadPreview
			}
		}

		return result
	}

	private async _sendCommand(command: M2LXCommandWithContext, generation: number): Promise<void> {
		if (!this._connection) throw new Error('M2L-X connection is not initialized')
		if (this._preparingForProduction) await this._preparingForProduction
		if (generation !== this._commandGeneration) {
			throw new Error('M2L-X scheduled command invalidated during production preparation')
		}
		this._productionActive = true
		this._validateCommand(command.command)
		this.emitDebug({
			context: command.context,
			timelineObjId: command.timelineObjId,
			command: command.command,
		})
		await this._connection.sendCommand(command.command, command)
	}

	private _assertKnownSource(source: string): void {
		if (!this._connection?.sources.has(source)) {
			throw new Error(`Unknown M2L-X video source "${source}"`)
		}
	}

	private _validateCommand(command: M2LXCommand, checkReadiness = true): void {
		const capabilities = this._connection?.capabilities
		switch (command.command) {
			case 'set_input_property':
				this._assertKnownSource(command.args.property.value)
				break
			case 'set_key_property':
				if (command.args.property.name === 'video' && command.args.property.value) {
					this._assertKnownSource(command.args.property.value)
				}
				if (checkReadiness) this._assertKeyHasSource(command)
				break
			case 'set_input_volume':
			case 'set_input_muted': {
				const audio = capabilities?.audio[command.node]
				for (const input of command.args) {
					if (!audio?.inputs.has(input.name))
						throw new Error(`Unknown M2L-X basic audio input ${command.node}/${input.name}`)
					if ('volume' in input && input.volume > audio.maximumVolume) {
						throw new Error(`M2L-X input volume exceeds configured maximum ${audio.maximumVolume}`)
					}
				}
				break
			}
			case 'connect': {
				const router = capabilities?.routers[command.node]
				if (!router?.inputs.has(command.args.input) || !router.outputs.has(command.args.output)) {
					throw new Error(`Unknown M2L-X route ${command.node}: ${command.args.input} -> ${command.args.output}`)
				}
				break
			}
			case 'load':
			case 'unload':
			case 'play':
			case 'pause':
			case 'seek':
			case 'set_loop_enabled': {
				if (!capabilities?.players.has(command.node)) throw new Error(`Unknown M2L-X media player ${command.node}`)
				if (!checkReadiness) break
				const player = this._connection?.state.players?.[command.node]
				if (['play', 'seek', 'set_loop_enabled'].includes(command.command) && !player?.loaded) {
					throw new Error(`M2L-X player ${command.node} has no loaded asset`)
				}
				if (command.command === 'seek' && (player?.duration === undefined || command.args.time >= player.duration)) {
					throw new Error(`M2L-X seek time must be less than the loaded duration for ${command.node}`)
				}
				break
			}
		}
	}

	/** The device answers 200 OK but silently ignores visibility changes on keys without a source. */
	private _assertKeyHasSource(command: M2LXSetKeyCommand): void {
		if (command.args.property.name !== 'visible' || command.args.property.value !== true) return
		const state = this._connection?.state
		const key =
			command.args.key_type === 'downstream'
				? state?.downstreamKeys?.[command.args.target][command.args.key_index]
				: state?.keys[command.args.target][command.args.key_index]
		if (!key || key.source === '') {
			throw new Error(
				`M2L-X ${command.args.key_type} key ${command.args.key_index} on ${command.args.target} has no source configured`
			)
		}
	}
}
