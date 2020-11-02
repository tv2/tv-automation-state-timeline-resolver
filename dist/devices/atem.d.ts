import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, AtemOptions, DeviceOptionsAtem, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { State as DeviceState, AtemConnection } from 'atem-state';
export interface AtemCommandWithContext {
    command: AtemConnection.Commands.ISerializableCommand;
    context: CommandContext;
    timelineObjId: string;
}
declare type CommandContext = any;
export interface DeviceOptionsAtemInternal extends DeviceOptionsAtem {
    options: (DeviceOptionsAtem['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, command: AtemConnection.Commands.ISerializableCommand, context: CommandContext, timelineObjId: string) => Promise<any>;
/**
 * This is a wrapper for the Atem Device. Commands to any and all atem devices will be sent through here.
 */
export declare class AtemDevice extends DeviceWithState<DeviceState> implements IDevice {
    private _doOnTime;
    private _atem;
    private _state;
    private _initialized;
    private _connected;
    private firstStateAfterMakeReady;
    private _atemStatus;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: DeviceOptionsAtemInternal, options: any);
    /**
     * Initiates the connection with the ATEM through the atem-connection lib
     * and initiates Atem State lib.
     */
    init(options: AtemOptions): Promise<boolean>;
    /**
     * Safely terminate everything to do with this device such that it can be
     * garbage collected.
     */
    terminate(): Promise<boolean>;
    /**
     * Prepare device for playout
     * @param okToDestroyStuff If true, may break output
     */
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Process a state, diff against previous state and generate commands to
     * be executed at the state's time.
     * @param newState The state to handle
     */
    handleState(newState: TimelineState, newMappings: Mappings): void;
    /**
     * Clear any scheduled commands after `clearAfterTime`
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    readonly canConnect: boolean;
    readonly connected: boolean;
    /**
     * Convert a timeline state into an Atem state.
     * @param state The state to be converted
     */
    convertStateToAtem(state: TimelineState, newMappings: Mappings): DeviceState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    doCustomCommand(commandName: string, args: any[]): Promise<any>;
    /**
     * Check status and return it with useful messages appended.
     */
    getStatus(): DeviceStatus;
    /**
     * Add commands to queue, to be executed at the right time
     */
    private _addToQueue;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     * @param oldAtemState
     * @param newAtemState
     */
    private _diffStates;
    private _defaultCommandReceiver;
    private _onAtemStateChanged;
    private _connectionChanged;
}
export {};
