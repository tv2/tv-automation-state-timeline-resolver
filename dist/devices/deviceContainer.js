"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const threadedclass_1 = require("threadedclass");
/**
 * A device container is a wrapper around a device in ThreadedClass class, it
 * keeps a local property of some basic information about the device (like
 * names and id's) to prevent a costly round trip over IPC.
 */
class DeviceContainer {
    constructor() {
        this._deviceId = 'N/A';
        this._deviceName = 'N/A';
        this._instanceId = -1;
        this._startTime = -1;
    }
    create(orgModule, orgClass, deviceId, deviceOptions, options, threadConfig) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._deviceOptions = deviceOptions;
            this._options = options;
            this._threadConfig = threadConfig;
            this._device = yield threadedclass_1.threadedClass(orgModule, orgClass, [deviceId, deviceOptions, options], threadConfig);
            if (deviceOptions.isMultiThreaded) {
                this._onEventListener = threadedclass_1.ThreadedClassManager.onEvent(this._device, 'thread_closed', () => {
                    // This is called if a child crashes
                    if (this.onChildClose)
                        this.onChildClose();
                });
            }
            yield this.reloadProps();
            return this;
        });
    }
    reloadProps() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._deviceId = yield this.device.deviceId;
            this._deviceType = yield this.device.deviceType;
            this._deviceName = yield this.device.deviceName;
            this._instanceId = yield this.device.instanceId;
            this._startTime = yield this.device.startTime;
        });
    }
    terminate() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._onEventListener) {
                this._onEventListener.stop();
            }
            yield threadedclass_1.ThreadedClassManager.destroy(this._device);
        });
    }
    get device() { return this._device; }
    get deviceId() { return this._deviceId; }
    get deviceType() { return this._deviceType; }
    get deviceName() { return this._deviceName; }
    get deviceOptions() { return this._deviceOptions; }
    get options() { return this._options; }
    get threadConfig() { return this._threadConfig; }
    get instanceId() { return this._instanceId; }
    get startTime() { return this._startTime; }
}
exports.DeviceContainer = DeviceContainer;
//# sourceMappingURL=deviceContainer.js.map