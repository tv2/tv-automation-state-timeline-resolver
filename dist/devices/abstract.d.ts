import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface AbstractDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export interface Command {
    commandName: string;
    timelineObjId: string;
    content: CommandContent;
    context: CommandContext;
}
declare type CommandContent = any;
declare type CommandContext = string;
export declare class AbstractDevice extends DeviceWithState<TimelineState> {
    private _doOnTime;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: AbstractDeviceOptions, options: any);
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Handle a new state, at the point in time specified
     * @param newState
     */
    handleState(newState: TimelineState): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    /**
     * Dispose of the device so it can be garbage collected.
     */
    terminate(): Promise<boolean>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    /**
     * converts the timeline state into something we can use
     * @param state
     */
    convertStateToAbstract(state: TimelineState): TimelineState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    getStatus(): DeviceStatus;
    private _addToQueue;
    /**
     * Generates commands based such that we will transition from the old state
     * to the new state.
     * @param oldAbstractState
     * @param newAbstractState
     */
    private _diffStates;
    private _defaultCommandReceiver;
}
export {};
