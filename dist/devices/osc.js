"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const osc = require("osc");
const easings_1 = require("../easings");
/**
 * This is a generic wrapper for any osc-enabled device.
 */
class OSCMessageDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this.transitions = {};
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
            if (deviceOptions.options.oscSender)
                this._oscSender = deviceOptions.options.oscSender;
            else
                this._oscSender = this._defaultOscSender;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'OSC');
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
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Handles a new state such that the device will be in that state at a specific point
     * in time.
     * @param newState
     */
    handleState(newState) {
        // Transform timeline states into device states
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: { time: 0, layers: {}, nextEvents: [] } }).state;
        let oldAbstractState = this.convertStateToOSCMessage(oldState);
        let newAbstractState = this.convertStateToOSCMessage(newState);
        // Generate commands necessary to transition to the new state
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
    makeReady(_okToDestroyStuff) {
        return Promise.resolve();
    }
    get canConnect() {
        return false;
    }
    get connected() {
        return false;
    }
    /**
     * Transform the timeline state into a device state, which is in this case also
     * a timeline state.
     * @param state
     */
    convertStateToOSCMessage(state) {
        const addrToOSCMessage = {};
        const addrToPriority = {};
        _.each(state.layers, (layer) => {
            const content = Object.assign(Object.assign({}, layer.content), { fromTlObject: layer.id });
            if ((addrToOSCMessage[content.path] &&
                addrToPriority[content.path] <= (layer.priority || 0)) ||
                !addrToOSCMessage[content.path]) {
                addrToOSCMessage[content.path] = content;
                addrToPriority[content.path] = layer.priority || 0;
            }
        });
        return addrToOSCMessage;
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
    /**
     * add the new commands to the queue:
     * @param commandsToAchieveState
     * @param time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            this._doOnTime.queue(time, undefined, (cmd) => {
                if (cmd.commandName === 'added' ||
                    cmd.commandName === 'changed') {
                    return this._commandReceiver(time, cmd.content, cmd.context, cmd.timelineObjId);
                }
                else {
                    return null;
                }
            }, cmd);
        });
    }
    /**
     * Generates commands to transition from old to new state.
     * @param oldOscSendState The assumed current state
     * @param newOscSendState The desired state of the device
     */
    _diffStates(oldOscSendState, newOscSendState) {
        // in this oscSend class, let's just cheat:
        let commands = [];
        _.each(newOscSendState, (newCommandContent, address) => {
            let oldLayer = oldOscSendState[address];
            if (!oldLayer) {
                // added!
                commands.push({
                    commandName: 'added',
                    context: `added: ${newCommandContent.fromTlObject}`,
                    timelineObjId: newCommandContent.fromTlObject,
                    content: newCommandContent
                });
            }
            else {
                // changed?
                if (!_.isEqual(oldLayer, newCommandContent)) {
                    // changed!
                    commands.push({
                        commandName: 'changed',
                        context: `changed: ${newCommandContent.fromTlObject}`,
                        timelineObjId: newCommandContent.fromTlObject,
                        content: newCommandContent
                    });
                }
            }
        });
        // removed
        _.each(oldOscSendState, (oldCommandContent, address) => {
            let newLayer = newOscSendState[address];
            if (!newLayer) {
                // removed!
                commands.push({
                    commandName: 'removed',
                    context: `removed: ${oldCommandContent.fromTlObject}`,
                    timelineObjId: oldCommandContent.fromTlObject,
                    content: oldCommandContent
                });
            }
        });
        return commands;
    }
    _defaultCommandReceiver(time, cmd, context, timelineObjId) {
        let cwc = {
            context: context,
            command: cmd,
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        try {
            if (cmd.transition && cmd.from) {
                const easingType = easings_1.Easing[cmd.transition.type];
                const easing = (easingType || {})[cmd.transition.direction];
                if (!easing)
                    throw new Error(`Easing "${cmd.transition.type}.${cmd.transition.direction}" not found`);
                for (let i = 0; i < Math.max(cmd.from.length, cmd.values.length); i++) {
                    if (cmd.from[i] && cmd.values[i]) {
                        if (cmd.from[i].value !== cmd.values[i].value && cmd.from[i].type !== cmd.values[i].type) {
                            throw new Error('Cannot interpolate between values of different types');
                        }
                    }
                }
                this.transitions[cmd.path] = Object.assign({ started: time }, cmd);
                this._oscSender({
                    address: cmd.path,
                    args: [...cmd.values].map((o, i) => cmd.from[i] || o)
                });
                // trigger loop:
                if (!this.transitionInterval)
                    this.transitionInterval = setInterval(() => this.runAnimation(), 40);
            }
            else {
                this._oscSender({
                    address: cmd.path,
                    args: cmd.values
                });
            }
            return Promise.resolve();
        }
        catch (e) {
            this.emit('commandError', e, cwc);
            return Promise.resolve();
        }
    }
    _defaultOscSender(msg, address, port) {
        this._oscClient.send(msg, address, port);
    }
    runAnimation() {
        for (const addr in this.transitions) {
            // delete old tweens
            if (this.transitions[addr].started + this.transitions[addr].transition.duration < this.getCurrentTime()) {
                delete this.transitions[addr];
            }
        }
        for (const addr in this.transitions) {
            const tween = this.transitions[addr];
            // check if easing exists:
            const easingType = easings_1.Easing[tween.transition.type];
            const easing = (easingType || {})[tween.transition.direction];
            if (easing) {
                // scale time in range 0...1, then calculate progress in range 0..1
                const deltaTime = this.getCurrentTime() - tween.started;
                const progress = deltaTime / tween.transition.duration;
                const fraction = easing(progress);
                // calculate individual values:
                const values = [];
                for (let i = 0; i < Math.max(tween.from.length, tween.values.length); i++) {
                    if (!tween.from[i]) {
                        values[i] = tween.values[i];
                    }
                    else if (!tween.values[i]) {
                        values[i] = tween.from[i];
                    }
                    else {
                        if (tween.from[i].type === src_1.OSCValueType.FLOAT && tween.values[i].type === src_1.OSCValueType.FLOAT) {
                            const oldVal = tween.from[i].value;
                            const newVal = tween.values[i].value;
                            values[i] = {
                                type: src_1.OSCValueType.FLOAT,
                                value: oldVal + (newVal - oldVal) * fraction
                            };
                        }
                        else if (tween.from[i].type === src_1.OSCValueType.INT && tween.values[i].type === src_1.OSCValueType.INT) {
                            const oldVal = tween.from[i].value;
                            const newVal = tween.values[i].value;
                            values[i] = {
                                type: src_1.OSCValueType.INT,
                                value: oldVal + Math.round((newVal - oldVal) * fraction)
                            };
                        }
                        else {
                            values[i] = tween.values[i];
                        }
                    }
                }
                this._oscSender({
                    address: tween.path,
                    args: values
                });
            }
        }
        if (Object.keys(this.transitions).length === 0) {
            clearInterval(this.transitionInterval);
            this.transitionInterval = undefined;
        }
    }
}
exports.OSCMessageDevice = OSCMessageDevice;
//# sourceMappingURL=osc.js.map