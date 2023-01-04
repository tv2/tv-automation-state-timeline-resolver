import * as _ from 'underscore'
import { DeviceWithState, CommandWithContext, DeviceStatus, StatusCode } from './../../devices/device'
import {
	DeviceType,
	AbstractOptions,
	DeviceOptionsAbstract,
	Mappings,
	Timeline,
	TSRTimelineContent,
} from 'timeline-state-resolver-types'

import { DoOnTime, SendMode } from '../../devices/doOnTime'
import { ActionExecutionResult, ActionExecutionResultCode } from 'timeline-state-resolver-types'
import { t } from '../../lib'

export interface Command {
	commandName: string
	timelineObjId: string
	content: CommandContent
	context: CommandContext
}
type CommandContent = any
type CommandContext = string

export interface DeviceOptionsAbstractInternal extends DeviceOptionsAbstract {
	commandReceiver?: CommandReceiver
}
export type CommandReceiver = (
	time: number,
	cmd: Command,
	context: CommandContext,
	timelineObjId: string
) => Promise<any>
type AbstractState = Timeline.TimelineState<TSRTimelineContent>
/*
	This is a wrapper for an "Abstract" device

	An abstract device is just a test-device that doesn't really do anything, but can be used
	as a preliminary mock
*/
export class AbstractDevice extends DeviceWithState<AbstractState, DeviceOptionsAbstractInternal> {
	private _doOnTime: DoOnTime

	private _commandReceiver: CommandReceiver

	constructor(deviceId: string, deviceOptions: DeviceOptionsAbstractInternal, getCurrentTime: () => Promise<number>) {
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
		this.handleDoOnTime(this._doOnTime, 'Abstract')
	}

	async executeAction(_actionId: string, _payload?: Record<string, any> | undefined): Promise<ActionExecutionResult> {
		return { result: ActionExecutionResultCode.Ok, response: t('Command received by the abstract device') }
	}

	/**
	 * Initiates the connection with CasparCG through the ccg-connection lib.
	 */
	async init(_initOptions: AbstractOptions): Promise<boolean> {
		return new Promise((resolve /*, reject*/) => {
			// This is where we would do initialization, like connecting to the devices, etc
			resolve(true)
		})
	}
	/** Called by the Conductor a bit before a .handleState is called */
	prepareForHandleState(newStateTime: number) {
		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(newStateTime)
		this.cleanUpStates(0, newStateTime)
	}
	/**
	 * Handle a new state, at the point in time specified
	 * @param newState
	 */
	handleState(newState: Timeline.TimelineState<TSRTimelineContent>, newMappings: Mappings) {
		super.onHandleState(newState, newMappings)
		const previousStateTime = Math.max(this.getCurrentTime(), newState.time)
		const oldState: Timeline.TimelineState<TSRTimelineContent> = (
			this.getStateBefore(previousStateTime) || { state: { time: 0, layers: {}, nextEvents: [] } }
		).state

		const oldAbstractState = this.convertStateToAbstract(oldState)
		const newAbstractState = this.convertStateToAbstract(newState)

		const commandsToAchieveState: Array<Command> = this._diffStates(oldAbstractState, newAbstractState)

		// clear any queued commands later than this time:
		this._doOnTime.clearQueueNowAndAfter(previousStateTime)
		// add the new commands to the queue:
		this._addToQueue(commandsToAchieveState, newState.time)

		// store the new state, for later use:
		this.setState(newState, newState.time)

		if (this.deviceOptions.debugState) {
			const debugState: Record<string, object> = {}
			for (const layer of Object.keys(newMappings)) {
				const tlObject = newAbstractState.layers[layer]
				if (tlObject !== undefined) {
					debugState[layer] = { id: tlObject.id, classes: tlObject.classes, content: tlObject.content }
				} else {
					debugState[layer] = {}
				}
			}
			this.emitDebugState(debugState)
		}
	}
	/**
	 * Clear any scheduled commands after this time
	 * @param clearAfterTime
	 */
	clearFuture(clearAfterTime: number) {
		this._doOnTime.clearQueueAfter(clearAfterTime)
	}
	/**
	 * Dispose of the device so it can be garbage collected.
	 */
	async terminate() {
		this._doOnTime.dispose()
		return Promise.resolve(true)
	}
	get canConnect(): boolean {
		return false
	}
	get connected(): boolean {
		return false
	}
	/**
	 * converts the timeline state into something we can use
	 * @param state
	 */
	convertStateToAbstract(state: Timeline.TimelineState<TSRTimelineContent>) {
		return state
	}
	get deviceType() {
		return DeviceType.ABSTRACT
	}
	get deviceName(): string {
		return 'Abstract ' + this.deviceId
	}
	get queue() {
		return this._doOnTime.getQueue()
	}
	getStatus(): DeviceStatus {
		return {
			statusCode: StatusCode.GOOD,
			messages: [],
			active: this.isActive,
		}
	}
	/**
	 * Add commands to queue, to be executed at the right time
	 */
	private _addToQueue(commandsToAchieveState: Array<Command>, time: number) {
		_.each(commandsToAchieveState, (cmd: Command) => {
			// add the new commands to the queue:
			this._doOnTime.queue(
				time,
				undefined,
				async (cmd: Command) => {
					return this._commandReceiver(time, cmd, cmd.context, cmd.timelineObjId)
				},
				cmd
			)
		})
	}
	/**
	 * Compares the new timeline-state with the old one, and generates commands to account for the difference
	 * @param oldAbstractState
	 * @param newAbstractState
	 */
	private _diffStates(oldAbstractState: AbstractState, newAbstractState: AbstractState) {
		// in this abstract class, let's just cheat:

		const commands: Array<Command> = []

		_.each(newAbstractState.layers, (newLayer, layerKey) => {
			const oldLayer = oldAbstractState.layers[layerKey]
			if (!oldLayer) {
				// added!
				commands.push({
					commandName: 'addedAbstract',
					content: newLayer.content,
					timelineObjId: newLayer.id,
					context: `added: ${newLayer.id}`,
				})
			} else {
				// changed?
				if (oldLayer.id !== newLayer.id) {
					// changed!
					commands.push({
						commandName: 'changedAbstract',
						content: newLayer.content,
						timelineObjId: newLayer.id,
						context: `changed: ${newLayer.id}`,
					})
				}
			}
		})
		// removed
		_.each(oldAbstractState.layers, (oldLayer, layerKey) => {
			const newLayer = newAbstractState.layers[layerKey]
			if (!newLayer) {
				// removed!
				commands.push({
					commandName: 'removedAbstract',
					content: oldLayer.content,
					timelineObjId: oldLayer.id,
					context: `removed: ${oldLayer.id}`,
				})
			}
		})
		return commands
	}
	private async _defaultCommandReceiver(
		_time: number,
		cmd: Command,
		context: CommandContext,
		timelineObjId: string
	): Promise<any> {
		// emit the command to debug:
		const cwc: CommandWithContext = {
			timelineObjId: timelineObjId,
			context: context,
			command: {
				commandName: cmd.commandName,
				content: cmd.content,
			},
		}
		this.emitDebug(cwc)

		// Note: In the Abstract case, the execution does nothing

		return Promise.resolve()
	}
}
