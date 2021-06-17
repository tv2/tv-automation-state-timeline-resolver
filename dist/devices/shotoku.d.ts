import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, ShotokuCommandContent, ShotokuOptions, DeviceOptionsShotoku, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { ShotokuCommand } from './shotokuAPI';
export interface DeviceOptionsShotokuInternal extends DeviceOptionsShotoku {
    options: (DeviceOptionsShotoku['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: ShotokuCommand, context: CommandContext, timelineObjId: string) => Promise<any>;
declare type CommandContext = string;
declare type ShotokuDeviceState = {
    [index: string]: ShotokuCommandContent & {
        fromTlObject: string;
    };
};
/**
 * This is a generic wrapper for any osc-enabled device.
 */
export declare class ShotokuDevice extends DeviceWithState<TimelineState> implements IDevice {
    private _doOnTime;
    private _shotoku;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: DeviceOptionsShotokuInternal, options: any);
    init(initOptions: ShotokuOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Handles a new state such that the device will be in that state at a specific point
     * in time.
     * @param newState
     */
    handleState(newState: TimelineState, newMappings: Mappings): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(_okToDestroyStuff?: boolean): Promise<void>;
    get canConnect(): boolean;
    get connected(): boolean;
    /**
     * Transform the timeline state into a device state, which is in this case also
     * a timeline state.
     * @param state
     */
    convertStateToShotokuShots(state: TimelineState): ShotokuDeviceState;
    get deviceType(): DeviceType;
    get deviceName(): string;
    get queue(): {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    /**
     * Add commands to queue, to be executed at the right time
     */
    private _addToQueue;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     * @param oldShots The assumed current state
     * @param newShots The desired state of the device
     */
    private _diffStates;
    private _defaultCommandReceiver;
}
export {};
