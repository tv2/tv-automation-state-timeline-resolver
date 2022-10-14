import * as _ from 'underscore'
import { DeviceWithState, CommandWithContext, DeviceStatus, StatusCode } from './../../devices/device'
import { DoOnTime, SendMode } from '../../devices/doOnTime'

import { TimelineState } from 'superfly-timeline'
import { DeviceType, Mappings, TriCasterOptions, DeviceOptionsTriCaster } from 'timeline-state-resolver-types'
import { convertStateToTriCaster, diffStates, getDefaultState, State } from './state'
import * as WebSocket from 'ws'
import { commandToWsMessage, TriCasterCommandContext, TriCasterCommandWithContext } from './commands'

const RECONNECT_TIMEOUT = 1000
const DEFAULT_PORT = 5951

export interface DeviceOptionsTriCasterInternal extends DeviceOptionsTriCaster {
	commandReceiver?: CommandReceiver
}
export type CommandReceiver = (
	time: number,
	cmd: TriCasterCommandWithContext,
	context: TriCasterCommandContext,
	timelineObjId: string
) => Promise<any>

/**
 * This is a VMixDevice, it sends commands when it feels like it
 */
export class TriCasterDevice extends DeviceWithState<State, DeviceOptionsTriCasterInternal> {
	private _doOnTime: DoOnTime

	private _commandReceiver: CommandReceiver
	private _host: string
	private _port: number
	private _socket: WebSocket
	private _resolveInitPromise: (value: boolean) => void
	private _connected = false
	private _initialized = false

	constructor(deviceId: string, deviceOptions: DeviceOptionsTriCasterInternal, getCurrentTime: () => Promise<number>) {
		super(deviceId, deviceOptions, getCurrentTime)
		if (deviceOptions.options) {
			if (deviceOptions.commandReceiver) this._commandReceiver = deviceOptions.commandReceiver
			else this._commandReceiver = this._defaultCommandReceiver.bind(this)
		}
		this._doOnTime = new DoOnTime(
			() => {
				return this.getCurrentTime()
			},
			SendMode.IN_ORDER,
			this._deviceOptions
		)
		this._doOnTime.on('error', (e) => this.emit('error', 'VMix.doOnTime', e))
		this._doOnTime.on('slowCommand', (msg) => this.emit('slowCommand', this.deviceName + ': ' + msg))
		this._doOnTime.on('slowSentCommand', (info) => this.emit('slowSentCommand', info))
		this._doOnTime.on('slowFulfilledCommand', (info) => this.emit('slowFulfilledCommand', info))
	}
	async init(options: TriCasterOptions): Promise<boolean> {
		this._host = options.host
		this._port = options.port ?? DEFAULT_PORT
		const initPromise = new Promise<boolean>((resolve) => {
			this._resolveInitPromise = resolve
		})
		return initPromise
	}

	private _connectSocket() {
		this._socket = new WebSocket(`ws://${this._host}:${this._port}/v1/shortcut_state`)
		this._socket.on('open', () => {
			this._setConnected(true)
			// @todo setup initial state
			this._resolveInitPromise(true)
		})

		this._socket.on('close', () => {
			this._setConnected(false)
			setTimeout(() => {
				this._connectSocket()
			}, RECONNECT_TIMEOUT)
		})

		this._socket.on('error', (err) => {
			this.emit('error', `Socket error: ${err.message}`, err)
			this._socket.close()
		})
	}

	private _connectionChanged() {
		this.emit('connectionChanged', this.getStatus())
	}

	private _setConnected(connected: boolean) {
		if (this._connected !== connected) {
			this._connected = connected
			this._connectionChanged()
		}
	}

	/** Called by the Conductor a bit before a .handleState is called */
	prepareForHandleState(newStateTime: number) {
		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(newStateTime)
		this.cleanUpStates(0, newStateTime)
	}

	handleState(newState: TimelineState, newMappings: Mappings) {
		super.onHandleState(newState, newMappings)
		if (!this._initialized) {
			// before it's initialized don't do anything
			this.emit('warning', 'TriCaster not initialized yet')
			return
		}

		const previousStateTime = Math.max(this.getCurrentTime(), newState.time)
		const oldState = this.getStateBefore(previousStateTime)?.state ?? getDefaultState()

		const newVMixState = convertStateToTriCaster(newState, newMappings, this.deviceId)

		const commandsToAchieveState: Array<TriCasterCommandWithContext> = diffStates(newVMixState, oldState)

		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(previousStateTime)

		// add the new commands to the queue:
		this._addToQueue(commandsToAchieveState, newState.time)

		// store the new state, for later use:
		this.setState(newVMixState, newState.time)
	}

	clearFuture(clearAfterTime: number) {
		// Clear any scheduled commands after this time
		this._doOnTime.clearQueueAfter(clearAfterTime)
	}

	async terminate() {
		this._doOnTime.dispose()
		this._socket.close()
		return Promise.resolve(true)
	}

	getStatus(): DeviceStatus {
		let statusCode = StatusCode.GOOD
		const messages: Array<string> = []

		if (!this._connected) {
			statusCode = StatusCode.BAD
			messages.push('Not connected')
		}

		return {
			statusCode: statusCode,
			messages: messages,
			active: this.isActive,
		}
	}

	async makeReady(okToDestroyStuff?: boolean): Promise<void> {
		if (okToDestroyStuff) {
			// do something?
		}
	}

	get canConnect(): boolean {
		return false
	}

	get connected(): boolean {
		return this._connected
	}

	get deviceType() {
		return DeviceType.TRICASTER
	}

	get deviceName(): string {
		return 'TriCaster ' + this.deviceId
	}

	get queue() {
		return this._doOnTime.getQueue()
	}

	private _addToQueue(commandsToAchieveState: Array<TriCasterCommandWithContext>, time: number) {
		_.each(commandsToAchieveState, (cmd: TriCasterCommandWithContext) => {
			this._doOnTime.queue(
				time,
				undefined,
				async (cmd: TriCasterCommandWithContext) => {
					return this._commandReceiver(time, cmd, cmd.context, cmd.timelineObjId)
				},
				cmd
			)
		})
	}

	private async _defaultCommandReceiver(
		_time: number,
		cmd: TriCasterCommandWithContext,
		context: TriCasterCommandContext,
		timelineObjId: string
	): Promise<any> {
		const cwc: CommandWithContext = {
			context: context,
			command: cmd,
			timelineObjId: timelineObjId,
		}
		this.emitDebug(cwc)

		return this._socket.send(commandToWsMessage(cmd.command))
	}
}
