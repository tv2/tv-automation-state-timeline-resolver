"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
/*
    This is a wrapper for an "Abstract" device

    An abstract device is just a test-device that doesn't really do anything, but can be used
    as a preliminary mock
*/
class AbstractDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Abstract');
    }
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(_initOptions) {
        return new Promise((resolve /*, reject*/) => {
            // This is where we would do initialization, like connecting to the devices, etc
            resolve(true);
        });
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Handle a new state, at the point in time specified
     * @param newState
     */
    handleState(newState) {
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: { time: 0, layers: {}, nextEvents: [] } }).state;
        let oldAbstractState = this.convertStateToAbstract(oldState);
        let newAbstractState = this.convertStateToAbstract(newState);
        let commandsToAchieveState = this._diffStates(oldAbstractState, newAbstractState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newState, newState.time);
    }
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime) {
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    /**
     * Dispose of the device so it can be garbage collected.
     */
    terminate() {
        this._doOnTime.dispose();
        return Promise.resolve(true);
    }
    get canConnect() {
        return false;
    }
    get connected() {
        return false;
    }
    /**
     * converts the timeline state into something we can use
     * @param state
     */
    convertStateToAbstract(state) {
        return state;
    }
    get deviceType() {
        return src_1.DeviceType.ABSTRACT;
    }
    get deviceName() {
        return 'Abstract ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    getStatus() {
        return {
            statusCode: device_1.StatusCode.GOOD
        };
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     * @param oldAbstractState
     * @param newAbstractState
     */
    _diffStates(oldAbstractState, newAbstractState) {
        // in this abstract class, let's just cheat:
        let commands = [];
        _.each(newAbstractState.layers, (newLayer, layerKey) => {
            let oldLayer = oldAbstractState.layers[layerKey];
            if (!oldLayer) {
                // added!
                commands.push({
                    commandName: 'addedAbstract',
                    content: newLayer.content,
                    timelineObjId: newLayer.id,
                    context: `added: ${newLayer.id}`
                });
            }
            else {
                // changed?
                if (oldLayer.id !== newLayer.id) {
                    // changed!
                    commands.push({
                        commandName: 'changedAbstract',
                        content: newLayer.content,
                        timelineObjId: newLayer.id,
                        context: `changed: ${newLayer.id}`
                    });
                }
            }
        });
        // removed
        _.each(oldAbstractState.layers, (oldLayer, layerKey) => {
            let newLayer = newAbstractState.layers[layerKey];
            if (!newLayer) {
                // removed!
                commands.push({
                    commandName: 'removedAbstract',
                    content: oldLayer.content,
                    timelineObjId: oldLayer.id,
                    context: `removed: ${oldLayer.id}`
                });
            }
        });
        return commands;
    }
    _defaultCommandReceiver(time, cmd, context, timelineObjId) {
        time = time;
        // emit the command to debug:
        let cwc = {
            timelineObjId: timelineObjId,
            context: context,
            command: {
                commandName: cmd.commandName,
                content: cmd.content
            }
        };
        this.emit('debug', cwc);
        // Note: In the Abstract case, the execution does nothing
        return Promise.resolve();
    }
}
exports.AbstractDevice = AbstractDevice;
//# sourceMappingURL=abstract.js.map