"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const panasonicPTZAPI_1 = require("./panasonicPTZAPI");
const PROBE_INTERVAL = 10 * 1000; // Probe every 10s
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
        });
        this._doOnTime.on('error', e => this.emit('error', 'doOnTime', e));
        if (deviceOptions.options && deviceOptions.options.host) {
            this._device = new panasonicPTZAPI_1.PanasonicPtzHttpInterface(deviceOptions.options.host, deviceOptions.options.port, deviceOptions.options.https);
            this._device.on('error', (msg) => {
                this.emit('error', 'PanasonicPtzHttpInterface', msg);
            });
            this._device.on('disconnected', (msg) => {
                this.emit('error', 'PanasonicPtzHttpInterface disconnected', msg);
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
    init() {
        if (this._device) {
            return new Promise((resolve, reject) => {
                this._device.ping().then((result) => {
                    this._setConnected(!!result);
                    if (result) {
                        setInterval(() => {
                            this._device.ping().then((result) => {
                                this._setConnected(!!result);
                            }).catch((e) => {
                                this.emit('error', 'ping', e);
                                this._setConnected(false);
                            });
                        }, PROBE_INTERVAL);
                    }
                    resolve(true);
                }).catch((e) => {
                    reject(e);
                });
            });
        }
        // @ts-ignore no-unused-vars
        return Promise.reject('There are no cameras set up for this device');
    }
    convertStateToPtz(state) {
        // convert the timeline state into something we can use
        const ptzState = this._getDefaultState();
        _.each(state.LLayers, (tlObject, layerName) => {
            const mapping = this.mapping[layerName]; // tslint:disable-line
            if (mapping && mapping.device === src_1.DeviceType.PANASONIC_PTZ) {
                if (mapping.mappingType === src_1.MappingPanasonicPtzType.PRESET) {
                    let tlObjectSource = tlObject;
                    _.extend(ptzState, {
                        preset: tlObjectSource.content.preset
                    });
                }
                else if (mapping.mappingType === src_1.MappingPanasonicPtzType.PRESET_SPEED) {
                    let tlObjectSource = tlObject;
                    _.extend(ptzState, {
                        speed: tlObjectSource.content.speed
                    });
                }
                else if (mapping.mappingType === src_1.MappingPanasonicPtzType.ZOOM_SPEED) {
                    let tlObjectSource = tlObject;
                    _.extend(ptzState, {
                        zoomSpeed: tlObjectSource.content.zoomSpeed
                    });
                }
                else if (mapping.mappingType === src_1.MappingPanasonicPtzType.ZOOM) {
                    let tlObjectSource = tlObject;
                    _.extend(ptzState, {
                        zoom: tlObjectSource.content.zoom
                    });
                }
            }
        });
        return ptzState;
    }
    handleState(newState) {
        // Handle this new state, at the point in time specified
        let oldState = (this.getStateBefore(newState.time) || { state: { time: 0, LLayers: {}, GLayers: {} } }).state;
        let oldPtzState = this.convertStateToPtz(oldState);
        let newPtzState = this.convertStateToPtz(newState);
        let commandsToAchieveState = this._diffStates(oldPtzState, newPtzState);
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
        if (this._device) {
            this._device.dispose();
        }
        return Promise.resolve(true);
    }
    getStatus() {
        return {
            statusCode: this._connected ? device_1.StatusCode.GOOD : device_1.StatusCode.BAD
        };
    }
    _getDefaultState() {
        return {
            preset: undefined,
            speed: undefined,
            zoomSpeed: 0,
            zoom: undefined
        };
    }
    // @ts-ignore no-unused-vars
    _defaultCommandReceiver(time, cmd, context) {
        let cwc = {
            context: context,
            command: cmd
        };
        if (cmd.type === src_1.TimelineContentTypePanasonicPtz.PRESET) {
            if (this._device && cmd.preset !== undefined) {
                this.emit('debug', cwc);
                this._device.recallPreset(cmd.preset)
                    .then((res) => {
                    this.emit('debug', `Panasonic PTZ result: ${res}`);
                })
                    .catch((e) => this.emit('error', 'PTZ.recallPreset', e));
            } // @todo: else: add throw here?
        }
        else if (cmd.type === src_1.TimelineContentTypePanasonicPtz.SPEED) {
            if (this._device && cmd.speed !== undefined) {
                this.emit('debug', cwc);
                this._device.setSpeed(cmd.speed)
                    .then((res) => {
                    this.emit('debug', `Panasonic PTZ result: ${res}`);
                })
                    .catch((e) => this.emit('error', 'PTZ.setSpeed', e));
            } // @todo: else: add throw here?
        }
        else if (cmd.type === src_1.TimelineContentTypePanasonicPtz.ZOOM_SPEED) {
            if (this._device && cmd.zoomSpeed !== undefined) {
                this.emit('debug', cwc);
                // scale -1 - 0 - +1 range to 01 - 50 - 99 range
                this._device.setZoomSpeed((cmd.zoomSpeed * 49) + 50)
                    .then((res) => {
                    this.emit('debug', `Panasonic PTZ result: ${res}`);
                })
                    .catch((e) => this.emit('error', 'PTZ.setZoomSpeed', e));
            } // @todo: else: add throw here?
        }
        else if (cmd.type === src_1.TimelineContentTypePanasonicPtz.ZOOM) {
            if (this._device && cmd.zoom !== undefined) {
                this.emit('debug', cwc);
                // scale 0 - +1 range to 555h - FFFh range
                this._device.setZoom((cmd.zoom * 0xAAA) + 0x555)
                    .then((res) => {
                    this.emit('debug', `Panasonic PTZ result: ${res}`);
                })
                    .catch((e) => this.emit('error', 'PTZ.setZoom', e));
            } // @todo: else: add throw here?
        }
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                return this._commandReceiver(time, cmd.command, cmd.context);
            }, cmd);
        });
    }
    _diffStates(oldPtzState, newPtzState) {
        let commands = [];
        let addCommands = (newNode, oldValue) => {
            if (newNode.preset !== oldValue.preset && newNode.preset !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.PRESET,
                        preset: newNode.preset
                    },
                    context: `preset differ (${newNode.preset}, ${oldValue.preset})`
                });
            }
            if (newNode.speed !== oldValue.speed && newNode.speed !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.SPEED,
                        speed: newNode.speed
                    },
                    context: `preset spped differ (${newNode.speed}, ${oldValue.speed})`
                });
            }
            if (newNode.zoomSpeed !== oldValue.zoomSpeed && newNode.zoomSpeed !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.ZOOM_SPEED,
                        speed: newNode.zoomSpeed
                    },
                    context: `zoom speed differ (${newNode.zoomSpeed}, ${oldValue.zoomSpeed})`
                });
            }
            if (newNode.zoom !== oldValue.zoom && newNode.zoom !== undefined) {
                commands.push({
                    command: {
                        type: src_1.TimelineContentTypePanasonicPtz.ZOOM,
                        zoom: newNode.zoom
                    },
                    context: `zoom speed differ (${newNode.zoom}, ${oldValue.zoom})`
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
    set mapping(mappings) {
        super.mapping = mappings;
    }
    get mapping() {
        return super.mapping;
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
}
exports.PanasonicPtzDevice = PanasonicPtzDevice;
//# sourceMappingURL=panasonicPTZ.js.map