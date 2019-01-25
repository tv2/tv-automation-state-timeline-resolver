"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const device_1 = require("./device");
const casparcg_connection_1 = require("casparcg-connection");
const src_1 = require("../types/src");
const casparcg_state_1 = require("casparcg-state");
const doOnTime_1 = require("../doOnTime");
const request = require("request");
// const BGLOADTIME = 1000 // the time we will look back to schedule a loadbg command.
/*
    This is a wrapper for a CasparCG device. All commands will be sent through this
*/
const MAX_TIMESYNC_TRIES = 5;
const MAX_TIMESYNC_DURATION = 40;
class CasparCGDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options, conductor) {
        super(deviceId, deviceOptions, options);
        this._queue = {};
        this._timeToTimecodeMap = { time: 0, timecode: 0 };
        this._timeBase = {};
        this._connected = false;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
            if (deviceOptions.options.timeBase)
                this._timeBase = deviceOptions.options.timeBase;
        }
        this._ccgState = new casparcg_state_1.CasparCGState({
            currentTime: this.getCurrentTime,
            externalLog: (...args) => {
                this.emit('debug', ...args);
            }
        });
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        });
        this._doOnTime.on('error', e => this.emit('error', 'doOnTime', e));
        this._conductor = conductor;
    }
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(connectionOptions) {
        this._connectionOptions = connectionOptions;
        this._ccg = new casparcg_connection_1.CasparCG({
            host: connectionOptions.host,
            port: connectionOptions.port,
            autoConnect: true,
            virginServerCheck: true,
            onConnectionChanged: (connected) => {
                this._connected = connected;
                this._connectionChanged();
            }
        });
        this._useScheduling = connectionOptions.useScheduling;
        this._ccg.on(casparcg_connection_1.CasparCGSocketStatusEvent.CONNECTED, (event) => {
            this.makeReady(false) // always make sure timecode is correct, setting it can never do bad
                .catch((e) => this.emit('error', 'casparCG.makeReady', e));
            if (event.valueOf().virginServer === true) {
                // a "virgin server" was just restarted (so it is cleared & black).
                // Otherwise it was probably just a loss of connection
                this._ccgState.softClearState();
                this.clearStates();
                this._conductor.resetResolver(); // trigger a re-calc
            }
        });
        return new Promise((resolve, reject) => {
            this._ccg.info()
                .then((command) => {
                this._ccgState.initStateFromChannelInfo(_.map(command.response.data, (obj) => {
                    return {
                        channelNo: obj.channel,
                        videoMode: obj.format.toUpperCase(),
                        fps: obj.frameRate
                    };
                }));
                resolve(true);
            }).catch((e) => reject(e));
        }).then(() => {
            return true;
        });
    }
    terminate() {
        this._doOnTime.dispose();
        return new Promise((resolve) => {
            this._ccg.disconnect();
            this._ccg.onDisconnected = () => {
                resolve();
            };
        });
    }
    /**
     * Generates an array of CasparCG commands by comparing the newState against the oldState, or the current device state.
     */
    handleState(newState) {
        // check if initialized:
        if (!this._ccgState.isInitialised) {
            this.emit('warning', 'CasparCG State not initialized yet');
            return;
        }
        let oldState = (this.getStateBefore(newState.time) || { state: { time: 0, LLayers: {}, GLayers: {} } }).state;
        let newCasparState = this.convertStateToCaspar(newState);
        let oldCasparState = this.convertStateToCaspar(oldState);
        let commandsToAchieveState = this._diffStates(oldCasparState, newCasparState);
        // console.log('commandsToAchieveState', commandsToAchieveState)
        // clear any queued commands later than this time:
        if (this._useScheduling) {
            this._clearScheduledFutureCommands(newState.time, commandsToAchieveState);
        }
        else {
            this._doOnTime.clearQueueNowAndAfter(newState.time);
        }
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newState, newState.time);
    }
    clearFuture(clearAfterTime) {
        // Clear any scheduled commands after this time
        if (this._useScheduling) {
            for (let token in this._queue) {
                if (this._queue[token].time > clearAfterTime) {
                    this._doCommand(new casparcg_connection_1.AMCP.ScheduleRemoveCommand(token));
                }
            }
        }
        else {
            this._doOnTime.clearQueueAfter(clearAfterTime);
        }
    }
    get canConnect() {
        return true;
    }
    get connected() {
        // Returns connection status
        return this._ccg.connected;
    }
    get deviceType() {
        return src_1.DeviceType.CASPARCG;
    }
    get deviceName() {
        return 'CasparCG ' + this.deviceId + this._ccg.host + ':' + this._ccg.port;
    }
    get queue() {
        if (this._queue) {
            return _.map(this._queue, (val, index) => [val, index]);
        }
        else {
            return [];
        }
    }
    /**
     * Takes a timeline state and returns a CasparCG State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToCaspar(timelineState) {
        const caspar = new casparcg_state_1.CasparCG.State();
        _.each(timelineState.LLayers, (layer, layerName) => {
            // tslint:disable-next-line
            const layerExt = layer;
            let foundMapping = this.mapping[layerName];
            if (!foundMapping && layerExt.isBackground && layerExt.originalLLayer) {
                foundMapping = this.mapping[layerExt.originalLLayer];
            }
            if (foundMapping &&
                foundMapping.device === src_1.DeviceType.CASPARCG &&
                _.has(foundMapping, 'channel') &&
                _.has(foundMapping, 'layer')) {
                const mapping = {
                    device: src_1.DeviceType.CASPARCG,
                    deviceId: foundMapping.deviceId,
                    channel: foundMapping.channel || 0,
                    layer: foundMapping.layer || 0
                };
                const channel = caspar.channels[mapping.channel] ? caspar.channels[mapping.channel] : new casparcg_state_1.CasparCG.Channel();
                channel.channelNo = Number(mapping.channel) || 1;
                // @todo: check if we need to get fps.
                channel.fps = 25 / 1000; // 25 fps over 1000ms
                caspar.channels[channel.channelNo] = channel;
                let stateLayer = null;
                if (layer.content.type === src_1.TimelineContentTypeCasparCg.VIDEO || // to be deprecated & replaced by MEDIA
                    layer.content.type === src_1.TimelineContentTypeCasparCg.AUDIO || // to be deprecated & replaced by MEDIA
                    layer.content.type === src_1.TimelineContentTypeCasparCg.MEDIA) {
                    const mediaObj = layer;
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.MEDIA,
                        media: mediaObj.content.attributes.file,
                        playTime: mediaObj.resolved.startTime || null,
                        pauseTime: mediaObj.resolved.pauseTime || null,
                        playing: mediaObj.resolved.playing !== undefined ? mediaObj.resolved.playing : true,
                        looping: mediaObj.content.attributes.loop,
                        seek: mediaObj.content.attributes.seek,
                        channelLayout: mediaObj.content.attributes.channelLayout
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === src_1.TimelineContentTypeCasparCg.IP) {
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.MEDIA,
                        media: layer.content.attributes.uri,
                        channelLayout: layer.content.attributes.channelLayout,
                        playTime: null,
                        playing: true,
                        seek: 0 // ip inputs can't be seeked
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === src_1.TimelineContentTypeCasparCg.INPUT) {
                    const inputObj = layer;
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.INPUT,
                        media: 'decklink',
                        input: {
                            device: inputObj.content.attributes.device,
                            channelLayout: inputObj.content.attributes.channelLayout
                        },
                        playing: true,
                        playTime: null
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === src_1.TimelineContentTypeCasparCg.TEMPLATE) {
                    const recordObj = layer;
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.TEMPLATE,
                        media: recordObj.content.attributes.name,
                        playTime: recordObj.resolved.startTime || null,
                        playing: true,
                        templateType: recordObj.content.attributes.type || 'html',
                        templateData: recordObj.content.attributes.data,
                        cgStop: recordObj.content.attributes.useStopCommand
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === src_1.TimelineContentTypeCasparCg.HTMLPAGE) {
                    const htmlObj = layer;
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.HTMLPAGE,
                        media: htmlObj.content.attributes.url,
                        playTime: htmlObj.resolved.startTime || null,
                        playing: true
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === src_1.TimelineContentTypeCasparCg.ROUTE) {
                    const routeObj = layer;
                    if (routeObj.content.attributes.LLayer) {
                        // tslint:disable-next-line
                        let routeMapping = this.mapping[routeObj.content.attributes.LLayer];
                        if (routeMapping) {
                            routeObj.content.attributes.channel = routeMapping.channel;
                            routeObj.content.attributes.layer = routeMapping.layer;
                        }
                    }
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.ROUTE,
                        media: 'route',
                        route: {
                            channel: routeObj.content.attributes.channel || 0,
                            layer: routeObj.content.attributes.layer,
                            channelLayout: routeObj.content.attributes.channelLayout
                        },
                        mode: routeObj.content.attributes.mode || undefined,
                        playing: true,
                        playTime: null // layer.resolved.startTime || null
                    };
                    stateLayer = l;
                }
                else if (layer.content.type === src_1.TimelineContentTypeCasparCg.RECORD) {
                    const recordObj = layer;
                    if (recordObj.resolved.startTime) {
                        let l = {
                            layerNo: mapping.layer,
                            content: casparcg_state_1.CasparCG.LayerContentType.RECORD,
                            media: recordObj.content.attributes.file,
                            encoderOptions: recordObj.content.attributes.encoderOptions,
                            playing: true,
                            playTime: recordObj.resolved.startTime || 0
                        };
                        stateLayer = l;
                    }
                }
                if (!stateLayer) {
                    let l = {
                        layerNo: mapping.layer,
                        content: casparcg_state_1.CasparCG.LayerContentType.NOTHING,
                        playing: false,
                        pauseTime: 0
                    };
                    stateLayer = l;
                }
                if (stateLayer) {
                    const baseContent = layer.content;
                    if (baseContent.transitions) {
                        switch (baseContent.type) {
                            case src_1.TimelineContentTypeCasparCg.VIDEO:
                            case src_1.TimelineContentTypeCasparCg.IP:
                            case src_1.TimelineContentTypeCasparCg.TEMPLATE:
                            case src_1.TimelineContentTypeCasparCg.INPUT:
                            case src_1.TimelineContentTypeCasparCg.ROUTE:
                                // create transition object
                                let media = stateLayer.media;
                                let transitions = {};
                                if (baseContent.transitions.inTransition) {
                                    transitions.inTransition = new casparcg_state_1.CasparCG.Transition(baseContent.transitions.inTransition.type, baseContent.transitions.inTransition.duration || baseContent.transitions.inTransition.maskFile, baseContent.transitions.inTransition.easing || baseContent.transitions.inTransition.delay, baseContent.transitions.inTransition.direction || baseContent.transitions.inTransition.overlayFile);
                                }
                                if (baseContent.transitions.outTransition) {
                                    transitions.outTransition = new casparcg_state_1.CasparCG.Transition(baseContent.transitions.outTransition.type, baseContent.transitions.outTransition.duration || baseContent.transitions.outTransition.maskFile, baseContent.transitions.outTransition.easing || baseContent.transitions.outTransition.delay, baseContent.transitions.outTransition.direction || baseContent.transitions.outTransition.overlayFile);
                                }
                                stateLayer.media = new casparcg_state_1.CasparCG.TransitionObject(media, {
                                    inTransition: transitions.inTransition,
                                    outTransition: transitions.outTransition
                                });
                                break;
                            default:
                                // create transition using mixer
                                break;
                        }
                    }
                    if (layer.resolved.mixer) {
                        // just pass through values here:
                        let mixer = {};
                        _.each(layer.resolved.mixer, (value, property) => {
                            mixer[property] = value;
                        });
                        stateLayer.mixer = mixer;
                    }
                    stateLayer.layerNo = mapping.layer;
                }
                if (stateLayer && !layerExt.isBackground) {
                    const prev = channel.layers[mapping.layer] || {};
                    channel.layers[mapping.layer] = _.extend(stateLayer, _.pick(prev, 'nextUp'));
                }
                else if (stateLayer && layerExt.isBackground) {
                    let s = stateLayer;
                    s.auto = false;
                    const res = channel.layers[mapping.layer];
                    if (!res) {
                        let l = {
                            layerNo: mapping.layer,
                            content: casparcg_state_1.CasparCG.LayerContentType.NOTHING,
                            playing: false,
                            pauseTime: 0,
                            nextUp: s
                        };
                        channel.layers[mapping.layer] = l;
                    }
                    else {
                        channel.layers[mapping.layer].nextUp = s;
                    }
                }
            }
        });
        return caspar;
    }
    makeReady(okToDestroyStuff) {
        // Sync Caspar Time to our time:
        return this._ccg.info()
            .then((command) => {
            let channels = command.response.data;
            const attemptSync = (channelNo, tries) => {
                let startTime = this.getCurrentTime();
                return this._commandReceiver(startTime, new casparcg_connection_1.AMCP.TimeCommand({
                    channel: channelNo,
                    timecode: this.convertTimeToTimecode(startTime, channelNo)
                }))
                    .then(() => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    let duration = this.getCurrentTime() - startTime;
                    if (duration > MAX_TIMESYNC_DURATION) { // @todo: acceptable time is dependent on fps
                        if (tries > MAX_TIMESYNC_TRIES) {
                            this.emit('error', 'CasparCG Time command took too long (' + MAX_TIMESYNC_TRIES + ' tries took longer than ' + MAX_TIMESYNC_DURATION + 'ms), channel will be slightly out of sync!');
                            return Promise.resolve();
                        }
                        yield new Promise(resolve => { setTimeout(() => resolve(), MAX_TIMESYNC_DURATION); });
                        return attemptSync(channelNo, tries + 1);
                    }
                }));
            };
            // console.log('channels', channels)
            let p = Promise.resolve();
            if (this._useScheduling) {
                _.each(channels, (channel) => {
                    let channelNo = channel.channel;
                    p = p.then(() => attemptSync(channelNo, 1));
                });
            }
            // Clear all channels (?)
            p = p.then(() => {
                if (okToDestroyStuff) {
                    return Promise.all(_.map(channels, (channel) => {
                        return this._commandReceiver(this.getCurrentTime(), new casparcg_connection_1.AMCP.ClearCommand({
                            channel: channel.channel
                        }));
                    })).then(() => { return; });
                }
                return Promise.resolve();
            });
            return p.then(() => { return; });
        })
            .then(() => {
            // reset our own state(s):
            if (okToDestroyStuff) {
                this.clearStates();
            }
            // a resolveTimeline will be triggered later
        });
    }
    restartCasparCG() {
        return new Promise((resolve, reject) => {
            if (!this._connectionOptions)
                throw new Error('CasparCGDevice._connectionOptions is not set!');
            if (!this._connectionOptions.launcherHost)
                throw new Error('CasparCGDevice: config.launcherHost is not set!');
            if (!this._connectionOptions.launcherPort)
                throw new Error('CasparCGDevice: config.launcherPort is not set!');
            let url = `http://${this._connectionOptions.launcherHost}:${this._connectionOptions.launcherPort}/processes/casparcg/restart`;
            request.post(url, {}, // json: cmd.params
            (error, response) => {
                if (error) {
                    reject(error);
                }
                else if (response.statusCode === 200) {
                    resolve();
                }
                else {
                    reject('Bad reply: [' + response.statusCode + '] ' + response.body);
                }
            });
        });
    }
    getStatus() {
        return {
            statusCode: this._connected ? device_1.StatusCode.GOOD : device_1.StatusCode.BAD
        };
    }
    _diffStates(oldState, newState) {
        // @todo: this is a tmp fix for the command order. should be removed when ccg-state has been refactored.
        return this._ccgState.diffStatesOrderedCommands(oldState, newState);
        // let commands: Array<{
        // 	cmds: Array<CommandNS.IAMCPCommandVO>
        // 	additionalLayerState?: StateNS.ILayerBase
        // }> = this._ccgState.diffStates(oldState, newState)
        // let returnCommands: Array<CommandNS.IAMCPCommandVO> = []
        // _.each(commands, (cmdObject) => {
        // 	returnCommands = returnCommands.concat(cmdObject.cmds)
        // })
        // return returnCommands
    }
    _doCommand(command) {
        this._commandReceiver(this.getCurrentTime(), command)
            .catch(e => this.emit('error', 'casparcg._commandReceiver', e));
    }
    _clearScheduledFutureCommands(time, commandsToSendNow) {
        // clear any queued commands later than this time:
        let now = this.getCurrentTime();
        _.each(this._queue, (q, token) => {
            if (q.time < now) {
                // the command has expired / been executed
                delete this._queue[token];
            }
            else if (q.time >= time) {
                // The command is in the future
                // check if that command is about to be scheduled here as well:
                let matchingCommand;
                let matchingCommandI = -1;
                if (q.time === time) {
                    _.each(commandsToSendNow, (cmd, i) => {
                        let command = casparcg_connection_1.AMCPUtil.deSerialize(cmd, 'id');
                        if (command.name === q.command.name &&
                            command.channel === q.command.channel &&
                            command.layer === q.command.layer &&
                            _.isEqual(command.payload, q.command.payload)) {
                            matchingCommand = command;
                            matchingCommandI = i;
                        }
                    });
                }
                if (matchingCommand) {
                    // We're about to send a command that's already scheduled in CasparCG
                    // just ignore it then..
                    // remove the commands from commands to send
                    commandsToSendNow.splice(matchingCommandI, 1);
                }
                else {
                    this._doCommand(new casparcg_connection_1.AMCP.ScheduleRemoveCommand(token));
                    delete this._queue[token];
                }
            }
        });
    }
    _addToQueue(commandsToAchieveState, time) {
        let i = 0;
        _.each(commandsToAchieveState, (cmd) => {
            let command = casparcg_connection_1.AMCPUtil.deSerialize(cmd, 'id');
            if (this._useScheduling) {
                if (time <= this.getCurrentTime()) {
                    this._doCommand(command);
                }
                else {
                    const token = `${time.toString(36).substr(-8)}_${('000' + i++).substr(-4)}`;
                    let scheduleCommand = new casparcg_connection_1.AMCP.ScheduleSetCommand({
                        token,
                        timecode: this.convertTimeToTimecode(time, command.channel),
                        command
                    });
                    this._doCommand(scheduleCommand);
                    this._queue[token] = {
                        time: time,
                        command: command
                    };
                }
            }
            else {
                this._doOnTime.queue(time, (command) => {
                    this._doCommand(command);
                }, command);
            }
        });
    }
    _defaultCommandReceiver(time, cmd) {
        time = time;
        let cwc = {
            context: null,
            command: cmd
        };
        this.emit('debug', cwc);
        return this._ccg.do(cmd)
            .then((resCommand) => {
            if (this._queue[resCommand.token]) {
                delete this._queue[resCommand.token];
            }
        }).catch((error) => {
            this.emit('error', 'casparcg.defaultCommandReceiver ' + cmd.name, error);
            if (cmd.name === 'ScheduleSetCommand') {
                // delete this._queue[cmd.getParam('command').token]
                delete this._queue[cmd.token];
            }
        });
    }
    convertTimeToTimecode(time, channel) {
        let relTime = time - this._timeToTimecodeMap.time;
        let timecodeTime = this._timeToTimecodeMap.timecode + relTime;
        let timeBase = (typeof this._timeBase === 'object' ?
            this._timeBase[channel + ''] :
            this._timeBase) || 25;
        let timecode = [
            ('0' + (Math.floor(timecodeTime / 3.6e6) % 24)).substr(-2),
            ('0' + (Math.floor(timecodeTime / 6e4) % 60)).substr(-2),
            ('0' + (Math.floor(timecodeTime / 1e3) % 60)).substr(-2),
            ('0' + (Math.floor(timecodeTime / (1000 / timeBase)) % timeBase)).substr(-(timeBase + '').length)
        ];
        return timecode.join(':');
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.CasparCGDevice = CasparCGDevice;
//# sourceMappingURL=casparCG.js.map