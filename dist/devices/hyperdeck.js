"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const hyperdeck_connection_1 = require("hyperdeck-connection");
const doOnTime_1 = require("../doOnTime");
/**
 * This is a wrapper for the Hyperdeck Device. Commands to any and all hyperdeck devices will be sent through here.
 */
class HyperdeckDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._initialized = false;
        this._connected = false;
        this._slots = 0;
        this._slotStatus = {};
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Hyperdeck');
    }
    /**
     * Initiates the connection with the Hyperdeck through the hyperdeck-connection lib.
     */
    init(options) {
        return new Promise((resolve /*, reject*/) => {
            let firstConnect = true;
            this._hyperdeck = new hyperdeck_connection_1.Hyperdeck({ pingPeriod: 1000 });
            this._hyperdeck.connect(options.host, options.port);
            this._hyperdeck.on('connected', () => tslib_1.__awaiter(this, void 0, void 0, function* () {
                yield this._hyperdeck.sendCommand(new hyperdeck_connection_1.Commands.RemoteCommand(true));
                this._queryCurrentState()
                    .then((state) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                    this.setState(state, this.getCurrentTime());
                    if (firstConnect) {
                        firstConnect = false;
                        this._initialized = true;
                        this._slots = yield this._querySlotNumber();
                        resolve(true);
                    }
                    this._connected = true;
                    this._connectionChanged();
                    this.emit('resetResolver');
                }))
                    .catch(e => this.emit('error', 'Hyperdeck.on("connected")', e));
                if (options.minRecordingTime) {
                    this._minRecordingTime = options.minRecordingTime;
                    if (this._recTimePollTimer)
                        clearTimeout(this._recTimePollTimer);
                }
                this._queryRecordingTime().catch(e => this.emit('error', 'HyperDeck.queryRecordingTime', e));
                const notifyCmd = new hyperdeck_connection_1.Commands.NotifySetCommand();
                notifyCmd.slot = true;
                notifyCmd.transport = true;
                this._hyperdeck.sendCommand(notifyCmd).catch(e => this.emit('error', 'HyperDeck.on("connected")', e));
                const tsCmd = new hyperdeck_connection_1.Commands.TransportInfoCommand();
                this._hyperdeck.sendCommand(tsCmd)
                    .then(r => this._transportStatus = r.status)
                    .catch(e => this.emit('error', 'HyperDeck.on("connected")', e));
            }));
            this._hyperdeck.on('disconnected', () => {
                this._connected = false;
                this._connectionChanged();
            });
            this._hyperdeck.on('error', (e) => this.emit('error', 'Hyperdeck', e));
            this._hyperdeck.on('notify.slot', (res) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                yield this._queryRecordingTime().catch(e => this.emit('error', 'HyperDeck.queryRecordingTime', e));
                if (res.status)
                    this._connectionChanged();
            }));
            this._hyperdeck.on('notify.transport', (res) => tslib_1.__awaiter(this, void 0, void 0, function* () {
                if (res.status) {
                    this._transportStatus = res.status;
                    const state = this.getState();
                    if (state && state.state.transport.status !== res.status) {
                        this._connectionChanged();
                    }
                }
            }));
        });
    }
    /**
     * Makes this device ready for garbage collection.
     */
    terminate() {
        this._doOnTime.dispose();
        if (this._recTimePollTimer)
            clearTimeout(this._recTimePollTimer);
        return new Promise((resolve) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield this._hyperdeck.disconnect();
            this._hyperdeck.removeAllListeners();
            resolve(true);
        }));
    }
    /**
     * Prepares device for playout
     */
    makeReady(okToDestroyStuff) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (okToDestroyStuff) {
                let time = this.getCurrentTime();
                this._doOnTime.clearQueueNowAndAfter(time);
                // TODO - could this being slow/offline be a problem?
                let state = yield this._queryCurrentState();
                this.setState(state, time);
            }
        });
    }
    /**
     * Sends commands to the HyperDeck to format disks. Afterwards,
     * calls this._queryRecordingTime
     */
    formatDisks() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const wait = t => new Promise(resolve => setTimeout(() => resolve(), t));
            for (let i = 1; i <= this._slots; i++) {
                // select slot
                const slotSel = new hyperdeck_connection_1.Commands.SlotSelectCommand();
                slotSel.slotId = i + '';
                try {
                    yield this._hyperdeck.sendCommand(slotSel);
                }
                catch (e) {
                    continue;
                }
                // get code:
                const prepare = new hyperdeck_connection_1.Commands.FormatCommand();
                prepare.filesystem = hyperdeck_connection_1.FilesystemFormat.exFAT;
                const res = yield this._hyperdeck.sendCommand(prepare);
                const format = new hyperdeck_connection_1.Commands.FormatConfirmCommand();
                format.code = res.code;
                yield this._hyperdeck.sendCommand(format);
                // now actualy await until finished:
                let slotInfo = new hyperdeck_connection_1.Commands.SlotInfoCommand(i);
                while ((yield this._hyperdeck.sendCommand(slotInfo)).status === hyperdeck_connection_1.SlotStatus.EMPTY) {
                    yield wait(500);
                }
            }
            yield this._queryRecordingTime();
        });
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Saves and handles state at specified point in time such that the device will be in
     * that state at that time.
     * @param newState
     */
    handleState(newState) {
        if (!this._initialized) {
            // before it's initialized don't do anything
            this.emit('info', 'Hyperdeck not initialized yet');
            return;
        }
        // Create device states
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: this._getDefaultState() }).state;
        let oldHyperdeckState = oldState;
        let newHyperdeckState = this.convertStateToHyperdeck(newState);
        // Generate commands to transition to new state
        let commandsToAchieveState = this._diffStates(oldHyperdeckState, newHyperdeckState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newHyperdeckState, newState.time);
    }
    /**
     * Clears any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime) {
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._connected;
    }
    /**
     * Converts a timeline state to a device state.
     * @param state
     */
    convertStateToHyperdeck(state) {
        if (!this._initialized)
            throw Error('convertStateToHyperdeck cannot be used before inititialized');
        // Convert the timeline state into something we can use easier:
        const deviceState = this._getDefaultState();
        const sortedLayers = _.map(state.layers, (tlObject, layerName) => ({ layerName, tlObject }))
            .sort((a, b) => a.layerName.localeCompare(b.layerName));
        _.each(sortedLayers, ({ tlObject, layerName }) => {
            const hyperdeckObj = tlObject;
            const mapping = this.getMapping()[layerName];
            if (mapping) {
                switch (mapping.mappingType) {
                    case src_1.MappingHyperdeckType.TRANSPORT:
                        if (hyperdeckObj.content.type === src_1.TimelineContentTypeHyperdeck.TRANSPORT) {
                            const hyperdeckObjTransport = tlObject;
                            if (!deviceState.transport) {
                                deviceState.transport = {
                                    status: hyperdeckObjTransport.content.status,
                                    recordFilename: hyperdeckObjTransport.content.recordFilename
                                };
                            }
                            deviceState.transport.status = hyperdeckObjTransport.content.status;
                            deviceState.transport.recordFilename = hyperdeckObjTransport.content.recordFilename;
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
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (!this._connected) {
            statusCode = device_1.StatusCode.BAD;
            messages.push('Not connected');
        }
        if (this._connected) {
            // check recording time left
            if (this._minRecordingTime &&
                this._recordingTime < this._minRecordingTime) {
                if (this._recordingTime === 0) {
                    statusCode = device_1.StatusCode.BAD;
                }
                else {
                    statusCode = device_1.StatusCode.WARNING_MAJOR;
                }
                messages.push(`Recording time left is less than ${Math.floor(this._recordingTime / 60)} minutes and ${this._recordingTime % 60} seconds`);
            }
            // check for available slots
            let noAvailableSlots = true;
            for (let slot = 1; slot <= this._slots; slot++) {
                if (this._slotStatus[slot] && this._slotStatus[slot].status !== hyperdeck_connection_1.SlotStatus.MOUNTED) {
                    messages.push(`Slot ${slot} is not mounted`);
                    if (statusCode < device_1.StatusCode.WARNING_MINOR)
                        statusCode = device_1.StatusCode.WARNING_MINOR;
                }
                else {
                    noAvailableSlots = false;
                }
            }
            if (noAvailableSlots) {
                statusCode = device_1.StatusCode.BAD;
            }
            // check if transport status is correct
            const state = this.getState();
            if (state) {
                const supposedState = state.state.transport.status;
                if (supposedState === hyperdeck_connection_1.TransportStatus.RECORD && this._transportStatus !== supposedState) {
                    if (statusCode < device_1.StatusCode.WARNING_MAJOR)
                        statusCode = device_1.StatusCode.WARNING_MAJOR;
                    messages.push('Hyperdeck not recording');
                }
            }
        }
        if (!this._initialized) {
            statusCode = device_1.StatusCode.BAD;
            messages.push(`Hyperdeck device connection not initialized (restart required)`);
        }
        return {
            statusCode,
            messages
        };
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd.command, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    /**
     * Generates commands to transition from old to new state.
     * @param oldHyperdeckState The assumed current state
     * @param newHyperdeckState The desired state of the device
     */
    _diffStates(oldHyperdeckState, newHyperdeckState) {
        const commandsToAchieveState = [];
        if (oldHyperdeckState.notify && newHyperdeckState.notify) {
            const notifyCmd = new hyperdeck_connection_1.Commands.NotifySetCommand();
            let hasChange = null;
            const keys = _.unique(_.keys(oldHyperdeckState.notify).concat(_.keys(newHyperdeckState.notify)));
            for (let k of keys) {
                if (oldHyperdeckState.notify[k] !== newHyperdeckState.notify[k]) {
                    notifyCmd[k] = newHyperdeckState.notify[k];
                    hasChange = {
                        timelineObjId: newHyperdeckState.timelineObjId
                    };
                }
            }
            if (hasChange) {
                commandsToAchieveState.push({
                    command: notifyCmd,
                    context: {
                        oldState: oldHyperdeckState.notify,
                        newState: newHyperdeckState.notify
                    },
                    timelineObjId: hasChange.timelineObjId
                });
            }
        }
        else {
            this.emit('error', 'Hyperdeck', new Error(`diffStates missing notify object: ${JSON.stringify(oldHyperdeckState.notify)}, ${JSON.stringify(newHyperdeckState.notify)}`));
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
                            },
                            timelineObjId: newHyperdeckState.timelineObjId
                        });
                    }
                    else if (filenameChanged) { // Split recording
                        commandsToAchieveState.push({
                            command: new hyperdeck_connection_1.Commands.StopCommand(),
                            context: {
                                oldState: oldHyperdeckState.transport,
                                newState: newHyperdeckState.transport
                            },
                            timelineObjId: newHyperdeckState.timelineObjId
                        });
                        commandsToAchieveState.push({
                            command: new hyperdeck_connection_1.Commands.RecordCommand(newHyperdeckState.transport.recordFilename),
                            context: {
                                oldState: oldHyperdeckState.transport,
                                newState: newHyperdeckState.transport
                            },
                            timelineObjId: newHyperdeckState.timelineObjId
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
                            },
                            timelineObjId: newHyperdeckState.timelineObjId
                        });
                    }
                    break;
            }
        }
        else {
            this.emit('error', 'Hyperdeck', new Error(`diffStates missing transport object: ${JSON.stringify(oldHyperdeckState.transport)}, ${JSON.stringify(newHyperdeckState.transport)}`));
        }
        return commandsToAchieveState;
    }
    /**
     * Gets the current state of the device
     */
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
                transport: transportRes,
                timelineObjId: 'currentState'
            };
            return res;
        });
    }
    /**
     * Queries the recording time left in seconds of the device and mutates
     * this._recordingTime
     */
    _queryRecordingTime() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._recTimePollTimer) {
                clearTimeout(this._recTimePollTimer);
            }
            let time = 0;
            for (let slot = 1; slot <= this._slots; slot++) {
                try {
                    const res = yield this._hyperdeck.sendCommand(new hyperdeck_connection_1.Commands.SlotInfoCommand(slot));
                    this._slotStatus[slot] = res;
                    if (res.status === 'mounted') {
                        time += res.recordingTime;
                    }
                }
                catch (e) {
                    // null
                }
            }
            if (time !== this._recordingTime) {
                this._recordingTime = time;
                this._connectionChanged();
            }
            let timeTillNextUpdate = 10;
            if (time > 10) {
                if (time - this._minRecordingTime > 10) {
                    timeTillNextUpdate = (time - this._minRecordingTime) / 2;
                }
                else if (time - this._minRecordingTime < 0) {
                    timeTillNextUpdate = time / 2;
                }
            }
            this._recTimePollTimer = setTimeout(() => {
                this._queryRecordingTime().catch(e => this.emit('error', 'HyperDeck.queryRecordingTime', e));
            }, timeTillNextUpdate * 1000);
        });
    }
    _querySlotNumber() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const { slots } = yield this._hyperdeck.sendCommand(new hyperdeck_connection_1.Commands.DeviceInfoCommand());
            return slots;
        });
    }
    /**
     * Gets the default state of the device
     */
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
            },
            timelineObjId: ''
        };
        return res;
    }
    _defaultCommandReceiver(_time, command, context, timelineObjId) {
        let cwc = {
            context: context,
            timelineObjId: timelineObjId,
            command: command
        };
        this.emit('debug', cwc);
        return this._hyperdeck.sendCommand(command)
            .catch(error => {
            this.emit('commandError', error, cwc);
        });
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.HyperdeckDevice = HyperdeckDevice;
//# sourceMappingURL=hyperdeck.js.map