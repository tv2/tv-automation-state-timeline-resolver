"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const casparcg_connection_1 = require("casparcg-connection");
const src_1 = require("../types/src");
const casparcg_state_1 = require("casparcg-state");
const doOnTime_1 = require("../doOnTime");
const request = require("request");
const transitionHandler_1 = require("./transitions/transitionHandler");
const MAX_TIMESYNC_TRIES = 5;
const MAX_TIMESYNC_DURATION = 40;
const MEDIA_RETRY_INTERVAL = 10 * 1000; // default time in ms between checking whether a file needs to be retried loading
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
        this._transitionHandler = new transitionHandler_1.InternalTransitionHandler();
        this._retryTime = null;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
            if (deviceOptions.options.timeBase)
                this._timeBase = deviceOptions.options.timeBase;
        }
        this._ccgState = new casparcg_state_1.CasparCGState();
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'CasparCG');
    }
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib and
     * initializes CasparCG State library.
     */
    async init(initOptions) {
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
        let command = await this._ccg.info();
        this._ccgState.initStateFromChannelInfo(_.map(command.response.data, (obj) => {
            return {
                channelNo: obj.channel,
                videoMode: obj.format.toUpperCase(),
                fps: obj.frameRate
            };
        }), this.getCurrentTime());
        if (typeof initOptions.retryInterval === 'number') {
            this._retryTime = initOptions.retryInterval || MEDIA_RETRY_INTERVAL;
            this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime);
        }
        return true;
    }
    /**
     * Terminates the device safely such that things can be garbage collected.
     */
    terminate() {
        this._doOnTime.dispose();
        this._transitionHandler.terminate();
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
    handleState(newState, newMappings) {
        super.onHandleState(newState, newMappings);
        // check if initialized:
        if (!this._ccgState.isInitialised) {
            this.emit('warning', 'CasparCG State not initialized yet');
            return;
        }
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldCasparState = (this.getStateBefore(previousStateTime) || { state: { channels: {} } }).state;
        let newCasparState = this.convertStateToCaspar(newState, newMappings);
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
        this.setState(newCasparState, newState.time);
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
    convertObjectToCasparState(mappings, layer, mapping, isForeground) {
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
                content: casparcg_state_1.LayerContentType.MEDIA,
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
                clearOn404: true,
                vfilter: mediaObj.content.videoFilter,
                afilter: mediaObj.content.audioFilter
            });
            // this.emit('debug', stateLayer)
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.IP) {
            const ipObj = layer;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.LayerContentType.MEDIA,
                media: ipObj.content.uri,
                channelLayout: ipObj.content.channelLayout,
                playTime: null,
                playing: true,
                seek: 0,
                vfilter: ipObj.content.videoFilter,
                afilter: ipObj.content.audioFilter
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.INPUT) {
            const inputObj = layer;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.LayerContentType.INPUT,
                media: 'decklink',
                input: {
                    device: inputObj.content.device,
                    channelLayout: inputObj.content.channelLayout,
                    format: inputObj.content.deviceFormat
                },
                filter: inputObj.content.filter,
                playing: true,
                playTime: null,
                vfilter: inputObj.content.videoFilter,
                afilter: inputObj.content.audioFilter
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.TEMPLATE) {
            const recordObj = layer;
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.LayerContentType.TEMPLATE,
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
                content: casparcg_state_1.LayerContentType.HTMLPAGE,
                media: htmlObj.content.url,
                playTime: startTime || null,
                playing: true
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.ROUTE) {
            const routeObj = layer;
            if (routeObj.content.mappedLayer) {
                let routeMapping = mappings[routeObj.content.mappedLayer];
                if (routeMapping && routeMapping.deviceId === this.deviceId) {
                    routeObj.content.channel = routeMapping.channel;
                    routeObj.content.layer = routeMapping.layer;
                }
            }
            stateLayer = device_1.literal({
                id: layer.id,
                layerNo: mapping.layer,
                content: casparcg_state_1.LayerContentType.ROUTE,
                media: 'route',
                route: {
                    channel: routeObj.content.channel || 0,
                    layer: routeObj.content.layer,
                    channelLayout: routeObj.content.channelLayout
                },
                mode: routeObj.content.mode || undefined,
                delay: routeObj.content.delay || undefined,
                playing: true,
                playTime: null,
                vfilter: routeObj.content.videoFilter,
                afilter: routeObj.content.audioFilter
            });
        }
        else if (layer.content.type === src_1.TimelineContentTypeCasparCg.RECORD) {
            const recordObj = layer;
            if (startTime) {
                stateLayer = device_1.literal({
                    id: layer.id,
                    layerNo: mapping.layer,
                    content: casparcg_state_1.LayerContentType.RECORD,
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
                content: casparcg_state_1.LayerContentType.NOTHING,
                playing: false
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
                case src_1.TimelineContentTypeCasparCg.HTMLPAGE:
                    // create transition object
                    let media = stateLayer.media;
                    let transitions = {};
                    if (baseContent.transitions.inTransition) {
                        transitions.inTransition = new casparcg_state_1.Transition(baseContent.transitions.inTransition);
                    }
                    if (baseContent.transitions.outTransition) {
                        transitions.outTransition = new casparcg_state_1.Transition(baseContent.transitions.outTransition);
                    }
                    stateLayer.media = new casparcg_state_1.TransitionObject(media, {
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
    convertStateToCaspar(timelineState, mappings) {
        const caspar = {
            channels: {}
        };
        _.each(mappings, (foundMapping, layerName) => {
            if (foundMapping &&
                foundMapping.device === src_1.DeviceType.CASPARCG &&
                foundMapping.deviceId === this.deviceId &&
                _.has(foundMapping, 'channel') &&
                _.has(foundMapping, 'layer')) {
                const mapping = foundMapping;
                mapping.channel = mapping.channel || 0;
                mapping.layer = mapping.layer || 0;
                // create a channel in state if necessary, or reuse existing channel
                const channel = caspar.channels[mapping.channel] || { channelNo: mapping.channel, layers: {} };
                channel.channelNo = Number(mapping.channel) || 1;
                channel.fps = this.initOptions ? this.initOptions.fps || 25 : 25;
                caspar.channels[channel.channelNo] = channel;
                // @todo: check if we need to get fps.
                channel.fps = this.initOptions ? this.initOptions.fps || 25 : 25;
                caspar.channels[mapping.channel] = channel;
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
                // create layer of appropriate type
                const foregroundStateLayer = foregroundObj ? this.convertObjectToCasparState(mappings, foregroundObj, mapping, true) : undefined;
                const backgroundStateLayer = backgroundObj ? this.convertObjectToCasparState(mappings, backgroundObj, mapping, false) : undefined;
                if (foregroundStateLayer) {
                    channel.layers[layerName] = {
                        ...foregroundStateLayer,
                        nextUp: backgroundStateLayer ? device_1.literal({
                            ...backgroundStateLayer,
                            auto: false
                        }) : undefined
                    };
                }
                else if (backgroundStateLayer) {
                    if (mapping.previewWhenNotOnAir) {
                        channel.layers[layerName] = {
                            ...backgroundStateLayer,
                            playing: false
                        };
                    }
                    else {
                        channel.layers[layerName] = device_1.literal({
                            id: `${backgroundStateLayer.id}_empty_base`,
                            layerNo: mapping.layer,
                            content: casparcg_state_1.LayerContentType.NOTHING,
                            playing: false,
                            nextUp: device_1.literal({
                                ...backgroundStateLayer,
                                auto: false
                            })
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
    async makeReady(okToDestroyStuff) {
        // Sync Caspar Time to our time:
        let command = await this._ccg.info();
        let channels = command.response.data;
        const attemptSync = async (channelNo, tries) => {
            let startTime = this.getCurrentTime();
            await this._commandReceiver(startTime, new casparcg_connection_1.AMCP.TimeCommand({
                channel: channelNo,
                timecode: this.convertTimeToTimecode(startTime, channelNo)
            }), 'makeReady', '');
            let duration = this.getCurrentTime() - startTime;
            if (duration > MAX_TIMESYNC_DURATION) { // @todo: acceptable time is dependent on fps
                if (tries > MAX_TIMESYNC_TRIES) {
                    this.emit('error', 'CasparCG', new Error(`CasparCG Time command took too long (${MAX_TIMESYNC_TRIES} tries took longer than ${MAX_TIMESYNC_DURATION}ms), channel will be slightly out of sync!`));
                    return Promise.resolve();
                }
                await new Promise(resolve => { setTimeout(() => resolve(), MAX_TIMESYNC_DURATION); });
                await attemptSync(channelNo, tries + 1);
            }
        };
        if (this._useScheduling) {
            for (let i in channels) {
                let channel = channels[i];
                let channelNo = channel.channel;
                await attemptSync(channelNo, 1);
            }
        }
        // Clear all channels (?)
        if (okToDestroyStuff) {
            await Promise.all(_.map(channels, async (channel) => {
                await this._commandReceiver(this.getCurrentTime(), new casparcg_connection_1.AMCP.ClearCommand({
                    channel: channel.channel
                }), 'makeReady and destroystuff', '');
            }));
        }
        // reset our own state(s):
        if (okToDestroyStuff) {
            this.clearStates();
        }
        // a resolveTimeline will be triggered later
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
            messages: messages,
            active: this.isActive
        };
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    _diffStates(oldState, newState, time) {
        // @todo: this is a tmp fix for the command order. should be removed when ccg-state has been refactored.
        return casparcg_state_1.CasparCGState.diffStatesOrderedCommands(oldState, newState, time);
    }
    _doCommand(command, context, timlineObjId) {
        let time = this.getCurrentTime();
        const interceptedCommand = this._interceptCommand(command);
        if (interceptedCommand) {
            return this._commandReceiver(time, interceptedCommand, context, timlineObjId);
        }
        else {
            return Promise.resolve();
        }
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
            if (this._retryTime)
                this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime);
        }
        let cwc = {
            context: context,
            timelineObjId: timelineObjId,
            command: JSON.stringify(cmd)
        };
        this.emit('debug', cwc);
        return this._ccg.do(cmd)
            .then((resCommand) => {
            if (this._queue[resCommand.token]) {
                delete this._queue[resCommand.token];
            }
            // If the command was performed successfully, copy the state from the current state into the tracked caspar-state:
            // This is later used in _assertIntendedState
            if ((resCommand.name === 'LoadbgCommand' ||
                resCommand.name === 'PlayCommand' ||
                resCommand.name === 'LoadCommand' ||
                resCommand.name === 'ClearCommand' ||
                resCommand.name === 'StopCommand' ||
                resCommand.name === 'ResumeCommand') &&
                resCommand.channel &&
                resCommand.layer) {
                const currentState = this.getState(time);
                if (currentState) {
                    const currentCasparState = currentState.state;
                    const trackedState = this._ccgState.getState();
                    const channel = currentCasparState.channels[resCommand.channel];
                    if (channel) {
                        if (!trackedState.channels[resCommand.channel]) {
                            trackedState.channels[resCommand.channel] = {
                                channelNo: channel.channelNo,
                                fps: channel.fps || 0,
                                videoMode: channel.videoMode || null,
                                layers: {}
                            };
                        }
                        // Copy the tracked from current state:
                        trackedState.channels[resCommand.channel].layers[resCommand.layer] = channel.layers[resCommand.layer];
                        this._ccgState.setState(trackedState);
                    }
                }
            }
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
        if (this._retryTime) {
            this._retryTimeout = setTimeout(() => this._assertIntendedState(), this._retryTime);
        }
        const tlState = this.getState(this.getCurrentTime());
        if (!tlState)
            return; // no state implies any state is correct
        const ccgState = tlState.state;
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
            this._timeBase) || (this.initOptions ? this.initOptions.fps || 25 : 25);
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
    /**
     * Intercept the casparcg-connection commands, for internal transitions
     * Returns the command if it's not intercepted along the way
     */
    _interceptCommand(command) {
        // Intercept internal commands:
        const objectParams = command['_objectParams'];
        if (objectParams) {
            let transitionOptions = objectParams.customOptions;
            if (transitionOptions) {
                if (objectParams.keyword === 'FILL') {
                    if (objectParams.transition === src_1.Transition.TSR_TRANSITION) {
                        // Handle transitions internally:
                        this._transitionHandler.activateTransition(this._getTransitionId('FILL', command.channel, command.layer), [0, 0, 1, 1], [objectParams.x, objectParams.y, objectParams.xScale, objectParams.yScale], ['position', 'position', 'scale', 'scale'], transitionOptions, {
                            'position': {
                                type: 'physical'
                            },
                            'scale': {
                                type: 'linear',
                                options: {
                                    linearSpeed: 0.0003 // tmp: todo: remove hard-coding of this
                                }
                            }
                        }, (newValues) => {
                            const c = new casparcg_connection_1.AMCP.MixerFillCommand({
                                channel: command.channel,
                                layer: command.layer,
                                x: newValues[0],
                                y: newValues[1],
                                xScale: newValues[2],
                                yScale: newValues[3]
                            });
                            this._commandReceiver(this.getCurrentTime(), c, 'Internal transition', 'internalTransition')
                                .catch((e => this.emit('error', 'CasparCG.InternalTransition', e)));
                        });
                        // Abort: don't send the original command
                        return undefined;
                    }
                    else {
                        this._transitionHandler.stopAndSnapTransition(this._getTransitionId('FILL', command.channel, command.layer), [objectParams.x, objectParams.y, objectParams.xScale, objectParams.yScale]);
                    }
                }
                else if (objectParams.keyword === 'PERSPECTIVE') {
                    if (objectParams.transition === src_1.Transition.TSR_TRANSITION) {
                        // Handle transitions internally:
                        this._transitionHandler.activateTransition(this._getTransitionId('PERSPECTIVE', command.channel, command.layer), [0, 0, 1, 0, 1, 1, 0, 1], [
                            objectParams.topLeftX,
                            objectParams.topLeftY,
                            objectParams.topRightX,
                            objectParams.topRightY,
                            objectParams.bottomRightX,
                            objectParams.bottomRightY,
                            objectParams.bottomLeftX,
                            objectParams.bottomLeftY
                        ], ['tl', 'tl', 'tr', 'tr', 'br', 'br', 'bl', 'bl'], transitionOptions, {
                            'tl': { type: 'physical' },
                            'tr': { type: 'physical' },
                            'bl': { type: 'physical' },
                            'br': { type: 'physical' } // bottom left corner
                        }, (newValues) => {
                            const c = new casparcg_connection_1.AMCP.MixerPerspectiveCommand({
                                channel: command.channel,
                                layer: command.layer,
                                topLeftX: newValues[0],
                                topLeftY: newValues[1],
                                topRightX: newValues[2],
                                topRightY: newValues[3],
                                bottomRightX: newValues[4],
                                bottomRightY: newValues[5],
                                bottomLeftX: newValues[6],
                                bottomLeftY: newValues[7]
                            });
                            this._commandReceiver(this.getCurrentTime(), c, 'Internal transition', 'internalTransition')
                                .catch((e => this.emit('error', 'CasparCG.InternalTransition', e)));
                        });
                        // Abort: don't send the original command
                        return undefined;
                    }
                    else {
                        this._transitionHandler.stopAndSnapTransition(this._getTransitionId('PERSPECTIVE', command.channel, command.layer), [
                            objectParams.topLeftX,
                            objectParams.topLeftY,
                            objectParams.topRightX,
                            objectParams.topRightY,
                            objectParams.bottomRightX,
                            objectParams.bottomRightY,
                            objectParams.bottomLeftX,
                            objectParams.bottomLeftY
                        ]);
                    }
                }
                else if (objectParams.keyword === 'OPACITY' ||
                    objectParams.keyword === 'VOLUME') {
                    const opt = (objectParams.keyword === 'OPACITY' ?
                        {
                            initial: 1,
                            prop: 'opacity'
                        } :
                        objectParams.keyword === 'VOLUME' ?
                            {
                                initial: 1,
                                prop: 'volume'
                            } :
                            {
                                initial: 0,
                                prop: 'N/A'
                            });
                    if (objectParams.transition === src_1.Transition.TSR_TRANSITION) {
                        // Handle transitions internally:
                        this._transitionHandler.activateTransition(this._getTransitionId(objectParams.keyword, command.channel, command.layer), [opt.initial], [objectParams[opt.prop]], ['v'], transitionOptions, {
                            'v': { type: 'linear' } // tmp hack: for these, a linear would be better that physical
                        }, (newValues) => {
                            const properties = {
                                channel: command.channel,
                                layer: command.layer
                            };
                            properties[opt.prop] = newValues[0];
                            const c = new casparcg_connection_1.AMCP[command.name](properties);
                            this._commandReceiver(this.getCurrentTime(), c, 'Internal transition', 'internalTransition')
                                .catch((e => this.emit('error', 'CasparCG.InternalTransition', e)));
                        });
                        // Abort: don't send the original command
                        return undefined;
                    }
                    else {
                        this._transitionHandler.stopAndSnapTransition(this._getTransitionId(objectParams.keyword, command.channel, command.layer), [objectParams[opt.prop]]);
                    }
                }
                else if (objectParams.keyword === 'CLEAR') {
                    if (command.layer) {
                        this._getTransitions(undefined, command.channel, command.layer)
                            .forEach(identifier => this._transitionHandler.clearTransition(identifier));
                    }
                    else {
                        // Clear the whole channel:
                        this._getTransitions(undefined, command.channel)
                            .forEach(identifier => this._transitionHandler.clearTransition(identifier));
                    }
                }
            }
        }
        return command;
    }
    _getTransitionId(keyword, channel, layer) {
        return `${keyword}_${channel}-${layer || ''}`;
    }
    _getTransitions(keyword, channel, layer) {
        let regex = '';
        if (keyword) {
            regex = `^${keyword}_`;
        }
        if (channel) {
            regex += `_${channel}-`;
        }
        if (layer) {
            regex += `-${layer}$`;
        }
        regex = regex
            .replace(/__/, '_')
            .replace(/--/, '--');
        return this._transitionHandler.getIdentifiers()
            .filter(i => i.match(new RegExp(regex)));
    }
}
exports.CasparCGDevice = CasparCGDevice;
//# sourceMappingURL=casparCG.js.map