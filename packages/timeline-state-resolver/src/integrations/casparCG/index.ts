import * as _ from 'underscore'
import * as deepMerge from 'deepmerge'
import { DeviceWithState, CommandWithContext, DeviceStatus, StatusCode, literal } from '../../devices/device'
import { AMCPCommand, BasicCasparCGAPI, Commands, Response } from 'casparcg-connection'
import {
	DeviceType,
	TimelineContentTypeCasparCg,
	MappingCasparCG,
	CasparCGOptions,
	TimelineObjCCGMedia,
	TimelineObjCCGHTMLPage,
	TimelineObjCCGRoute,
	TimelineObjCCGInput,
	TimelineObjCCGRecord,
	TimelineObjCCGTemplate,
	TimelineObjCCGProducerContentBase,
	ResolvedTimelineObjectInstanceExtended,
	TimelineObjCCGIP,
	DeviceOptionsCasparCG,
	Mappings,
} from 'timeline-state-resolver-types'

import { TimelineState, ResolvedTimelineObjectInstance } from 'superfly-timeline'
import {
	CasparCGState,
	AMCPCommandWithContext,
	LayerBase,
	MediaLayer,
	InputLayer,
	TemplateLayer,
	HtmlPageLayer,
	RouteLayer,
	RecordLayer,
	EmptyLayer,
	LayerContentType,
	TransitionObject,
	State,
	NextUp,
	Transition as StateTransition,
	Mixer,
} from 'casparcg-state'
import { InternalState } from 'casparcg-state/dist/lib/stateObjectStorage'
import { DoOnTime, SendMode } from '../../devices/doOnTime'
import * as request from 'request'
import { InternalTransitionHandler } from '../../devices/transitions/transitionHandler'
import Debug from 'debug'
import { endTrace, startTrace } from '../../lib'
const debug = Debug('timeline-state-resolver:casparcg')

const MEDIA_RETRY_INTERVAL = 10 * 1000 // default time in ms between checking whether a file needs to be retried loading

export interface DeviceOptionsCasparCGInternal extends DeviceOptionsCasparCG {
	commandReceiver?: CommandReceiver
	/** Allow skipping the resync upon connection, for unit tests */
	skipVirginCheck?: boolean
}
export type CommandReceiver = (time: number, cmd: AMCPCommand, context: string, timelineObjId: string) => Promise<any>
/**
 * This class is used to interface with CasparCG installations. It creates
 * device states from timeline states and then diffs these states to generate
 * commands. It depends on the DoOnTime class to execute the commands timely or,
 * optionally, uses the CasparCG command scheduling features.
 */
export class CasparCGDevice extends DeviceWithState<State, DeviceOptionsCasparCGInternal> {
	private _ccg: BasicCasparCGAPI
	private _commandReceiver: CommandReceiver
	private _doOnTime: DoOnTime
	private initOptions?: CasparCGOptions
	private _connected = false
	private _queueOverflow = false
	private _transitionHandler: InternalTransitionHandler = new InternalTransitionHandler()
	private _retryTimeout: NodeJS.Timeout
	private _retryTime: number | null = null
	private _currentState: InternalState = { channels: {} }

	constructor(deviceId: string, deviceOptions: DeviceOptionsCasparCGInternal, getCurrentTime: () => Promise<number>) {
		super(deviceId, deviceOptions, getCurrentTime)

		if (deviceOptions.options) {
			if (deviceOptions.commandReceiver) this._commandReceiver = deviceOptions.commandReceiver
			else this._commandReceiver = this._defaultCommandReceiver.bind(this)
		}

		this._doOnTime = new DoOnTime(
			() => {
				return this.getCurrentTime()
			},
			SendMode.BURST,
			this._deviceOptions
		)
		this.handleDoOnTime(this._doOnTime, 'CasparCG')
	}

