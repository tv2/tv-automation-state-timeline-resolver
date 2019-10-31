"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const sisyfos_1 = require("../types/src/sisyfos");
const sisyfosAPI_1 = require("./sisyfosAPI");
/**
 * This is a generic wrapper for any osc-enabled device.
 */
class SisyfosMessageDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._sisyfos = new sisyfosAPI_1.SisyfosInterface();
        this._sisyfos.on('error', e => this.emit('error', 'Sisyfos', e));
        this._sisyfos.on('connected', () => {
            this._connectionChanged();
        });
        this._sisyfos.on('disconnected', () => {
            this._connectionChanged();
        });
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Sisyfos');
    }
    init(options) {
        this._sisyfos.once('initialized', () => {
            this.setState(this.getDeviceState(), this.getCurrentTime());
            this.emit('resetResolver');
        });
        return this._sisyfos.connect(options.host, options.port)
            .then(() => true);
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
        if (!this._sisyfos.state) {
            this.emit('warning', 'Sisyfos State not initialized yet');
            return;
        }
        // Transform timeline states into device states
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: { channels: {} } }).state;
        let newAbstractState = this.convertStateToSisyfosState(newState);
        // Generate commands necessary to transition to the new state
        let commandsToAchieveState = this._diffStates(oldState, newAbstractState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newAbstractState, newState.time);
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
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (!this._sisyfos.connected) {
            statusCode = device_1.StatusCode.BAD;
            messages.push('Not connected');
        }
        if (!this._sisyfos.state) {
            statusCode = device_1.StatusCode.BAD;
            messages.push(`Sisyfos device connection not initialized (restart required)`);
        }
        return {
            statusCode: statusCode,
            messages: messages
        };
    }
    makeReady(okToDestroyStuff) {
        if (okToDestroyStuff) {
            this._doOnTime.clearQueueNowAndAfter(this.getCurrentTime());
            this.setState(this.getDeviceState(), this.getCurrentTime());
        }
        return Promise.resolve();
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._sisyfos.connected;
    }
    getDeviceState() {
        const deviceStateFromAPI = this._sisyfos.state;
        const deviceState = { channels: {} };
        for (const ch of Object.keys(deviceStateFromAPI.channels)) {
            const channelFromAPI = deviceStateFromAPI.channels[ch];
            const channel = Object.assign(Object.assign({}, channelFromAPI), { faderLevel: 0.75, pgmOn: 0, pstOn: 0, label: '', tlObjIds: [] });
            deviceState.channels[ch] = channel;
        }
        return deviceState;
    }
    /**
     * Transform the timeline state into a device state, which is in this case also
     * a timeline state.
     * @param state
     */
    convertStateToSisyfosState(state) {
        const deviceState = this.getDeviceState();
        _.each(state.layers, (tlObject, layerName) => {
            const layer = tlObject;
            let foundMapping = this.getMapping()[layerName]; // @todo: make ts understand this
            // if the tlObj is specifies to load to PST the original Layer is used to resolve the mapping
            if (!foundMapping && layer.isLookahead && layer.lookaheadForLayer) {
                foundMapping = this.getMapping()[layer.lookaheadForLayer];
            }
            if (foundMapping) {
                if (layer.isLookahead) {
                    deviceState.channels[foundMapping.channel].pstOn = layer.content.isPgm || 0;
                }
                else {
                    deviceState.channels[foundMapping.channel].pgmOn = layer.content.isPgm || 0;
                }
                if (layer.content.faderLevel !== undefined) {
                    deviceState.channels[foundMapping.channel].faderLevel = layer.content.faderLevel;
                }
                if (layer.content.fadeToBlack !== undefined) {
                    deviceState.channels[foundMapping.channel].fadeToBlack = layer.content.fadeToBlack;
                }
                if (layer.content.label !== undefined) {
                    deviceState.channels[foundMapping.channel].label = layer.content.label;
                }
                deviceState.channels[foundMapping.channel].tlObjIds.push(tlObject.id);
            }
        });
        return deviceState;
    }
    get deviceType() {
        return src_1.DeviceType.SISYFOS;
    }
    get deviceName() {
        return 'Sisyfos ' + this.deviceId;
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
                return this._commandReceiver(time, cmd.content, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    /**
     * Generates commands to transition from old to new state.
     * @param oldOscSendState The assumed current state
     * @param newOscSendState The desired state of the device
     */
    _diffStates(oldOscSendState, newOscSendState) {
        const commands = [];
        _.each(newOscSendState.channels, (newChannel, index) => {
            const oldChannel = oldOscSendState.channels[index];
            if (oldChannel && oldChannel.pgmOn !== newChannel.pgmOn) {
                commands.push({
                    context: 'Channel ${index} goes from "${oldChannel.pgmOn}" to "${newChannel.pgmOn}"',
                    content: {
                        type: sisyfos_1.Commands.TOGGLE_PGM,
                        channel: Number(index),
                        value: newChannel.pgmOn
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
            if (oldChannel && oldChannel.pstOn !== newChannel.pstOn) {
                commands.push({
                    context: 'Channel ${index} goes from "${oldChannel.pgmOn}" to "${newChannel.pgmOn}"',
                    content: {
                        type: sisyfos_1.Commands.TOGGLE_PST,
                        channel: Number(index),
                        value: newChannel.pstOn
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
            if (oldChannel && oldChannel.faderLevel !== newChannel.faderLevel) {
                commands.push({
                    context: 'faderLevel change',
                    content: {
                        type: sisyfos_1.Commands.SET_FADER,
                        channel: Number(index),
                        value: newChannel.faderLevel
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
            if (oldChannel && oldChannel.fadeToBlack !== newChannel.fadeToBlack) {
                commands.push({
                    context: 'fade all pgm to black',
                    content: {
                        type: sisyfos_1.Commands.FADE_TO_BLACK,
                        channel: 0,
                        value: newChannel.fadeToBlack
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
            if (newChannel.label !== '' && oldChannel.label !== newChannel.label) {
                commands.push({
                    context: 'set label on fader',
                    content: {
                        type: sisyfos_1.Commands.LABEL,
                        channel: Number(index),
                        value: newChannel.label
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
        });
        return commands;
    }
    _defaultCommandReceiver(_time, cmd, context, timelineObjId) {
        let cwc = {
            context: context,
            command: cmd,
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        try {
            this._sisyfos.send(cmd);
            return Promise.resolve();
        }
        catch (e) {
            return Promise.reject(e);
        }
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.SisyfosMessageDevice = SisyfosMessageDevice;
//# sourceMappingURL=sisyfos.js.map