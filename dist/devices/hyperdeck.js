"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const underScoreDeepExtend = require("underscore-deep-extend");
const device_1 = require("./device");
const src_1 = require("../types/src");
const hyperdeck_connection_1 = require("hyperdeck-connection");
const doOnTime_1 = require("../doOnTime");
_.mixin({ deepExtend: underScoreDeepExtend(_) });
function deepExtend(destination, ...sources) {
    // @ts-ignore (mixin)
    return _.deepExtend(destination, ...sources);
}
class HyperdeckDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options, conductor) {
        super(deviceId, deviceOptions, options);
        this._initialized = false;
        this._connected = false;
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
     * Initiates the connection with the Hyperdeck through the hyperdeck-connection lib.
     */
    init(options) {
        return new Promise((resolve /*, reject*/) => {
            let firstConnect = true;
            this._hyperdeck = new hyperdeck_connection_1.Hyperdeck();
            this._hyperdeck.connect(options.host, options.port);
            this._hyperdeck.on('connected', () => {
                return this._queryCurrentState().then(state => {
                    this.setState(state, this.getCurrentTime());
                    if (firstConnect) {
                        firstConnect = false;
                        this._initialized = true;
                        resolve(true);
                    }
                    this._connected = true;
                    this._connectionChanged();
                    this._conductor.resetResolver();
                });
            });
            this._hyperdeck.on('disconnected', () => {
                this._connected = false;
                this._connectionChanged();
            });
            this._hyperdeck.on('error', (e) => this.emit('error', 'Hyperdeck', e));
        });
    }
    terminate() {
        this._doOnTime.dispose();
        return new Promise((resolve) => {
            // TODO: implement dispose function in hyperdeck-connection
            // this._hyperdeck.dispose()
            // .then(() => {
            // resolve(true)
            // })
            resolve(true);
        });
    }
    makeReady(okToDestroyStuff) {
        if (okToDestroyStuff) {
            this._doOnTime.clearQueueNowAndAfter(this.getCurrentTime());
            // TODO - could this being slow/offline be a problem?
            return this._queryCurrentState().then(state => {
                this.setState(state, this.getCurrentTime());
            });
        }
        return Promise.resolve();
    }
    handleState(newState) {
        if (!this._initialized) {
            // before it's initialized don't do anything
            this.emit('info', 'Hyperdeck not initialized yet');
            return;
        }
        let oldState = (this.getStateBefore(newState.time) || { state: this._getDefaultState() }).state;
        let oldHyperdeckState = oldState;
        let newHyperdeckState = this.convertStateToHyperdeck(newState);
        let commandsToAchieveState = this._diffStates(oldHyperdeckState, newHyperdeckState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newState.time);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newHyperdeckState, newState.time);
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
    convertStateToHyperdeck(state) {
        if (!this._initialized)
            throw Error('convertStateToHyperdeck cannot be used before inititialized');
        // Convert the timeline state into something we can use easier:
        const deviceState = this._getDefaultState();
        const sortedLayers = _.map(state.LLayers, (tlObject, layerName) => ({ layerName, tlObject }))
            .sort((a, b) => a.layerName.localeCompare(b.layerName));
        _.each(sortedLayers, ({ tlObject, layerName }) => {
            const content = tlObject.resolved || tlObject.content;
            const mapping = this.mapping[layerName]; // tslint:disable-line
            if (mapping) {
                switch (mapping.mappingType) {
                    case src_1.MappingHyperdeckType.TRANSPORT:
                        if (content.type === src_1.TimelineContentTypeHyperdeck.TRANSPORT) {
                            if (deviceState.transport) {
                                deepExtend(deviceState.transport, content.attributes);
                            }
                            else {
                                deviceState.transport = content.attributes;
                            }
                        }
                        break;
                }
            }
        });
        return deviceState;
    }
    get deviceType() {
        return src_1.DeviceType.HYPERDECK;
    }
    get deviceName() {
        return 'Hyperdeck ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    getStatus() {
        // TODO: add status check here, to set warning if we've set it to record, but it's not
        return {
            statusCode: this._connected ? device_1.StatusCode.GOOD : device_1.StatusCode.BAD
        };
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                return this._commandReceiver(time, cmd.command, cmd.context);
            }, cmd);
        });
    }
    _diffStates(oldHyperdeckState, newHyperdeckState) {
        const commandsToAchieveState = [];
        if (oldHyperdeckState.notify && newHyperdeckState.notify) {
            const notifyCmd = new hyperdeck_connection_1.Commands.NotifySetCommand();
            let hasChange = false;
            const keys = _.unique(_.keys(oldHyperdeckState.notify).concat(_.keys(newHyperdeckState.notify)));
            for (let k of keys) {
                if (oldHyperdeckState.notify[k] !== newHyperdeckState.notify[k]) {
                    hasChange = true;
                    notifyCmd[k] = newHyperdeckState.notify[k];
                }
            }
            if (hasChange) {
                commandsToAchieveState.push({
                    command: notifyCmd,
                    context: {
                        oldState: oldHyperdeckState.notify,
                        newState: newHyperdeckState.notify
                    }
                });
            }
        }
        else {
            this.emit('error', 'diffStates missing notify object', oldHyperdeckState.notify, newHyperdeckState.notify);
        }
        if (oldHyperdeckState.transport && newHyperdeckState.transport) {
            switch (newHyperdeckState.transport.status) {
                case hyperdeck_connection_1.TransportStatus.RECORD:
                    // TODO - sometimes we can loose track of the filename (eg on reconnect).
                    // should we split the record when recovering from that? (it might loose some frames)
                    const filenameChanged = oldHyperdeckState.transport.recordFilename !== undefined &&
                        oldHyperdeckState.transport.recordFilename !== newHyperdeckState.transport.recordFilename;
                    if (oldHyperdeckState.transport.status !== newHyperdeckState.transport.status) { // Start recording
                        commandsToAchieveState.push({
                            command: new hyperdeck_connection_1.Commands.RecordCommand(newHyperdeckState.transport.recordFilename),
                            context: {
                                oldState: oldHyperdeckState.transport,
                                newState: newHyperdeckState.transport
                            }
                        });
                    }
                    else if (filenameChanged) { // Split recording
                        commandsToAchieveState.push({
                            command: new hyperdeck_connection_1.Commands.StopCommand(),
                            context: {
                                oldState: oldHyperdeckState.transport,
                                newState: newHyperdeckState.transport
                            }
                        });
                        commandsToAchieveState.push({
                            command: new hyperdeck_connection_1.Commands.RecordCommand(newHyperdeckState.transport.recordFilename),
                            context: {
                                oldState: oldHyperdeckState.transport,
                                newState: newHyperdeckState.transport
                            }
                        });
                    } // else continue recording
                    break;
                default:
                    // TODO - warn
                    // for now we are assuming they want a stop. that could be conditional later on
                    if (oldHyperdeckState.transport.status === hyperdeck_connection_1.TransportStatus.RECORD) {
                        commandsToAchieveState.push({
                            command: new hyperdeck_connection_1.Commands.StopCommand(),
                            context: {
                                oldState: oldHyperdeckState.transport,
                                newState: newHyperdeckState.transport
                            }
                        });
                    }
                    break;
            }
        }
        else {
            this.emit('error', 'diffStates missing transport object', oldHyperdeckState.transport, newHyperdeckState.transport);
        }
        return commandsToAchieveState;
    }
    _queryCurrentState() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._connected)
                return this._getDefaultState();
            const notify = this._hyperdeck.sendCommand(new hyperdeck_connection_1.Commands.NotifyGetCommand());
            const transport = this._hyperdeck.sendCommand(new hyperdeck_connection_1.Commands.TransportInfoCommand());
            const notifyRes = yield notify;
            const transportRes = yield transport;
            const res = {
                notify: notifyRes,
                transport: transportRes
            };
            return res;
        });
    }
    _getDefaultState() {
        const res = {
            notify: {
                remote: false,
                transport: false,
                slot: false,
                configuration: false,
                droppedFrames: false
            },
            transport: {
                status: hyperdeck_connection_1.TransportStatus.PREVIEW
            }
        };
        return res;
    }
    _defaultCommandReceiver(_time, command, context) {
        let cwc = {
            context: context,
            command: command
        };
        this.emit('debug', cwc);
        return this._hyperdeck.sendCommand(command);
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.HyperdeckDevice = HyperdeckDevice;
//# sourceMappingURL=hyperdeck.js.map