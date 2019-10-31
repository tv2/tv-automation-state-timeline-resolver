import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { SisfyosOptions, SisyfosState, SisyfosCommand } from '../types/src/sisyfos';
export interface SisyfosDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
export declare type CommandReceiver = (time: number, cmd: SisyfosCommand, context: CommandContext, timelineObjId: string) => Promise<any>;
declare type CommandContext = string;
/**
 * This is a generic wrapper for any osc-enabled device.
 */
export declare class SisyfosMessageDevice extends DeviceWithState<SisyfosState> {
    private _doOnTime;
    private _sisyfos;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: SisyfosDeviceOptions, options: any);
    init(options: SisfyosOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Handles a new state such that the device will be in that state at a specific point
     * in time.
     * @param newState
     */
    handleState(newState: TimelineState): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    getDeviceState(): SisyfosState;
    /**
     * Transform the timeline state into a device state, which is in this case also
     * a timeline state.
     * @param state
     */
    convertStateToSisyfosState(state: TimelineState): SisyfosState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    /**
     * add the new commands to the queue:
     * @param commandsToAchieveState
     * @param time
     */
    private _addToQueue;
    /**
     * Generates commands to transition from old to new state.
     * @param oldOscSendState The assumed current state
     * @param newOscSendState The desired state of the device
     */
    private _diffStates;
    private _defaultCommandReceiver;
    private _connectionChanged;
}
export {};
