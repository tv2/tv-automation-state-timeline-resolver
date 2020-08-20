"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const underScoreDeepExtend = require("underscore-deep-extend");
const device_1 = require("./device");
const src_1 = require("../types/src");
const atem_connection_1 = require("atem-connection");
const atem_state_1 = require("atem-state");
const doOnTime_1 = require("../doOnTime");
_.mixin({ deepExtend: underScoreDeepExtend(_) });
function jsonClone(src) {
    return JSON.parse(JSON.stringify(src));
}
function deepExtend(destination, ...sources) {
    // @ts-ignore (mixin)
    return _.deepExtend(destination, ...sources);
}
/**
 * This is a wrapper for the Atem Device. Commands to any and all atem devices will be sent through here.
 */
class AtemDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._initialized = false;
        this._connected = false; // note: ideally this should be replaced by this._atem.connected
        this.firstStateAfterMakeReady = true; // note: temprorary for some improved logging
        this._atemStatus = {
            psus: []
        };
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Atem');
    }
    /**
     * Initiates the connection with the ATEM through the atem-connection lib
     * and initiates Atem State lib.
     */
    init(options) {
        return new Promise((resolve, reject) => {
            // This is where we would do initialization, like connecting to the devices, etc
            this._state = new atem_state_1.AtemState();
            this._atem = new atem_connection_1.Atem({ externalLog: (...args) => this.emit('info', JSON.stringify(args)) });
            this._atem.once('connected', () => {
                // check if state has been initialized:
                this._connected = true;
                this._initialized = true;
                resolve(true);
            });
            this._atem.on('connected', () => {
                let time = this.getCurrentTime();
                this.setState(this._atem.state, time);
                this._connected = true;
                this._connectionChanged();
                this.emit('resetResolver');
            });
            this._atem.on('disconnected', () => {
                this._connected = false;
                this._connectionChanged();
            });
            this._atem.on('error', (e) => this.emit('error', 'Atem', e));
            this._atem.on('stateChanged', (state) => this._onAtemStateChanged(state));
            this._atem.connect(options.host, options.port)
                .catch(e => {
                reject(e);
            });
        });
    }
    /**
     * Safely terminate everything to do with this device such that it can be
     * garbage collected.
     */
    terminate() {
        this._doOnTime.dispose();
        return new Promise((resolve) => {
            // TODO: implement dispose function in atem-connection
            this._atem.disconnect()
                .then(() => {
                resolve(true);
            })
                .catch(() => {
                resolve(false);
            });
        });
    }
    /**
     * Prepare device for playout
     * @param okToDestroyStuff If true, may break output
     */
    async makeReady(okToDestroyStuff) {
        this.firstStateAfterMakeReady = true;
        if (okToDestroyStuff) {
            this._doOnTime.clearQueueNowAndAfter(this.getCurrentTime());
            this.setState(this._atem.state, this.getCurrentTime());
        }
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Process a state, diff against previous state and generate commands to
     * be executed at the state's time.
     * @param newState The state to handle
     */
    handleState(newState) {
        if (!this._initialized) { // before it's initialized don't do anything
            this.emit('warning', 'Atem not initialized yet');
            return;
        }
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: this._getDefaultState() }).state;
        let oldAtemState = oldState;
        let newAtemState = this.convertStateToAtem(newState);
        if (this.firstStateAfterMakeReady) { // emit a debug message with the states:
            this.firstStateAfterMakeReady = false;
            this.emit('debug', JSON.stringify({ reason: 'firstStateAfterMakeReady', before: (oldAtemState || {}).video, after: (newAtemState || {}).video }));
        }
        let commandsToAchieveState = this._diffStates(oldAtemState, newAtemState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newAtemState, newState.time);
    }
    /**
     * Clear any scheduled commands after `clearAfterTime`
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime) {
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._connected;
    }
    /**
     * Convert a timeline state into an Atem state.
     * @param state The state to be converted
     */
    convertStateToAtem(state) {
        if (!this._initialized)
            throw Error('convertStateToAtem cannot be used before inititialized');
        // Start out with default state:
        const deviceState = this._getDefaultState();
        // Sort layer based on Layer name
        const sortedLayers = _.map(state.layers, (tlObject, layerName) => ({ layerName, tlObject }))
            .sort((a, b) => a.layerName.localeCompare(b.layerName));
        // For every layer, augment the state
        _.each(sortedLayers, ({ tlObject, layerName }) => {
            // const content = tlObject.content
            let mapping = this.getMapping()[layerName];
            if (mapping && mapping.deviceId === this.deviceId) {
                if (mapping.index !== undefined && mapping.index >= 0) { // index must be 0 or higher
                    switch (mapping.mappingType) {
                        case src_1.MappingAtemType.MixEffect:
                            if (tlObject.content.type === src_1.TimelineContentTypeAtem.ME) {
                                let me = deviceState.video.ME[mapping.index];
                                let atemObj = tlObject;
                                if (me)
                                    deepExtend(me, atemObj.content.me);
                            }
                            break;
                        case src_1.MappingAtemType.DownStreamKeyer:
                            if (tlObject.content.type === src_1.TimelineContentTypeAtem.DSK) {
                                let dsk = deviceState.video.downstreamKeyers[mapping.index];
                                let atemObj = tlObject;
                                if (dsk)
                                    deepExtend(dsk, atemObj.content.dsk);
                            }
                            break;
                        case src_1.MappingAtemType.SuperSourceBox:
                            if (tlObject.content.type === src_1.TimelineContentTypeAtem.SSRC) {
                                let ssrc = deviceState.video.superSources[mapping.index];
                                let atemObj = tlObject;
                                if (ssrc)
                                    deepExtend(ssrc.boxes, atemObj.content.ssrc.boxes);
                            }
                            break;
                        case src_1.MappingAtemType.SuperSourceProperties:
                            if (tlObject.content.type === src_1.TimelineContentTypeAtem.SSRCPROPS) {
                                let ssrc = deviceState.video.superSources[mapping.index];
                                let atemObj = tlObject;
                                if (ssrc)
                                    deepExtend(ssrc.properties, atemObj.content.ssrcProps);
                            }
                            break;
                        case src_1.MappingAtemType.Auxilliary:
                            if (tlObject.content.type === src_1.TimelineContentTypeAtem.AUX) {
                                let atemObj = tlObject;
                                deviceState.video.auxilliaries[mapping.index] = atemObj.content.aux.input;
                            }
                            break;
                        case src_1.MappingAtemType.MediaPlayer:
                            if (tlObject.content.type === src_1.TimelineContentTypeAtem.MEDIAPLAYER) {
                                let ms = deviceState.media.players[mapping.index];
                                let atemObj = tlObject;
                                if (ms)
                                    deepExtend(ms, atemObj.content.mediaPlayer);
                            }
                            break;
                        case src_1.MappingAtemType.AudioChannel:
                            if (tlObject.content.type === src_1.TimelineContentTypeAtem.AUDIOCHANNEL) {
                                const chan = deviceState.audio.channels[mapping.index];
                                let atemObj = tlObject;
                                if (chan) {
                                    deviceState.audio.channels[mapping.index] = {
                                        ...chan,
                                        ...atemObj.content.audioChannel
                                    };
                                }
                            }
                            break;
                    }
                }
                if (mapping.mappingType === src_1.MappingAtemType.MacroPlayer) {
                    if (tlObject.content.type === src_1.TimelineContentTypeAtem.MACROPLAYER) {
                        let ms = deviceState.macro.macroPlayer;
                        let atemObj = tlObject;
                        if (ms)
                            deepExtend(ms, atemObj.content.macroPlayer);
                    }
                }
            }
        });
        return deviceState;
    }
    get deviceType() {
        return src_1.DeviceType.ATEM;
    }
    get deviceName() {
        return 'Atem ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    /**
     * Check status and return it with useful messages appended.
     */
    getStatus() {
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (statusCode === device_1.StatusCode.GOOD) {
            if (!this._connected) {
                statusCode = device_1.StatusCode.BAD;
                messages.push(`Atem disconnected`);
            }
        }
        if (statusCode === device_1.StatusCode.GOOD) {
            let psus = this._atemStatus.psus;
            _.each(psus, (psu, i) => {
                if (!psu) {
                    statusCode = device_1.StatusCode.WARNING_MAJOR;
                    messages.push(`Atem PSU ${i + 1} is faulty. The device has ${psus.length} PSU(s) in total.`);
                }
            });
        }
        if (!this._initialized) {
            statusCode = device_1.StatusCode.BAD;
            messages.push(`ATEM device connection not initialized (restart required)`);
        }
        let deviceStatus = {
            statusCode: statusCode,
            messages: messages,
            active: this.isActive
        };
        return deviceStatus;
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd.command, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     * @param oldAtemState
     * @param newAtemState
     */
    _diffStates(oldAtemState, newAtemState) {
        // Ensure the state diffs the correct version
        this._state.version = this._atem.state.info.apiVersion;
        return _.map(this._state.diffStates(oldAtemState, newAtemState), (cmd) => {
            if (_.has(cmd, 'command') && _.has(cmd, 'context')) {
                return cmd;
            }
            else {
                // backwards compability, to be removed later:
                return {
                    command: cmd,
                    context: null,
                    timelineObjId: '' // @todo: implement in Atem-state
                };
            }
        });
    }
    /**
     * Returns the default state of an atem device, partially base on the topology and partially based on reported
     * properties. This can be used to augment with device state info.
     */
    _getDefaultState() {
        let deviceState = new atem_state_1.State();
        for (let i = 0; i < this._atem.state.info.capabilities.MEs; i++) {
            deviceState.video.ME[i] = Object.assign(new atem_connection_1.VideoState.MixEffect(i), jsonClone(atem_state_1.Defaults.Video.MixEffect));
            for (const usk in this._atem.state.video.ME[i].upstreamKeyers) {
                deviceState.video.ME[i].upstreamKeyers[usk] = jsonClone(atem_state_1.Defaults.Video.UpstreamKeyer(Number(usk)));
                for (const flyKf in this._atem.state.video.ME[i].upstreamKeyers[usk].flyKeyframes) {
                    deviceState.video.ME[i].upstreamKeyers[usk].flyKeyframes[flyKf] = jsonClone(atem_state_1.Defaults.Video.flyKeyframe(Number(flyKf)));
                }
            }
        }
        for (let i = 0; i < Object.keys(this._atem.state.video.downstreamKeyers).length; i++) {
            deviceState.video.downstreamKeyers[i] = jsonClone(atem_state_1.Defaults.Video.DownStreamKeyer);
        }
        for (let i = 0; i < this._atem.state.info.capabilities.auxilliaries; i++) {
            deviceState.video.auxilliaries[i] = jsonClone(atem_state_1.Defaults.Video.defaultInput);
        }
        for (let i = 0; i < this._atem.state.info.capabilities.superSources; i++) {
            const ssrc = new atem_connection_1.VideoState.SuperSource(i);
            ssrc.properties = jsonClone(atem_state_1.Defaults.Video.SuperSourceProperties);
            ssrc.border = jsonClone(atem_state_1.Defaults.Video.SuperSourceBorder);
            const ssrcInfo = this._atem.state.info.superSources[i];
            const boxCount = ssrcInfo ? ssrcInfo.boxCount : 4;
            for (let i = 0; i < boxCount; i++) {
                ssrc.boxes[i] = jsonClone(atem_state_1.Defaults.Video.SuperSourceBox);
            }
            deviceState.video.superSources[i] = ssrc;
        }
        for (const i of Object.keys(this._atem.state.audio.channels)) {
            deviceState.audio.channels[i] = jsonClone(atem_state_1.Defaults.Audio.Channel);
        }
        deviceState.macro.macroPlayer = jsonClone(atem_state_1.Defaults.Video.MacroPlayer);
        for (let i = 0; i < this._atem.state.info.capabilities.mediaPlayers; i++) {
            deviceState.media.players[i] = {
                ...jsonClone(atem_state_1.Defaults.Video.MediaPlayer),
                // default to matching index
                clipIndex: i,
                stillIndex: i
            };
        }
        return deviceState;
    }
    _defaultCommandReceiver(_time, command, context, timelineObjId) {
        let cwc = {
            context: context,
            command: command,
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        return this._atem.sendCommand(command)
            .then(() => {
            // @todo: command was acknowledged by atem, how will we check if it did what we wanted?
        })
            .catch((error) => {
            this.emit('commandError', error, cwc);
        });
    }
    _onAtemStateChanged(newState) {
        let psus = newState.info.power || [];
        if (!_.isEqual(this._atemStatus.psus, psus)) {
            this._atemStatus.psus = _.clone(psus);
            this._connectionChanged();
        }
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.AtemDevice = AtemDevice;
//# sourceMappingURL=atem.js.map