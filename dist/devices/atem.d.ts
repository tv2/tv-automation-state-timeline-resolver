import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, AtemOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { Commands as AtemCommands } from 'atem-connection';
import { State as DeviceState } from 'atem-state';
import { Conductor } from '../conductor';
/**
 * This is a wrapper for the Atem Device. Commands to any and all atem devices will be sent through here.
 */
export interface AtemDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export interface AtemCommandWithContext {
    command: AtemCommands.AbstractCommand;
    context: CommandContext;
}
declare type CommandContext = any;
export declare class AtemDevice extends DeviceWithState<DeviceState> {
    private _doOnTime;
    private _atem;
    private _state;
    private _initialized;
    private _connected;
    private _conductor;
    private firstStateAfterMakeReady;
    private _atemStatus;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: AtemDeviceOptions, options: any, conductor: Conductor);
    /**
     * Initiates the connection with the ATEM through the atem-connection lib.
     */
    init(options: AtemOptions): Promise<boolean>;
    terminate(): Promise<boolean>;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToAtem(state: TimelineState): DeviceState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        time: number;
    }[];
    getStatus(): DeviceStatus;
    private _addToQueue;
    private _diffStates;
    private _getDefaultState;
    private _defaultCommandReceiver;
    private _onAtemStateChanged;
    private _connectionChanged;
}
export {};