	/**
	 * Initiates the connection with CasparCG through the ccg-connection lib and
	 * initializes CasparCG State library.
	 */
	async init(initOptions: CasparCGOptions): Promise<boolean> {
		this.initOptions = initOptions
		this._ccg = new BasicCasparCGAPI({
			host: initOptions.host,
			port: initOptions.port,
		})

		this._ccg.on('connect', () => {
			this.makeReady(false) // always make sure timecode is correct, setting it can never do bad
				.catch((e) => this.emit('error', 'casparCG.makeReady', e))

			Promise.resolve()
				.then(async () => {
					if (this.deviceOptions.skipVirginCheck) return false

					// a "virgin server" was just restarted (so it is cleared & black).
					// Otherwise it was probably just a loss of connection

					const { error, request } = await this._ccg.executeCommand({ command: Commands.Info, params: {} })
					if (error) return true

					const response = await request

					const channelPromises: Promise<Response>[] = []
					const channelLength: number = response?.data?.['length'] ?? 0

					// Issue commands
					for (let i = 1; i <= channelLength; i++) {
						// 1-based index for channels

						const { error, request } = await this._ccg.executeCommand({
							command: Commands.Info,
							params: { channel: i },
						})
						if (error) {
							// We can't return here, as that will leave anything in channelPromises as potentially unhandled
							channelPromises.push(Promise.reject('execute failed'))
							break
						}
						channelPromises.push(request)
					}

					// Wait for all commands
					const channelResults = await Promise.all(channelPromises)

					// Resync if all channels have no stage object (no possibility of anything playing)
					return !channelResults.find((ch) => ch.data['stage'])
				})
				.catch((e) => {
					this.emit('error', 'connect virgin check failed', e)
					// Something failed, force the resync as glitching playback is better than black output
					return true
				})
				.then((doResync) => {
					// Finally we can report it as connected
					this._connected = true
					this._connectionChanged()

					if (doResync) {
						this._currentState = { channels: {} }
						this.clearStates()
						this.emit('resetResolver')
					}
				})
				.catch((e) => {
					this.emit('error', 'connect state resync failed', e)
					// Some unknwon error occured, report the connection as failed
					this._connected = false
					this._connectionChanged()
				})
		})

		this._ccg.on('disconnect', () => {
			this._connected = false
			this._connectionChanged()
		})

		const { error, request } = await this._ccg.executeCommand({ command: Commands.Info, params: {} })
		if (error) {
			return false // todo - should this throw?
		}
		const response = await request

		if (response?.data[0]) {
			response.data.forEach((obj) => {
				this._currentState.channels[obj.channel] = {
					channelNo: obj.channel,
					videoMode: obj.format.toUpperCase(),
					fps: obj.frameRate,
					layers: {},
				}
			})
		} else {
			return false // not being able to get channel count is a problem for us
		}

		if (typeof initOptions.retryInterval === 'number' && initOptions.retryInterval >= 0) {
			this._retryTime = initOptions.retryInterval || MEDIA_RETRY_INTERVAL
			this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime)
		}

