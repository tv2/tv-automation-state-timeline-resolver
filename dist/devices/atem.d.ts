import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, AtemOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { Commands as AtemCommands } from 'atem-connection';
import { State as DeviceState } from 'atem-state';
export interface AtemDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export interface AtemCommandWithContext {
    command: AtemCommands.AbstractCommand;
    context: CommandContext;
    timelineObjId: string;
}
declare type CommandContext = any;
/**
 * This is a wrapper for the Atem Device. Commands to any and all atem devices will be sent through here.
 */
export declare class AtemDevice extends DeviceWithState<DeviceState> {
    private _doOnTime;
    private _atem;
    private _state;
    private _initialized;
    private _connected;
    private firstStateAfterMakeReady;
    private _atemStatus;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: AtemDeviceOptions, options: any);
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
    handleState(newState: TimelineState): void;
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
    convertStateToAtem(state: TimelineState): DeviceState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    /**
     * Check status and return it with useful messages appended.
     */
    getStatus(): DeviceStatus;
    /**
     * Execute `commandsToAchieveState` at `time` using the doOnTime class
     * @param commandsToAchieveState
     * @param time
     */
    private _addToQueue;
    /**
     * Diffs two states and generate commands based on the diff.
     * @param oldAtemState
     * @param newAtemState
     */
    private _diffStates;
    /**
     * Returns the default state of an atem device, partially base on the topology and partially based on reported
     * properties. This can be used to augment with device state info.
     */
    private _getDefaultState;
    private _defaultCommandReceiver;
    private _onAtemStateChanged;
    private _connectionChanged;
}
export {};
