import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, SingularLiveOptions, DeviceOptionsSingularLive, SingularCompositionAnimation, SingularCompositionControlNode, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface DeviceOptionsSingularLiveInternal extends DeviceOptionsSingularLive {
    options: (DeviceOptionsSingularLive['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: SingularLiveCommandContent, context: CommandContext, timelineObjId: string) => Promise<any>;
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
export declare type CommandContext = string;
export interface SingularComposition {
    timelineObjId: string;
    animation: SingularCompositionAnimation;
    controlNode: SingularCompositionControlNode;
}
export interface SingularLiveState {
    compositions: {
        [key: string]: SingularComposition;
    };
}
/**
 * This is a Singular.Live device, it talks to a Singular.Live App Instance using an Access Token
 */
export declare class SingularLiveDevice extends DeviceWithState<SingularLiveState> implements IDevice {
    private _accessToken;
    private _doOnTime;
    private _deviceStatus;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: DeviceOptionsSingularLiveInternal, options: any);
    init(initOptions: SingularLiveOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    handleState(newState: TimelineState, newMappings: Mappings): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(_okToDestroyStuff?: boolean): Promise<void>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    private _getDefaultState;
    convertStateToSingularLive(state: TimelineState, newMappings: Mappings): SingularLiveState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    /**
     * Add commands to queue, to be executed at the right time
     */
    private _addToQueue;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    private _diffStates;
    private _defaultCommandReceiver;
}
