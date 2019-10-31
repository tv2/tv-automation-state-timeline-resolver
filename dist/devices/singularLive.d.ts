import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, SingularLiveOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface SingularLiveDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: CommandReceiver;
    };
}
export interface SingularLiveAnimationCommandContent extends SingularLiveCommandContent {
    animation: {
        action: 'play' | 'jump';
        to: 'In' | 'Out';
    };
}
export interface SingularLiveControlNodeCommandContent extends SingularLiveCommandContent {
    controlNode: {
        payload: {
            [key: string]: string;
        };
    };
}
export interface SingularLiveCommandContent {
    compositionName: string;
}
export declare type CommandReceiver = (time: number, cmd: SingularLiveCommandContent, context: CommandContext, timelineObjId: string) => Promise<any>;
export declare type CommandContext = string;
export interface SingularComposition {
    timelineObjId: string;
    animation: {
        stage: string;
        action: 'jump' | 'play';
    };
    controlNode: {
        payload: {
            [key: string]: string;
        };
    };
}
export interface SingularLiveState {
    compositions: {
        [key: string]: SingularComposition;
    };
}
/**
 * This is a Singular.Live device, it talks to a Singular.Live App Instance using an Access Token
 */
export declare class SingularLiveDevice extends DeviceWithState<TimelineState> {
    private _accessToken;
    private _doOnTime;
    private _deviceStatus;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: SingularLiveDeviceOptions, options: any);
    init(options: SingularLiveOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(_okToDestroyStuff?: boolean): Promise<void>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    private _getDefaultState;
    convertStateToSingularLive(state: TimelineState): SingularLiveState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    private _addToQueue;
    private _diffStates;
    private _defaultCommandReceiver;
}
