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
function deepExtend(destination, ...sources) {
    // @ts-ignore (mixin)
    return _.deepExtend(destination, ...sources);
}
class AtemDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options, conductor) {
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
        });
        this._doOnTime.on('error', e => this.emit('error', 'doOnTime', e));
        this._conductor = conductor;
    }
    /**
     * Initiates the connection with the ATEM through the atem-connection lib.
     */
    init(options) {
        return new Promise((resolve, reject) => {
            // This is where we would do initialization, like connecting to the devices, etc
            this._state = new atem_state_1.AtemState();
            this._atem = new atem_connection_1.Atem();
            this._atem.once('connected', () => {
                // check if state has been initialized:
                this._connected = true;
                this._initialized = true;
                resolve(true);
            });
            this._atem.on('connected', () => {
                this.setState(this._atem.state, this.getCurrentTime());
                this._connected = true;
                this._connectionChanged();
                this._conductor.resetResolver();
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
    terminate() {
        this._doOnTime.dispose();
        return new Promise((resolve) => {
            // TODO: implement dispose function in atem-connection
            // this._atem.dispose()
            // .then(() => {
            // resolve(true)
            // })
            resolve(true);
        });
    }
    makeReady(okToDestroyStuff) {
        this.firstStateAfterMakeReady = true;
        if (okToDestroyStuff) {
            this._doOnTime.clearQueueNowAndAfter(this.getCurrentTime());
            this.setState(this._atem.state, this.getCurrentTime());
        }
        return Promise.resolve();
    }
    handleState(newState) {
        // Handle this new state, at the point in time specified
        // @ts-ignore
        // console.log('handleState', JSON.stringify(newState, ' ', 2))
        // console.log('handleState', newState.LLayers['myLayer0'])
        if (!this._initialized) {
            // before it's initialized don't do anything
            this.emit('info', 'Atem not initialized yet');
            return;
        }
        let oldState = (this.getStateBefore(newState.time) || { state: this._getDefaultState() }).state;
        let oldAtemState = oldState;
        let newAtemState = this.convertStateToAtem(newState);
        if (this.firstStateAfterMakeReady) {
            this.firstStateAfterMakeReady = false;
            this.emit('debug', JSON.stringify({ reason: 'firstStateAfterMakeReady', before: (oldAtemState || {}).video, after: (newAtemState || {}).video }));
        }
        // @ts-ignore
        // console.log('newAtemState', JSON.stringify(newAtemState, ' ', 2))
        // console.log('oldAtemState', JSON.stringify(oldAtemState, ' ', 2))
        // console.log('newAtemState', newAtemState.video.ME[0])
        let commandsToAchieveState = this._diffStates(oldAtemState, newAtemState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newState.time);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newAtemState, newState.time);
    }
    clearFuture(clearAfterTime) {
        // Clear any scheduled commands after this time
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._connected;
    }
    convertStateToAtem(state) {
        if (!this._initialized)
            throw Error('convertStateToAtem cannot be used before inititialized');
        // Convert the timeline state into something we can use easier:
        const deviceState = this._getDefaultState();
        const sortedLayers = _.map(state.LLayers, (tlObject, layerName) => ({ layerName, tlObject }))
            .sort((a, b) => a.layerName.localeCompare(b.layerName));
        _.each(sortedLayers, ({ tlObject, layerName }) => {
            const tlObjectExt = tlObject;
            const content = tlObject.resolved || tlObject.content;
            let mapping = this.mapping[layerName]; // tslint:disable-line
            if (!mapping && tlObjectExt.originalLLayer) {
                mapping = this.mapping[tlObjectExt.originalLLayer]; // tslint:disable-line
            }
            if (mapping) {
                if (mapping.index !== undefined && mapping.index >= 0) { // index must be 0 or higher
                    switch (mapping.mappingType) {
                        case src_1.MappingAtemType.MixEffect:
                            if (tlObjectExt.isBackground) {
                                break;
                            }
                            if (content.type === src_1.TimelineContentTypeAtem.ME) {
                                let me = deviceState.video.ME[mapping.index];
                                if (me)
                                    deepExtend(me, content.attributes);
                            }
                            break;
                        case src_1.MappingAtemType.DownStreamKeyer:
                            if (tlObjectExt.isBackground) {
                                break;
                            }
                            if (content.type === src_1.TimelineContentTypeAtem.DSK) {
                                let dsk = deviceState.video.downstreamKeyers[mapping.index];
                                if (dsk)
                                    deepExtend(dsk, content.attributes);
                            }
                            break;
                        case src_1.MappingAtemType.SuperSourceBox:
                            if (tlObjectExt.isBackground && (!tlObjectExt.originalLLayer || tlObjectExt.originalLLayer && state.LLayers[tlObjectExt.originalLLayer])) {
                                break;
                            }
                            if (content.type === src_1.TimelineContentTypeAtem.SSRC) {
                                let ssrc = deviceState.video.superSourceBoxes;
                                if (ssrc)
                                    deepExtend(ssrc, content.attributes.boxes);
                            }
                            break;
                        case src_1.MappingAtemType.Auxilliary:
                            if (tlObjectExt.isBackground) {
                                break;
                            }
                            if (content.type === src_1.TimelineContentTypeAtem.AUX) {
                                deviceState.video.auxilliaries[mapping.index] = content.attributes.input;
                            }
                            break;
                        case src_1.MappingAtemType.MediaPlayer:
                            if (tlObjectExt.isBackground) {
                                break;
                            }
                            if (content.type === src_1.TimelineContentTypeAtem.MEDIAPLAYER) {
                                let ms = deviceState.media.players[mapping.index];
                                if (ms)
                                    deepExtend(ms, content.attributes);
                            }
                            break;
                    }
                }
                if (mapping.mappingType === src_1.MappingAtemType.SuperSourceProperties) {
                    if (!(tlObjectExt.isBackground && (!tlObjectExt.originalLLayer || tlObjectExt.originalLLayer && state.LLayers[tlObjectExt.originalLLayer]))) {
                        if (content.type === src_1.TimelineContentTypeAtem.SSRCPROPS) {
                            let ssrc = deviceState.video.superSourceProperties;
                            if (ssrc)
                                deepExtend(ssrc, content.attributes);
                        }
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
            // psus = [true, false] // tmp test
            _.each(psus, (psu, i) => {
                if (!psu) {
                    statusCode = device_1.StatusCode.WARNING_MAJOR;
                    messages.push(`Atem PSU ${i + 1} is faulty. The device has ${psus.length} PSU(s) in total.`);
                }
            });
        }
        let deviceStatus = {
            statusCode: statusCode,
            messages: messages
        };
        return deviceStatus;
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                return this._commandReceiver(time, cmd.command, cmd.context);
            }, cmd);
        });
    }
    _diffStates(oldAbstractState, newAbstractState) {
        return _.map(this._state.diffStates(oldAbstractState, newAbstractState), (cmd) => {
            if (_.has(cmd, 'command') && _.has(cmd, 'context')) {
                return cmd;
            }
            else {
                // backwards compability, to be removed later:
                return {
                    command: cmd,
                    context: null
                };
            }
        });
    }
    _getDefaultState() {
        let deviceState = new atem_state_1.State();
        for (let i = 0; i < this._atem.state.info.capabilities.MEs; i++) {
            deviceState.video.ME[i] = JSON.parse(JSON.stringify(atem_state_1.Defaults.Video.MixEffect));
            for (const usk in this._atem.state.video.ME[i].upstreamKeyers) {
                deviceState.video.ME[i].upstreamKeyers[usk] = JSON.parse(JSON.stringify(atem_state_1.Defaults.Video.UpstreamKeyer(Number(usk))));
                for (const flyKf in this._atem.state.video.ME[i].upstreamKeyers[usk].flyKeyframes) {
                    deviceState.video.ME[i].upstreamKeyers[usk].flyKeyframes[flyKf] = JSON.parse(JSON.stringify(atem_state_1.Defaults.Video.flyKeyframe(Number(flyKf))));
                }
            }
        }
        for (let i = 0; i < Object.keys(this._atem.state.video.downstreamKeyers).length; i++) {
            deviceState.video.downstreamKeyers[i] = JSON.parse(JSON.stringify(atem_state_1.Defaults.Video.DownStreamKeyer));
        }
        for (let i = 0; i < this._atem.state.info.capabilities.auxilliaries; i++) {
            deviceState.video.auxilliaries[i] = JSON.parse(JSON.stringify(atem_state_1.Defaults.Video.defaultInput));
        }
        for (let i = 0; i < this._atem.state.info.superSourceBoxes; i++) {
            deviceState.video.superSourceBoxes[i] = JSON.parse(JSON.stringify(atem_state_1.Defaults.Video.SuperSourceBox));
        }
        if (this._atem.state.video.superSourceProperties) {
            deviceState.video.superSourceProperties = JSON.parse(JSON.stringify(atem_state_1.Defaults.Video.SuperSourceProperties));
        }
        return deviceState;
    }
    _defaultCommandReceiver(_time, command, context) {
        let cwc = {
            context: context,
            command: command
        };
        this.emit('debug', cwc);
        return this._atem.sendCommand(command).then(() => {
            // @todo: command was acknowledged by atem, how will we check if it did what we wanted?
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