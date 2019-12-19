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
/**
 * Base class for all Devices to inherit from. Defines the API that the conductor
 * class will use.
 */
class Device extends events_1.EventEmitter {
    constructor(deviceId, deviceOptions, options) {
        super();
        this._mappings = {};
        this._currentTimeDiff = 0;
        this._currentTimeUpdated = 0;
        this.useDirectTime = false;
        this._reportAllCommands = false;
        this._deviceId = deviceId;
        this._deviceOptions = deviceOptions;
        this._instanceId = Math.floor(Math.random() * 10000);
        this._startTime = Date.now();
        this._reportAllCommands = !!deviceOptions.reportAllCommands;
        // this._deviceOptions = this._deviceOptions // ts-lint fix
        if (process.env.JEST_WORKER_ID !== undefined) {
            // running in Jest test environment.
            // Because Jest does a lot of funky stuff with the timing, we have to pull the time directly.
            this.useDirectTime = true;
        }
        if (options.getCurrentTime) {
            this._getCurrentTime = () => options.getCurrentTime();
        }
        this._updateCurrentTime();
    }
    terminate() {
        return Promise.resolve(true);
    }
    getCurrentTime() {
        if (this.useDirectTime) {
            // Used when running in test
            // @ts-ignore
            return this._getCurrentTime();
        }
        if ((Date.now() - this._currentTimeUpdated) > 5 * 60 * 1000) {
            this._updateCurrentTime();
        }
        return Date.now() - this._currentTimeDiff;
    }
    /**
     * The makeReady method could be triggered at a time before broadcast
     * Whenever we know that the user want's to make sure things are ready for broadcast
     * The exact implementation differ between different devices
     * @param okToDestroyStuff If true, the device may do things that might affect the output (temporarily)
     */
    makeReady(_okToDestroyStuff, _activeRundownId) {
        // This method should be overwritten by child
        return Promise.resolve();
    }
    /**
     * The standDown event could be triggered at a time after broadcast
     * The exact implementation differ between different devices
     * @param okToDestroyStuff If true, the device may do things that might affect the output (temporarily)
     */
    standDown(_okToDestroyStuff) {
        // This method should be overwritten by child
        return Promise.resolve();
    }
    getMapping() {
        return this._mappings;
    }
    setMapping(mappings) {
        this._mappings = mappings;
    }
    get deviceId() {
        return this._deviceId;
    }
    get deviceOptions() {
        return this._deviceOptions;
    }
    get supportsExpectedPlayoutItems() {
        return false;
    }
    handleExpectedPlayoutItems(_expectedPlayoutItems) {
        // When receiving a new list of playoutItems.
        // by default, do nothing
    }
    _updateCurrentTime() {
        if (this._getCurrentTime) {
            const startTime = Date.now();
            Promise.resolve(this._getCurrentTime())
                .then((parentTime) => {
                const endTime = Date.now();
                const clientTime = Math.round((startTime + endTime) / 2);
                this._currentTimeDiff = clientTime - parentTime;
                this._currentTimeUpdated = endTime;
            })
                .catch((err) => {
                this.emit('error', 'device._updateCurrentTime', err);
            });
        }
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    /* tslint:enable:unified-signatures */
    get instanceId() {
        return this._instanceId;
    }
    get startTime() {
        return this._startTime;
    }
    handleDoOnTime(doOnTime, deviceType) {
        doOnTime.on('error', e => this.emit('error', `${deviceType}.doOnTime`, e));
        doOnTime.on('slowCommand', msg => this.emit('slowCommand', this.deviceName + ': ' + msg));
        doOnTime.on('commandReport', commandReport => {
            if (this._reportAllCommands) {
                this.emit('commandReport', commandReport);
            }
        });
    }
}
exports.Device = Device;
/**
 * Basic class that devices with state tracking can inherit from. Defines some
 * extra convenience methods for tracking state while inheriting all other methods
 * from the Device class.
 */
class DeviceWithState extends Device {
    constructor() {
        super(...arguments);
        this._states = {};
        this._setStateCount = 0;
    }
    /**
     * Get the last known state before a point time. Useful for creating device
     * diffs.
     * @param time
     */
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
    /**
     * Get the last known state at a point in time. Useful for creating device
     * diffs.
     *
     * @todo is this literally the same as "getStateBefore(time + 1)"?
     *
     * @param time
     */
    getState(time) {
        if (time === undefined) {
            time = this.getCurrentTime();
        }
        let foundTime = 0;
        let foundState = null;
        _.each(this._states, (state, stateTimeStr) => {
            let stateTime = parseFloat(stateTimeStr);
            if (stateTime > foundTime && stateTime <= time) {
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
    /**
     * Saves a state on a certain time point. Overwrites any previous state
     * saved at the same time. Removes any state after this time point.
     * @param state
     * @param time
     */
    setState(state, time) {
        if (!time)
            throw new Error('setState: falsy time');
        this.cleanUpStates(0, time); // remove states after this time, as they are not relevant anymore
        this._states[time + ''] = state;
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
    /**
     * Sets a windows outside of which all states will be removed.
     * @param removeBeforeTime
     * @param removeAfterTime
     */
    cleanUpStates(removeBeforeTime, removeAfterTime) {
        _.each(_.keys(this._states), (stateTimeStr) => {
            let stateTime = parseFloat(stateTimeStr);
            if ((removeBeforeTime &&
                stateTime <= removeBeforeTime) ||
                (removeAfterTime &&
                    stateTime >= removeAfterTime) ||
                !stateTime) {
                delete this._states[stateTime];
            }
        });
    }
    /**
     * Removes all states
     */
    clearStates() {
        _.each(_.keys(this._states), (time) => {
            delete this._states[time];
        });
    }
}
exports.DeviceWithState = DeviceWithState;
//# sourceMappingURL=device.js.map