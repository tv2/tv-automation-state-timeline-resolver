"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    async create(orgModule, orgClass, deviceId, deviceOptions, getCurrentTime, threadConfig) {
        this._deviceOptions = deviceOptions;
        // this._options = options
        this._threadConfig = threadConfig;
        if (process.env.JEST_WORKER_ID !== undefined && threadConfig && threadConfig.disableMultithreading) {
            // running in Jest test environment.
            // hack: we need to work around the mangling performed by threadedClass, as getCurrentTime needs to not return a promise
            getCurrentTime = { inner: getCurrentTime };
        }
        this._device = await threadedclass_1.threadedClass(orgModule, orgClass, [deviceId, deviceOptions, getCurrentTime], // TODO types
        threadConfig);
        if (deviceOptions.isMultiThreaded) {
            this._onEventListener = threadedclass_1.ThreadedClassManager.onEvent(this._device, 'thread_closed', () => {
                // This is called if a child crashes
                if (this.onChildClose)
                    this.onChildClose();
            });
        }
        await this.reloadProps();
        return this;
    }
    async reloadProps() {
        this._deviceId = await this.device.deviceId;
        this._deviceType = await this.device.deviceType;
        this._deviceName = await this.device.deviceName;
        this._instanceId = await this.device.instanceId;
        this._startTime = await this.device.startTime;
    }
    async terminate() {
        if (this._onEventListener) {
            this._onEventListener.stop();
        }
        await threadedclass_1.ThreadedClassManager.destroy(this._device);
    }
    get device() { return this._device; }
    get deviceId() { return this._deviceId; }
    get deviceType() { return this._deviceType; }
    get deviceName() { return this._deviceName; }
    get deviceOptions() { return this._deviceOptions; }
    get threadConfig() { return this._threadConfig; }
    get instanceId() { return this._instanceId; }
    get startTime() { return this._startTime; }
}
exports.DeviceContainer = DeviceContainer;
//# sourceMappingURL=deviceContainer.js.map