		return true
	}

	/**
	 * Terminates the device safely such that things can be garbage collected.
	 */
	async terminate(): Promise<boolean> {
		this._doOnTime.dispose()
		this._transitionHandler.terminate()
		clearTimeout(this._retryTimeout)
		return new Promise((resolve) => {
			if (!this._ccg) {
				resolve(true)
				return
			}
			this._ccg.disconnect()
			this._ccg.once('disconnect', () => {
				resolve(true)
			})
		})
	}
	/** Called by the Conductor a bit before a .handleState is called */
	prepareForHandleState(newStateTime: number) {
		// Clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(newStateTime)
		this.cleanUpStates(0, newStateTime)
	}
	/**
	 * Generates an array of CasparCG commands by comparing the newState against the oldState, or the current device state.
	 */
	handleState(newState: TimelineState, newMappings: Mappings) {
		super.onHandleState(newState, newMappings)

		const previousStateTime = Math.max(this.getCurrentTime(), newState.time)

		const oldCasparState = (this.getStateBefore(previousStateTime) || { state: { channels: {} } }).state

		const convertTrace = startTrace(`device:convertState`, { deviceId: this.deviceId })
		const newCasparState = this.convertStateToCaspar(newState, newMappings)
		this.emit('timeTrace', endTrace(convertTrace))

		const diffTrace = startTrace(`device:diffState`, { deviceId: this.deviceId })
		const commandsToAchieveState = CasparCGState.diffStatesOrderedCommands(
			oldCasparState as InternalState,
			newCasparState,
			newState.time
		)
		this.emit('timeTrace', endTrace(diffTrace))

		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(previousStateTime)

		// add the new commands to the queue:
		this._addToQueue(commandsToAchieveState, newState.time)

		// store the new state, for later use:
		this.setState(newCasparState, newState.time)
	}

	/**
	 * Clear any scheduled commands after this time
	 * @param clearAfterTime
	 */
	clearFuture(clearAfterTime: number) {
		this._doOnTime.clearQueueAfter(clearAfterTime)
	}
	get canConnect(): boolean {
		return true
	}
	get connected(): boolean {
		// Returns connection status
		return this._ccg ? this._ccg.connected : false
	}

	get deviceType() {
		return DeviceType.CASPARCG
	}
	get deviceName(): string {
		if (this._ccg) {
			return 'CasparCG ' + this.deviceId + ' ' + this._ccg.host + ':' + this._ccg.port
		} else {
			return 'Uninitialized CasparCG ' + this.deviceId
		}
	}

	private convertObjectToCasparState(
		mappings: Mappings,
		layer: ResolvedTimelineObjectInstance,
		mapping: MappingCasparCG,
		isForeground: boolean
	): LayerBase {
		let startTime = layer.instance.originalStart || layer.instance.start
		if (startTime === 0) startTime = 1 // @todo: startTime === 0 will make ccg-state seek to the current time

		let stateLayer: LayerBase | null = null
		if (layer.content.type === TimelineContentTypeCasparCg.MEDIA) {
			const mediaObj = layer as any as TimelineObjCCGMedia

			const holdOnFirstFrame = !isForeground || mediaObj.isLookahead
			const loopingPlayTime =
				mediaObj.content.loop && !mediaObj.content.seek && !mediaObj.content.inPoint && !mediaObj.content.length

			stateLayer = literal<MediaLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.MEDIA,
				media: mediaObj.content.file,
				playTime: !holdOnFirstFrame && (mediaObj.content.noStarttime || loopingPlayTime) ? null : startTime,

				pauseTime: holdOnFirstFrame ? startTime : mediaObj.content.pauseTime || null,
				playing:
					!mediaObj.isLookahead && (mediaObj.content.playing !== undefined ? mediaObj.content.playing : isForeground),

				looping: mediaObj.content.loop,
				seek: mediaObj.content.seek,
				inPoint: mediaObj.content.inPoint,
				length: mediaObj.content.length,

				channelLayout: mediaObj.content.channelLayout,
				clearOn404: true,

				vfilter: mediaObj.content.videoFilter,
				afilter: mediaObj.content.audioFilter,
			})
			// this.emitDebug(stateLayer)
		} else if (layer.content.type === TimelineContentTypeCasparCg.IP) {
			const ipObj = layer as any as TimelineObjCCGIP

			stateLayer = literal<MediaLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.MEDIA,
				media: ipObj.content.uri,
				channelLayout: ipObj.content.channelLayout,
				playTime: null, // ip inputs can't be seeked // layer.resolved.startTime || null,
				playing: true,
				seek: 0, // ip inputs can't be seeked

				vfilter: ipObj.content.videoFilter,
				afilter: ipObj.content.audioFilter,
			})
		} else if (layer.content.type === TimelineContentTypeCasparCg.INPUT) {
			const inputObj = layer as any as TimelineObjCCGInput

			stateLayer = literal<InputLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.INPUT,
				media: 'decklink',
				input: {
					device: inputObj.content.device,
					channelLayout: inputObj.content.channelLayout,
					format: inputObj.content.deviceFormat,
				},
				playing: true,
				playTime: null,

				vfilter: inputObj.content.videoFilter || inputObj.content.filter,
				afilter: inputObj.content.audioFilter,
			})
		} else if (layer.content.type === TimelineContentTypeCasparCg.TEMPLATE) {
			const recordObj = layer as any as TimelineObjCCGTemplate

			stateLayer = literal<TemplateLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.TEMPLATE,
				media: recordObj.content.name,

				playTime: startTime || null,
				playing: true,

				templateType: recordObj.content.templateType || 'html',
				templateData: recordObj.content.data,
				cgStop: recordObj.content.useStopCommand,
			})
		} else if (layer.content.type === TimelineContentTypeCasparCg.HTMLPAGE) {
			const htmlObj = layer as any as TimelineObjCCGHTMLPage

			stateLayer = literal<HtmlPageLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.HTMLPAGE,
				media: htmlObj.content.url,

				playTime: startTime || null,
				playing: true,
			})
		} else if (layer.content.type === TimelineContentTypeCasparCg.ROUTE) {
			const routeObj = layer as any as TimelineObjCCGRoute

			if (routeObj.content.mappedLayer) {
				const routeMapping = mappings[routeObj.content.mappedLayer] as MappingCasparCG
				if (routeMapping && routeMapping.deviceId === this.deviceId) {
					routeObj.content.channel = routeMapping.channel
					routeObj.content.layer = routeMapping.layer
				}
			}
			stateLayer = literal<RouteLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.ROUTE,
				media: 'route',
				route: {
					channel: routeObj.content.channel || 0,
					layer: routeObj.content.layer,
					channelLayout: routeObj.content.channelLayout,
				},
				mode: routeObj.content.mode || undefined,
				delay: routeObj.content.delay || undefined,
				playing: true,
				playTime: null, // layer.resolved.startTime || null,

				vfilter: routeObj.content.videoFilter,
				afilter: routeObj.content.audioFilter,
			})
		} else if (layer.content.type === TimelineContentTypeCasparCg.RECORD) {
			const recordObj = layer as any as TimelineObjCCGRecord

			if (startTime) {
				stateLayer = literal<RecordLayer>({
					id: layer.id,
					layerNo: mapping.layer,
					content: LayerContentType.RECORD,
					media: recordObj.content.file,
					encoderOptions: recordObj.content.encoderOptions,
					playing: true,
					playTime: startTime,
				})
			}
		}

		// if no appropriate layer could be created, make it an empty layer
		if (!stateLayer) {
			const l: EmptyLayer = {
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.NOTHING,
				playing: false,
			}
			stateLayer = l
		} // now it holds that stateLayer is truthy

		const baseContent = layer.content as TimelineObjCCGProducerContentBase
		if (baseContent.transitions) {
			// add transitions to the layer obj
			switch (baseContent.type) {
				case TimelineContentTypeCasparCg.MEDIA:
				case TimelineContentTypeCasparCg.IP:
				case TimelineContentTypeCasparCg.TEMPLATE:
				case TimelineContentTypeCasparCg.INPUT:
				case TimelineContentTypeCasparCg.ROUTE:
				case TimelineContentTypeCasparCg.HTMLPAGE: {
					// create transition object
					const media = stateLayer.media
					const transitions = {} as any
					if (baseContent.transitions.inTransition) {
						transitions.inTransition = new StateTransition(baseContent.transitions.inTransition)
					}
					if (baseContent.transitions.outTransition) {
						transitions.outTransition = new StateTransition(baseContent.transitions.outTransition)
					}
					// todo - not a fan of this type assertion but think it's ok
					stateLayer.media = new TransitionObject(media as string, {
						inTransition: transitions.inTransition,
						outTransition: transitions.outTransition,
					})
					break
				}
				default:
					// create transition using mixer
					break
			}
		}
		if (layer.content.mixer) {
			// add mixer properties
			// just pass through values here:
			const mixer: Mixer = {}
			_.each(layer.content.mixer, (value, property) => {
				mixer[property] = value
			})
			stateLayer.mixer = mixer
		}

		stateLayer.layerNo = mapping.layer
		return stateLayer
	}

	/**
	 * Takes a timeline state and returns a CasparCG State that will work with the state lib.
	 * @param timelineState The timeline state to generate from.
	 */
	convertStateToCaspar(timelineState: TimelineState, mappings: Mappings): State {
		const caspar: State = {
			channels: {},
		}

		_.each(mappings, (foundMapping, layerName) => {
			if (
				foundMapping &&
				foundMapping.device === DeviceType.CASPARCG &&
				foundMapping.deviceId === this.deviceId &&
				_.has(foundMapping, 'channel') &&
				_.has(foundMapping, 'layer')
			) {
				const mapping = foundMapping as MappingCasparCG
				mapping.channel = mapping.channel || 0
				mapping.layer = mapping.layer || 0

				// create a channel in state if necessary, or reuse existing channel
				const channel = caspar.channels[mapping.channel] || { channelNo: mapping.channel, layers: {} }
				channel.channelNo = Number(mapping.channel) || 1
				channel.fps = this.initOptions ? this.initOptions.fps || 25 : 25
				caspar.channels[channel.channelNo] = channel

				// @todo: check if we need to get fps.
				channel.fps = this.initOptions ? this.initOptions.fps || 25 : 25
				caspar.channels[mapping.channel] = channel

				let foregroundObj = timelineState.layers[layerName] as ResolvedTimelineObjectInstance | undefined
				let backgroundObj = _.last(
					_.filter(timelineState.layers, (obj) => {
						// Takes the last one, to be consistent with previous behaviour
						const objExt = obj as ResolvedTimelineObjectInstanceExtended
						return !!objExt.isLookahead && objExt.lookaheadForLayer === layerName
					})
				)

				// If lookahead is on the same layer, then ensure objects are treated as such
				if (foregroundObj && (foregroundObj as ResolvedTimelineObjectInstanceExtended).isLookahead) {
					backgroundObj = foregroundObj
					foregroundObj = undefined
				}

				// create layer of appropriate type
				const foregroundStateLayer = foregroundObj
					? this.convertObjectToCasparState(mappings, foregroundObj, mapping, true)
					: undefined
				const backgroundStateLayer = backgroundObj
					? this.convertObjectToCasparState(mappings, backgroundObj, mapping, false)
					: undefined

				debug(
					`${layerName} (${mapping.channel}-${mapping.layer}): FG keys: ${Object.entries(foregroundStateLayer || {})
						.map((e) => e[0] + ': ' + e[1])
						.join(', ')}`
				)
				debug(
					`${layerName} (${mapping.channel}-${mapping.layer}): BG keys: ${Object.entries(backgroundStateLayer || {})
						.map((e) => e[0] + ': ' + e[1])
						.join(', ')}`
				)

				const merge = <T extends Record<string, any>>(o1: T, o2: T) => {
					const o = {
						...o1,
					}
					Object.entries(o2).forEach(([key, value]) => {
						if (value !== undefined) {
							o[key as keyof T] = value
						}
					})
					return o
				}

				if (foregroundStateLayer) {
					const currentTemplateData = (channel.layers[mapping.layer] as any as TemplateLayer | undefined)?.templateData
					const foregroundTemplateData = (foregroundStateLayer as any as TemplateLayer | undefined)?.templateData
					channel.layers[mapping.layer] = merge(channel.layers[mapping.layer], {
						...foregroundStateLayer,
						...(_.isObject(currentTemplateData) && _.isObject(foregroundTemplateData)
							? { templateData: deepMerge(currentTemplateData, foregroundTemplateData) }
							: {}),
						nextUp: backgroundStateLayer
							? merge(
									(channel.layers[mapping.layer] || {}).nextUp!,
									literal<NextUp>({
										...(backgroundStateLayer as NextUp),
										auto: false,
									})
							  )
							: undefined,
					})
				} else if (backgroundStateLayer) {
					if (mapping.previewWhenNotOnAir) {
						channel.layers[mapping.layer] = merge(channel.layers[mapping.layer], {
							...channel.layers[mapping.layer],
							...backgroundStateLayer,
							playing: false,
						})
					} else {
						channel.layers[mapping.layer] = merge(
							channel.layers[mapping.layer],
							literal<EmptyLayer>({
								id: `${backgroundStateLayer.id}_empty_base`,
								layerNo: mapping.layer,
								content: LayerContentType.NOTHING,
								playing: false,
								nextUp: literal<NextUp>({
									...(backgroundStateLayer as NextUp),
									auto: false,
								}),
							})
						)
					}
				}
			}
		})

		return caspar
	}

	/**
	 * Prepares the physical device for playout. If amcp scheduling is used this
	 * tries to sync the timecode. If {@code okToDestroyStuff === true} this clears
	 * all channels and resets our states.
	 * @param okToDestroyStuff Whether it is OK to restart the device
	 */
	async makeReady(okToDestroyStuff?: boolean): Promise<void> {
		// Sync Caspar Time to our time:
		const command = await this._ccg.executeCommand({ command: Commands.Info, params: {} })
		if (command.error) throw new Error('Could not makeReady')
		const response = await command.request
		const channels: any[] = response.data

		// Clear all channels (?)
		if (okToDestroyStuff) {
			await Promise.all(
				_.map(channels, async (channel: any) => {
					await this._commandReceiver(
						this.getCurrentTime(),
						{
							command: Commands.Clear,
							params: {
								channel: channel.channel,
							},
						},
						'makeReady and destroystuff',
						''
					)
				})
			)
		}
		// reset our own state(s):
		if (okToDestroyStuff) {
			this.clearStates()
		}
		// a resolveTimeline will be triggered later
	}

	/**
	 * Attemps to restart casparcg over the HTTP API provided by CasparCG launcher.
	 */
	async restartCasparCG(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (!this.initOptions) throw new Error('CasparCGDevice._connectionOptions is not set!')
			if (!this.initOptions.launcherHost) throw new Error('CasparCGDevice: config.launcherHost is not set!')
			if (!this.initOptions.launcherPort) throw new Error('CasparCGDevice: config.launcherPort is not set!')

			const url = `http://${this.initOptions.launcherHost}:${this.initOptions.launcherPort}/processes/casparcg/restart`
			request.post(
				url,
				{}, // json: cmd.params
				(error, response) => {
					if (error) {
						reject(error)
					} else if (response.statusCode === 200) {
						resolve()
					} else {
						reject('Bad reply: [' + response.statusCode + '] ' + response.body)
					}
				}
			)
		})
	}
	getStatus(): DeviceStatus {
		let statusCode = StatusCode.GOOD
		const messages: Array<string> = []

		if (statusCode === StatusCode.GOOD) {
			if (!this._connected) {
				statusCode = StatusCode.BAD
				messages.push(`CasparCG disconnected`)
			}
		}

		if (this._queueOverflow) {
			statusCode = StatusCode.BAD
			messages.push('Command queue overflow: CasparCG server has to be restarted')
		}

		return {
			statusCode: statusCode,
			messages: messages,
			active: this.isActive,
		}
	}
	/**
	 * Use either AMCP Command Scheduling or the doOnTime to execute commands at
	 * {@code time}.
	 * @param commandsToAchieveState Commands to be added to queue
	 * @param time Point in time to send commands at
	 */
	private _addToQueue(commandsToAchieveState: Array<AMCPCommandWithContext>, time: number) {
		_.each(commandsToAchieveState, (cmd: AMCPCommandWithContext) => {
			this._doOnTime.queue(
				time,
				undefined,
				async (c: { command: AMCPCommand; cmd: AMCPCommandWithContext }) => {
					return this._commandReceiver(time, c.command, c.cmd.context.context, c.cmd.context.layerId)
				},
				{ command: { command: cmd.command, params: cmd.params }, cmd: cmd }
			)
		})
	}
	/**
	 * Sends a command over a casparcg-connection instance
	 * @param time deprecated
	 * @param cmd Command to execute
	 */
	private async _defaultCommandReceiver(
		time: number,
		cmd: AMCPCommand,
		context: string,
		timelineObjId: string
	): Promise<any> {
		// do no retry while we are sending commands, instead always retry closely after:
		if (!context.match(/\[RETRY\]/i)) {
			clearTimeout(this._retryTimeout)
			if (this._retryTime) this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime)
		}

		const cwc: CommandWithContext = {
			context: context,
			timelineObjId: timelineObjId,
			command: JSON.stringify(cmd),
		}
		this.emitDebug(cwc)

		const { request, error } = await this._ccg.executeCommand(cmd)
		if (error) {
			this.emit('commandError', error, cwc)
		}

		try {
			const response = await request

			// I forgot what this means.. oh well... todo
			if (!response) return

			this._changeTrackedStateFromCommand(cmd, response, time)

			if (response.responseCode === 504 && !this._queueOverflow) {
				this._queueOverflow = true
				this._connectionChanged()
			} else if (this._queueOverflow) {
				this._queueOverflow = false
				this._connectionChanged()
			}

			if (response.responseCode >= 400) {
				// this is an error code:
				let errorString = `${response.responseCode} ${cmd.command} ${response.type}: ${response.type}`

				if (Object.keys(cmd.params).length) {
					errorString += ' ' + JSON.stringify(cmd.params)
				}

				this.emit('commandError', new Error(errorString), cwc)
			}
		} catch (e) {
			// This shouldn't really happen
			this.emit('commandError', Error('Command not sent: ' + e), cwc)
		}
	}

	private _changeTrackedStateFromCommand(command: AMCPCommand, response: Response, time: number) {
		if (
			response.responseCode < 300 && // TODO - maybe we accept every code except 404?
			response.command.match(/Loadbg|Play|Load|Clear|Stop|Resume/i) &&
			'channel' in command.params &&
			command.params.channel !== undefined &&
			'layer' in command.params &&
			command.params.layer !== undefined
		) {
			const currentExpectedState = this.getState(time)
			if (currentExpectedState) {
				const confirmedState = this._currentState

				const expectedChannelState = currentExpectedState.state.channels[command.params.channel]
				if (expectedChannelState) {
					let confirmedChannelState = confirmedState.channels[command.params.channel]
					if (!confirmedState.channels[command.params.channel]) {
						confirmedChannelState = confirmedState.channels[command.params.channel] = {
							channelNo: expectedChannelState.channelNo,
							fps: expectedChannelState.fps || 0,
							videoMode: expectedChannelState.videoMode || null,
							layers: {},
						}
					}

					// copy into the trackedState
					switch (command.command) {
						case Commands.Play:
						case Commands.Load:
							if (!('clip' in command.params) && !confirmedChannelState.layers[command.params.layer]?.nextUp) {
								// Ignore, no clip was loaded in confirmedChannelState
							} else {
								// a play/load command without parameters (channel/layer) is only succesful if the nextUp worked
								// a play/load command with params can always be accepted
								confirmedChannelState.layers[command.params.layer] = {
									...expectedChannelState.layers[command.params.layer],
									nextUp: undefined, // a play command always clears nextUp
								}
							}
							break
						case Commands.Loadbg:
							// only loadbg can set nextUp and nextUp can only be set by loadbg
							confirmedChannelState.layers[command.params.layer] = {
								...confirmedChannelState.layers[command.params.layer],
								nextUp: expectedChannelState.layers[command.params.layer]?.nextUp,
							}
							break
						case Commands.Stop:
							if (confirmedChannelState.layers[command.params.layer]?.nextUp?.auto) {
								// auto next + stop means bg -> fg => nextUp cleared
								confirmedChannelState.layers[command.params.layer] = {
									...expectedChannelState.layers[command.params.layer],
									nextUp: undefined, // auto next + stop means bg -> fg => nextUp cleared
								}
							} else {
								// stop does not affect nextup
								confirmedChannelState.layers[command.params.layer] = {
									...expectedChannelState.layers[command.params.layer],
									nextUp: confirmedChannelState.layers[command.params.layer]?.nextUp,
								}
							}
							break
						case Commands.Resume:
							// resume does not affect nextup
							confirmedChannelState.layers[command.params.layer] = {
								...expectedChannelState.layers[command.params.layer],
								nextUp: confirmedChannelState.layers[command.params.layer]?.nextUp,
							}
							break
						case Commands.Clear:
							// Remove both the background and foreground
							delete confirmedChannelState.layers[command.params.layer]
							break
						default: {
							// Never hit
							// const _a: never = command.params.name
							break
						}
					}
				}
			}
		}
	}

	/**
	 * This function takes the current timeline-state, and diffs it with the known
	 * CasparCG state. If any media has failed to load, it will create a diff with
	 * the intended (timeline) state and that command will be executed.
	 */
	private _assertIntendedState() {
		if (this._retryTime) {
			this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime)
		}

		const tlState = this.getState(this.getCurrentTime())

		if (!tlState) return // no state implies any state is correct

		const ccgState = tlState.state

		const diff = CasparCGState.diffStates(this._currentState, ccgState, this.getCurrentTime())

		const cmd: Array<AMCPCommandWithContext> = []
		for (const layer of diff) {
			// filter out media commands
			for (let i = 0; i < layer.cmds.length; i++) {
				if (
					// todo - shall we pass decklinks etc. as well?
					layer.cmds[i].command === Commands.Loadbg ||
					layer.cmds[i].command === Commands.Load ||
					(layer.cmds[i].command === Commands.Play && 'clip' in (layer.cmds[i].params as Record<string, unknown>))
				) {
					layer.cmds[i].context.context += ' [RETRY]'
					cmd.push(layer.cmds[i])
				}
			}
		}

		if (cmd.length > 0) {
			this._addToQueue(cmd, this.getCurrentTime())
		}
	}

	private _connectionChanged() {
		this.emit('connectionChanged', this.getStatus())
	}
}
