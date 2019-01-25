"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
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
        });
        this._doOnTime.on('error', e => this.emit('error', 'doOnTime', e));
    }
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init() {
        return new Promise((resolve /*, reject*/) => {
            // This is where we would do initialization, like connecting to the devices, etc
            resolve(true);
        });
    }
    handleState(newState) {
        // Handle this new state, at the point in time specified
        let oldState = (this.getStateBefore(newState.time) || { state: { time: 0, LLayers: {}, GLayers: {} } }).state;
        let oldAbstractState = this.convertStateToAbstract(oldState);
        let newAbstractState = this.convertStateToAbstract(newState);
        let commandsToAchieveState = this._diffStates(oldAbstractState, newAbstractState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newState.time);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newState, newState.time);
    }
    clearFuture(clearAfterTime) {
        // Clear any scheduled commands after this time
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
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
    convertStateToAbstract(state) {
        // convert the timeline state into something we can use
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
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                return this._commandReceiver(time, cmd, cmd.context);
            }, cmd);
        });
    }
    _diffStates(oldAbstractState, newAbstractState) {
        // in this abstract class, let's just cheat:
        let commands = [];
        _.each(newAbstractState.LLayers, (newLayer, layerKey) => {
            let oldLayer = oldAbstractState.LLayers[layerKey];
            if (!oldLayer) {
                // added!
                commands.push({
                    commandName: 'addedAbstract',
                    content: newLayer.content,
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
                        context: `changed: ${newLayer.id}`
                    });
                }
            }
        });
        // removed
        _.each(oldAbstractState.LLayers, (oldLayer, layerKey) => {
            let newLayer = newAbstractState.LLayers[layerKey];
            if (!newLayer) {
                // removed!
                commands.push({
                    commandName: 'removedAbstract',
                    content: oldLayer.content,
                    context: `removed: ${oldLayer.id}`
                });
            }
        });
        return commands;
    }
    _defaultCommandReceiver(time, cmd, context) {
        time = time;
        // emit the command to debug:
        let cwc = {
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