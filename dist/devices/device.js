"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const events_1 = require("events");
var StatusCode;
(function (StatusCode) {
    StatusCode[StatusCode["UNKNOWN"] = 0] = "UNKNOWN";
    StatusCode[StatusCode["GOOD"] = 1] = "GOOD";
    StatusCode[StatusCode["WARNING_MINOR"] = 2] = "WARNING_MINOR";
    StatusCode[StatusCode["WARNING_MAJOR"] = 3] = "WARNING_MAJOR";
    StatusCode[StatusCode["BAD"] = 4] = "BAD";
    StatusCode[StatusCode["FATAL"] = 5] = "FATAL"; // Operation affected, not possible to recover without manual interference
})(StatusCode = exports.StatusCode || (exports.StatusCode = {}));
function literal(o) { return o; }
exports.literal = literal;
class Device extends events_1.EventEmitter {
    constructor(deviceId, deviceOptions, options) {
        super();
        this._deviceId = deviceId;
        this._deviceOptions = deviceOptions;
        this._deviceOptions = this._deviceOptions; // ts-lint fix
        if (options.getCurrentTime) {
            this._getCurrentTime = options.getCurrentTime;
        }
    }
    terminate() {
        return Promise.resolve(true);
    }
    getCurrentTime() {
        if (this._getCurrentTime)
            return this._getCurrentTime();
        return Date.now();
    }
    /**
     * The makeReady method could be triggered at a time before broadcast
     * Whenever we know that the user want's to make sure things are ready for broadcast
     * The exact implementation differ between different devices
     * @param okToDestroyStuff If true, the device may do things that might affect the output (temporarily)
     */
    makeReady(okToDestroyStuff) {
        // This method should be overwritten by child
        okToDestroyStuff = okToDestroyStuff;
        return Promise.resolve();
    }
    /**
     * The standDown event could be triggered at a time after broadcast
     * The exact implementation differ between different devices
     * @param okToDestroyStuff If true, the device may do things that might affect the output (temporarily)
     */
    standDown(okToDestroyStuff) {
        // This method should be overwritten by child
        okToDestroyStuff = okToDestroyStuff;
        return Promise.resolve();
    }
    get mapping() {
        return this._mappings;
    }
    set mapping(mappings) {
        this._mappings = mappings;
    }
    get deviceId() {
        return this._deviceId;
    }
    set deviceId(deviceId) {
        this._deviceId = deviceId;
    }
    get deviceOptions() {
        return this._deviceOptions;
    }
}
exports.Device = Device;
class DeviceWithState extends Device {
    constructor() {
        super(...arguments);
        this._states = {};
        this._setStateCount = 0;
    }
    getStateBefore(time) {
        let foundTime = 0;
        let foundState = null;
        _.each(this._states, (state, stateTimeStr) => {
            let stateTime = parseFloat(stateTimeStr);
            if (stateTime > foundTime && stateTime < time) {
                foundState = state;
                foundTime = stateTime;
            }
        });
        if (foundState) {
            return {
                state: foundState,
                time: foundTime
            };
        }
        return null;
    }
    setState(state, time) {
        // if (!state.time) throw new Error('setState: falsy state.time')
        if (!time)
            throw new Error('setState: falsy time');
        this._states[time + ''] = state;
        this.cleanUpStates(0, time); // remove states after this time, as they are not relevant anymore
        this._setStateCount++;
        if (this._setStateCount > 10) {
            this._setStateCount = 0;
            // Clean up old states:
            let stateBeforeNow = this.getStateBefore(this.getCurrentTime());
            if (stateBeforeNow && stateBeforeNow.time) {
                this.cleanUpStates(stateBeforeNow.time - 1, 0);
            }
        }
    }
    cleanUpStates(removeBeforeTime, removeAfterTime) {
        _.each(_.keys(this._states), (stateTimeStr) => {
            let stateTime = parseFloat(stateTimeStr);
            if ((removeBeforeTime &&
                stateTime < removeBeforeTime) ||
                (removeAfterTime &&
                    stateTime > removeAfterTime) ||
                !stateTime) {
                delete this._states[stateTime];
            }
        });
    }
    clearStates() {
        _.each(_.keys(this._states), (time) => {
            delete this._states[time];
        });
    }
}
exports.DeviceWithState = DeviceWithState;
//# sourceMappingURL=device.js.map