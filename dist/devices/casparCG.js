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
const MAX_TIMESYNC_TRIES = 5;
const MAX_TIMESYNC_DURATION = 40;
const MEDIA_RETRY_INTERVAL = 10 * 1000; // default time in ms between checking whether a file needs to be retried loading
const MEDIA_RETRY_DEBOUNCE = 500; // how long to wait after a command has sent before checking for retries
/**
 * This class is used to interface with CasparCG installations. It creates
 * device states from timeline states and then diffs these states to generate
 * commands. It depends on the DoOnTime class to execute the commands timely or,
 * optionally, uses the CasparCG command scheduling features.
 */
class CasparCGDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._queue = {};
        this._timeToTimecodeMap = { time: 0, timecode: 0 };
        this._timeBase = {};
        this._connected = false;
        this._retryTime = MEDIA_RETRY_INTERVAL;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
            if (deviceOptions.options.timeBase)
                this._timeBase = deviceOptions.options.timeBase;
        }
        this._ccgState = new casparcg_state_1.CasparCGState({
            externalLog: (...args) => {
                this.emit('debug', ...args);
            }
        });
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'CasparCG');
    }
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib and
     * initializes CasparCG State library.
     */
    init(initOptions) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.initOptions = initOptions;
            this._useScheduling = initOptions.useScheduling;
            this._ccg = new casparcg_connection_1.CasparCG({
                host: initOptions.host,
                port: initOptions.port,
                autoConnect: true,
                virginServerCheck: true,
                onConnectionChanged: (connected) => {
                    this._connected = connected;
                    this._connectionChanged();
                }
            });
            this._ccg.on(casparcg_connection_1.CasparCGSocketStatusEvent.CONNECTED, (event) => {
                this.makeReady(false) // always make sure timecode is correct, setting it can never do bad
                    .catch((e) => this.emit('error', 'casparCG.makeReady', e));
                if (event.valueOf().virginServer === true) {
                    // a "virgin server" was just restarted (so it is cleared & black).
                    // Otherwise it was probably just a loss of connection
                    this._ccgState.softClearState();
                    this.clearStates();
                    this.emit('resetResolver');
                }
            });
            let command = yield this._ccg.info();
            this._ccgState.initStateFromChannelInfo(_.map(command.response.data, (obj) => {
                return {
                    channelNo: obj.channel,
                    videoMode: obj.format.toUpperCase(),
                    fps: obj.frameRate
                };
            }), this.getCurrentTime());
            if (initOptions.retryInterval !== false) {
                if (typeof initOptions.retryInterval === 'number')
                    this._retryTime = initOptions.retryInterval || MEDIA_RETRY_INTERVAL;
                this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime);
            }
            return true;
        });
    }
    /**
     * Terminates the device safely such that things can be garbage collected.
     */
    terminate() {
        this._doOnTime.dispose();
        clearTimeout(this._retryTimeout);
        return new Promise((resolve) => {
            this._ccg.disconnect();
            this._ccg.onDisconnected = () => {
                resolve();
            };
        });
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // Clear any queued commands later than this time:
        if (this._useScheduling) {
            // Can't do it
            // this._clearScheduledFutureCommands(newStateTime, commandsToAchieveState)
        }
        else {
            this._doOnTime.clearQueueNowAndAfter(newStateTime);
            this.cleanUpStates(0, newStateTime);
        }
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
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || ({ state: { time: 0, layers: {}, nextEvents: [] } })).state;
        let newCasparState = this.convertStateToCaspar(newState);
        let oldCasparState = this.convertStateToCaspar(oldState);
        let commandsToAchieveState = this._diffStates(oldCasparState, newCasparState, newState.time);
        // clear any queued commands later than this time:
        if (this._useScheduling) {
            this._clearScheduledFutureCommands(newState.time, commandsToAchieveState);
        }
        else {
            this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        }
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
        if (this._useScheduling) {
            for (let token in this._queue) {
                if (this._queue[token].time > clearAfterTime) {
                    this._doCommand(new casparcg_connection_1.AMCP.ScheduleRemoveCommand(token), `clearFuture (${clearAfterTime})`, '').catch(e => this.emit('error', 'CasparCG.ScheduleRemoveCommand', e));
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
        return this._ccg ? this._ccg.connected : false;
    }
    get deviceType() {
        return src_1.DeviceType.CASPARCG;
    }
    get deviceName() {
        if (this._ccg) {
            return 'CasparCG ' + this.deviceId + ' ' + this._ccg.host + ':' + this._ccg.port;
        }
        else {
            return 'Uninitialized CasparCG ' + this.deviceId;
        }
    }
    get queue() {
        if (this._queue) {
            return _.map(this._queue, (val, index) => [val, index]);
        }
        else {
            return [];
        }
    }
    convertObjectToCasparState(layer, mapping, isForeground) {
        let startTime = layer.instance.originalStart || layer.instance.start;
        if (startTime === 0)
            startTime = 1; // @todo: startTime === 0 will make ccg-state seek to the current time
        let stateLayer = null;
        if (layer.content.type === src_1.TimelineContentTypeCasparCg.MEDIA) {
            const mediaObj = layer;
            const holdOnFirstFrame = !isForeground || mediaObj.isLookahead;
            const loopingPlayTime = mediaObj.content.loop && !mediaObj.content.seek && !mediaObj.content.inPoint && !mediaObj.content.length;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.CasparCG.LayerContentType.MEDIA,
                media: mediaObj.content.file,
                playTime: (!holdOnFirstFrame && (mediaObj.content.noStarttime || loopingPlayTime) ?
                    null :
                    startTime),
                pauseTime: holdOnFirstFrame ? startTime : (mediaObj.content.pauseTime || null),
                playing: !mediaObj.isLookahead && (mediaObj.content.playing !== undefined ? mediaObj.content.playing : isForeground),
                looping: mediaObj.content.loop,
                seek: mediaObj.content.seek,
                inPoint: mediaObj.content.inPoint,
                length: mediaObj.content.length,
                channelLayout: mediaObj.content.channelLayout,
                clearOn404: true
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.IP) {
            const ipObj = layer;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.CasparCG.LayerContentType.MEDIA,
                media: ipObj.content.uri,
                channelLayout: ipObj.content.channelLayout,
                playTime: null,
                playing: true,
                seek: 0 // ip inputs can't be seeked
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.INPUT) {
            const inputObj = layer;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.CasparCG.LayerContentType.INPUT,
                media: 'decklink',
                input: {
                    device: inputObj.content.device,
                    channelLayout: inputObj.content.channelLayout
                },
                playing: true,
                playTime: null
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.TEMPLATE) {
            const recordObj = layer;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.CasparCG.LayerContentType.TEMPLATE,
                media: recordObj.content.name,
                playTime: startTime || null,
                playing: true,
                templateType: recordObj.content.templateType || 'html',
                templateData: recordObj.content.data,
                cgStop: recordObj.content.useStopCommand
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.HTMLPAGE) {
            const htmlObj = layer;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.CasparCG.LayerContentType.HTMLPAGE,
                media: htmlObj.content.url,
                playTime: startTime || null,
                playing: true
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.ROUTE) {
            const routeObj = layer;
            if (routeObj.content.mappedLayer) {
                let routeMapping = this.getMapping()[routeObj.content.mappedLayer];
                if (routeMapping) {
                    routeObj.content.channel = routeMapping.channel;
                    routeObj.content.layer = routeMapping.layer;
                }
            }
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.CasparCG.LayerContentType.ROUTE,
                media: 'route',
                route: {
                    channel: routeObj.content.channel || 0,
                    layer: routeObj.content.layer,
                    channelLayout: routeObj.content.channelLayout
                },
                mode: routeObj.content.mode || undefined,
                playing: true,
                playTime: null // layer.resolved.startTime || null
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.RECORD) {
            const recordObj = layer;
            if (startTime) {
                stateLayer = device_1.literal({
                    id: layer.id,
                    layerNo: mapping.layer,
                    content: casparcg_state_1.CasparCG.LayerContentType.RECORD,
                    media: recordObj.content.file,
                    encoderOptions: recordObj.content.encoderOptions,
                    playing: true,
                    playTime: startTime || 0
                });
            }
        }
        // if no appropriate layer could be created, make it an empty layer
        if (!stateLayer) {
            let l = {
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.CasparCG.LayerContentType.NOTHING,
                playing: false,
                pauseTime: 0
            };
            stateLayer = l;
        } // now it holds that stateLayer is truthy
        const baseContent = layer.content;
        if (baseContent.transitions) { // add transitions to the layer obj
            switch (baseContent.type) {
                case src_1.TimelineContentTypeCasparCg.MEDIA:
                case src_1.TimelineContentTypeCasparCg.IP:
                case src_1.TimelineContentTypeCasparCg.TEMPLATE:
                case src_1.TimelineContentTypeCasparCg.INPUT:
                case src_1.TimelineContentTypeCasparCg.ROUTE:
                    // create transition object
                    let media = stateLayer.media;
                    let transitions = {};
                    if (baseContent.transitions.inTransition) {
                        transitions.inTransition = new casparcg_state_1.CasparCG.Transition(baseContent.transitions.inTransition);
                    }
                    if (baseContent.transitions.outTransition) {
                        transitions.outTransition = new casparcg_state_1.CasparCG.Transition(baseContent.transitions.outTransition);
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
        if (layer.content.mixer) { // add mixer properties
            // just pass through values here:
            let mixer = {};
            _.each(layer.content.mixer, (value, property) => {
                mixer[property] = value;
            });
            stateLayer.mixer = mixer;
        }
        stateLayer.layerNo = mapping.layer;
        return stateLayer;
    }
    /**
     * Takes a timeline state and returns a CasparCG State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToCaspar(timelineState) {
        const caspar = new casparcg_state_1.CasparCG.State();
        _.each(this.getMapping(), (foundMapping, layerName) => {
            if (foundMapping &&
                foundMapping.device === src_1.DeviceType.CASPARCG &&
                _.has(foundMapping, 'channel') &&
                _.has(foundMapping, 'layer')) {
                let foregroundObj = timelineState.layers[layerName];
                let backgroundObj = _.last(_.filter(timelineState.layers, obj => {
                    // Takes the last one, to be consistent with previous behaviour
                    const objExt = obj;
                    return !!objExt.isLookahead && objExt.lookaheadForLayer === layerName;
                }));
                // If lookahead is on the same layer, then ensure objects are treated as such
                if (foregroundObj && foregroundObj.isLookahead) {
                    backgroundObj = foregroundObj;
                    foregroundObj = undefined;
                }
                const mapping = foundMapping;
                mapping.channel = mapping.channel || 0;
                mapping.layer = mapping.layer || 0;
                // create a channel in state if necessary, or reuse existing channel
                const channel = caspar.channels[mapping.channel] ? caspar.channels[mapping.channel] : new casparcg_state_1.CasparCG.Channel();
                channel.channelNo = Number(mapping.channel) || 1;
                // @todo: check if we need to get fps.
                channel.fps = 25 / 1000; // 25 fps over 1000ms
                caspar.channels[channel.channelNo] = channel;
                // create layer of appropriate type
                const foregroundStateLayer = foregroundObj ? this.convertObjectToCasparState(foregroundObj, mapping, true) : undefined;
                const backgroundStateLayer = backgroundObj ? this.convertObjectToCasparState(backgroundObj, mapping, false) : undefined;
                if (foregroundStateLayer) {
                    channel.layers[mapping.layer] = Object.assign(Object.assign({}, foregroundStateLayer), { nextUp: backgroundStateLayer ? device_1.literal(Object.assign(Object.assign({}, backgroundStateLayer), { auto: false })) : undefined });
                }
                else if (backgroundStateLayer) {
                    if (mapping.previewWhenNotOnAir) {
                        channel.layers[mapping.layer] = Object.assign(Object.assign({}, backgroundStateLayer), { playing: false });
                    }
                    else {
                        channel.layers[mapping.layer] = device_1.literal({
                            id: `${backgroundStateLayer.id}_empty_base`,
                            layerNo: mapping.layer,
                            content: casparcg_state_1.CasparCG.LayerContentType.NOTHING,
                            playing: false,
                            pauseTime: 0,
                            nextUp: device_1.literal(Object.assign(Object.assign({}, backgroundStateLayer), { auto: false }))
                        });
                    }
                }
            }
        });
        return caspar;
    }
    /**
     * Prepares the physical device for playout. If amcp scheduling is used this
     * tries to sync the timecode. If {@code okToDestroyStuff === true} this clears
     * all channels and resets our states.
     * @param okToDestroyStuff Whether it is OK to restart the device
     */
    makeReady(okToDestroyStuff) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // Sync Caspar Time to our time:
            let command = yield this._ccg.info();
            let channels = command.response.data;
            const attemptSync = (channelNo, tries) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                let startTime = this.getCurrentTime();
                yield this._commandReceiver(startTime, new casparcg_connection_1.AMCP.TimeCommand({
                    channel: channelNo,
                    timecode: this.convertTimeToTimecode(startTime, channelNo)
                }), 'makeReady', '');
                let duration = this.getCurrentTime() - startTime;
                if (duration > MAX_TIMESYNC_DURATION) { // @todo: acceptable time is dependent on fps
                    if (tries > MAX_TIMESYNC_TRIES) {
                        this.emit('error', 'CasparCG', new Error(`CasparCG Time command took too long (${MAX_TIMESYNC_TRIES} tries took longer than ${MAX_TIMESYNC_DURATION}ms), channel will be slightly out of sync!`));
                        return Promise.resolve();
                    }
                    yield new Promise(resolve => { setTimeout(() => resolve(), MAX_TIMESYNC_DURATION); });
                    yield attemptSync(channelNo, tries + 1);
                }
            });
            if (this._useScheduling) {
                for (let i in channels) {
                    let channel = channels[i];
                    let channelNo = channel.channel;
                    yield attemptSync(channelNo, 1);
                }
            }
            // Clear all channels (?)
            if (okToDestroyStuff) {
                yield Promise.all(_.map(channels, (channel) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    yield this._commandReceiver(this.getCurrentTime(), new casparcg_connection_1.AMCP.ClearCommand({
                        channel: channel.channel
                    }), 'makeReady and destroystuff', '');
                })));
            }
            // reset our own state(s):
            if (okToDestroyStuff) {
                this.clearStates();
            }
            // a resolveTimeline will be triggered later
        });
    }
    /**
     * Attemps to restart casparcg over the HTTP API provided by CasparCG launcher.
     */
    restartCasparCG() {
        return new Promise((resolve, reject) => {
            if (!this.initOptions)
                throw new Error('CasparCGDevice._connectionOptions is not set!');
            if (!this.initOptions.launcherHost)
                throw new Error('CasparCGDevice: config.launcherHost is not set!');
            if (!this.initOptions.launcherPort)
                throw new Error('CasparCGDevice: config.launcherPort is not set!');
            let url = `http://${this.initOptions.launcherHost}:${this.initOptions.launcherPort}/processes/casparcg/restart`;
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
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (statusCode === device_1.StatusCode.GOOD) {
            if (!this._connected) {
                statusCode = device_1.StatusCode.BAD;
                messages.push(`CasparCG disconnected`);
            }
        }
        if (!this._ccgState.isInitialised) {
            statusCode = device_1.StatusCode.BAD;
            messages.push(`CasparCG device connection not initialized (restart required)`);
        }
        return {
            statusCode: statusCode,
            messages: messages
        };
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    _diffStates(oldState, newState, time) {
        // @todo: this is a tmp fix for the command order. should be removed when ccg-state has been refactored.
        return this._ccgState.diffStatesOrderedCommands(oldState, newState, time);
    }
    _doCommand(command, context, timlineObjId) {
        let time = this.getCurrentTime();
        return this._commandReceiver(time, command, context, timlineObjId);
    }
    /**
     * Clear future commands after {@code time} if they are not in {@code commandsToSendNow}.
     */
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
                    this._doCommand(new casparcg_connection_1.AMCP.ScheduleRemoveCommand(token), `_clearScheduledFutureCommands (${time})`, '').catch(e => this.emit('error', 'CasparCG.ScheduleRemoveCommand', e));
                    delete this._queue[token];
                }
            }
        });
    }
    /**
     * Use either AMCP Command Scheduling or the doOnTime to execute commands at
     * {@code time}.
     * @param commandsToAchieveState Commands to be added to queue
     * @param time Point in time to send commands at
     */
    _addToQueue(commandsToAchieveState, time) {
        let i = 0;
        let now = this.getCurrentTime();
        _.each(commandsToAchieveState, (cmd) => {
            let command = casparcg_connection_1.AMCPUtil.deSerialize(cmd, 'id');
            if (this._useScheduling) {
                if (time <= now) {
                    this._doCommand(command, cmd.context.context, cmd.context.layerId)
                        .catch(e => this.emit('error', 'CasparCG._doCommand', e));
                }
                else {
                    const token = `${time.toString(36).substr(-8)}_${('000' + i++).substr(-4)}`;
                    let scheduleCommand = new casparcg_connection_1.AMCP.ScheduleSetCommand({
                        token,
                        timecode: this.convertTimeToTimecode(time, command.channel),
                        command
                    });
                    this._doCommand(scheduleCommand, cmd.context.context, cmd.context.layerId)
                        .catch(e => this.emit('error', 'CasparCG._doCommand', e));
                    this._queue[token] = {
                        time: time,
                        command: command
                    };
                }
            }
            else {
                this._doOnTime.queue(time, undefined, (c) => {
                    return this._doCommand(c.command, c.cmd.context.context, c.cmd.context.layerId);
                }, { command: command, cmd: cmd });
            }
        });
    }
    /**
     * Sends a command over a casparcg-connection instance
     * @param time deprecated
     * @param cmd Command to execute
     */
    _defaultCommandReceiver(time, cmd, context, timelineObjId) {
        // do no retry while we are sending commands, instead always retry closely after:
        if (!context.match(/\[RETRY\]/i)) {
            clearTimeout(this._retryTimeout);
            if (!this.initOptions || this.initOptions.retryInterval !== false)
                this._retryTimeout = setTimeout(() => this._assertIntendedState(), MEDIA_RETRY_DEBOUNCE);
        }
        let cwc = {
            context: context,
            timelineObjId: timelineObjId,
            command: cmd
        };
        this.emit('debug', cwc);
        return this._ccg.do(cmd)
            .then((resCommand) => {
            if (this._queue[resCommand.token]) {
                delete this._queue[resCommand.token];
            }
            this._ccgState.applyCommands([{ cmd: resCommand.serialize() }], time);
        }).catch((error) => {
            let errorString = '';
            if (error && error.response && error.response.code === 404) {
                errorString = `404: File not found`;
            }
            if (!errorString) {
                errorString = (error && error.response && error.response.raw ?
                    error.response.raw
                    : error.toString());
            }
            if (cmd.name) {
                errorString += ` ${cmd.name} `;
            }
            if (cmd['_objectParams'] && !_.isEmpty(cmd['_objectParams'])) {
                errorString += ', params: ' + JSON.stringify(cmd['_objectParams']);
            }
            else if (cmd.payload && !_.isEmpty(cmd.payload)) {
                errorString += ', payload: ' + JSON.stringify(cmd.payload);
            }
            console.log('commandError', errorString);
            this.emit('commandError', new Error(errorString), cwc);
            if (cmd.name === 'ScheduleSetCommand') {
                // delete this._queue[cmd.getParam('command').token]
                delete this._queue[cmd.token];
            }
        });
    }
    /**
     * This function takes the current timeline-state, and diffs it with the known
     * CasparCG state. If any media has failed to load, it will create a diff with
     * the intended (timeline) state and that command will be executed.
     */
    _assertIntendedState() {
        this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime);
        const tlState = this.getState(this.getCurrentTime());
        if (!tlState)
            return; // no state implies any state is correct
        const ccgState = this.convertStateToCaspar(tlState.state);
        const diff = this._ccgState.getDiff(ccgState, this.getCurrentTime());
        const cmd = [];
        for (const layer of diff) {
            // filter out media commands
            for (let i = 0; i < layer.cmds.length; i++) {
                if (layer.cmds[i]._commandName === 'LoadbgCommand'
                    ||
                        (layer.cmds[i]._commandName === 'PlayCommand' && layer.cmds[i]._objectParams.clip)
                    ||
                        layer.cmds[i]._commandName === 'LoadCommand') {
                    layer.cmds[i].context.context += ' [RETRY]';
                    cmd.push(layer.cmds[i]);
                }
            }
        }
        if (cmd.length > 0) {
            this._addToQueue(cmd, this.getCurrentTime());
        }
    }
    /**
     * Converts ms to timecode.
     * @param time Time to convert
     * @param channel Channel to use for timebase
     */
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