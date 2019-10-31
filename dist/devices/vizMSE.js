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
// const DEFAULT_FPS = 25 // frames per second
// const JUMP_ERROR_MARGIN = 10 // frames
function getHash(str) {
    const hash = crypto.createHash('sha1');
    return hash.update(str).digest('base64').replace(/[\+\/\=]/g, '_'); // remove +/= from strings, because they cause troubles
}
exports.getHash = getHash;
/**
 * This class is used to interface with a vizRT Media Sequence Editor, through the v-connection library
 */
class VizMSEDevice extends device_1.DeviceWithState {
    // private _initialized: boolean = false
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
    }
    init(connectionOptions) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._connectionOptions = connectionOptions;
            if (!this._connectionOptions.host)
                throw new Error('VizMSE bad connection option: host');
            this._vizMSE = v_connection_1.createMSE(this._connectionOptions.host, this._connectionOptions.restPort, this._connectionOptions.wsPort);
            this._vizmseManager = new VizMSEManager(this._vizMSE, this._connectionOptions.preloadAllElements);
            this._vizmseManager.on('connectionChanged', (connected) => this._connectionChanged(connected));
            yield this._vizmseManager.initializeRundown(connectionOptions.showID, connectionOptions.profile, connectionOptions.playlistID);
            // this._vizmse.on('error', e => this.emit('error', 'VizMSE.v-connection', e))
            this._vizmseManager.on('info', str => this.emit('info', 'VizMSE: ' + str));
            this._vizmseManager.on('warning', str => this.emit('warning', 'VizMSE' + str));
            this._vizmseManager.on('error', e => this.emit('error', 'VizMSE', e));
            this._vizmseManager.on('debug', (...args) => this.emit('debug', ...args));
            // this._initialized = true
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
        if (this._vizmseManager) {
            this._vizmseManager.setExpectedPlayoutItems(expectedPlayoutItems);
        }
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
                    const stateLayer = content2StateLayer(layer.id, layer.content);
                    if (stateLayer) {
                        if (isLookahead)
                            stateLayer.lookahead = true;
                        state.layer[layerName] = stateLayer;
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
            if (okToDestroyStuff) {
                // reset our own state(s):
                this.clearStates();
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
                    yield this._vizmseManager.deactivate();
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
        // if (this._vizMSE.statusMessage) {
        // 	statusCode = StatusCode.BAD
        // 	messages.push(this._vizMSE.statusMessage)
        // }
        // if (!this._vizMSE.initialized) {
        // 	statusCode = StatusCode.BAD
        // 	messages.push(`VizMSE device connection not initialized (restart required)`)
        // }
        return {
            statusCode: statusCode,
            messages: messages
        };
    }
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
            // if (
            // 	!oldLayer ||
            // 	!_.isEqual(newLayer.channels, oldLayer.channels)
            // ) {
            // 	const channel = newLayer.channels[0] as number | undefined
            // 	if (channel !== undefined) { // todo: support for multiple channels
            // 		addCommand({
            // 			type: VizMSECommandType.SETUPPORT,
            // 			time: prepareTime,
            // 			portId: portId,
            // 			timelineObjId: newLayer.timelineObjId,
            // 			channel: channel
            // 		}, newLayer.lookahead)
            // 	}
            // }
            if (!oldLayer ||
                !_.isEqual(_.omit(newLayer, ['continueStep']), _.omit(oldLayer, ['continueStep']))) {
                if (newLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL ||
                    newLayer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) {
                    // Maybe prepare the element first:
                    addCommand({
                        type: VizMSECommandType.PREPARE_ELEMENT,
                        time: prepareTime,
                        timelineObjId: newLayer.timelineObjId,
                        fromLookahead: newLayer.lookahead,
                        templateInstance: VizMSEManager.getTemplateInstance(newLayer),
                        templateName: VizMSEManager.getTemplateName(newLayer),
                        templateData: VizMSEManager.getTemplateData(newLayer)
                    }, newLayer.lookahead);
                    // Start playing
                    addCommand({
                        type: VizMSECommandType.TAKE_ELEMENT,
                        time: time,
                        timelineObjId: newLayer.timelineObjId,
                        fromLookahead: newLayer.lookahead,
                        templateInstance: VizMSEManager.getTemplateInstance(newLayer),
                        templateName: VizMSEManager.getTemplateName(newLayer),
                        templateData: VizMSEManager.getTemplateData(newLayer)
                    }, newLayer.lookahead);
                }
            }
            else if ((newLayer.continueStep || 0) > (oldLayer.continueStep || 0)) {
                // An increase in continueStep should result in triggering a continue:
                addCommand({
                    type: VizMSECommandType.CONTINUE_ELEMENT,
                    time: prepareTime,
                    timelineObjId: newLayer.timelineObjId,
                    fromLookahead: newLayer.lookahead,
                    templateInstance: VizMSEManager.getTemplateInstance(newLayer)
                }, newLayer.lookahead);
            }
            else if ((newLayer.continueStep || 0) < (oldLayer.continueStep || 0)) {
                // A decrease in continueStep should result in triggering a continue:
                addCommand({
                    type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE,
                    time: prepareTime,
                    timelineObjId: newLayer.timelineObjId,
                    fromLookahead: newLayer.lookahead,
                    templateInstance: VizMSEManager.getTemplateInstance(newLayer)
                }, newLayer.lookahead);
            }
        });
        _.each(oldState.layer, (oldLayer, layerId) => {
            const newLayer = newState.layer[layerId];
            if (!newLayer) {
                // Stopped playing
                addCommand({
                    type: VizMSECommandType.TAKEOUT_ELEMENT,
                    time: prepareTime,
                    timelineObjId: oldLayer.timelineObjId,
                    fromLookahead: oldLayer.lookahead,
                    elementName: VizMSEManager.getTemplateInstance(oldLayer)
                }, oldLayer.lookahead);
            }
        });
        return highPrioCommands.concat(lowPrioCommands);
    }
    _doCommand(command, context, timlineObjId) {
        let time = this.getCurrentTime();
        return this._commandReceiver(time, command, context, timlineObjId);
    }
    /**
     * Use either AMCP Command Scheduling or the doOnTime to execute commands at
     * {@code time}.
     * @param commandsToAchieveState Commands to be added to queue
     * @param time Point in time to send commands at
     */
    _addToQueue(commandsToAchieveState) {
        _.each(commandsToAchieveState, (cmd) => {
            this._doOnTime.queue(cmd.time, cmd.layerId, (c) => {
                return this._doCommand(c.cmd, c.cmd.type + '_' + c.cmd.timelineObjId, c.cmd.timelineObjId);
            }, { cmd: cmd });
        });
    }
    /**
     * Sends commands to the VizMSE ISA server
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
    _connectionChanged(connected) {
        if (connected === true || connected === false)
            this._vizMSEConnected = connected;
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.VizMSEDevice = VizMSEDevice;
class VizMSEManager extends events_1.EventEmitter {
    constructor(_vizMSE, preloadAllElements) {
        super();
        this._vizMSE = _vizMSE;
        this.preloadAllElements = preloadAllElements;
        this.initialized = false;
        this._elementCache = {};
        this._expectedPlayoutItems = [];
        // this._vizmse.on('error', (...args) => this.emit('error', ...args))
        // this._vizmse.on('debug', (...args) => this.emit('debug', ...args))
    }
    initializeRundown(showID, profile, playlistID) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._vizMSE.on('connected', () => this.emit('connectionChanged', true));
            this._vizMSE.on('disconnected', () => this.emit('connectionChanged', false));
            yield this._vizMSE.ping();
            this.emit('connectionChanged', true);
            // Setup the rundown used by this device
            // check if it already exists:
            this._rundown = _.find(this._vizMSE.getRundowns(), (rundown) => {
                return (rundown.show === showID &&
                    rundown.profile === profile &&
                    rundown.playlist === playlistID);
            });
            if (!this._rundown) {
                this._rundown = yield this._vizMSE.createRundown(showID, profile, playlistID);
            }
            if (!this._rundown)
                throw new Error(`VizMSEManager: unable to create rundown!`);
            // const profile = await this._vizMSE.getProfile('sofie') // TODO: Figure out if this is needed
            this._updateExpectedPlayoutItems().catch(e => this.emit('error', e));
            this.initialized = true;
        });
    }
    terminate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._vizMSE) {
                yield this._vizMSE.close();
                delete this._vizMSE;
            }
        });
    }
    setExpectedPlayoutItems(expectedPlayoutItems) {
        if (this.preloadAllElements) {
            this._expectedPlayoutItems = expectedPlayoutItems;
        }
        this._updateExpectedPlayoutItems().catch(e => this.emit('error', e));
    }
    activate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            yield this._rundown.activate();
        });
    }
    deactivate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            yield this._rundown.deactivate();
            this._clearCache();
        });
    }
    prepareElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            const elementHash = this.getElementHash(cmd);
            this.emit('debug', `VizMSE: prepare "${elementHash}"`);
            yield this._checkPrepareElement(cmd, true);
        });
    }
    cueElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            const elementRef = yield this._checkPrepareElement(cmd);
            this.emit('debug', `VizMSE: cue "${elementRef}"`);
            yield this._rundown.cue(elementRef);
        });
    }
    takeElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            const elementRef = yield this._checkPrepareElement(cmd);
            this.emit('debug', `VizMSE: take "${elementRef}"`);
            yield this._rundown.take(elementRef);
        });
    }
    takeoutElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            this.emit('debug', `VizMSE: out "${cmd.elementName}"`);
            yield this._rundown.out(cmd.elementName);
        });
    }
    continueElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            this.emit('debug', `VizMSE: continue "${cmd.templateInstance}"`);
            yield this._rundown.continue(cmd.templateInstance);
        });
    }
    continueElementReverse(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            this.emit('debug', `VizMSE: continue reverse "${cmd.templateInstance}"`);
            yield this._rundown.continueReverse(cmd.templateInstance);
        });
    }
    static getTemplateName(layer) {
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL)
            return layer.templateName;
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT)
            return '';
        throw new Error(`Unknown layer.contentType "${layer['contentType']}"`);
    }
    static getTemplateData(layer) {
        if (layer.contentType === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL)
            return layer.templateData;
        return [];
    }
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
        if (this._elementCache[hash]) {
            this.emit('error', `There is already an element with hash "${hash}" in cache`);
        }
        this._elementCache[hash] = element;
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
            return el.vcpid;
        throw Error('Unknown element type, neither internal nor external');
    }
    _isInternalElement(el) {
        return (el && el.name && !el.vcpid);
    }
    _isExternalElement(el) {
        return (el && !el.name && el.vcpid);
    }
    _checkPrepareElement(cmd, fromPrepare) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // check if element is prepared
            const elementHash = this.getElementHash(cmd);
            let element = this._getCachedElement(elementHash);
            if (!element) {
                if (!fromPrepare) {
                    this.emit('warning', `Late preparation of element "${elementHash}"`);
                }
                else {
                    this.emit('debug', `VizMSE: preparing new "${elementHash}"`);
                }
                element = yield this._prepareNewElement(cmd);
            }
            return this._getElementReference(element);
            // })
        });
    }
    _prepareNewElement(cmd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._rundown)
                throw new Error(`Viz Rundown not initialized!`);
            const elementHash = this.getElementHash(cmd);
            try {
                if (_.isNumber(cmd.templateName)) {
                    // Prepare a pilot element
                    const pilotEl = yield this._rundown.createElement(cmd.templateName);
                    this._cacheElement(elementHash, pilotEl);
                    return pilotEl;
                }
                else {
                    // Prepare an internal element
                    const internalEl = yield this._rundown.createElement(cmd.templateName, cmd.templateInstance, cmd.templateData || []);
                    this._cacheElement(elementHash, internalEl);
                    return internalEl;
                }
            }
            catch (e) {
                if (e.toString().match(/already exist/i)) { // "An internal graphics element with name 'xxxxxxxxxxxxxxx' already exists."
                    // If the object already exists, it's not an error, fetch and use the element instead
                    const element = yield this._rundown.getElement(cmd.templateInstance);
                    this._cacheElement(elementHash, element);
                    return element;
                }
                else {
                    throw e;
                }
            }
        });
    }
    _updateExpectedPlayoutItems() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this.preloadAllElements) {
                this.emit('debug', `VISMSE: _updateExpectedPlayoutItems (${this._expectedPlayoutItems.length})`);
                yield Promise.all(_.map(this._expectedPlayoutItems, (expectedPlayoutItem) => tslib_1.__awaiter(this, void 0, void 0, function* () {
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
                    }
                })));
            }
        });
    }
}
var VizMSECommandType;
(function (VizMSECommandType) {
    // ACTIVATE = 'activate', // something to be done before starting to use the viz engine
    // DEACTIVATE = 'deactivate', // something to be done when done with a viz engine
    VizMSECommandType["PREPARE_ELEMENT"] = "prepare";
    VizMSECommandType["CUE_ELEMENT"] = "cue";
    VizMSECommandType["TAKE_ELEMENT"] = "take";
    VizMSECommandType["TAKEOUT_ELEMENT"] = "out";
    VizMSECommandType["CONTINUE_ELEMENT"] = "continue";
    VizMSECommandType["CONTINUE_ELEMENT_REVERSE"] = "continuereverse";
})(VizMSECommandType = exports.VizMSECommandType || (exports.VizMSECommandType = {}));
function content2StateLayer(timelineObjId, content) {
    if (content.type === src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL) {
        return {
            timelineObjId: timelineObjId,
            contentType: src_1.TimelineContentTypeVizMSE.ELEMENT_INTERNAL,
            continueStep: content.continueStep,
            templateName: content.templateName,
            templateData: content.templateData
        };
    }
    else if (content.type === src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT) {
        return {
            timelineObjId: timelineObjId,
            contentType: src_1.TimelineContentTypeVizMSE.ELEMENT_PILOT,
            continueStep: content.continueStep,
            templateVcpId: content.templateVcpId
        };
    }
    return;
}
//# sourceMappingURL=vizMSE.js.map