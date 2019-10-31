"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const events_1 = require("events");
const request = require("request");
const querystring = require("querystring");
const sprintf_js_1 = require("sprintf-js");
/**
 * Low level device class for Panasonic PTZ devices executing a
 * basic queue.
 */
class PanasonicPtzCamera extends events_1.EventEmitter {
    constructor(url, commandDelay = 130) {
        super();
        this._commandQueue = [];
        this._executeQueueTimeout = [];
        this._commandDelay = commandDelay;
        this._url = url;
    }
    get url() {
        return this._url;
    }
    sendCommand(command) {
        const p = new Promise((resolve, reject) => {
            this._commandQueue.push({ command: command, executing: false, resolve: resolve, reject: reject });
        });
        if (this._commandQueue.filter(i => i.executing).length === 0)
            this._executeQueue();
        return p;
    }
    dispose() {
        this._commandQueue = [];
        _.each(this._executeQueueTimeout, (item) => {
            clearTimeout(item);
        });
    }
    _dropFromQueue(item) {
        const index = this._commandQueue.findIndex(i => i === item);
        if (index >= 0) {
            this._commandQueue.splice(index, 1);
        }
        else {
            throw new Error(`Command ${item.command} should be dropped from the queue, but could not be found!`);
        }
    }
    _executeQueue() {
        const qItem = this._commandQueue.find(i => !i.executing);
        if (!qItem) {
            return;
        }
        const queryUrl = this._url + '?' + querystring.stringify({ 'cmd': qItem.command, 'res': '1' });
        this.emit('debug', 'Command sent', queryUrl);
        qItem.executing = true;
        request.get(queryUrl, {}, (error, response) => {
            if (error) {
                this.emit('error', error);
                this._dropFromQueue(qItem);
                qItem.reject(error);
                return;
            }
            this._dropFromQueue(qItem);
            qItem.resolve(response.body);
        });
        // find any commands that aren't executing yet and execute one after 130ms
        if (this._commandQueue.filter(i => !i.executing).length > 0) {
            const timeout = setTimeout(() => {
                // remove from timeouts list
                const index = this._executeQueueTimeout.indexOf(timeout);
                if (index >= 0) {
                    this._executeQueueTimeout.splice(index, 1);
                }
                this._executeQueue();
            }, this._commandDelay);
            // add to timeouts list so that we can cancel them when disposing
            this._executeQueueTimeout.push(timeout);
        }
    }
}
exports.PanasonicPtzCamera = PanasonicPtzCamera;
var PanasonicHttpCommands;
(function (PanasonicHttpCommands) {
    PanasonicHttpCommands["POWER_MODE_QUERY"] = "#O";
    PanasonicHttpCommands["PRESET_NUMBER_CONTROL_TPL"] = "#R%02i";
    PanasonicHttpCommands["PRESET_NUMBER_QUERY"] = "#S";
    PanasonicHttpCommands["PRESET_SPEED_CONTROL_TPL"] = "#UPVS%03i";
    PanasonicHttpCommands["PRESET_SPEED_QUERY"] = "#UPVS";
    PanasonicHttpCommands["ZOOM_SPEED_CONTROL_TPL"] = "#Z%02i";
    PanasonicHttpCommands["ZOOM_SPEED_QUERY"] = "#Z";
    PanasonicHttpCommands["ZOOM_CONTROL_TPL"] = "#AXZ%03X";
    PanasonicHttpCommands["ZOOM_QUERY"] = "#GZ";
})(PanasonicHttpCommands || (PanasonicHttpCommands = {}));
var PanasonicHttpResponse;
(function (PanasonicHttpResponse) {
    PanasonicHttpResponse["POWER_MODE_ON"] = "p1";
    PanasonicHttpResponse["POWER_MODE_STBY"] = "p0";
    PanasonicHttpResponse["POWER_MODE_TURNING_ON"] = "p3";
    PanasonicHttpResponse["PRESET_NUMBER_TPL"] = "s";
    PanasonicHttpResponse["PRESET_SPEED_TPL"] = "uPVS";
    PanasonicHttpResponse["ZOOM_SPEED_TPL"] = "zS";
    PanasonicHttpResponse["ZOOM_TPL"] = "gz";
    PanasonicHttpResponse["ZOOM_CONTROL_TPL"] = "axz";
    PanasonicHttpResponse["ERROR_1"] = "E1";
    PanasonicHttpResponse["ERROR_2"] = "E2";
    PanasonicHttpResponse["ERROR_3"] = "E3";
})(PanasonicHttpResponse || (PanasonicHttpResponse = {}));
/**
 * High level methods for interfacing with a panasonic PTZ camera. This class
 * depends on the PanasonicPtzCamera class.
 */
