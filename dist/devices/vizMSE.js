"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const events_1 = require("events");
const device_1 = require("./device");
const src_1 = require("../types/src");
const v_connection_1 = require("v-connection");
const doOnTime_1 = require("../doOnTime");
const crypto = require("crypto");
/** The ideal time to prepare elements before going on air */
const IDEAL_PREPARE_TIME = 1000;
/** Minimum time to wait after preparing elements */
const PREPARE_TIME_WAIT = 50;
// How often to check / preload elements
const MONITOR_INTERVAL = 5 * 1000;
// How long to wait after any action (takes, cues, etc) before trying to cue for preloading
const SAFE_PRELOAD_TIME = 2000;
function getHash(str) {
    const hash = crypto.createHash('sha1');
    return hash.update(str).digest('base64').replace(/[\+\/\=]/g, '_'); // remove +/= from strings, because they cause troubles
}
exports.getHash = getHash;
/**
 * This class is used to interface with a vizRT Media Sequence Editor, through the v-connection library.
 * It features playing both "internal" graphics element and vizPilot elements.
 */
class VizMSEDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._vizMSEConnected = false;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.IN_ORDER, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'VizMSE');
        this._doOnTimeBurst = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTimeBurst, 'VizMSE.burst');
    }
    init(initOptions) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._initOptions = initOptions;
            if (!this._initOptions.host)
                throw new Error('VizMSE bad option: host');
            if (!this._initOptions.showID)
                throw new Error('VizMSE bad option: showID');
            if (!this._initOptions.profile)
                throw new Error('VizMSE bad option: profile');
            this._vizMSE = v_connection_1.createMSE(this._initOptions.host, this._initOptions.restPort, this._initOptions.wsPort);
            this._vizmseManager = new VizMSEManager(this, this._vizMSE, this._initOptions.preloadAllElements, initOptions.showID, initOptions.profile, initOptions.playlistID);
            this._vizmseManager.on('connectionChanged', (connected) => this.connectionChanged(connected));
            yield this._vizmseManager.initializeRundown();
            this._vizmseManager.on('info', str => this.emit('info', 'VizMSE: ' + str));
            this._vizmseManager.on('warning', str => this.emit('warning', 'VizMSE' + str));
            this._vizmseManager.on('error', e => this.emit('error', 'VizMSE', e));
            this._vizmseManager.on('debug', (...args) => this.emit('debug', ...args));
            return true;
        });
    }
    /**
     * Terminates the device safely such that things can be garbage collected.
     */
    terminate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._vizmseManager) {
                yield this._vizmseManager.terminate();
                delete this._vizmseManager;
            }
            this._doOnTime.dispose();
            return true;
        });
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Generates an array of VizMSE commands by comparing the newState against the oldState, or the current device state.
     */
    handleState(newState) {
        // check if initialized:
        if (!this._vizmseManager || !this._vizmseManager.initialized) {
            this.emit('warning', 'VizMSE.v-connection not initialized yet');
            return;
        }
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldVizMSEState = (this.getStateBefore(previousStateTime) ||
            { state: { time: 0, layer: {} } }).state;
        let newVizMSEState = this.convertStateToVizMSE(newState);
        let commandsToAchieveState = this._diffStates(oldVizMSEState, newVizMSEState, newState.time);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue
        this._addToQueue(commandsToAchieveState);
        // store the new state, for later use:
        this.setState(newVizMSEState, newState.time);
    }
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime) {
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._vizMSEConnected;
    }
    get deviceType() {
        return src_1.DeviceType.VIZMSE;
    }
    get deviceName() {
        return `VizMSE ${this._vizMSE ? this._vizMSE.hostname : 'Uninitialized'}`;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    get supportsExpectedPlayoutItems() {
        return true;
    }
    handleExpectedPlayoutItems(expectedPlayoutItems) {
        this.emit('debug', 'VIZDEBUG: handleExpectedPlayoutItems called');
        if (this._vizmseManager) {
            this.emit('debug', 'VIZDEBUG: manager exists');
            this._vizmseManager.setExpectedPlayoutItems(expectedPlayoutItems);
        }
    }
    getCurrentState() {
        return (this.getState() || {}).state;
    }
    connectionChanged(connected) {
        if (connected === true || connected === false)
            this._vizMSEConnected = connected;
        this.emit('connectionChanged', this.getStatus());
    }
    /**
     * Takes a timeline state and returns a VizMSE State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToVizMSE(timelineState) {
        const state = {
            time: timelineState.time,
            layer: {}
        };
        const mappings = this.getMapping();
        _.each(timelineState.layers, (layer, layerName) => {
            const layerExt = layer;
            let foundMapping = mappings[layerName];
            let isLookahead = false;
            if (!foundMapping && layerExt.isLookahead && layerExt.lookaheadForLayer) {
                foundMapping = mappings[layerExt.lookaheadForLayer];
                isLookahead = true;
            }
            if (foundMapping &&
                foundMapping.device === src_1.DeviceType.VIZMSE) {
                if (layer.content) {
                    let l = layer;
                    if (l.content.type === src_1.TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS) {
                        state.layer[layerName] = device_1.literal({
                            timelineObjId: l.id,
                            contentType: src_1.TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS
                        });
                    }
                    else if (l.content.type === src_1.TimelineContentTypeVizMSE.CLEAR_ALL_ELEMENTS) {
                        // Special case: clear all graphics:
                        state.isClearAll = {
                            timelineObjId: l.id
                        };
                    }
                    else if (l.content.type === src_1.TimelineContentTypeVizMSE.CONTINUE) {
                        state.layer[layerName] = device_1.literal({
                            timelineObjId: l.id,
                            contentType: src_1.TimelineContentTypeVizMSE.CONTINUE,
                            direction: l.content.direction,
                            reference: l.content.reference
                        });
                    }
                    else {
                        const stateLayer = content2StateLayer(l.id, l.content);
                        if (stateLayer) {
                            if (isLookahead)
                                stateLayer.lookahead = true;
                            state.layer[layerName] = stateLayer;
                        }
                    }
                }
            }
        });
        if (state.isClearAll) {
            // clear rest of state:
            state.layer = {};
        }
        // Fix references:
        _.each(state.layer, (layer) => {
            if (layer.contentType === src_1.TimelineContentTypeVizMSE.CONTINUE) {
                const otherLayer = state.layer[layer.reference];
                if (otherLayer) {
                    if (otherLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
                        otherLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) {
                        layer.referenceContent = otherLayer;
                    }
                    else {
                        // it's not possible to reference that kind of object
                        this.emit('warning', `object "${layer.timelineObjId}" of contentType="${layer.contentType}", cannot reference object "${otherLayer.timelineObjId}" on layer "${layer.reference}" of contentType="${otherLayer.contentType}" `);
                    }
                }
            }
        });
        return state;
    }
    /**
     * Prepares the physical device for playout.
     * @param okToDestroyStuff Whether it is OK to do things that affects playout visibly
     */
    makeReady(okToDestroyStuff) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._vizmseManager) {
                yield this._vizmseManager.activate();
            }
            else
                throw new Error(`Unable to activate vizMSE, not initialized yet!`);
            if (okToDestroyStuff) {
                // reset our own state(s):
                this.clearStates();
                if (this._vizmseManager) {
                    if (this._initOptions &&
                        this._initOptions.clearAllOnMakeReady &&
                        this._initOptions.clearAllTemplateName) {
                        yield this._vizmseManager.clearAll({
                            type: VizMSECommandType.CLEAR_ALL_ELEMENTS,
                            time: this.getCurrentTime(),
                            timelineObjId: 'makeReady',
                            templateName: this._initOptions.clearAllTemplateName
                        });
                    }
                }
                else
                    throw new Error(`Unable to activate vizMSE, not initialized yet!`);
            }
        });
    }
    /**
     * The standDown event could be triggered at a time after broadcast
     * @param okToDestroyStuff If true, the device may do things that might affect the visible output
     */
    standDown(okToDestroyStuff) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (okToDestroyStuff) {
                if (this._vizmseManager) {
                    if (!this._initOptions ||
                        !this._initOptions.dontDeactivateOnStandDown) {
                        yield this._vizmseManager.deactivate();
                    }
                    else {
                        this._vizmseManager.standDownActiveRundown(); // because we still want to stop monitoring expectedPlayoutItems
                    }
                }
            }
        });
    }
    getStatus() {
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (!this._vizMSEConnected) {
            statusCode = device_1.StatusCode.BAD;
            messages.push('Not connected');
        }
        if (this._vizmseManager &&
            (this._vizmseManager.notLoadedCount > 0 ||
                this._vizmseManager.loadingCount > 0)) {
            statusCode = device_1.StatusCode.WARNING_MINOR;
            messages.push(`Got ${this._vizmseManager.notLoadedCount} elements not yet loaded to the Viz Engine (${this._vizmseManager.loadingCount} are currently loading)`);
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
        const highPrioCommands = [];
        const lowPrioCommands = [];
        const addCommand = (command, lowPriority) => {
            (lowPriority ? lowPrioCommands : highPrioCommands).push(command);
        };
        /** The time of when to run "preparation" commands */
        let prepareTime = Math.min(time, Math.max(time - IDEAL_PREPARE_TIME, oldState.time + PREPARE_TIME_WAIT // earliset possible prepareTime
        ));
        if (prepareTime < this.getCurrentTime()) { // Only to not emit an unnessesary slowCommand event
            prepareTime = this.getCurrentTime();
        }
        if (time < prepareTime) {
            prepareTime = time - 10;
        }
        _.each(newState.layer, (newLayer, layerId) => {
            const oldLayer = oldState.layer[layerId];
            if (newLayer.contentType === src_1.TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS) {
                if (!oldLayer || !_.isEqual(newLayer, oldLayer)) {
                    addCommand(device_1.literal({
                        timelineObjId: newLayer.timelineObjId,
                        fromLookahead: newLayer.lookahead,
                        layerId: layerId,
                        type: VizMSECommandType.LOAD_ALL_ELEMENTS,
                        time: time
                    }), newLayer.lookahead);
                }
            }
            else if (newLayer.contentType === src_1.TimelineContentTypeVizMSE.CONTINUE) {
                if ((!oldLayer ||
                    !_.isEqual(newLayer, oldLayer)) &&
                    newLayer.referenceContent) {
                    const props = {
                        timelineObjId: newLayer.timelineObjId,
                        fromLookahead: newLayer.lookahead,
                        layerId: layerId,
                        templateInstance: VizMSEManager.getTemplateInstance(newLayer.referenceContent),
                        templateName: VizMSEManager.getTemplateName(newLayer.referenceContent),
                        templateData: VizMSEManager.getTemplateData(newLayer.referenceContent),
                        channelName: newLayer.referenceContent.channelName
                    };
                    if ((newLayer.direction || 1) === 1) {
                        addCommand(device_1.literal(Object.assign(Object.assign({}, props), { type: VizMSECommandType.CONTINUE_ELEMENT, time: time })), newLayer.lookahead);
                    }
                    else {
                        addCommand(device_1.literal(Object.assign(Object.assign({}, props), { type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE, time: time })), newLayer.lookahead);
                    }
                }
            }
            else {
                const props = {
                    timelineObjId: newLayer.timelineObjId,
                    fromLookahead: newLayer.lookahead,
                    layerId: layerId,
                    templateInstance: VizMSEManager.getTemplateInstance(newLayer),
                    templateName: VizMSEManager.getTemplateName(newLayer),
                    templateData: VizMSEManager.getTemplateData(newLayer),
                    channelName: newLayer.channelName
                };
                if (!oldLayer ||
                    !_.isEqual(_.omit(newLayer, ['continueStep']), _.omit(oldLayer, ['continueStep']))) {
                    if (newLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
                        newLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) {
                        // Maybe prepare the element first:
                        addCommand(device_1.literal(Object.assign(Object.assign({}, props), { type: VizMSECommandType.PREPARE_ELEMENT, time: prepareTime })), newLayer.lookahead);
                        if (newLayer.cue) {
                            // Cue the element
                            addCommand(device_1.literal(Object.assign(Object.assign({}, props), { type: VizMSECommandType.CUE_ELEMENT, time: time })), newLayer.lookahead);
                        }
                        else {
                            // Start playing element
                            addCommand(device_1.literal(Object.assign(Object.assign({}, props), { type: VizMSECommandType.TAKE_ELEMENT, time: time })), newLayer.lookahead);
                        }
                    }
                }
                else if ((oldLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
                    oldLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) &&
                    (newLayer.continueStep || 0) > (oldLayer.continueStep || 0)) {
                    // An increase in continueStep should result in triggering a continue:
                    addCommand(device_1.literal(Object.assign(Object.assign({}, props), { type: VizMSECommandType.CONTINUE_ELEMENT, time: time })), newLayer.lookahead);
                }
                else if ((oldLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
                    oldLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) &&
                    (newLayer.continueStep || 0) < (oldLayer.continueStep || 0)) {
                    // A decrease in continueStep should result in triggering a continue:
                    addCommand(device_1.literal(Object.assign(Object.assign({}, props), { type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE, time: time })), newLayer.lookahead);
                }
            }
        });
        _.each(oldState.layer, (oldLayer, layerId) => {
            const newLayer = newState.layer[layerId];
            if (!newLayer) {
                if (oldLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
                    oldLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) {
                    // Stopped playing
                    addCommand(device_1.literal({
                        type: VizMSECommandType.TAKEOUT_ELEMENT,
                        time: time,
                        timelineObjId: oldLayer.timelineObjId,
                        fromLookahead: oldLayer.lookahead,
                        layerId: layerId,
                        transition: oldLayer && oldLayer.outTransition,
                        templateInstance: VizMSEManager.getTemplateInstance(oldLayer),
                        templateName: VizMSEManager.getTemplateName(oldLayer),
                        templateData: VizMSEManager.getTemplateData(oldLayer),
                        channelName: oldLayer.channelName
                    }), oldLayer.lookahead);
                }
            }
        });
        if (newState.isClearAll) {
            // Special: clear all graphics
            const templateName = this._initOptions && this._initOptions.clearAllTemplateName;
            if (!templateName) {
                this.emit('warning', `vizMSE: initOptions.clearAllTemplateName is not set!`);
            }
            else {
                // Start playing special element:
                return [
                    device_1.literal({
                        timelineObjId: newState.isClearAll.timelineObjId,
                        time: time,
                        type: VizMSECommandType.CLEAR_ALL_ELEMENTS,
                        templateName: templateName
                    })
                ];
            }
        }
        return highPrioCommands.concat(lowPrioCommands);
    }
    _doCommand(command, context, timlineObjId) {
        let time = this.getCurrentTime();
        return this._commandReceiver(time, command, context, timlineObjId);
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState) {
        _.each(commandsToAchieveState, (cmd) => {
            this._doOnTime.queue(cmd.time, cmd.layerId, (c) => {
                return this._doCommand(c.cmd, c.cmd.type + '_' + c.cmd.timelineObjId, c.cmd.timelineObjId);
            }, { cmd: cmd });
            this._doOnTimeBurst.queue(cmd.time, undefined, (c) => {
                if ((c.cmd.type === VizMSECommandType.TAKE_ELEMENT) &&
                    !c.cmd.fromLookahead) {
                    if (this._vizmseManager && c.cmd.layerId) {
                        this._vizmseManager.clearAllWaitWithLayer(c.cmd.layerId);
                    }
                }
                return Promise.resolve();
            }, { cmd: cmd });
        });
    }
    /**
     * Sends commands to the VizMSE server
     * @param time deprecated
     * @param cmd Command to execute
     */
    _defaultCommandReceiver(_time, cmd, context, timelineObjId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let cwc = {
                context: context,
                timelineObjId: timelineObjId,
                command: cmd
            };
            this.emit('debug', cwc);
            try {
                if (this._vizmseManager) {
                    if (cmd.type === VizMSECommandType.PREPARE_ELEMENT) {
                        yield this._vizmseManager.prepareElement(cmd);
                    }
                    else if (cmd.type === VizMSECommandType.CUE_ELEMENT) {
                        yield this._vizmseManager.cueElement(cmd);
                    }
                    else if (cmd.type === VizMSECommandType.TAKE_ELEMENT) {
                        yield this._vizmseManager.takeElement(cmd);
                    }
                    else if (cmd.type === VizMSECommandType.TAKEOUT_ELEMENT) {
                        yield this._vizmseManager.takeoutElement(cmd);
                    }
                    else if (cmd.type === VizMSECommandType.CONTINUE_ELEMENT) {
                        yield this._vizmseManager.continueElement(cmd);
                    }
                    else if (cmd.type === VizMSECommandType.CONTINUE_ELEMENT_REVERSE) {
                        yield this._vizmseManager.continueElementReverse(cmd);
                    }
                    else if (cmd.type === VizMSECommandType.LOAD_ALL_ELEMENTS) {
                        yield this._vizmseManager.loadAllElements(cmd);
                    }
                    else if (cmd.type === VizMSECommandType.CLEAR_ALL_ELEMENTS) {
                        yield this._vizmseManager.clearAll(cmd);
                    }
                    else {
                        // @ts-ignore never
                        throw new Error(`Unsupported command type "${cmd.type}"`);
                    }
                }
                else {
                    throw new Error(`Not initialized yet`);
                }
            }
            catch (error) {
                let errorString = (error && error.message ?
                    error.message :
                    error.toString());
                this.emit('commandError', new Error(errorString), cwc);
            }
        });
    }
}
exports.VizMSEDevice = VizMSEDevice;
class VizMSEManager extends events_1.EventEmitter {
    constructor(_parentVizMSEDevice, _vizMSE, preloadAllElements = false, _showID, _profile, _playlistID) {
        super();
        this._parentVizMSEDevice = _parentVizMSEDevice;
        this._vizMSE = _vizMSE;
        this.preloadAllElements = preloadAllElements;
        this._showID = _showID;
        this._profile = _profile;
        this._playlistID = _playlistID;
        this.initialized = false;
        this.notLoadedCount = 0;
        this.loadingCount = 0;
        this._elementCache = {};
        this._expectedPlayoutItems = [];
        this._lastTimeCommandSent = 0;
        this._hasActiveRundown = false;
        this._elementsLoaded = {};
        this._mseConnected = false;
        this._msePingConnected = false;
        this._waitWithLayers = {};
    }
    /**
     * Initialize the Rundown in MSE.
     * Our approach is to create a single rundown on initialization, and then use only that for later control.
     */
    initializeRundown() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._vizMSE.on('connected', () => this.mseConnectionChanged(true));
            this._vizMSE.on('disconnected', () => this.mseConnectionChanged(false));
            // Perform a ping, to ensure we are connected properly
            yield this._vizMSE.ping();
            this._msePingConnected = true;
            this.mseConnectionChanged(true);
            // Setup the rundown used by this device:
            const rundown = yield this._getRundown();
            if (!rundown)
                throw new Error(`VizMSEManager: Unable to create rundown!`);
            // const profile = await this._vizMSE.getProfile('sofie') // TODO: Figure out if this is needed
            if (this._monitorAndLoadElementsInterval) {
                clearInterval(this._monitorAndLoadElementsInterval);
            }
            this._monitorAndLoadElementsInterval = setInterval(() => {
                this._monitorLoadedElements()
                    .catch((...args) => {
                    this.emit('error', ...args);
                });
            }, MONITOR_INTERVAL);
            if (this._monitorMSEConnection) {
                clearInterval(this._monitorMSEConnection);
            }
            this._monitorMSEConnection = setInterval(() => this._monitorConnection(), MONITOR_INTERVAL);
            this.initialized = true;
        });
    }
    /**
     * Close connections and die
     */
    terminate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._monitorAndLoadElementsInterval) {
                clearInterval(this._monitorAndLoadElementsInterval);
            }
            if (this._monitorMSEConnection) {
                clearInterval(this._monitorMSEConnection);
            }
            if (this._vizMSE) {
                yield this._vizMSE.close();
                delete this._vizMSE;
            }
        });
    }
    /**
     * Set the collection of expectedPlayoutItems.
     * These will be monitored and can be triggered to pre-load.
     */
    setExpectedPlayoutItems(expectedPlayoutItems) {
        this.emit('debug', 'VIZDEBUG: setExpectedPlayoutItems called');
        if (this.preloadAllElements) {
            this.emit('debug', 'VIZDEBUG: preload elements allowed');
            this._expectedPlayoutItems = expectedPlayoutItems;
            this._getExpectedPlayoutItems().catch((...args) => this.emit('error', ...args));
        }
    }
    /**
     * Activate the rundown.
     * This causes the MSE rundown to activate, which must be done before using it.
     * Doing this will make MSE start loading things onto the vizEngine etc.
     */
    activate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._triggerCommandSent();
            const rundown = yield this._getRundown();
            // clear any existing elements from the existing rundown
            try {
                yield rundown.purge();
            }
            catch (e) {
                if (((e && e.toString()) + '').match(/active profile/i)) { // "Cannot purge an active profile."
                    // That's okay
                }
                else
                    throw e;
            }
            this._clearCache();
            this._triggerCommandSent();
            yield rundown.activate();
            this._triggerCommandSent();
            yield this._triggerLoadAllElements();
            this._triggerCommandSent();
            this._hasActiveRundown = true;
        });
    }
    /**
     * Deactivate the MSE rundown.
     * This causes the MSE to stand down and clear the vizEngines of any loaded graphics.
     */
    deactivate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            this._triggerCommandSent();
            yield rundown.deactivate();
            this._triggerCommandSent();
            this.standDownActiveRundown();
        });
    }
    standDownActiveRundown() {
        this._hasActiveRundown = false;
    }
    /**
     * Prepare an element
     * This creates the element and is intended to be called a little time ahead of Takeing the element.
     */
    prepareElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const elementHash = this.getElementHash(cmd);
            this.emit('debug', `VizMSE: prepare "${elementHash}"`);
            this._triggerCommandSent();
            yield this._checkPrepareElement(cmd, true);
            this._triggerCommandSent();
        });
    }
    /**
     * Cue:ing an element: Load and play the first frame of a graphic
     */
    cueElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            const elementRef = yield this._checkPrepareElement(cmd);
            yield this._checkElementExists(cmd);
            yield this._handleRetry(() => {
                this.emit('debug', `VizMSE: cue "${elementRef}"`);
                return rundown.cue(elementRef);
            });
        });
    }
    /**
     * Take an element: Load and Play a graphic element, run in-animatinos etc
     */
    takeElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            const elementRef = yield this._checkPrepareElement(cmd);
            yield this._checkElementExists(cmd);
            yield this._handleRetry(() => {
                this.emit('debug', `VizMSE: take "${elementRef}"`);
                return rundown.take(elementRef);
            });
        });
    }
    /**
     * Take out: Animate out a graphic element
     */
    takeoutElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            if (cmd.transition) {
                if (cmd.transition.type === src_1.VIZMSETransitionType.DELAY) {
                    if (yield this.waitWithLayer(cmd.layerId || '__default', cmd.transition.delay)) {
                        // at this point, the wait aws aborted by someone else. Do nothing then.
                        return;
                    }
                }
            }
            const elementRef = yield this._checkPrepareElement(cmd);
            yield this._checkElementExists(cmd);
            yield this._handleRetry(() => {
                this.emit('debug', `VizMSE: out "${elementRef}"`);
                return rundown.out(elementRef);
            });
        });
    }
    /**
     * Continue: Cause the graphic element to step forward, if it has multiple states
     */
    continueElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            const elementRef = yield this._checkPrepareElement(cmd);
            yield this._checkElementExists(cmd);
            yield this._handleRetry(() => {
                this.emit('debug', `VizMSE: continue "${elementRef}"`);
                return rundown.continue(elementRef);
            });
        });
    }
    /**
     * Continue-reverse: Cause the graphic element to step backwards, if it has multiple states
     */
    continueElementReverse(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            const elementRef = yield this._checkPrepareElement(cmd);
            yield this._checkElementExists(cmd);
            yield this._handleRetry(() => {
                this.emit('debug', `VizMSE: continue reverse "${elementRef}"`);
                return rundown.continueReverse(elementRef);
            });
        });
    }
    /**
     * Special: trigger a template which clears all templates on the output
     */
    clearAll(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            const template = {
                timelineObjId: cmd.timelineObjId,
                contentType: src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL,
                templateName: cmd.templateName,
                templateData: []
            };
            // Start playing special element:
            const cmdTake = {
                time: cmd.time,
                type: VizMSECommandType.TAKE_ELEMENT,
                timelineObjId: template.timelineObjId,
                templateInstance: VizMSEManager.getTemplateInstance(template),
                templateName: VizMSEManager.getTemplateName(template)
            };
            const elementRef = yield this._checkPrepareElement(cmdTake);
            yield this._checkElementExists(cmdTake);
            yield this._handleRetry(() => {
                this.emit('debug', `VizMSE: clearAll take "${elementRef}"`);
                return rundown.take(elementRef);
            });
        });
    }
    /**
     * Load all elements: Trigger a loading of all pilot elements onto the vizEngine.
     * This might cause the vizEngine to freeze during load, so do not to it while on air!
     */
    loadAllElements(_cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._triggerCommandSent();
            yield this._triggerLoadAllElements();
            this._triggerCommandSent();
        });
    }
    /** Convenience function for determining the template name/vcpid */
    static getTemplateName(layer) {
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL)
            return layer.templateName;
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT)
            return layer.templateVcpId;
        throw new Error(`Unknown layer.contentType "${layer['contentType']}"`);
    }
    /** Convenience function to get the data for an element */
    static getTemplateData(layer) {
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL)
            return layer.templateData;
        return [];
    }
    /** Convenience function to get the "instance-id" of an element. This is intended to be unique for each usage/instance of the elemenet */
    static getTemplateInstance(layer) {
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL) {
            return 'sofieInt_' + layer.templateName + '_' + getHash(layer.templateData.join(','));
        }
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT)
            return 'pilot_' + layer.templateVcpId;
        throw new Error(`Unknown layer.contentType "${layer['contentType']}"`);
    }
    getElementHash(cmd) {
        if (_.isNumber(cmd.templateInstance)) {
            return 'pilot_' + cmd.templateInstance;
        }
        else {
            return ('int_' +
                cmd.templateInstance);
        }
    }
    _getCachedElement(hash) {
        return this._elementCache[hash];
    }
    _cacheElement(hash, element) {
        if (!hash)
            throw new Error('_cacheElement: hash not set');
        if (!element)
            throw new Error('_cacheElement: element not set (with hash ' + hash + ')');
        if (this._elementCache[hash]) {
            this.emit('warning', `There is already an element with hash "${hash}" in cache`);
        }
        this._elementCache[hash] = { hash, element };
    }
    _clearCache() {
        _.each(_.keys(this._elementCache), hash => {
            delete this._elementCache[hash];
        });
    }
    _getElementReference(el) {
        if (this._isInternalElement(el))
            return el.name;
        if (this._isExternalElement(el))
            return Number(el.vcpid); // TMP!!
        throw Error('Unknown element type, neither internal nor external');
    }
    _isInternalElement(element) {
        const el = element;
        return (el && el.name && !el.vcpid);
    }
    _isExternalElement(element) {
        const el = element;
        return (el && el.vcpid);
    }
    /**
     * Check if element is already created, otherwise create it and return it.
     */
    _checkPrepareElement(cmd, fromPrepare) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // check if element is prepared
            const elementHash = this.getElementHash(cmd);
            let element = (this._getCachedElement(elementHash) || {}).element;
            if (!element) {
                if (!fromPrepare) {
                    this.emit('warning', `Late preparation of element "${elementHash}"`);
                }
                else {
                    this.emit('debug', `VizMSE: preparing new "${elementHash}"`);
                }
                element = yield this._prepareNewElement(cmd);
                if (!fromPrepare)
                    yield this._wait(100); // wait a bit, because taking isn't possible right away anyway at this point
            }
            return this._getElementReference(element);
            // })
        });
    }
    /** Check that the element exists and if not, throw error */
    _checkElementExists(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            const elementHash = this.getElementHash(cmd);
            const cachedElement = this._getCachedElement(elementHash);
            if (!cachedElement)
                throw new Error(`_checkElementExists: cachedElement falsy`);
            const elementRef = this._getElementReference(cachedElement.element);
            const elementIsExternal = cachedElement && this._isExternalElement(cachedElement.element);
            if (elementIsExternal) {
                const element = yield rundown.getElement(elementRef);
                if (this._isExternalElement(element) &&
                    element.exists === 'no') {
                    throw new Error(`Can't take the element "${elementRef}" while it has the property exists="no"`);
                }
            }
        });
    }
    /**
     * Create a new element in MSE
     */
    _prepareNewElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            const elementHash = this.getElementHash(cmd);
            try {
                if (_.isNumber(cmd.templateName)) {
                    // Prepare a pilot element
                    const pilotEl = yield rundown.createElement(cmd.templateName, cmd.channelName);
                    this._cacheElement(elementHash, pilotEl);
                    return pilotEl;
                }
                else {
                    // Prepare an internal element
                    const internalEl = yield rundown.createElement(cmd.templateName, cmd.templateInstance, cmd.templateData || [], cmd.channelName);
                    this._cacheElement(elementHash, internalEl);
                    return internalEl;
                }
            }
            catch (e) {
                if (e.toString().match(/already exist/i)) { // "An internal graphics element with name 'xxxxxxxxxxxxxxx' already exists."
                    // If the object already exists, it's not an error, fetch and use the element instead
                    const element = yield rundown.getElement(cmd.templateInstance);
                    this._cacheElement(elementHash, element);
                    return element;
                }
                else {
                    throw e;
                }
            }
        });
    }
    _getExpectedPlayoutItems() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this.emit('debug', `VISMSE: _getExpectedPlayoutItems (${this._expectedPlayoutItems.length})`);
            const hashesAndItems = {};
            yield Promise.all(_.map(this._expectedPlayoutItems, (expectedPlayoutItem) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                try {
                    const stateLayer = (_.isNumber(expectedPlayoutItem.templateName) ?
                        content2StateLayer('', {
                            deviceType: src_1.DeviceType.VIZMSE,
                            type: src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT,
                            templateVcpId: expectedPlayoutItem.templateName
                        }) :
                        content2StateLayer('', {
                            deviceType: src_1.DeviceType.VIZMSE,
                            type: src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL,
                            templateName: expectedPlayoutItem.templateName,
                            templateData: expectedPlayoutItem.templateData
                        }));
                    if (stateLayer) {
                        const item = Object.assign(Object.assign({}, expectedPlayoutItem), { templateInstance: VizMSEManager.getTemplateInstance(stateLayer) });
                        yield this._checkPrepareElement(item, true);
                        hashesAndItems[this.getElementHash(item)] = item;
                    }
                }
                catch (e) {
                    this.emit('error', `Error in _getExpectedPlayoutItems: ${e.toString()}`);
                }
            })));
            return hashesAndItems;
        });
    }
    /**
     * Update the load-statuses of the expectedPlayoutItems -elements from MSE, where needed
     */
    updateElementsLoadedStatus(forceReloadAll) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const hashesAndItems = yield this._getExpectedPlayoutItems();
            const elementsToLoad = _.compact(_.map(hashesAndItems, (item, hash) => {
                const el = this._getCachedElement(hash);
                if (!item.noAutoPreloading && el) {
                    return Object.assign(Object.assign({}, el), { item: item, hash: hash });
                }
                return undefined;
            }));
            if (this._rundown) {
                this.emit('debug', `Updating status of elements starting, elementsToLoad.length=${elementsToLoad.length} (${_.keys(hashesAndItems).length})`);
                const rundown = yield this._getRundown();
                if (forceReloadAll) {
                    this._elementsLoaded = {};
                }
                yield Promise.all(_.map(elementsToLoad, (e) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    const cachedEl = this._elementsLoaded[e.hash];
                    if (!cachedEl || !cachedEl.isLoaded) {
                        try {
                            const elementRef = yield this._checkPrepareElement(e.item);
                            this.emit('debug', `Updating status of element ${elementRef}`);
                            // Update cached status of the element:
                            const newEl = yield rundown.getElement(elementRef);
                            this._elementsLoaded[e.hash] = {
                                element: newEl,
                                isLoaded: this._isElementLoaded(newEl),
                                isNotLoaded: this._isElementNotLoaded(newEl)
                            };
                        }
                        catch (e) {
                            this.emit('error', `Error in updateElementsLoadedStatus: ${e.toString()}`);
                        }
                    }
                })));
                this.emit('debug', `Updating status of elements done, this._elementsLoaded.length=${_.keys(this._elementsLoaded).length}`);
            }
            else {
                throw Error('VizMSE.v-connection not initialized yet');
            }
        });
    }
    /**
     * Trigger a load of all elements that are not yet loaded onto the vizEngine.
     */
    _triggerLoadAllElements() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const rundown = yield this._getRundown();
            this.emit('debug', '_triggerLoadAllElements starting');
            // First, update the loading-status of all elements:
            yield this.updateElementsLoadedStatus(true);
            // Then, load all elements that needs loading:
            yield Promise.all(_.map(this._elementsLoaded, (e) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                if (this._isInternalElement(e.element)) {
                    // TODO: what?
                }
                else if (this._isExternalElement(e.element)) {
                    if (e.isLoaded) {
                        // The element is loaded fine, no need to do anything
                        this.emit('debug', `Element "${this._getElementReference(e.element)}" is loaded`);
                    }
                    else if (e.isNotLoaded) {
                        // The element has not started loading, load it:
                        this.emit('debug', `Element "${this._getElementReference(e.element)}" is not loaded, initializing`);
                        yield rundown.initialize(this._getElementReference(e.element));
                    }
                    else {
                        // The element is currently loading, do nothing
                        this.emit('debug', `Element "${this._getElementReference(e.element)}" is loading`);
                    }
                }
                else {
                    this.emit('error', `Element "${this._getElementReference(e.element)}" type `);
                }
            })));
            this.emit('debug', '_triggerLoadAllElements done');
        });
    }
    _monitorConnection() {
        // (the ping will throuw on a timeout if ping doesn't return in time)
        if (this.initialized) {
            this._vizMSE.ping()
                .then(() => {
                // ok!
                if (!this._msePingConnected) {
                    this._msePingConnected = true;
                    this.onConnectionChanged();
                }
            }, () => {
                // not ok!
                if (this._msePingConnected) {
                    this._msePingConnected = false;
                    this.onConnectionChanged();
                }
            });
        }
    }
    /** Monitor loading status of expected elements */
    _monitorLoadedElements() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                if (this._rundown &&
                    this._hasActiveRundown &&
                    this.preloadAllElements &&
                    this._timeSinceLastCommandSent() > SAFE_PRELOAD_TIME) {
                    yield this.updateElementsLoadedStatus(false);
                    let notLoaded = 0;
                    let loading = 0;
                    let loaded = 0;
                    _.each(this._elementsLoaded, (e) => {
                        if (e.isLoaded)
                            loaded++;
                        else if (e.isNotLoaded)
                            notLoaded++;
                        else
                            loading++;
                    });
                    loaded = loaded; // loaded isn't really used anywhere
                    this._setLoadedStatus(notLoaded, loading);
                }
                else
                    this._setLoadedStatus(0, 0);
            }
            catch (e) {
                this.emit('error', e);
            }
        });
    }
    _wait(time) {
        return new Promise(resolve => setTimeout(resolve, time));
    }
    /** Execute fcn an retry a couple of times until it succeeds */
    _handleRetry(fcn) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let i = 0;
            const maxNumberOfTries = 5;
            while (true) {
                try {
                    this._triggerCommandSent();
                    const result = fcn();
                    this._triggerCommandSent();
                    return result;
                }
                catch (e) {
                    if (i++ < maxNumberOfTries) {
                        if (e && e.toString && e.toString().match(/inexistent/i)) { // "PepTalk inexistent error"
                            this.emit('debug', `VizMSE: _handleRetry got "inexistent" error, trying again...`);
                            // Wait and try again:
                            yield this._wait(300);
                        }
                        else {
                            // Unhandled error, give up:
                            throw e;
                        }
                    }
                    else {
                        // Give up, we've tried enough times already
                        throw e;
                    }
                }
            }
        });
    }
    _triggerCommandSent() {
        this._lastTimeCommandSent = Date.now();
    }
    _timeSinceLastCommandSent() {
        return Date.now() - this._lastTimeCommandSent;
    }
    _setLoadedStatus(notLoaded, loading) {
        if (notLoaded !== this.notLoadedCount ||
            loading !== this.loadingCount) {
            this.notLoadedCount = notLoaded;
            this.loadingCount = loading;
            this._parentVizMSEDevice.connectionChanged();
        }
    }
    /**
     * Returns true if the element is successfully loaded (as opposed to "not-loaded" or "loading")
     */
    _isElementLoaded(el) {
        if (this._isInternalElement(el)) {
            return true; // not implemented / unknown
        }
        else if (this._isExternalElement(el)) {
            return ((el.available === '1.00' || el.available === '1') &&
                (el.loaded === '1.00' || el.loaded === '1') &&
                el.is_loading !== 'yes');
        }
        else {
            throw new Error(`vizMSE: _isLoaded: unknown element type: ${el && JSON.stringify(el)}`);
        }
    }
    /**
     * Returns true if the element has NOT started loading (is currently not loading, or finished loaded)
     */
    _isElementNotLoaded(el) {
        if (this._isInternalElement(el)) {
            return false; // not implemented / unknown
        }
        else if (this._isExternalElement(el)) {
            return ((el.loaded === '0.00' || el.loaded === '0' || !el.loaded) &&
                el.is_loading !== 'yes');
        }
        else {
            throw new Error(`vizMSE: _isLoaded: unknown element type: ${el && JSON.stringify(el)}`);
        }
    }
    /**
     * Return the current MSE rundown, create it if it doesn't exists
     */
    _getRundown() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown) {
                // Only allow for one rundown fetch at the same time:
                if (this._getRundownPromise) {
                    return this._getRundownPromise;
                }
                const getRundownPromise = (() => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    // Check if the rundown already exists:
                    // let rundown: VRundown | undefined = _.find(await this._vizMSE.getRundowns(), (rundown) => {
                    // 	return (
                    // 		rundown.show === this._showID &&
                    // 		rundown.profile === this._profile &&
                    // 		rundown.playlist === this._playlistID
                    // 	)
                    // })
                    this.emit('debug', `Creating new rundown ${[this._showID, this._profile, this._playlistID]}`);
                    let rundown = yield this._vizMSE.createRundown(this._showID, this._profile, this._playlistID);
                    this._rundown = rundown;
                    if (!this._rundown)
                        throw new Error(`_getRundown: this._rundown is not set!`);
                    return this._rundown;
                }))();
                this._getRundownPromise = getRundownPromise;
                const rundown = yield this._getRundownPromise;
                this._rundown = rundown;
                return rundown;
            }
            else {
                return this._rundown;
            }
        });
    }
    mseConnectionChanged(connected) {
        if (connected !== this._mseConnected) {
            this._mseConnected = connected;
            this.onConnectionChanged();
        }
    }
    onConnectionChanged() {
        this.emit('connectionChanged', (this._mseConnected &&
            this._msePingConnected));
    }
    clearAllWaitWithLayer(portId) {
        if (!this._waitWithLayers[portId]) {
            _.each(this._waitWithLayers[portId], fcn => {
                fcn(true);
            });
        }
    }
    /**
     * Returns true if the wait was cleared from someone else
     */
    waitWithLayer(layerId, delay) {
        return new Promise(resolve => {
            if (!this._waitWithLayers[layerId])
                this._waitWithLayers[layerId] = [];
            this._waitWithLayers[layerId].push(resolve);
            setTimeout(() => {
                resolve(false);
            }, delay || 0);
        });
    }
}
var VizMSECommandType;
(function (VizMSECommandType) {
    VizMSECommandType["PREPARE_ELEMENT"] = "prepare";
    VizMSECommandType["CUE_ELEMENT"] = "cue";
    VizMSECommandType["TAKE_ELEMENT"] = "take";
    VizMSECommandType["TAKEOUT_ELEMENT"] = "out";
    VizMSECommandType["CONTINUE_ELEMENT"] = "continue";
    VizMSECommandType["CONTINUE_ELEMENT_REVERSE"] = "continuereverse";
    VizMSECommandType["LOAD_ALL_ELEMENTS"] = "load_all_elements";
    VizMSECommandType["CLEAR_ALL_ELEMENTS"] = "clear_all_elements";
})(VizMSECommandType = exports.VizMSECommandType || (exports.VizMSECommandType = {}));
function content2StateLayer(timelineObjId, content) {
    if (content.type === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL) {
        const o = {
            timelineObjId: timelineObjId,
            contentType: src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL,
            continueStep: content.continueStep,
            cue: content.cue,
            outTransition: content.outTransition,
            templateName: content.templateName,
            templateData: content.templateData,
            channelName: content.channelName
        };
        return o;
    }
    else if (content.type === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) {
        const o = {
            timelineObjId: timelineObjId,
            contentType: src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT,
            continueStep: content.continueStep,
            cue: content.cue,
            outTransition: content.outTransition,
            templateVcpId: content.templateVcpId,
            channelName: content.channelName
        };
        return o;
    }
    return;
}
//# sourceMappingURL=vizMSE.js.map