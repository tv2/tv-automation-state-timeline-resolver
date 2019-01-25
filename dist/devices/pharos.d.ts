import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, PharosOptions, TimelineContentTypePharos } from '../types/src';
import { TimelineState, TimelineResolvedObject, TimelineResolvedKeyframe } from 'superfly-timeline';
export interface PharosDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export interface Command {
    content: CommandContent;
    context: CommandContext;
}
declare type TimelinePharosObj = TimelineObjPharosScene & TimelineObjPharosTimeline;
export interface PharosState extends TimelineState {
    LLayers: {
        [LLayer: string]: TimelinePharosObj;
    };
}
export interface TimelineObjPharosScene extends TimelineResolvedObject {
    content: {
        keyframes?: Array<TimelineResolvedKeyframe>;
        type: TimelineContentTypePharos.SCENE;
        attributes: {
            scene: number;
            fade?: number;
            stopped?: boolean;
            noRelease?: true;
        };
    };
}
export interface TimelineObjPharosTimeline extends TimelineResolvedObject {
    content: {
        keyframes?: Array<TimelineResolvedKeyframe>;
        type: TimelineContentTypePharos.TIMELINE;
        attributes: {
            timeline: number;
            pause?: boolean;
            rate?: boolean;
            fade?: number;
            stopped?: boolean;
            noRelease?: true;
        };
    };
}
interface CommandContent {
    fcn: (...args: any[]) => Promise<any>;
    args: any[];
}
declare type CommandContext = string;
export declare class PharosDevice extends DeviceWithState<TimelineState> {
    private _doOnTime;
    private _pharos;
    private _pharosProjectInfo?;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: PharosDeviceOptions, options: any);
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(connectionOptions: PharosOptions): Promise<boolean>;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToPharos(state: TimelineState): PharosState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        time: number;
    }[];
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    getStatus(): DeviceStatus;
    private _addToQueue;
    private _diffStates;
    private _defaultCommandReceiver;
    private _connectionChanged;
}
export {};
