"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const device_1 = require("./device");
const src_1 = require("../types/src");
const request = require("request");
/**
 * This is a HTTPWatcherDevice, requests a uri on a regular interval and watches
 * it's response.
 */
class HTTPWatcherDevice extends device_1.Device {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this.status = device_1.StatusCode.UNKNOWN;
        const opts = deviceOptions.options || {};
        switch (opts.httpMethod) {
            case 'post':
                this.httpMethod = src_1.TimelineContentTypeHTTP.POST;
                break;
            case 'delete':
                this.httpMethod = src_1.TimelineContentTypeHTTP.DELETE;
                break;
            case 'put':
                this.httpMethod = src_1.TimelineContentTypeHTTP.PUT;
                break;
            case 'get':
            case undefined:
            default:
                this.httpMethod = src_1.TimelineContentTypeHTTP.GET;
                break;
        }
        this.expectedHttpResponse = Number(opts.expectedHttpResponse) || undefined;
        this.keyword = opts.keyword;
        this.intervalTime = Math.max(Number(opts.interval) || 1000, 1000);
        this.uri = opts.uri;
    }
    onInterval() {
        if (!this.uri) {
            this._setStatus(device_1.StatusCode.BAD, 'URI not set');
            return;
        }
        let reqMethod = request[this.httpMethod];
        if (reqMethod) {
            reqMethod(this.uri, {}, this.handleResponse.bind(this));
        }
        else {
            this._setStatus(device_1.StatusCode.BAD, `Bad request method: "${this.httpMethod}"`);
        }
    }
    stopInterval() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = undefined;
        }
    }
    startInterval() {
        this.stopInterval();
        this.interval = setInterval(this.onInterval.bind(this), this.intervalTime);
    }
    handleResponse(error, response, body) {
        if (error) {
            this._setStatus(device_1.StatusCode.BAD, error.toString() || 'Unknown');
        }
        else if (this.expectedHttpResponse &&
            this.expectedHttpResponse !== response.statusCode) {
            this._setStatus(device_1.StatusCode.BAD, `Expected status code ${this.expectedHttpResponse}, got ${response.statusCode}`);
        }
        else if (this.keyword &&
            body &&
            (body.toString() || '').indexOf(this.keyword) === -1) {
            this._setStatus(device_1.StatusCode.BAD, `Expected keyword "${this.keyword}" not found`);
        }
        else {
            this._setStatus(device_1.StatusCode.GOOD);
        }
    }
    init(_initOptions) {
        this.startInterval();
        return Promise.resolve(true);
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(_newStateTime) {
        // NOP
    }
    handleState(newState, newMappings) {
        super.onHandleState(newState, newMappings);
        // NOP
    }
    clearFuture(_clearAfterTime) {
        // NOP
    }
    getStatus() {
        let s = {
            statusCode: this.status,
            active: true // since this is not using any mappings, it's considered to be always active
        };
        if (this.statusReason)
            s.messages = [this.statusReason];
        return s;
    }
    terminate() {
        this.stopInterval();
        return Promise.resolve(true);
    }
    _setStatus(status, reason) {
        if (this.status !== status ||
            this.statusReason !== reason) {
            this.status = status;
            this.statusReason = reason;
            this.emit('connectionChanged', this.getStatus());
        }
    }
    get canConnect() {
        return false;
    }
    get connected() {
        return false;
    }
    get deviceType() {
        return src_1.DeviceType.HTTPWATCHER;
    }
    get deviceName() {
        return 'HTTP-Watch ' + this.deviceId;
    }
}
exports.HTTPWatcherDevice = HTTPWatcherDevice;
//# sourceMappingURL=httpWatcher.js.map