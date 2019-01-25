"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const emberplus_1 = require("emberplus");
const doOnTime_1 = require("../doOnTime");
const lib_1 = require("../lib");
class LawoDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._savedNodes = [];
        this._connected = false;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver) {
                this._commandReceiver = deviceOptions.options.commandReceiver;
            }
            else {
                this._commandReceiver = this._defaultCommandReceiver;
            }
            if (deviceOptions.options.sourcesPath) {
                this._sourcesPath = deviceOptions.options.sourcesPath;
            }
            if (deviceOptions.options.rampMotorFunctionPath) {
                this._rampMotorFunctionPath = deviceOptions.options.rampMotorFunctionPath;
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
        });
        this._doOnTime.on('error', e => this.emit('error', 'DoOnTime', e));
        this._lawo = new emberplus_1.DeviceTree(host, port);
        this._lawo.on('error', (e) => {
            if ((e.message + '').match(/econnrefused/i) ||
                (e.message + '').match(/disconnected/i)) {
                this._setConnected(false);
            }
            else {
                this.emit('error', 'Emberplus', e);
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
    init() {
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
    handleState(newState) {
        // Handle this new state, at the point in time specified
        let oldState = (this.getStateBefore(newState.time) || { state: { time: 0, LLayers: {}, GLayers: {} } }).state;
        let oldLawoState = this.convertStateToLawo(oldState);
        let newLawoState = this.convertStateToLawo(newState);
        let commandsToAchieveState = this._diffStates(oldLawoState, newLawoState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newState.time);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newState, newState.time);
    }
    clearFuture(clearAfterTime) {
        // Clear any scheduled commands after this time
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    terminate() {
        this._doOnTime.dispose();
        // @todo: Implement lawo dispose function upstream
        try {
            this._lawo.disconnect();
            this._lawo.removeAllListeners('error');
            this._lawo.removeAllListeners('connected');
            this._lawo.removeAllListeners('disconnected');
        }
        catch (e) {
            this.emit('error', 'terminate', e);
        }
        return Promise.resolve(true);
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._connected;
    }
    convertStateToLawo(state) {
        // convert the timeline state into something we can use
        const lawoState = {};
        _.each(state.LLayers, (tlObject, layerName) => {
            const mapping = this.mapping[layerName]; // tslint:disable-line
            if (mapping && mapping.identifier && mapping.device === src_1.DeviceType.LAWO) {
                if (tlObject.content.type === src_1.TimelineContentTypeLawo.SOURCE) {
                    let tlObjectSource = tlObject;
                    _.each(tlObjectSource.content.attributes, (value, key) => {
                        lawoState[this._sourceNodeAttributePath(mapping.identifier, key)] = {
                            type: tlObjectSource.content.type,
                            key: key,
                            identifier: mapping.identifier,
                            value: value.value,
                            transitionDuration: value.transitionDuration,
                            triggerValue: value.triggerValue
                        };
                    });
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
    set mapping(mappings) {
        super.mapping = mappings;
    }
    get mapping() {
        return super.mapping;
    }
    getStatus() {
        return {
            statusCode: this._connected ? device_1.StatusCode.GOOD : device_1.StatusCode.BAD
        };
    }
    _setConnected(connected) {
        if (this._connected !== connected) {
            this._connected = connected;
            this._connectionChanged();
        }
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                return this._commandReceiver(time, cmd.cmd, cmd.context);
            }, cmd);
        });
    }
    _diffStates(oldLawoState, newLawoState) {
        let commands = [];
        // let addCommand = (path, newNode: LawoStateNode) => {
        // }
        _.each(newLawoState, (newNode, path) => {
            let oldValue = oldLawoState[path] || null;
            let diff = lib_1.getDiff(newNode, oldValue);
            // if (!_.isEqual(newNode, oldValue)) {
            if (diff) {
                // addCommand(path, newNode)
                // It's a plain value:
                commands.push({
                    cmd: {
                        path: path,
                        type: newNode.type,
                        key: newNode.key,
                        identifier: newNode.identifier,
                        value: newNode.value,
                        transitionDuration: newNode.transitionDuration
                    },
                    context: diff
                });
            }
        });
        return commands;
    }
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
                        this.emit('error', `Path error: ${e.toString()}`);
                        reject(e);
                    });
                }
            });
        });
    }
    _sourceNodeAttributePath(identifier, attributePath) {
        return _.compact([
            this._sourcesPath,
            identifier,
            attributePath.replace('/', '.')
        ]).join('.');
    }
    // @ts-ignore no-unused-vars
    _defaultCommandReceiver(time, command, context) {
        if (command.key === 'Fader/Motor dB Value') { // fader level
            let cwc = {
                context: context,
                command: command
            };
            this.emit('debug', cwc);
            if (command.transitionDuration && command.transitionDuration > 0) { // with timed fader movement
                return this._lawo.invokeFunction(new emberplus_1.Ember.QualifiedFunction(this._rampMotorFunctionPath), [command.identifier, new emberplus_1.Ember.ParameterContents(command.value, 'real'), new emberplus_1.Ember.ParameterContents(command.transitionDuration / 1000, 'real')])
                    .then((res) => {
                    this.emit('debug', `Ember function result: ${JSON.stringify(res)}`);
                })
                    .catch((e) => {
                    if (e.success === false) { // @todo: QualifiedFunction Fader/Motor cannot handle too short durations or small value changes
                        this.emit('command', command);
                        this.emit('info', `Ember function result: ${JSON.stringify(e)}`);
                    }
                    else {
                        this.emit('error', `Ember function command error: ${e.toString()}`);
                    }
                });
            }
            else { // withouth timed fader movement
                return this._getNodeByPath(command.path)
                    .then((node) => {
                    this._lawo.setValue(node, new emberplus_1.Ember.ParameterContents(command.value, 'real'))
                        .then((res) => {
                        this.emit('debug', `Ember result: ${JSON.stringify(res)}`);
                    })
                        .catch((e) => console.log(e));
                })
                    .catch((e) => {
                    this.emit('error', `Ember command error: ${e.toString()}`);
                });
            }
        }
        else {
            // this.emit('error', `Ember command error: ${e.toString()}`)
            return Promise.reject(`Lawo: Unsupported command.key: "${command.key}"`);
        }
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.LawoDevice = LawoDevice;
//# sourceMappingURL=lawo.js.map