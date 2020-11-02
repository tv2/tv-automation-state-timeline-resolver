import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { Command as CommandNS } from 'casparcg-connection';
import { DeviceType, CasparCGOptions, DeviceOptionsCasparCG, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { State } from 'casparcg-state';
export interface DeviceOptionsCasparCGInternal extends DeviceOptionsCasparCG {
    options: (DeviceOptionsCasparCG['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: CommandNS.IAMCPCommand, context: string, timelineObjId: string) => Promise<any>;
/**
 * This class is used to interface with CasparCG installations. It creates
 * device states from timeline states and then diffs these states to generate
 * commands. It depends on the DoOnTime class to execute the commands timely or,
 * optionally, uses the CasparCG command scheduling features.
 */
export declare class CasparCGDevice extends DeviceWithState<State> implements IDevice {
    private _ccg;
    private _ccgState;
    private _queue;
    private _commandReceiver;
    private _timeToTimecodeMap;
    private _timeBase;
    private _useScheduling?;
    private _doOnTime;
    private initOptions?;
    private _connected;
    private _retryTimeout;
    private _retryTime;
    constructor(deviceId: string, deviceOptions: DeviceOptionsCasparCGInternal, options: any);
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib and
     * initializes CasparCG State library.
     */
    init(initOptions: CasparCGOptions): Promise<boolean>;
    /**
     * Terminates the device safely such that things can be garbage collected.
     */
    terminate(): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Generates an array of CasparCG commands by comparing the newState against the oldState, or the current device state.
     */
    handleState(newState: TimelineState, newMappings: Mappings): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    readonly canConnect: boolean;
    readonly connected: boolean;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: (string | {
        time: number;
        command: CommandNS.IAMCPCommand;
    })[][];
    private convertObjectToCasparState;
    /**
     * Takes a timeline state and returns a CasparCG State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToCaspar(timelineState: TimelineState, mappings: Mappings): State;
    /**
     * Prepares the physical device for playout. If amcp scheduling is used this
     * tries to sync the timecode. If {@code okToDestroyStuff === true} this clears
     * all channels and resets our states.
     * @param okToDestroyStuff Whether it is OK to restart the device
     */
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    /**
     * Attemps to restart casparcg over the HTTP API provided by CasparCG launcher.
     */
    restartCasparCG(): Promise<any>;
    getStatus(): DeviceStatus;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    private _diffStates;
    private _doCommand;
    /**
     * Clear future commands after {@code time} if they are not in {@code commandsToSendNow}.
     */
    private _clearScheduledFutureCommands;
    /**
     * Use either AMCP Command Scheduling or the doOnTime to execute commands at
     * {@code time}.
     * @param commandsToAchieveState Commands to be added to queue
     * @param time Point in time to send commands at
     */
    private _addToQueue;
    /**
     * Sends a command over a casparcg-connection instance
     * @param time deprecated
     * @param cmd Command to execute
     */
    private _defaultCommandReceiver;
    /**
     * This function takes the current timeline-state, and diffs it with the known
     * CasparCG state. If any media has failed to load, it will create a diff with
     * the intended (timeline) state and that command will be executed.
     */
    private _assertIntendedState;
    /**
     * Converts ms to timecode.
     * @param time Time to convert
     * @param channel Channel to use for timebase
     */
    private convertTimeToTimecode;
    private _connectionChanged;
}
