import * as _ from 'underscore'
import * as deepMerge from 'deepmerge'
import { DeviceWithState, CommandWithContext, DeviceStatus, StatusCode, literal } from '../../devices/device'
import { AMCPCommand, BasicCasparCGAPI, ClearCommand, Commands, Response } from 'casparcg-connection'
import {
	DeviceType,
	TimelineContentTypeCasparCg,
	MappingCasparCG,
	CasparCGOptions,
	TimelineContentCCGProducerBase,
	ResolvedTimelineObjectInstanceExtended,
	DeviceOptionsCasparCG,
	Mappings,
	TimelineContentCasparCGAny,
	TSRTimelineObjProps,
	Timeline,
	TSRTimelineContent,
	ActionExecutionResult,
	ActionExecutionResultCode,
	CasparCGActions,
} from 'timeline-state-resolver-types'

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
import { endTrace, startTrace, t } from '../../lib'
const debug = Debug('timeline-state-resolver:casparcg')

const MEDIA_RETRY_INTERVAL = 10 * 1000 // default time in ms between checking whether a file needs to be retried loading

export interface DeviceOptionsCasparCGInternal extends DeviceOptionsCasparCG {
	commandReceiver?: CommandReceiver
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

			this._connected = true
			this._connectionChanged()

			// TODO - maybe add this back based on info command
			// if (event.valueOf().virginServer === true) {
			// 	// a "virgin server" was just restarted (so it is cleared & black).
			// 	// Otherwise it was probably just a loss of connection

