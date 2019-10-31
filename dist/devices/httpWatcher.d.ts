import { DeviceStatus, Device } from './device';
import { DeviceType, DeviceOptions } from '../types/src';
import * as request from 'request';
import { TimelineState } from 'superfly-timeline';
export interface HttpWatcherDeviceOptions extends DeviceOptions {
    options?: {
        uri?: string;
        httpMethod?: string;
        expectedHttpResponse?: number;
        keyword?: string;
        interval?: number;
    };
}
/**
 * This is a HTTPWatcherDevice, requests a uri on a regular interval and watches
 * it's response.
 */
export declare class HttpWatcherDevice extends Device {
    private uri?;
    private httpMethod;
    private expectedHttpResponse;
    private keyword;
    private intervalTime;
    private interval;
    private status;
    private statusReason;
    constructor(deviceId: string, deviceOptions: HttpWatcherDeviceOptions, options: any);
    onInterval(): void;
    stopInterval(): void;
    startInterval(): void;
    handleResponse(error: any, response: request.Response, body: any): void;
    init(): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(_newStateTime: number): void;
    handleState(_newState: TimelineState): void;
    clearFuture(_clearAfterTime: number): void;
    getStatus(): DeviceStatus;
    terminate(): Promise<boolean>;
    private _setStatus;
    readonly canConnect: boolean;
    readonly connected: boolean;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
}
