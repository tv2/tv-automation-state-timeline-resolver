import { ThreadedClass, ThreadedClassConfig } from 'threadedclass';
import { DeviceClassOptions, Device } from './device';
import { DeviceOptions, DeviceType } from '../types/src';
/**
 * A device container is a wrapper around a device in ThreadedClass class, it
 * keeps a local property of some basic information about the device (like
 * names and id's) to prevent a costly round trip over IPC.
 */
export declare class DeviceContainer {
    _device: ThreadedClass<Device>;
    _deviceId: string;
    _deviceType: DeviceType;
    _deviceName: string;
    _deviceOptions: DeviceOptions;
    _options: DeviceClassOptions;
    _threadConfig: ThreadedClassConfig | undefined;
    onChildClose: () => void | undefined;
    private _instanceId;
    private _startTime;
    private _onEventListener;
    create<T extends Device>(orgModule: string, orgClass: Function, deviceId: string, deviceOptions: DeviceOptions, options: DeviceClassOptions, threadConfig?: ThreadedClassConfig): Promise<this>;
    reloadProps(): Promise<void>;
    terminate(): Promise<void>;
    readonly device: ThreadedClass<Device>;
    readonly deviceId: string;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly deviceOptions: DeviceOptions;
    readonly options: DeviceClassOptions;
    readonly threadConfig: ThreadedClassConfig | undefined;
    readonly instanceId: number;
    readonly startTime: number;
}
