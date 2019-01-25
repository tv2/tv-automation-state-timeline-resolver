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
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToAbstract(state: TimelineState): TimelineState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        time: number;
    }[];
    getStatus(): DeviceStatus;
    private _addToQueue;
    private _diffStates;
    private _defaultCommandReceiver;
}
export {};
