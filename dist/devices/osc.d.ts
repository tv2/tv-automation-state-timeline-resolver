import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, OSCOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface OSCMessageDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export declare class OSCMessageDevice extends DeviceWithState<TimelineState> {
    private _doOnTime;
    private _oscClient;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: OSCMessageDeviceOptions, options: any);
    init(options: OSCOptions): Promise<boolean>;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToOSCMessage(state: TimelineState): TimelineState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        time: number;
    }[];
    private _addToQueue;
    private _diffStates;
    private _defaultCommandReceiver;
}
