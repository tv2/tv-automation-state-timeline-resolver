"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const panasonicPTZAPI_1 = require("./panasonicPTZAPI");
const PROBE_INTERVAL = 10 * 1000; // Probe every 10s
/**
 * A wrapper for panasonic ptz cameras. Maps timeline states to device states and
 * executes commands to achieve such states. Depends on PanasonicPTZAPI class for
 * connection with the physical device.
 */
class PanasonicPtzDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._connected = false;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver) {
                this._commandReceiver = deviceOptions.options.commandReceiver;
            }
            else {
                this._commandReceiver = this._defaultCommandReceiver;
            }
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'PanasonicPTZ');
        if (deviceOptions.options && deviceOptions.options.host) {
            // set up connection class
            this._device = new panasonicPTZAPI_1.PanasonicPtzHttpInterface(deviceOptions.options.host, deviceOptions.options.port, deviceOptions.options.https);
            this._device.on('error', (msg) => {
                if (msg.code === 'ECONNREFUSED')
                    return; // ignore, since we catch this in connection logic
                this.emit('error', 'PanasonicPtzHttpInterface', msg);
            });
            this._device.on('disconnected', () => {
                this._setConnected(false);
            });
            this._device.on('debug', (...args) => {
                this.emit('debug', 'Panasonic PTZ', ...args);
            });
        }
        else {
            this._device = undefined;
        }
    }
    /**
     * Initiates the device: set up ping for connection logic.
     */
    init(_initOptions) {
        if (this._device) {
            return new Promise((resolve, reject) => {
                setInterval(() => {
                    this._device.ping().then((result) => {
                        this._setConnected(!!result);
                    }).catch(() => {
                        this._setConnected(false);
                    });
                }, PROBE_INTERVAL);
                this._device.ping().then((result) => {
                    this._setConnected(!!result);
                    resolve(true);
                }).catch((e) => {
                    reject(e);
                });
            });
        }
        // @ts-ignore no-unused-vars
        return Promise.reject('There are no cameras set up for this device');
    }
    /**
     * Converts a timeline state into a device state.
     * @param state
     */
    convertStateToPtz(state) {
        // convert the timeline state into something we can use
        const ptzState = this._getDefaultState();
        _.each(state.layers, (tlObject, layerName) => {
            const mapping = this.getMapping()[layerName];
            if (mapping && mapping.device === src_1.DeviceType.PANASONIC_PTZ) {
                if (mapping.mappingType === src_1.MappingPanasonicPtzType.PRESET) {
                    let tlObjectSource = tlObject;
                    ptzState.preset = {
                        value: tlObjectSource.content.preset,
                        timelineObjId: tlObject.id
                    };
                }
                else if (mapping.mappingType === src_1.MappingPanasonicPtzType.PRESET_SPEED) {
                    let tlObjectSource = tlObject;
                    ptzState.speed = {
                        value: tlObjectSource.content.speed,
                        timelineObjId: tlObject.id
                    };
                }
                else if (mapping.mappingType === src_1.MappingPanasonicPtzType.ZOOM_SPEED) {
                    let tlObjectSource = tlObject;
                    ptzState.zoomSpeed = {
                        value: tlObjectSource.content.zoomSpeed,
                        timelineObjId: tlObject.id
                    };
                }
                else if (mapping.mappingType === src_1.MappingPanasonicPtzType.ZOOM) {
                    let tlObjectSource = tlObject;
                    ptzState.zoom = {
                        value: tlObjectSource.content.zoom,
                        timelineObjId: tlObject.id
                    };
                }
            }
        });
        return ptzState;
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Handles a new state such that the device will be in that state at a specific point
     * in time.
     * @param newState
     */
    handleState(newState) {
        // Create device states
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: { time: 0, layers: {}, nextEvents: [] } }).state;
        let oldPtzState = this.convertStateToPtz(oldState);
        let newPtzState = this.convertStateToPtz(newState);
        // Generate commands needed to reach new state
        let commandsToAchieveState = this._diffStates(oldPtzState, newPtzState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
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
        if (this._device) {
            this._device.dispose();
        }
        return Promise.resolve(true);
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
    _getDefaultState() {
        return {
            // preset: undefined,
            // speed: undefined,
            zoomSpeed: {
                value: 0,
                timelineObjId: 'default'
            }
            // zoom: undefined
        };
    }
    // @ts-ignore no-unused-vars
    _defaultCommandReceiver(time, cmd, context, timelineObjId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            let cwc = {
                context: context,
                command: cmd,
                timelineObjId: timelineObjId
            };
            try {
                if (this._device) {
                    if (cmd.type === src_1.TimelineContentTypePanasonicPtz.PRESET) { // recall preset
                        if (cmd.preset !== undefined) {
                            const res = yield this._device.recallPreset(cmd.preset);
                            this.emit('debug', `Panasonic PTZ result: ${res}`);
                        }
                        else
                            throw new Error(`Bad parameter: preset`);
                    }
                    else if (cmd.type === src_1.TimelineContentTypePanasonicPtz.SPEED) { // set speed
                        if (cmd.speed !== undefined) {
                            const res = yield this._device.setSpeed(cmd.speed);
                            this.emit('debug', `Panasonic PTZ result: ${res}`);
                        }
                        else
                            throw new Error(`Bad parameter: speed`);
                    }
                    else if (cmd.type === src_1.TimelineContentTypePanasonicPtz.ZOOM_SPEED) { // set zoom speed
                        if (cmd.zoomSpeed !== undefined) {
                            // scale -1 - 0 - +1 range to 01 - 50 - 99 range
                            const res = yield this._device.setZoomSpeed((cmd.zoomSpeed * 49) + 50);
                            this.emit('debug', `Panasonic PTZ result: ${res}`);
                        }
                        else
                            throw new Error(`Bad parameter: zoomSpeed`);
                    }
                    else if (cmd.type === src_1.TimelineContentTypePanasonicPtz.ZOOM) { // set zoom
                        if (cmd.zoom !== undefined) {
                            // scale 0 - +1 range to 555h - FFFh range
                            const res = yield this._device.setZoom((cmd.zoom * 0xAAA) + 0x555);
                            this.emit('debug', `Panasonic PTZ result: ${res}`);
                        }
                        else
                            throw new Error(`Bad parameter: zoom`);
                    }
                    else
                        throw new Error(`PTZ: Unknown type: "${cmd.type}"`);
                }
                else
                    throw new Error(`PTZ device not set up`);
            }
            catch (e) {
                this.emit('commandError', e, cwc);
            }
        });
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd.command, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    _diffStates(oldPtzState, newPtzState) {
        let commands = [];
        let addCommands = (newNode, oldValue) => {
            if (newNode.preset && this.getValue(newNode.preset) !== this.getValue(oldValue.preset) && this.getValue(newNode.preset) !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.PRESET,
                        preset: this.getValue(newNode.preset)
                    },
                    context: `preset differ (${this.getValue(newNode.preset)}, ${this.getValue(oldValue.preset)})`,
                    timelineObjId: newNode.preset.timelineObjId
                });
            }
            if (newNode.speed && this.getValue(newNode.speed) !== this.getValue(oldValue.speed) && this.getValue(newNode.speed) !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.SPEED,
                        speed: this.getValue(newNode.speed)
                    },
                    context: `speed differ (${this.getValue(newNode.speed)}, ${this.getValue(oldValue.speed)})`,
                    timelineObjId: newNode.speed.timelineObjId
                });
            }
            if (newNode.zoomSpeed && this.getValue(newNode.zoomSpeed) !== this.getValue(oldValue.zoomSpeed) && this.getValue(newNode.zoomSpeed) !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.ZOOM_SPEED,
                        speed: this.getValue(newNode.zoomSpeed)
                    },
                    context: `zoom speed differ (${this.getValue(newNode.zoomSpeed)}, ${this.getValue(oldValue.zoomSpeed)})`,
                    timelineObjId: newNode.zoomSpeed.timelineObjId
                });
            }
            if (newNode.zoom && this.getValue(newNode.zoom) !== this.getValue(oldValue.zoom) && this.getValue(newNode.zoom) !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.ZOOM,
                        zoom: this.getValue(newNode.zoom)
                    },
                    context: `zoom differ (${this.getValue(newNode.zoom)}, ${this.getValue(oldValue.zoom)})`,
                    timelineObjId: newNode.zoom.timelineObjId
                });
            }
        };
        if (!_.isEqual(newPtzState, oldPtzState)) {
            addCommands(newPtzState, oldPtzState);
        }
        return commands;
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._connected;
    }
    get deviceType() {
        return src_1.DeviceType.PANASONIC_PTZ;
    }
    get deviceName() {
        return 'Panasonic PTZ ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    _setConnected(connected) {
        if (this._connected !== connected) {
            this._connected = connected;
            this._connectionChanged();
        }
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
    getValue(a) {
        if (a)
            return a.value;
        return undefined;
    }
}
exports.PanasonicPtzDevice = PanasonicPtzDevice;
//# sourceMappingURL=panasonicPTZ.js.map