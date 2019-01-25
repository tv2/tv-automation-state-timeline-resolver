/// <reference types="node" />
import { TimelineState } from 'superfly-timeline';
import { Mappings, DeviceType, DeviceOptions } from '../types/src';
import { EventEmitter } from 'events';
export interface DeviceCommand {
    time: number;
    deviceId: string;
    command: any;
}
export interface DeviceCommandContainer {
    deviceId: string;
    commands: Array<DeviceCommand>;
}
export interface CommandWithContext {
    context: any;
    command: any;
}
export declare enum StatusCode {
    UNKNOWN = 0,
    GOOD = 1,
    WARNING_MINOR = 2,
    WARNING_MAJOR = 3,
    BAD = 4,
    FATAL = 5
}
export interface DeviceStatus {
    statusCode: StatusCode;
    messages?: Array<string>;
}
export declare function literal<T>(o: T): T;
interface IDevice {
    on(event: 'info', listener: (info: any) => void): this;
    on(event: 'warning', listener: (warning: any) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'debug', listener: (...debug: any[]) => void): this;
}
export declare abstract class Device extends EventEmitter implements IDevice {
    private _getCurrentTime;
    private _deviceId;
    private _deviceOptions;
    private _mappings;
    constructor(deviceId: string, deviceOptions: DeviceOptions, options: any);
    /**
     * Connect to the device, resolve the promise when ready.
     * @param connectionOptions Device-specific options
     */
    abstract init(connectionOptions: any): Promise<boolean>;
    terminate(): Promise<boolean>;
    getCurrentTime(): number;
    abstract handleState(newState: TimelineState): any;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    abstract clearFuture(clearAfterTime: number): any;
    abstract readonly canConnect: boolean;
    abstract readonly connected: boolean;
    /**
     * The makeReady method could be triggered at a time before broadcast
     * Whenever we know that the user want's to make sure things are ready for broadcast
     * The exact implementation differ between different devices
     * @param okToDestroyStuff If true, the device may do things that might affect the output (temporarily)
     */
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    /**
     * The standDown event could be triggered at a time after broadcast
     * The exact implementation differ between different devices
     * @param okToDestroyStuff If true, the device may do things that might affect the output (temporarily)
     */
    standDown(okToDestroyStuff?: boolean): Promise<void>;
    abstract getStatus(): DeviceStatus;
    mapping: Mappings;
    deviceId: string;
    /**
     * A human-readable name for this device
     */
    abstract readonly deviceName: string;
    abstract readonly deviceType: DeviceType;
    readonly deviceOptions: DeviceOptions;
}
export declare abstract class DeviceWithState<T> extends Device {
    private _states;
    private _setStateCount;
    getStateBefore(time: number): {
        state: T;
        time: number;
    } | null;
    setState(state: T, time: number): void;
    cleanUpStates(removeBeforeTime: number, removeAfterTime: number): void;
    clearStates(): void;
}
export {};