			// 	this._currentState = { channels: {} }
			// 	this.clearStates()
			// 	this.emit('resetResolver')
			// }
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
	handleState(newState: Timeline.TimelineState<TSRTimelineContent>, newMappings: Mappings) {
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
		layer: Timeline.ResolvedTimelineObjectInstance,
		mapping: MappingCasparCG,
		isForeground: boolean
	): LayerBase {
		let startTime = layer.instance.originalStart || layer.instance.start
		if (startTime === 0) startTime = 1 // @todo: startTime === 0 will make ccg-state seek to the current time

		const layerProps = layer as Timeline.ResolvedTimelineObjectInstance & TSRTimelineObjProps
		const content = layer.content as TimelineContentCasparCGAny

		let stateLayer: LayerBase | null = null
		if (content.type === TimelineContentTypeCasparCg.MEDIA) {
			const holdOnFirstFrame = !isForeground || layerProps.isLookahead
			const loopingPlayTime = content.loop && !content.seek && !content.inPoint && !content.length

			stateLayer = literal<MediaLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.MEDIA,
				media: content.file,
				playTime: !holdOnFirstFrame && (content.noStarttime || loopingPlayTime) ? null : startTime,

				pauseTime: holdOnFirstFrame ? startTime : content.pauseTime || null,
				playing: !layerProps.isLookahead && (content.playing !== undefined ? content.playing : isForeground),

				looping: content.loop,
				seek: content.seek,
				inPoint: content.inPoint,
				length: content.length,

				channelLayout: content.channelLayout,
				clearOn404: true,

				vfilter: content.videoFilter,
				afilter: content.audioFilter,
			})
			// this.emitDebug(stateLayer)
		} else if (content.type === TimelineContentTypeCasparCg.IP) {
			stateLayer = literal<MediaLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.MEDIA,
				media: content.uri,
				channelLayout: content.channelLayout,
				playTime: null, // ip inputs can't be seeked // layer.resolved.startTime || null,
				playing: true,
				seek: 0, // ip inputs can't be seeked

				vfilter: content.videoFilter,
				afilter: content.audioFilter,
			})
		} else if (content.type === TimelineContentTypeCasparCg.INPUT) {
			stateLayer = literal<InputLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.INPUT,
				media: 'decklink',
				input: {
					device: content.device,
					channelLayout: content.channelLayout,
					format: content.deviceFormat,
				},
				playing: true,
				playTime: null,

				vfilter: content.videoFilter || content.filter,
				afilter: content.audioFilter,
			})
		} else if (content.type === TimelineContentTypeCasparCg.TEMPLATE) {
			stateLayer = literal<TemplateLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.TEMPLATE,
				media: content.name,

				playTime: startTime || null,
				playing: true,

				templateType: content.templateType || 'html',
				templateData: content.data,
				cgStop: content.useStopCommand,
			})
		} else if (content.type === TimelineContentTypeCasparCg.HTMLPAGE) {
			stateLayer = literal<HtmlPageLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.HTMLPAGE,
				media: content.url,

				playTime: startTime || null,
				playing: true,
			})
		} else if (content.type === TimelineContentTypeCasparCg.ROUTE) {
			if (content.mappedLayer) {
				const routeMapping = mappings[content.mappedLayer] as MappingCasparCG
				if (routeMapping && routeMapping.deviceId === this.deviceId) {
					content.channel = routeMapping.channel
					content.layer = routeMapping.layer
				}
			}
			stateLayer = literal<RouteLayer>({
				id: layer.id,
				layerNo: mapping.layer,
				content: LayerContentType.ROUTE,
				media: 'route',
				route: {
					channel: content.channel || 0,
					layer: content.layer,
					channelLayout: content.channelLayout,
				},
				mode: content.mode || undefined,
				delay: content.delay || undefined,
				playing: true,
				playTime: null, // layer.resolved.startTime || null,

				vfilter: content.videoFilter,
				afilter: content.audioFilter,
			})
		} else if (content.type === TimelineContentTypeCasparCg.RECORD) {
			if (startTime) {
				stateLayer = literal<RecordLayer>({
					id: layer.id,
					layerNo: mapping.layer,
					content: LayerContentType.RECORD,
					media: content.file,
					encoderOptions: content.encoderOptions,
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

		const baseContent = content as TimelineContentCCGProducerBase
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
		if ('mixer' in content && content.mixer) {
			// add mixer properties
			// just pass through values here:
			const mixer: Mixer = {}
			_.each(content.mixer, (value, property) => {
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
	convertStateToCaspar(timelineState: Timeline.TimelineState<TSRTimelineContent>, mappings: Mappings): State {
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

				let foregroundObj: ResolvedTimelineObjectInstanceExtended | undefined = timelineState.layers[layerName]
				let backgroundObj = _.last(
					_.filter(timelineState.layers, (obj) => {
						// Takes the last one, to be consistent with previous behaviour
						const objExt: ResolvedTimelineObjectInstanceExtended = obj
						return !!objExt.isLookahead && objExt.lookaheadForLayer === layerName
					})
				)

				// If lookahead is on the same layer, then ensure objects are treated as such
				if (foregroundObj && foregroundObj.isLookahead) {
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

	async clearAllChannels(): Promise<ActionExecutionResult> {
		if (!this._ccg.connected) {
			return {
				result: ActionExecutionResultCode.Error,
				response: t('Cannot restart CasparCG without a connection'),
			}
		}

		const { error, request } = await this._ccg.executeCommand({ command: Commands.Info, params: {} })
		if (error) {
			return { result: ActionExecutionResultCode.Error }
		}
		const response = await request
		if (!response?.data[0]) {
			return { result: ActionExecutionResultCode.Error }
		}

		await Promise.all(
			response.data.map(async (_, i) => {
				await this._commandReceiver(
					this.getCurrentTime(),
					literal<ClearCommand>({
						command: Commands.Clear,
						params: {
							channel: i + 1,
						},
					}),
					'clearAllChannels',
					''
				)
			})
		)

		this.clearStates()
		this._currentState = { channels: {} }
		response.data.forEach((obj) => {
			this._currentState.channels[obj.channel] = {
				channelNo: obj.channel,
				videoMode: obj.format.toUpperCase(),
				fps: obj.frameRate,
				layers: {},
			}
		})

		this.emit('resetResolver')

		return {
			result: ActionExecutionResultCode.Ok,
		}
	}

	async executeAction(id: CasparCGActions): Promise<ActionExecutionResult> {
		switch (id) {
			case CasparCGActions.ClearAllChannels:
				return this.clearAllChannels()
			case CasparCGActions.RestartServer:
				await this.restartCasparCG()
				return {
					result: ActionExecutionResultCode.Ok,
				}
			default:
				return {
					result: ActionExecutionResultCode.Error,
					response: t('Action "{{id}}" not found', { id }),
				}
		}
	}

	/**
	 * Attemps to restart casparcg over the HTTP API provided by CasparCG launcher.
	 */
	async restartCasparCG(): Promise<ActionExecutionResult> {
		if (!this.initOptions) {
			return { result: ActionExecutionResultCode.Error, response: t('CasparCGDevice._connectionOptions is not set!') }
		}
		if (!this.initOptions.launcherHost) {
			return { result: ActionExecutionResultCode.Error, response: t('CasparCGDevice: config.launcherHost is not set!') }
		}
		if (!this.initOptions.launcherPort) {
			return { result: ActionExecutionResultCode.Error, response: t('CasparCGDevice: config.launcherPort is not set!') }
		}

		return new Promise<ActionExecutionResult>((resolve) => {
			const url = `http://${this.initOptions?.launcherHost}:${this.initOptions?.launcherPort}/processes/casparcg/restart`
			request.post(
				url,
				{}, // json: cmd.params
				(error, response) => {
					if (error) {
						resolve({ result: ActionExecutionResultCode.Error, response: error })
					} else if (response.statusCode === 200) {
						resolve({ result: ActionExecutionResultCode.Ok })
					} else {
						resolve({
							result: ActionExecutionResultCode.Error,
							response: t('Bad reply: [{{statusCode}}] {{body}}', {
								statusCode: response.statusCode,
								body: response.body,
							}),
						})
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
			const currentState = this.getState(time)
			if (currentState) {
				const currentCasparState = currentState.state

				const trackedState = this._currentState

				const channel = currentCasparState.channels[command.params.channel]
				if (channel) {
					if (!trackedState.channels[command.params.channel]) {
						trackedState.channels[command.params.channel] = {
							channelNo: channel.channelNo,
							fps: channel.fps || 0,
							videoMode: channel.videoMode || null,
							layers: {},
						}
					}

					// copy into the trackedState
					if (
						(command.command === Commands.Play && command.params.clip) ||
						(!('clip' in command.params) &&
							trackedState.channels[command.params.channel].layers[command.params.layer].nextUp)
					) {
						// a play command without parameters (channel/layer) is only succesful if the nextUp worked
						// a play command with params can always be accepted
						trackedState.channels[command.params.channel].layers[command.params.layer] = {
							...channel.layers[command.params.layer],
							nextUp: undefined, // a play command always clears nextUp
						}
					} else if (command.command === Commands.Loadbg) {
						// only loadbg can set nextUp and nextUp can only be set by loadbg
						trackedState.channels[command.params.channel].layers[command.params.layer] = {
							...trackedState.channels[command.params.channel].layers[command.params.layer],
							nextUp: channel.layers[command.params.layer].nextUp,
						}
					} else if (
						command.command === Commands.Stop &&
						trackedState.channels[command.params.channel].layers[command.params.layer].nextUp?.auto
					) {
						// auto next + stop means bg -> fg => nextUp cleared
						trackedState.channels[command.params.channel].layers[command.params.layer] = {
							...channel.layers[command.params.layer],
							nextUp: undefined, // auto next + stop means bg -> fg => nextUp cleared
						}
					} else if (command.command === Commands.Resume || command.command === Commands.Stop) {
						// stop and resume can be done without affecting nextup
						trackedState.channels[command.params.channel].layers[command.params.layer] = {
							...channel.layers[command.params.layer],
							nextUp: trackedState.channels[command.params.channel].layers[command.params.layer].nextUp,
						}
					} else {
						// anything else can always be copied but also clears nextUp
						// @todo - can LOADBG be followed by an empty LOAD? (if yes, apply same logic as PLAY)
						trackedState.channels[command.params.channel].layers[command.params.layer] = {
							...channel.layers[command.params.layer],
							nextUp: undefined,
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
