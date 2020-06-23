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
        this._resyncing = false;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._sisyfos = new sisyfosAPI_1.SisyfosApi();
        this._sisyfos.on('error', e => this.emit('error', 'Sisyfos', e));
        this._sisyfos.on('connected', () => {
            this._connectionChanged();
        });
        this._sisyfos.on('disconnected', () => {
            this._connectionChanged();
        });
        this._sisyfos.on('mixerOnline', (onlineStatus) => {
            this._sisyfos.setMixerOnline(onlineStatus);
            this._connectionChanged();
        });
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Sisyfos');
    }
    init(initOptions) {
        this._sisyfos.once('initialized', () => {
            this.setState(this.getDeviceState(false), this.getCurrentTime());
            this.emit('resetResolver');
        });
        return this._sisyfos.connect(initOptions.host, initOptions.port)
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
        let oldState = (this.getStateBefore(previousStateTime) || { state: { channels: {}, resync: false } }).state;
        let newAbstractState = this.convertStateToSisyfosState(newState);
        this._handleStateInner(oldState, newAbstractState, previousStateTime, newState.time);
    }
    _handleStateInner(oldState, newAbstractState, previousStateTime, newTime) {
        // Generate commands necessary to transition to the new state
        let commandsToAchieveState = this._diffStates(oldState, newAbstractState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newTime);
        // store the new state, for later use:
        this.setState(newAbstractState, newTime);
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
        if (!this._sisyfos.state && !this._resyncing) {
            statusCode = device_1.StatusCode.BAD;
            messages.push(`Sisyfos device connection not initialized (restart required)`);
        }
        if (!this._sisyfos.mixerOnline) {
            statusCode = device_1.StatusCode.BAD;
            messages.push(`Sisyfos has no connection to Audiomixer`);
        }
        return {
            statusCode: statusCode,
            messages: messages
        };
    }
    makeReady(okToDestroyStuff) {
        return this._makeReadyInner(okToDestroyStuff);
    }
    _makeReadyInner(okToDestroyStuff, resync) {
        if (okToDestroyStuff) {
            if (resync) {
                this._resyncing = true;
                // If state is still not reinitialised afer 5 seconds, we may have a problem.
                setTimeout(() => this._resyncing = false, 5000);
            }
            this._doOnTime.clearQueueNowAndAfter(this.getCurrentTime());
            this._sisyfos.reInitialize();
            this._sisyfos.on('initialized', () => {
                if (resync) {
                    this._resyncing = false;
                    const targetState = this.getState(this.getCurrentTime());
                    if (targetState) {
                        this._handleStateInner(this.getDeviceState(false), targetState.state, targetState.time, this.getCurrentTime());
                    }
                }
                else {
                    this.setState(this.getDeviceState(false), this.getCurrentTime());
                    this.emit('resetResolver');
                }
            });
        }
        return Promise.resolve();
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._sisyfos.connected;
    }
    getDeviceState(isDefaultState = true) {
        let deviceStateFromAPI = this._sisyfos.state;
        const deviceState = {
            channels: {},
            resync: false
        };
        if (!deviceStateFromAPI)
            deviceStateFromAPI = deviceState;
        for (const ch of Object.keys(deviceStateFromAPI.channels)) {
            const channelFromAPI = deviceStateFromAPI.channels[ch];
            let channel = {
                ...channelFromAPI,
                tlObjIds: []
            };
            if (isDefaultState) { // reset values for default state
                channel = {
                    ...channel,
                    ...this.getDefaultStateChannel()
                };
            }
            deviceState.channels[ch] = channel;
        }
        return deviceState;
    }
    getDefaultStateChannel() {
        return {
            faderLevel: 0.75,
            pgmOn: 0,
            pstOn: 0,
            label: '',
            visible: true,
            tlObjIds: []
        };
    }
    /**
     * Transform the timeline state into a device state, which is in this case also
     * a timeline state.
     * @param state
     */
    convertStateToSisyfosState(state) {
        const deviceState = this.getDeviceState();
        const mappings = this.getMapping();
        _.each(state.layers, (tlObject, layerName) => {
            const layer = tlObject;
            let foundMapping = mappings[layerName]; // @todo: make ts understand this
            const content = tlObject.content;
            // Allow resync without valid channel mapping
            if (layer.content.resync !== undefined) {
                deviceState.resync = deviceState.resync || layer.content.resync;
            }
            // if the tlObj is specifies to load to PST the original Layer is used to resolve the mapping
            if (!foundMapping && layer.isLookahead && layer.lookaheadForLayer) {
                foundMapping = mappings[layer.lookaheadForLayer];
            }
            // Preparation: put all channels that comes from the state in an array:
            const newChannels = [];
            if (foundMapping) {
                // @ts-ignore backwards-compatibility:
                if (!foundMapping.mappingType)
                    foundMapping.mappingType = sisyfos_1.MappingSisyfosType.CHANNEL;
                // @ts-ignore backwards-compatibility:
                if (content.type === 'sisyfos')
                    content.type = sisyfos_1.TimelineContentTypeSisyfos.CHANNEL;
                if (foundMapping.mappingType === sisyfos_1.MappingSisyfosType.CHANNEL &&
                    content.type === sisyfos_1.TimelineContentTypeSisyfos.CHANNEL) {
                    newChannels.push({
                        ...content,
                        channel: foundMapping.channel,
                        overridePriority: content.overridePriority || 0,
                        isLookahead: layer.isLookahead || false,
                        tlObjId: layer.id
                    });
                }
                else if (foundMapping.mappingType === sisyfos_1.MappingSisyfosType.CHANNELS &&
                    content.type === sisyfos_1.TimelineContentTypeSisyfos.CHANNELS) {
                    _.each(content.channels, channel => {
                        const referencedMapping = mappings[channel.mappedLayer];
                        if (referencedMapping && referencedMapping.mappingType === sisyfos_1.MappingSisyfosType.CHANNEL) {
                            newChannels.push({
                                ...channel,
                                channel: referencedMapping.channel,
                                overridePriority: content.overridePriority || 0,
                                isLookahead: layer.isLookahead || false,
                                tlObjId: layer.id
                            });
                        }
                    });
                }
                deviceState.resync = deviceState.resync || content.resync || false;
            }
            // Sort by overridePriority, so that those with highest overridePriority will be applied last
            _.each(_.sortBy(newChannels, channel => channel.overridePriority), newChannel => {
                if (!deviceState.channels[newChannel.channel]) {
                    deviceState.channels[newChannel.channel] = this.getDefaultStateChannel();
                }
                const channel = deviceState.channels[newChannel.channel];
                if (newChannel.isPgm !== undefined) {
                    if (newChannel.isLookahead) {
                        channel.pstOn = newChannel.isPgm || 0;
                    }
                    else {
                        channel.pgmOn = newChannel.isPgm || 0;
                    }
                }
                if (newChannel.faderLevel !== undefined)
                    channel.faderLevel = newChannel.faderLevel;
                if (newChannel.label !== undefined)
                    channel.label = newChannel.label;
                if (newChannel.visible !== undefined)
                    channel.visible = newChannel.visible;
                channel.tlObjIds.push(tlObject.id);
            });
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
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    _diffStates(oldOscSendState, newOscSendState) {
        const commands = [];
        if (newOscSendState.resync && !oldOscSendState.resync) {
            commands.push({
                context: `Resyncing with Sisyfos`,
                content: {
                    type: sisyfosAPI_1.SisyfosCommandType.RESYNC
                },
                timelineObjId: ''
            });
        }
        _.each(newOscSendState.channels, (newChannel, index) => {
            const oldChannel = oldOscSendState.channels[index];
            if (oldChannel && oldChannel.pgmOn !== newChannel.pgmOn) {
                commands.push({
                    context: `Channel ${index} pgm goes from "${oldChannel.pgmOn}" to "${newChannel.pgmOn}"`,
                    content: {
                        type: sisyfosAPI_1.SisyfosCommandType.TOGGLE_PGM,
                        channel: Number(index),
                        value: newChannel.pgmOn
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
            if (oldChannel && oldChannel.pstOn !== newChannel.pstOn) {
                commands.push({
                    context: `Channel ${index} pst goes from "${oldChannel.pstOn}" to "${newChannel.pstOn}"`,
                    content: {
                        type: sisyfosAPI_1.SisyfosCommandType.TOGGLE_PST,
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
                        type: sisyfosAPI_1.SisyfosCommandType.SET_FADER,
                        channel: Number(index),
                        value: newChannel.faderLevel
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
            newChannel.label = newChannel.label || (oldChannel ? oldChannel.label : '');
            if (oldChannel && newChannel.label !== '' && oldChannel.label !== newChannel.label) {
                commands.push({
                    context: 'set label on fader',
                    content: {
                        type: sisyfosAPI_1.SisyfosCommandType.LABEL,
                        channel: Number(index),
                        value: newChannel.label
                    },
                    timelineObjId: newChannel.tlObjIds[0] || ''
                });
            }
            if (oldChannel && oldChannel.visible !== newChannel.visible) {
                commands.push({
                    context: `Channel ${index} Visibility goes from "${oldChannel.visible}" to "${newChannel.visible}"`,
                    content: {
                        type: sisyfosAPI_1.SisyfosCommandType.VISIBLE,
                        channel: Number(index),
                        value: newChannel.visible
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
        if (cmd.type === sisyfosAPI_1.SisyfosCommandType.RESYNC) {
            return this._makeReadyInner(true, true);
        }
        else {
            try {
                this._sisyfos.send(cmd);
                return Promise.resolve();
            }
            catch (e) {
                return Promise.reject(e);
            }
        }
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.SisyfosMessageDevice = SisyfosMessageDevice;
//# sourceMappingURL=sisyfos.js.map