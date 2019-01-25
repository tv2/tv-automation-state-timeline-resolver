import { TimelineState } from 'superfly-timeline';
import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, HyperdeckOptions } from '../types/src';
import { Commands as HyperdeckCommands, TransportStatus } from 'hyperdeck-connection';
import { Conductor } from '../conductor';
/**
 * This is a wrapper for the Hyperdeck Device. Commands to any and all hyperdeck devices will be sent through here.
 */
export interface HyperdeckDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export interface HyperdeckCommandWithContext {
    command: HyperdeckCommands.AbstractCommand;
    context: CommandContext;
}
export interface TransportInfoCommandResponseExt {
    status: TransportStatus;
    recordFilename?: string;
}
export interface DeviceState {
    notify: HyperdeckCommands.NotifyCommandResponse;
    transport: TransportInfoCommandResponseExt;
}
declare type CommandContext = any;
export declare class HyperdeckDevice extends DeviceWithState<DeviceState> {
    private _doOnTime;
    private _hyperdeck;
    private _initialized;
    private _connected;
    private _conductor;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: HyperdeckDeviceOptions, options: any, conductor: Conductor);
    /**
     * Initiates the connection with the Hyperdeck through the hyperdeck-connection lib.
     */
    init(options: HyperdeckOptions): Promise<boolean>;
    terminate(): Promise<boolean>;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToHyperdeck(state: TimelineState): DeviceState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        time: number;
    }[];
    getStatus(): DeviceStatus;
    private _addToQueue;
    private _diffStates;
    private _queryCurrentState;
    private _getDefaultState;
    private _defaultCommandReceiver;
    private _connectionChanged;
}
export {};
