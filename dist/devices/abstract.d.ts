import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, AbstractOptions, DeviceOptionsAbstract, Mappings } from '../types/src';
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
declare type AbstractState = TimelineState;
export declare class AbstractDevice extends DeviceWithState<AbstractState> implements IDevice {
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
    handleState(newState: TimelineState, newMappings: Mappings): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    /**
     * Dispose of the device so it can be garbage collected.
     */
    terminate(): Promise<boolean>;
    get canConnect(): boolean;
    get connected(): boolean;
    /**
     * converts the timeline state into something we can use
     * @param state
     */
    convertStateToAbstract(state: TimelineState): TimelineState;
    get deviceType(): DeviceType;
    get deviceName(): string;
    get queue(): {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    getStatus(): DeviceStatus;
    doCustomCommand(commandName: string, args: any[]): Promise<any>;
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
