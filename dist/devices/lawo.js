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
        this._initialized = false;
        this._sourceNameToNodeName = new Map();
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
                    this._sourceNamePath = 'General.Inherited Label';
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
                    await this._mapSourcesToNodeNames();
                    this._initialized = true;
                    this.emit('info', 'finished device initalization');
                    this.emit('resetResolver');
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
    handleState(newState, newMappings) {
        super.onHandleState(newState, newMappings);
        if (!this._initialized)
            return;
        // Convert timeline states to device states
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldLawoState = (this.getStateBefore(previousStateTime) || { state: { nodes: {} } }).state;
        let newLawoState = this.convertStateToLawo(newState, newMappings);
        // generate commands to transition to new state
        let commandsToAchieveState = this._diffStates(oldLawoState, newLawoState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newLawoState, newState.time);
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
    convertStateToLawo(state, mappings) {
        const lawoState = {
            nodes: {}
        };
        const attrName = this._rampMotorFunctionPath || !this._dbPropertyName ? 'Fader.Motor dB Value' : this._dbPropertyName;
        const newFaders = [];
        const pushFader = (identifier, fader, mapping, tlObjId, priority = 0) => {
            newFaders.push({
                attrPath: this._sourceNodeAttributePath(identifier, attrName),
                priority,
                node: {
                    type: src_1.TimelineContentTypeLawo.SOURCE,
                    key: 'fader',
                    identifier: identifier,
                    value: fader.faderValue,
                    valueType: emberplus_connection_1.Model.ParameterType.Real,
                    transitionDuration: fader.transitionDuration,
                    priority: mapping.priority || 0,
                    timelineObjId: tlObjId
                }
            });
        };
        _.each(state.layers, (tlObject, layerName) => {
            // for every layer
            const lawoObj = tlObject;
            const mapping = mappings[layerName];
            if (mapping && mapping.device === src_1.DeviceType.LAWO && mapping.deviceId === this.deviceId) {
                // Mapping is for Lawo
                if (mapping.mappingType === src_1.MappingLawoType.SOURCES && lawoObj.content.type === src_1.TimelineContentTypeLawo.SOURCES) {
                    // mapping implies a composite of sources
                    for (const fader of lawoObj.content.sources) {
                        // for every mapping in the composite
                        const sourceMapping = mappings[fader.mappingName];
                        if (!sourceMapping || !sourceMapping.identifier || sourceMapping.mappingType !== src_1.MappingLawoType.SOURCE || mapping.deviceId !== this.deviceId)
                            continue;
                        // mapped mapping is a source mapping
                        pushFader(sourceMapping.identifier, fader, sourceMapping, tlObject.id, lawoObj.content.overridePriority);
                    }
                }
                else if (mapping.identifier && lawoObj.content.type === src_1.TimelineContentTypeLawo.SOURCE) {
                    // mapping is for a source
                    let tlObjectSource = lawoObj;
                    let fader = tlObjectSource.content;
                    const priority = tlObjectSource.content.overridePriority;
                    // TODO - next breaking change, remove deprecated tlObject typings "Fader/Motor dB Value"
                    if ('Fader/Motor dB Value' in tlObjectSource.content) {
                        fader = {
                            faderValue: tlObjectSource.content['Fader/Motor dB Value'].value,
                            transitionDuration: tlObjectSource.content['Fader/Motor dB Value'].transitionDuration
                        };
                    }
                    pushFader(mapping.identifier, fader, mapping, tlObject.id, priority);
                }
                else if (mapping.identifier && lawoObj.content.type === src_1.TimelineContentTypeLawo.EMBER_PROPERTY) {
                    // mapping is a property to set
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
                    // mapping is a trigger value (will resend all commands to the Lawo to enforce state when changed)
                    let tlObjectSource = lawoObj;
                    lawoState.triggerValue = tlObjectSource.content.triggerValue;
                }
            }
        });
        newFaders.sort((a, b) => a.priority - b.priority);
        // layers are sorted by priority
        for (const newFader of newFaders) {
            lawoState.nodes[newFader.attrPath] = newFader.node;
        }
        // highest priority source has been written to lawoState
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
            messages: messages,
            active: this.isActive
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
            if (diff || (newNode.key === 'fader' && isRetrigger)) {
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
    _identifierToNodeName(identifier) {
        if (this._sourceNamePath) {
            const s = this._sourceNameToNodeName.get(identifier);
            if (!s)
                this.emit('warning', `Source identifier "${identifier}" could not be found`);
            return s || identifier;
        }
        else {
            return identifier;
        }
    }
    /**
     * Returns an attribute path
     * @param identifier
     * @param attributePath
     */
    _sourceNodeAttributePath(identifier, attributePath) {
        return _.compact([
            this._sourcesPath,
            this._identifierToNodeName(identifier),
            attributePath
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
            if (command.key === 'fader' && command.transitionDuration && command.transitionDuration >= 0) { // fader level
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
                    this.emit('debug', `Ember function invoked (${timelineObjId}, ${command.identifier}, ${command.value})`);
                    const res = await req.response;
                    if (res && res.success === false) {
                        const reasons = {
                            1: 'Incorrect number of parameters',
                            2: 'Incorrect datatype',
                            3: 'Input value out of range',
                            4: 'Source / sum not found',
                            5: 'Source / sum not assigned to fader',
                            6: 'Combination of values not allowed',
                            7: 'Touch active'
                        };
                        const result = res.result[0].value;
                        if (res.result
                            && (result === 6 || result === 5)
                            && this._lastSentValue[command.path] <= startSend) { // result 5 / 6 and no new command fired for this path in meantime
                            // Lawo rejected the command, so ensure the value gets set
                            this.emit('info', `Ember function result (${timelineObjId}, ${command.identifier}) was ${result}, running a direct setValue now`);
                            await this._setValueFn(command, timelineObjId, false); // result 6 is quite likely to cause a timeout
                        }
                        else {
                            this.emit('error', `Lawo: Ember function success false (${timelineObjId}, ${command.identifier}), result ${res.result[0].value}`, new Error('Lawo Result ' + res.result[0].value));
                        }
                        this.emit('debug', `Lawo: Ember fn error ${command.identifier}): result ${result}: ${reasons[result]}`, { ...res, source: command.identifier });
                    }
                    else {
                        this.emit('debug', `Ember function result (${timelineObjId}, ${command.identifier}): ${(JSON.stringify(res))}`, res);
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
            if (node.contents.value === value)
                return; // no need to do another setValue
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
    async _mapSourcesToNodeNames() {
        if (!this._sourceNamePath)
            return;
        this.emit('info', 'Start mapping source identifiers to channel node identifiers');
        // get the node that contains the sources
        const sourceNode = await this._lawo.getElementByPath(this._sourcesPath);
        if (!sourceNode) {
            this.emit('warning', 'Could not map source names to node names because source node could not be found!');
            return;
        }
        // get the sources
        const req = await (this._lawo.getDirectory(sourceNode));
        const sources = await req.response;
        if (!sources)
            return;
        for (const child of Object.values(sources.children || {})) {
            if (child.contents.type === emberplus_connection_1.Model.ElementType.Node) {
                try { // get the identifier
                    let previousNode = undefined;
                    const node = await this._lawo.getElementByPath(this._sourcesPath + '.'
                        + child.number + '.' + this._sourceNamePath, (node) => {
                        if (!node)
                            return;
                        const sourceId = child.contents.identifier || child.number + '';
                        // remove old mapping if it hasn't changed
                        if (previousNode && this._sourceNameToNodeName.get(previousNode) === sourceId) {
                            this.emit('info', `removing mapping ${previousNode}`);
                            this._sourceNameToNodeName.delete(previousNode);
                        }
                        // set new mapping
                        this._sourceNameToNodeName.set(node.contents.value, sourceId);
                        previousNode = node.contents.value;
                        this.emit('info', `mapping ${node.contents.value} to channel ${sourceId}`);
                    });
                    if (!node)
                        continue;
                    this._sourceNameToNodeName.set(node.contents.value, child.contents.identifier || child.number + '');
                    previousNode = node.contents.value;
                }
                catch (e) {
                    this.emit('error', 'lawo: map sources to node names', e);
                }
            }
        }
        this.emit('info', 'Mapped source identifiers to channel node identifiers');
    }
}
exports.LawoDevice = LawoDevice;
//# sourceMappingURL=lawo.js.map