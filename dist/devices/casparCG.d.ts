import { DeviceWithState, DeviceStatus } from './device';
import { Command as CommandNS } from 'casparcg-connection';
import { DeviceType, DeviceOptions, CasparCGOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { CasparCG as StateNS } from 'casparcg-state';
import { Conductor } from '../conductor';
export interface CasparCGDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: CommandNS.IAMCPCommand) => Promise<any>;
        timeBase?: {
            [channel: string]: number;
        } | number;
    };
}
export declare class CasparCGDevice extends DeviceWithState<TimelineState> {
    private _ccg;
    private _conductor;
    private _ccgState;
    private _queue;
    private _commandReceiver;
    private _timeToTimecodeMap;
    private _timeBase;
    private _useScheduling?;
    private _doOnTime;
    private _connectionOptions?;
    private _connected;
    constructor(deviceId: string, deviceOptions: CasparCGDeviceOptions, options: any, conductor: Conductor);
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(connectionOptions: CasparCGOptions): Promise<boolean>;
    terminate(): Promise<boolean>;
    /**
     * Generates an array of CasparCG commands by comparing the newState against the oldState, or the current device state.
     */
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    readonly canConnect: boolean;
    readonly connected: boolean;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: (string | {
        time: number;
        command: CommandNS.IAMCPCommand;
    })[][];
    /**
     * Takes a timeline state and returns a CasparCG State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToCaspar(timelineState: TimelineState): StateNS.State;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    restartCasparCG(): Promise<any>;
    getStatus(): DeviceStatus;
    private _diffStates;
    private _doCommand;
    private _clearScheduledFutureCommands;
    private _addToQueue;
    private _defaultCommandReceiver;
    private convertTimeToTimecode;
    private _connectionChanged;
}
