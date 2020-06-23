"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const lib_1 = require("../lib");
const emberplus_connection_1 = require("emberplus-connection");
/**
 * This is a wrapper for a Lawo sound mixer
 *
 * It controls mutes and fades over Ember Plus.
 */
class LawoDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
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
            if (deviceOptions.options.faderInterval) {
                this._faderIntervalTime = deviceOptions.options.faderInterval;
            }
            switch (deviceOptions.options.deviceMode) {
                case src_1.LawoDeviceMode.Ruby:
                    this._sourcesPath = 'Ruby.Sources';
                    this._dbPropertyName = 'Fader.Motor dB Value';
                    this._rampMotorFunctionPath = 'Ruby.Functions.RampMotorFader';
                    break;
                case src_1.LawoDeviceMode.RubyManualRamp:
                    this._sourcesPath = 'Ruby.Sources';
                    this._dbPropertyName = 'Fader.Motor dB Value';
                    this._faderThreshold = -60;
                    break;
                case src_1.LawoDeviceMode.MC2:
                    this._sourcesPath = 'Channels.Inputs';
                    this._dbPropertyName = 'Fader.Fader Level';
                    this._faderThreshold = -90;
                    break;
                case src_1.LawoDeviceMode.R3lay:
                    this._sourcesPath = 'R3LAYVRX4.Ex.Sources';
                    this._dbPropertyName = 'Active.Amplification';
                    this._faderThreshold = -60;
                    break;
                case src_1.LawoDeviceMode.Manual:
                default:
                    this._sourcesPath = deviceOptions.options.sourcesPath || '';
                    this._dbPropertyName = deviceOptions.options.dbPropertyName || '';
                    this._rampMotorFunctionPath = deviceOptions.options.dbPropertyName || '';
                    this._faderThreshold = deviceOptions.options.faderThreshold || -60;
            }
        }
        let host = (deviceOptions.options && deviceOptions.options.host
            ? deviceOptions.options.host :
            undefined);
        let port = (deviceOptions.options && deviceOptions.options.port ?
            deviceOptions.options.port :
            undefined);
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Lawo');
        this._lawo = new emberplus_connection_1.EmberClient(host || '', port);
        this._lawo.on('error', (e) => {
            if ((e.message + '').match(/econnrefused/i) ||
                (e.message + '').match(/disconnected/i)) {
                this._setConnected(false);
            }
            else {
                this.emit('error', 'Lawo.Emberplus', e);
            }
        });
        // this._lawo.on('warn', (w) => {
        // 	this.emit('debug', 'Warning: Lawo.Emberplus', w)
        // })
        let firstConnection = true;
        this._lawo.on('connected', async () => {
            this._setConnected(true);
            if (firstConnection) {
                try {
                    const req = await this._lawo.getDirectory(this._lawo.tree);
                    await req.response;
                }
                catch (e) {
                    this.emit('error', 'Error while expanding root', e);
                }
            }
            firstConnection = false;
        });
        this._lawo.on('disconnected', () => {
            this._setConnected(false);
        });
    }
    /**
     * Initiates the connection with Lawo
     */
    async init(_initOptions) {
        const err = await this._lawo.connect();
        if (err)
            this.emit('error', 'Lawo initialization', err);
        return true; // device is usable, lib will handle connection
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
            this._lawo.disconnect().then(() => {
                this._lawo.discard();
            }).catch(() => null); // fail silently
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
                        valueType: emberplus_connection_1.Model.ParameterType.Real,
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
                        valueType: mapping.emberType || emberplus_connection_1.Model.ParameterType.Real,
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
    async _getNodeByPath(path) {
        const node = await this._lawo.getElementByPath(path);
        return node;
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
    async _defaultCommandReceiver(_time, command, context, timelineObjId) {
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
                // TODO - Lawo result 6 code is based on time - difference ratio, certain ratios we may want to run a manual fade?
                if (!this._rampMotorFunctionPath || (command.transitionDuration < 500 && this._faderIntervalTime < 250)) {
                    // add the fade to the fade object, such that we can fade the signal using the fader
                    if (!command.from) { // @todo: see if we can query the lawo first
                        const node = await this._getNodeByPath(command.path);
                        if (node) {
                            if (node.contents.factor) {
                                command.from = node.contents.value / (node.contents.factor || 1);
                            }
                            else {
                                command.from = node.contents.value;
                            }
                            if (command.from === command.value)
                                return;
                        }
                        else {
                            throw new Error('Node ' + command.path + ' was not found');
                        }
                    }
                    this.transitions[command.path] = {
                        ...command,
                        tlObjId: timelineObjId,
                        started: this.getCurrentTime()
                    };
                    if (!this.transitionInterval)
                        this.transitionInterval = setInterval(() => this.runAnimation(), this._faderIntervalTime || 75);
                }
                else if (command.transitionDuration >= 500) { // Motor Ramp in Lawo cannot handle too short durations
                    const fn = await this._lawo.getElementByPath(this._rampMotorFunctionPath);
                    if (!fn)
                        throw new Error('Function path not found');
                    if (fn.contents.type !== emberplus_connection_1.Model.ElementType.Function)
                        throw new Error('Node at specified path for function is not a function');
                    const req = await this._lawo.invoke(fn, { type: emberplus_connection_1.Model.ParameterType.String, value: command.identifier }, { type: emberplus_connection_1.Model.ParameterType.Real, value: command.value }, { type: emberplus_connection_1.Model.ParameterType.Real, value: command.transitionDuration / 1000 });
                    this.emit('debug', `Ember function invoked (${timelineObjId})`);
                    const res = await req.response;
                    this.emit('debug', `Ember function result (${timelineObjId}): ${(JSON.stringify(res))}`, res);
                    if (res && res.success === false) {
                        if (res.result && res.result[0].value === 6 && this._lastSentValue[command.path] <= startSend) { // result 6 and no new command fired for this path in meantime
                            // Lawo rejected the command, so ensure the value gets set
                            this.emit('info', `Ember function result (${timelineObjId}) was 6, running a direct setValue now`);
                            await this._setValueFn(command, timelineObjId);
                        }
                        else {
                            this.emit('error', `Lawo: Ember function success false (${timelineObjId}, ${command.identifier})`, new Error('Lawo Result ' + res.result[0].value));
                        }
                    }
                }
                else { // withouth timed fader movement
                    await this._setValueFn(command, timelineObjId);
                }
            }
            else {
                await this._setValueFn(command, timelineObjId);
            }
        }
        catch (error) {
            this.emit('commandError', error, cwc);
        }
    }
    async setValueWrapper(command, timelineObjId, logResult = true) {
        try {
            const node = await this._getNodeByPath(command.path);
            const value = node.contents.factor ? command.value * node.contents.factor : command.value;
            const req = await this._lawo.setValue(node, value, logResult);
            if (logResult) {
                const res = await req.response;
                this.emit('debug', `Ember result (${timelineObjId}): ${(res && res.contents.value)}`, { command, res: res && res.contents });
            }
            else if (!req.sentOk) {
                this.emit('error', 'SetValue no logResult', new Error(`Ember req (${timelineObjId}) for "${command.path}" to "${value}" failed`));
            }
        }
        catch (e) {
            this.emit('error', `Lawo: Error in setValue (${timelineObjId})`, e);
            throw e;
        }
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
                this._setValueFn(transition, transition.tlObjId).catch(() => null);
            }
        }
        for (const addr in this.transitions) {
            const transition = this.transitions[addr];
            const from = this._faderThreshold ? Math.max(this._faderThreshold, transition.from) : transition.from;
            const to = this._faderThreshold ? Math.max(this._faderThreshold, transition.value) : transition.value;
            const p = (this.getCurrentTime() - transition.started) / transition.transitionDuration;
            const v = from + p * (to - from); // should this have easing?
            this._setValueFn({ ...transition, value: v }, transition.tlObjId, false).catch(() => null);
        }
        if (Object.keys(this.transitions).length === 0) {
            clearInterval(this.transitionInterval);
            this.transitionInterval = undefined;
        }
    }
}
exports.LawoDevice = LawoDevice;
//# sourceMappingURL=lawo.js.map