class PanasonicPtzHttpInterface extends events_1.EventEmitter {
    constructor(host, port, https) {
        super();
        this._device = new PanasonicPtzCamera((https ? 'https' : 'http') + '://' + host + (port ? ':' + port : '') + '/cgi-bin/aw_ptz');
        this._device.on('error', (err) => {
            this.emit('error', err);
        });
        this._device.on('debug', (...args) => {
            this.emit('debug', ...args);
        });
    }
    static _isError(response) {
        if (response === PanasonicHttpResponse.ERROR_1 ||
            response === PanasonicHttpResponse.ERROR_2 ||
            response === PanasonicHttpResponse.ERROR_3) {
            return true;
        }
        else {
            return false;
        }
    }
    dispose() {
        this._device.dispose();
    }
    /**
     * Get the last preset recalled in the camera
     * @returns {Promise<number>}
     * @memberof PanasonicPtzHttpInterface
     */
    getPreset() {
        const device = this._device;
        return new Promise((resolve, reject) => {
            device.sendCommand(PanasonicHttpCommands.PRESET_NUMBER_QUERY).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.PRESET_NUMBER_TPL)) {
                    const preset = Number.parseInt(response.substr(PanasonicHttpResponse.PRESET_NUMBER_TPL.length), 10);
                    resolve(preset);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Recall camera preset
     * @param {number} preset The preset to be recalled in the camera. 0-99
     * @returns {Promise<number>} A promise: the preset the camera will transition to
     * @memberof PanasonicPtzHttpInterface
     */
    recallPreset(preset) {
        const device = this._device;
        if (!_.isFinite(preset))
            throw new Error('Camera speed preset is not a finite number');
        if (preset < 0 || preset > 99)
            throw new Error('Illegal preset number');
        return new Promise((resolve, reject) => {
            device.sendCommand(sprintf_js_1.sprintf(PanasonicHttpCommands.PRESET_NUMBER_CONTROL_TPL, preset)).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.PRESET_NUMBER_TPL)) {
                    const preset = Number.parseInt(response.substr(PanasonicHttpResponse.PRESET_NUMBER_TPL.length), 10);
                    resolve(preset);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Get camera preset recall speed, within speed table
     * @returns {Promise<number>} A promise: the speed set in the camera
     * @memberof PanasonicPtzHttpInterface
     */
    getSpeed() {
        const device = this._device;
        return new Promise((resolve, reject) => {
            device.sendCommand(PanasonicHttpCommands.PRESET_SPEED_QUERY).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.PRESET_SPEED_TPL)) {
                    const speed = Number.parseInt(response.substr(PanasonicHttpResponse.PRESET_SPEED_TPL.length), 10);
                    resolve(speed);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Set camera preset recall speed, within speed table
     * @param {number} speed Speed to be set for the camera preset recall. 250-999 or 0. 0 is maximum speed
     * @returns {Promise<number>} A promise: the speed set in the camera
     * @memberof PanasonicPtzHttpInterface
     */
    setSpeed(speed) {
        const device = this._device;
        if (!_.isFinite(speed))
            throw new Error('Camera speed preset is not a finite number');
        if ((speed < 250 || speed > 999) && (speed !== 0))
            throw new Error('Camera speed must be between 250 and 999 or needs to be 0');
        return new Promise((resolve, reject) => {
            device.sendCommand(sprintf_js_1.sprintf(PanasonicHttpCommands.PRESET_SPEED_CONTROL_TPL, speed)).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.PRESET_SPEED_TPL)) {
                    const speed = Number.parseInt(response.substr(PanasonicHttpResponse.PRESET_SPEED_TPL.length), 10);
                    resolve(speed);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Get camera lens zoom speed (essentially, current virtual zoom rocker position)
     * @returns {Promise<number>} A promise: the speed at which the lens is changing it's zoom
     * @memberof PanasonicPtzHttpInterface
     */
    getZoomSpeed() {
        const device = this._device;
        return new Promise((resolve, reject) => {
            device.sendCommand(PanasonicHttpCommands.ZOOM_SPEED_QUERY).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.ZOOM_SPEED_TPL)) {
                    const speed = Number.parseInt(response.substr(PanasonicHttpResponse.ZOOM_SPEED_TPL.length), 10);
                    resolve(speed);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Set camera lens zoom speed (essentially, current virtual zoom rocker position)
     * @param {number} speed Speed to be set for the camera zoom. Acceptable values are 1-99. 50 is zoom stop, 49 is slowest WIDE, 51 is slowest TELE, 1 is fastest WIDE, 99 is fastest TELE
     * @returns {Promise<number>} A promise: the speed at which the lens is changing it's zoom
     * @memberof PanasonicPtzHttpInterface
     */
    setZoomSpeed(speed) {
        const device = this._device;
        if (!_.isFinite(speed))
            throw new Error('Camera zoom speed is not a finite number');
        if ((speed < 1 || speed > 99))
            throw new Error('Camera zoom speed must be between 1 and 99');
        return new Promise((resolve, reject) => {
            device.sendCommand(sprintf_js_1.sprintf(PanasonicHttpCommands.ZOOM_SPEED_CONTROL_TPL, speed)).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.ZOOM_SPEED_TPL)) {
                    const speed = Number.parseInt(response.substr(PanasonicHttpResponse.ZOOM_SPEED_TPL.length), 10);
                    resolve(speed);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Get camera lens zoom (an absolute number)
     * @returns {Promise<number>} A promise: current lens zoom
     * @memberof PanasonicPtzHttpInterface
     */
    getZoom() {
        const device = this._device;
        return new Promise((resolve, reject) => {
            device.sendCommand(PanasonicHttpCommands.ZOOM_QUERY).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.ZOOM_TPL)) {
                    const zoom = Number.parseInt(response.substr(PanasonicHttpResponse.ZOOM_TPL.length), 16);
                    resolve(zoom);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Set camera lens zoom (an absolute number)
     * @param {number} level The zoom level to set the lens to
     * @returns {Promise<number>} A promise: current lens zoom
     * @memberof PanasonicPtzHttpInterface
     */
    setZoom(level) {
        const device = this._device;
        if (!_.isFinite(level))
            throw new Error('Camera zoom speed is not a finite number');
        if ((level < 0x555 || level > 0xFFF))
            throw new Error('Camera zoom speed must be between 1365 and 4095');
        return new Promise((resolve, reject) => {
            device.sendCommand(sprintf_js_1.sprintf(PanasonicHttpCommands.ZOOM_CONTROL_TPL, level)).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response.startsWith(PanasonicHttpResponse.ZOOM_CONTROL_TPL)) {
                    const level = Number.parseInt(response.substr(PanasonicHttpResponse.ZOOM_CONTROL_TPL.length), 16);
                    resolve(level);
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
    /**
     * Ping a camera by checking it's power status. Will return true if the camera is on, false if it's off but reachable and will fail otherwise
     * @returns {Promose<boolean | string>} A promise: true if the camera is ON, false if the camera is off, 'turningOn' if transitioning from STBY to ON
     * @memberof PanasonicPtzHttpInterface
     */
    ping() {
        const device = this._device;
        return new Promise((resolve, reject) => {
            device.sendCommand(PanasonicHttpCommands.POWER_MODE_QUERY).then((response) => {
                if (PanasonicPtzHttpInterface._isError(response)) {
                    reject(`Device returned an error: ${response}`);
                }
                else if (response === PanasonicHttpResponse.POWER_MODE_ON) {
                    resolve(true);
                }
                else if (response === PanasonicHttpResponse.POWER_MODE_STBY) {
                    resolve(false);
                }
                else if (response === PanasonicHttpResponse.POWER_MODE_TURNING_ON) {
                    resolve('turningOn');
                }
                else {
                    reject(`Unknown response: ${response}`);
                }
            }).catch((error) => {
                this.emit('disconnected', error);
                reject(error);
            });
        });
    }
}
exports.PanasonicPtzHttpInterface = PanasonicPtzHttpInterface;
//# sourceMappingURL=panasonicPTZAPI.js.map