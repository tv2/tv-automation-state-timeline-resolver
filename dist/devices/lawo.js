"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const emberplus_1 = require("emberplus");
const doOnTime_1 = require("../doOnTime");
const lib_1 = require("../lib");
const FADER_THRESHOLD = -90; // below this value the channel is considered muted
/**
 * This is a wrapper for a Lawo sound mixer
 *
 * It controls mutes and fades over Ember Plus.
 */
class LawoDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._savedNodes = [];
        this._lastSentValue = {};
        this._connected = false;
        this.transitions = {};
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver) {
                this._commandReceiver = deviceOptions.options.commandReceiver;
            }
            else {
                this._commandReceiver = this._defaultCommandReceiver;
            }
            if (deviceOptions.options.setValueFn) {
                this._setValueFn = deviceOptions.options.setValueFn;
            }
            else {
                this._setValueFn = this.setValueWrapper;
            }
            if (deviceOptions.options.sourcesPath) {
                this._sourcesPath = deviceOptions.options.sourcesPath;
            }
            if (deviceOptions.options.rampMotorFunctionPath) {
                this._rampMotorFunctionPath = deviceOptions.options.rampMotorFunctionPath;
            }
            if (deviceOptions.options.dbPropertyName) {
                this._dbPropertyName = deviceOptions.options.dbPropertyName;
            }
            if (deviceOptions.options.faderInterval) {
                this._faderIntervalTime = deviceOptions.options.faderInterval;
            }
        }
        let host = (deviceOptions.options && deviceOptions.options.host
            ? deviceOptions.options.host :
            null);
        let port = (deviceOptions.options && deviceOptions.options.port ?
            deviceOptions.options.port :
            null);
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Lawo');
        this._lawo = new emberplus_1.DeviceTree(host, port);
        this._lawo.on('error', (e) => {
            if ((e.message + '').match(/econnrefused/i) ||
                (e.message + '').match(/disconnected/i)) {
                this._setConnected(false);
            }
            else {
                this.emit('error', 'Lawo.Emberplus', e);
            }
        });
        this._lawo.on('connected', () => {
            this._setConnected(true);
        });
        this._lawo.on('disconnected', () => {
            this._setConnected(false);
        });
    }
    /**
     * Initiates the connection with Lawo
     */
    init(_initOptions) {
        return new Promise((resolve, reject) => {
            let fail = (e) => reject(e);
            try {
                this._lawo.once('error', fail);
                this._lawo.connect() // default timeout = 2
                    .then(() => {
                    this._lawo.removeListener('error', fail);
                    resolve(true);
                })
                    .catch((e) => {
                    this._lawo.removeListener('error', fail);
                    reject(e);
                });
            }
            catch (e) {
                this._lawo.removeListener('error', fail);
                reject(e);
            }
        });
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Handles a state such that the device will reflect that state at the given time.
     * @param newState
     */
    handleState(newState) {
        // Convert timeline states to device states
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: { time: 0, layers: {}, nextEvents: [] } }).state;
        let oldLawoState = this.convertStateToLawo(oldState);
        let newLawoState = this.convertStateToLawo(newState);
        // generate commands to transition to new state
        let commandsToAchieveState = this._diffStates(oldLawoState, newLawoState);
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
    /**
     * Safely disconnect from physical device such that this instance of the class
     * can be garbage collected.
     */
    terminate() {
        this._doOnTime.dispose();
        if (this.transitionInterval)
            clearInterval(this.transitionInterval);
        // @todo: Implement lawo dispose function upstream
        try {
            this._lawo.disconnect();
            this._lawo.removeAllListeners('error');
            this._lawo.removeAllListeners('connected');
            this._lawo.removeAllListeners('disconnected');
        }
        catch (e) {
            this.emit('error', 'Lawo.terminate', e);
        }
        return Promise.resolve(true);
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._connected;
    }
    /**
     * Converts a timeline state into a device state.
     * @param state
     */
    convertStateToLawo(state) {
        const lawoState = {
            nodes: {}
        };
        _.each(state.layers, (tlObject, layerName) => {
            const lawoObj = tlObject;
            const mapping = this.getMapping()[layerName];
            if (mapping && mapping.device === src_1.DeviceType.LAWO) {
                if (mapping.identifier && lawoObj.content.type === src_1.TimelineContentTypeLawo.SOURCE) {
                    let tlObjectSource = lawoObj;
                    const fader = tlObjectSource.content['Fader/Motor dB Value'];
                    const attrName = this._rampMotorFunctionPath || !this._dbPropertyName ? 'Fader/Motor dB Value' : this._dbPropertyName;
                    lawoState.nodes[this._sourceNodeAttributePath(mapping.identifier, attrName)] = {
                        type: tlObjectSource.content.type,
                        key: 'Fader/Motor dB Value',
                        identifier: mapping.identifier,
                        value: fader.value,
                        valueType: src_1.EmberTypes.REAL,
                        transitionDuration: fader.transitionDuration,
                        priority: mapping.priority || 0,
                        timelineObjId: tlObject.id
                    };
                }
                else if (mapping.identifier && lawoObj.content.type === src_1.TimelineContentTypeLawo.EMBER_PROPERTY) {
                    let tlObjectSource = lawoObj;
                    lawoState.nodes[mapping.identifier] = {
                        type: tlObjectSource.content.type,
                        key: '',
                        identifier: mapping.identifier,
                        value: tlObjectSource.content.value,
                        valueType: mapping.emberType || src_1.EmberTypes.REAL,
                        priority: mapping.priority || 0,
                        timelineObjId: tlObject.id
                    };
                }
                else if (lawoObj.content.type === src_1.TimelineContentTypeLawo.TRIGGER_VALUE) {
                    let tlObjectSource = lawoObj;
                    lawoState.triggerValue = tlObjectSource.content.triggerValue;
                }
            }
        });
        return lawoState;
    }
    get deviceType() {
        return src_1.DeviceType.LAWO;
    }
    get deviceName() {
        return 'Lawo ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    getStatus() {
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (!this._connected) {
            statusCode = device_1.StatusCode.BAD;
            messages.push('Not connected');
        }
        return {
            statusCode: statusCode,
            messages: messages
        };
    }
    _setConnected(connected) {
        if (this._connected !== connected) {
            this._connected = connected;
            this._connectionChanged();
        }
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd.cmd, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     * @param oldLawoState The assumed device state
     * @param newLawoState The desired device state
     */
    _diffStates(oldLawoState, newLawoState) {
        let commands = [];
        let isRetrigger = newLawoState.triggerValue && newLawoState.triggerValue !== oldLawoState.triggerValue;
        _.each(newLawoState.nodes, (newNode, path) => {
            let oldValue = oldLawoState.nodes[path] || null;
            let diff = lib_1.getDiff(_.omit(newNode, 'timelineObjId'), _.omit(oldValue, 'timelineObjId'));
            if (diff || (newNode.key === 'Fader/Motor dB Value' && isRetrigger)) {
                // It's a plain value:
                commands.push({
                    cmd: {
                        path: path,
                        type: newNode.type,
                        key: newNode.key,
                        identifier: newNode.identifier,
                        value: newNode.value,
                        valueType: newNode.valueType,
                        transitionDuration: newNode.transitionDuration,
                        priority: newNode.priority
                    },
                    context: diff || `triggerValue: "${newLawoState.triggerValue}"`,
                    timelineObjId: newNode.timelineObjId
                });
            }
        });
        commands.sort((a, b) => {
            if (a.cmd.priority < b.cmd.priority)
                return 1;
            if (a.cmd.priority > b.cmd.priority)
                return -1;
            if (a.cmd.path > b.cmd.path)
                return 1;
            if (a.cmd.path < b.cmd.path)
                return -1;
            return 0;
        });
        return commands;
    }
    /**
     * Gets an ember node based on its path
     * @param path
     */
    _getNodeByPath(path) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                if (this._savedNodes[path] !== undefined) {
                    resolve(this._savedNodes[path]);
                }
                else {
                    this._lawo.getNodeByPath(path)
                        .then((node) => {
                        this._savedNodes[path] = node;
                        resolve(node);
                    })
                        .catch((e) => {
                        this.emit('error', 'Lawo path error', e);
                        reject(e);
                    });
                }
            });
        });
    }
    /**
     * Returns an attribute path
     * @param identifier
     * @param attributePath
     */
    _sourceNodeAttributePath(identifier, attributePath) {
        return _.compact([
            this._sourcesPath,
            identifier,
            attributePath.replace('/', '.')
        ]).join('.');
    }
    _defaultCommandReceiver(_time, command, context, timelineObjId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const cwc = {
                context: context,
                command: command,
                timelineObjId: timelineObjId
            };
            this.emit('debug', cwc);
            // save start time of command
            const startSend = this.getCurrentTime();
            this._lastSentValue[command.path] = startSend;
            try {
                if (command.key === 'Fader/Motor dB Value' && command.transitionDuration && command.transitionDuration >= 0) { // fader level
                    // this.emit('debug', cwc)
                    if (!this._rampMotorFunctionPath) {
                        // add the fade to the fade object, such that we can fade the signal using the fader
                        if (!command.from) { // @todo: see if we can query the lawo first
                            const node = yield this._getNodeByPath(command.path);
                            if (node) {
                                if (node.contents.value === command.value)
                                    return;
                                command.from = node.contents.value;
                            }
                            else {
                                yield this._setValueFn(command, timelineObjId);
                                return;
                            }
                        }
                        this.transitions[command.path] = Object.assign(Object.assign({}, command), { started: this.getCurrentTime() });
                        if (!this.transitionInterval)
                            this.transitionInterval = setInterval(() => this.runAnimation(), this._faderIntervalTime || 75);
                    }
                    else if (command.transitionDuration >= 500) { // Motor Ramp in Lawo cannot handle too short durations
                        try {
                            const res = yield this._lawo.invokeFunction(new emberplus_1.Ember.QualifiedFunction(this._rampMotorFunctionPath), [
                                command.identifier,
                                new emberplus_1.Ember.ParameterContents(command.value, 'real'),
                                new emberplus_1.Ember.ParameterContents(command.transitionDuration / 1000, 'real')
                            ]);
                            this.emit('debug', `Ember function result (${timelineObjId}): ${JSON.stringify(res)}`);
                        }
                        catch (e) {
                            if (e.result && e.result.indexOf(6) > -1 && this._lastSentValue[command.path] <= startSend) { // result 6 and no new command fired for this path in meantime
                                // Lawo rejected the command, so ensure the value gets set
                                this.emit('info', `Ember function result (${timelineObjId}) was 6, running a direct setValue now`);
                                yield this._setValueFn(command, timelineObjId, src_1.EmberTypes.REAL);
                            }
                            else {
                                if (e.success === false) { // @todo: QualifiedFunction Fader/Motor cannot handle too short durations or small value changes
                                    this.emit('info', `Ember function result (${timelineObjId}): ${JSON.stringify(e)}`);
                                }
                                this.emit('error', `Lawo: Ember function command error (${timelineObjId})`, e);
                                throw e;
                            }
                        }
                    }
                    else { // withouth timed fader movement
                        yield this._setValueFn(command, timelineObjId, src_1.EmberTypes.REAL);
                    }
                }
                else {
                    yield this._setValueFn(command, timelineObjId);
                }
            }
            catch (error) {
                this.emit('commandError', error, cwc);
            }
        });
    }
    setValueWrapper(command, timelineObjId, valueType) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                const node = yield this._getNodeByPath(command.path);
                if (valueType === src_1.EmberTypes.REAL && command.value % 1 === 0) {
                    command.value += .01;
                }
                const res = yield this._lawo.setValueWithHacksaw(node, new emberplus_1.Ember.ParameterContents(command.value, valueType || command.valueType));
                this.emit('debug', `Ember result (${timelineObjId}): ${JSON.stringify(res)}`);
            }
            catch (e) {
                this.emit('error', `Lawo: Error in setValue (${timelineObjId})`, e);
                throw e;
            }
        });
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
    runAnimation() {
        for (const addr in this.transitions) {
            const transition = this.transitions[addr];
            // delete old transitions
            if (transition.started + transition.transitionDuration < this.getCurrentTime()) {
                delete this.transitions[addr];
                // assert correct finished value:
                this._setValueFn(transition, '').catch(() => null);
            }
        }
        for (const addr in this.transitions) {
            const transition = this.transitions[addr];
            const from = Math.max(FADER_THRESHOLD, transition.from);
            const to = Math.max(FADER_THRESHOLD, transition.value);
            const p = (this.getCurrentTime() - transition.started) / transition.transitionDuration;
            const v = from + p * (to - from); // should this have easing?
            this._setValueFn(Object.assign(Object.assign({}, transition), { value: v }), '').catch(() => null);
        }
        if (Object.keys(this.transitions).length === 0) {
            clearInterval(this.transitionInterval);
            this.transitionInterval = undefined;
        }
    }
}
exports.LawoDevice = LawoDevice;
//# sourceMappingURL=lawo.js.map