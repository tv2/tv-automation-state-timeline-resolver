import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, HttpSendOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface HttpSendDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export declare class HttpSendDevice extends DeviceWithState<TimelineState> {
    private _makeReadyCommands;
    private _doOnTime;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: HttpSendDeviceOptions, options: any);
    init(options: HttpSendOptions): Promise<boolean>;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToHttpSend(state: TimelineState): TimelineState;
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
