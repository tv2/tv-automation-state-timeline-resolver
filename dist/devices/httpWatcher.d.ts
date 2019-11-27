import { DeviceStatus, Device, IDevice } from './device';
import { DeviceType, HTTPWatcherOptions, DeviceOptionsHTTPpWatcher } from '../types/src';
import * as request from 'request';
import { TimelineState } from 'superfly-timeline';
export interface DeviceOptionsHTTPWatcherInternal extends DeviceOptionsHTTPpWatcher {
    options: (DeviceOptionsHTTPpWatcher['options']);
}
/**
 * This is a HTTPWatcherDevice, requests a uri on a regular interval and watches
 * it's response.
 */
export declare class HTTPWatcherDevice extends Device implements IDevice {
    private uri?;
    private httpMethod;
    private expectedHttpResponse;
    private keyword;
    private intervalTime;
    private interval;
    private status;
    private statusReason;
    constructor(deviceId: string, deviceOptions: DeviceOptionsHTTPWatcherInternal, options: any);
    onInterval(): void;
    stopInterval(): void;
    startInterval(): void;
    handleResponse(error: any, response: request.Response, body: any): void;
    init(_initOptions: HTTPWatcherOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(_newStateTime: number): void;
    handleState(_newState: TimelineState): void;
    clearFuture(_clearAfterTime: number): void;
    getStatus(): DeviceStatus;
    terminate(): Promise<boolean>;
    private _setStatus;
    get canConnect(): boolean;
    get connected(): boolean;
    get deviceType(): DeviceType;
    get deviceName(): string;
}
