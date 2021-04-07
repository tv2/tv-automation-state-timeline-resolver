/// <reference types="node" />
import { CommandWithContext } from './devices/device';
import { DeviceOptionsCasparCGInternal } from './devices/casparCG';
import { DeviceOptionsAbstractInternal } from './devices/abstract';
import { DeviceOptionsHTTPSendInternal } from './devices/httpSend';
import { Mappings, TSRTimeline } from './types/src';
import { DeviceOptionsAtemInternal } from './devices/atem';
import { EventEmitter } from 'events';
import { DeviceOptionsLawoInternal } from './devices/lawo';
import { DeviceOptionsPanasonicPTZInternal } from './devices/panasonicPTZ';
import { DeviceOptionsHyperdeckInternal } from './devices/hyperdeck';
import { DeviceOptionsTCPSendInternal } from './devices/tcpSend';
import { DeviceOptionsPharosInternal } from './devices/pharos';
import { DeviceOptionsOSCInternal } from './devices/osc';
import { DeviceContainer } from './devices/deviceContainer';
import { MemUsageReport } from 'threadedclass';
import { DeviceOptionsHTTPWatcherInternal } from './devices/httpWatcher';
import { DeviceOptionsQuantelInternal } from './devices/quantel';
import { DeviceOptionsSisyfosInternal } from './devices/sisyfos';
import { DeviceOptionsSingularLiveInternal } from './devices/singularLive';
import { DeviceOptionsVMixInternal } from './devices/vmix';
import { DeviceOptionsVizMSEInternal } from './devices/vizMSE';
import { DeviceOptionsShotokuInternal } from './devices/shotoku';
export { DeviceContainer };
export { CommandWithContext };
export declare const LOOKAHEADTIME = 5000;
export declare const PREPARETIME = 2000;
export declare const MINTRIGGERTIME = 10;
export declare const MINTIMEUNIT = 1;
export declare const DEFAULT_PREPARATION_TIME = 20;
export declare type TimelineTriggerTimeResult = Array<{
    id: string;
    time: number;
}>;
export { Device } from './devices/device';
export interface ConductorOptions {
    initializeAsClear?: boolean;
    getCurrentTime?: () => number;
    autoInit?: boolean;
    multiThreadedResolver?: boolean;
    useCacheWhenResolving?: boolean;
    proActiveResolve?: boolean;
}
export interface StatReport {
    reason?: string;
    timelineStartResolve: number;
    timelineResolved: number;
    stateHandled: number;
    done: number;
}
/**
 * The Conductor class serves as the main class for interacting. It contains
 * methods for setting mappings, timelines and adding/removing devices. It keeps
 * track of when to resolve the timeline and updates the devices with new states.
 */
export declare class Conductor extends EventEmitter {
    private _logDebug;
    private _timeline;
    private _mappings;
    private _options;
    private devices;
    private _getCurrentTime?;
    private _nextResolveTime;
    private _resolvedStates;
    private _resolveTimelineTrigger;
    private _isInitialized;
    private _doOnTime;
    private _multiThreadedResolver;
    private _useCacheWhenResolving;
    private _callbackInstances;
    private _triggerSendStartStopCallbacksTimeout;
    private _sentCallbacks;
    private _actionQueue;
    private _statMeasureStart;
    private _statMeasureReason;
    private _statReports;
    private _resolver;
    private _interval;
    private _timelineHash;
    constructor(options?: ConductorOptions);
    /**
     * Initializates the resolver, with optional multithreading
     */
    init(): Promise<void>;
    /**
     * Returns a nice, synchronized time.
     */
    getCurrentTime(): number;
    /**
     * Returns the mappings
     */
    get mapping(): Mappings;
    /**
     * Returns the current timeline
     */
    get timeline(): TSRTimeline;
    /**
     * Sets a new timeline and resets the resolver.
     */
    setTimelineAndMappings(timeline: TSRTimeline, mappings?: Mappings): void;
    get timelineHash(): string | undefined;
    set timelineHash(hash: string | undefined);
    get logDebug(): boolean;
    set logDebug(val: boolean);
    getDevices(): Array<DeviceContainer>;
    getDevice(deviceId: string): DeviceContainer;
    /**
     * Adds a a device that can be referenced by the timeline and mappings.
     * @param deviceId Id used by the mappings to reference the device.
     * @param deviceOptions The options used to initalize the device
     * @returns A promise that resolves with the created device, or rejects with an error message.
     */
    addDevice(deviceId: string, deviceOptions: DeviceOptionsAnyInternal): Promise<DeviceContainer>;
    /**
     * Safely remove a device
     * @param deviceId The id of the device to be removed
     */
    removeDevice(deviceId: string): Promise<void>;
    /**
     * Remove all devices
     */
    destroy(): Promise<void>;
    /**
     * Resets the resolve-time, so that the resolving will happen for the point-in time NOW
     * next time
     */
    resetResolver(): void;
    /**
     * Send a makeReady-trigger to all devices
     */
    devicesMakeReady(okToDestroyStuff?: boolean, activeRundownId?: string): Promise<void>;
    /**
     * Send a standDown-trigger to all devices
     */
    devicesStandDown(okToDestroyStuff?: boolean): Promise<void>;
    getThreadsMemoryUsage(): Promise<{
        [childId: string]: MemUsageReport;
    }>;
    private _mapAllDevices;
    /**
     * This is the main resolve-loop.
     */
    private _triggerResolveTimeline;
    /**
     * Resolves the timeline for the next resolve-time, generates the commands and passes on the commands.
     */
    private _resolveTimeline;
    private _resolveTimelineInner;
    /**
     * Returns a time estimate for the resolval duration based on the amount of
     * objects on the timeline. If the proActiveResolve option is falsy this
     * returns 0.
     */
    estimateResolveTime(): any;
    private _diffStateForCallbacks;
    private _queueCallback;
    private _triggerSendStartStopCallbacks;
    private _sendStartStopCallbacks;
    private statStartMeasure;
    private statReport;
    /**
     * Split the state into substates that are relevant for each device
     */
    private filterLayersPerDevice;
}
export declare type DeviceOptionsAnyInternal = (DeviceOptionsAbstractInternal | DeviceOptionsCasparCGInternal | DeviceOptionsAtemInternal | DeviceOptionsLawoInternal | DeviceOptionsHTTPSendInternal | DeviceOptionsHTTPWatcherInternal | DeviceOptionsPanasonicPTZInternal | DeviceOptionsTCPSendInternal | DeviceOptionsHyperdeckInternal | DeviceOptionsPharosInternal | DeviceOptionsOSCInternal | DeviceOptionsSisyfosInternal | DeviceOptionsQuantelInternal | DeviceOptionsSingularLiveInternal | DeviceOptionsVMixInternal | DeviceOptionsShotokuInternal | DeviceOptionsVizMSEInternal | DeviceOptionsSingularLiveInternal | DeviceOptionsVizMSEInternal);
