"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const osc = require("osc");
class OSCMessageDevice extends device_1.DeviceWithState {
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
        this._doOnTime.on('error', e => this.emit('error', e));
    }
    init(options) {
        this._oscClient = new osc.UDPPort({
            localAddress: '0.0.0.0',
            localPort: 0,
            remoteAddress: options.host,
            remotePort: options.port,
            metadata: true
        });
        this._oscClient.open();
        return Promise.resolve(true); // This device doesn't have any initialization procedure
    }
    handleState(newState) {
        // Handle this new state, at the point in time specified
        // console.log('handleState')
        let oldState = (this.getStateBefore(newState.time) || { state: { time: 0, LLayers: {}, GLayers: {} } }).state;
        let oldAbstractState = this.convertStateToOSCMessage(oldState);
        let newAbstractState = this.convertStateToOSCMessage(newState);
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
    getStatus() {
        // Good, since this device has no status, really
        return {
            statusCode: device_1.StatusCode.GOOD
        };
    }
    makeReady(okToDestroyStuff) {
        okToDestroyStuff = okToDestroyStuff;
        return Promise.resolve();
    }
    get canConnect() {
        return false;
    }
    get connected() {
        return false;
    }
    convertStateToOSCMessage(state) {
        // convert the timeline state into something we can use
        // (won't even use this.mapping)
        return state;
    }
    get deviceType() {
        return src_1.DeviceType.OSC;
    }
    get deviceName() {
        return 'OSC ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                if (cmd.commandName === 'added' ||
                    cmd.commandName === 'changed') {
                    return this._commandReceiver(time, cmd.content, cmd.context);
                }
                else {
                    return null;
                }
            }, cmd);
        });
    }
    _diffStates(oldoscSendState, newOscSendState) {
        // in this oscSend class, let's just cheat:
        let commands = [];
        _.each(newOscSendState.LLayers, (newLayer, layerKey) => {
            let oldLayer = oldoscSendState.LLayers[layerKey];
            if (!oldLayer) {
                // added!
                commands.push({
                    commandName: 'added',
                    content: newLayer.content,
                    context: `added: ${newLayer.id}`
                });
            }
            else {
                // changed?
                if (!_.isEqual(oldLayer.content, newLayer.content)) {
                    // changed!
                    commands.push({
                        commandName: 'changed',
                        content: newLayer.content,
                        context: `changed: ${newLayer.id}`
                    });
                }
            }
        });
        // removed
        _.each(oldoscSendState.LLayers, (oldLayer, layerKey) => {
            let newLayer = newOscSendState.LLayers[layerKey];
            if (!newLayer) {
                // removed!
                commands.push({
                    commandName: 'removed',
                    content: oldLayer.content,
                    context: `removed: ${oldLayer.id}`
                });
            }
        });
        return commands;
    }
    _defaultCommandReceiver(time, cmd, context) {
        time = time;
        // this.emit('info', 'OSC: Send ', cmd)
        let cwc = {
            context: context,
            command: cmd
        };
        this.emit('debug', cwc);
        try {
            this._oscClient.send({
                address: cmd.path,
                args: cmd.values
            });
            return Promise.resolve();
        }
        catch (e) {
            return Promise.reject(e);
        }
    }
}
exports.OSCMessageDevice = OSCMessageDevice;
//# sourceMappingURL=osc.js.map