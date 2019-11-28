import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, AbstractOptions, DeviceOptionsAbstract } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface Command {
    commandName: string;
    timelineObjId: string;
    content: CommandContent;
    context: CommandContext;
}
declare type CommandContent = any;
declare type CommandContext = string;
export interface DeviceOptionsAbstractInternal extends DeviceOptionsAbstract {
    options: (DeviceOptionsAbstract['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: Command, context: CommandContext, timelineObjId: string) => Promise<any>;
export declare class AbstractDevice extends DeviceWithState<TimelineState> implements IDevice {
    private _doOnTime;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: DeviceOptionsAbstractInternal, options: any);
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(_initOptions: AbstractOptions): Promise<boolean>;
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
    /**
     * Add commands to queue, to be executed at the right time
     */
    private _addToQueue;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     * @param oldAbstractState
     * @param newAbstractState
     */
    private _diffStates;
    private _defaultCommandReceiver;
}
export {};
