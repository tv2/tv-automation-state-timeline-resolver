import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, TimelineContentTypePanasonicPtz, PanasonicPTZOptions, DeviceOptionsPanasonicPTZ } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface DeviceOptionsPanasonicPTZInternal extends DeviceOptionsPanasonicPTZ {
    options: (DeviceOptionsPanasonicPTZ['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: PanasonicPtzCommand, context: CommandContext, timelineObjId: string) => Promise<any>;
export interface PanasonicPtzState {
    speed?: {
        value: number;
        timelineObjId: string;
    };
    preset?: {
        value: number;
        timelineObjId: string;
    };
    zoomSpeed?: {
        value: number;
        timelineObjId: string;
    };
    zoom?: {
        value: number;
        timelineObjId: string;
    };
}
export interface PanasonicPtzCommand {
    type: TimelineContentTypePanasonicPtz;
    speed?: number;
    preset?: number;
    zoomSpeed?: number;
    zoom?: number;
}
export interface PanasonicPtzCommandWithContext {
    command: PanasonicPtzCommand;
    context: CommandContext;
    timelineObjId: string;
}
declare type CommandContext = any;
/**
 * A wrapper for panasonic ptz cameras. Maps timeline states to device states and
 * executes commands to achieve such states. Depends on PanasonicPTZAPI class for
 * connection with the physical device.
 */
export declare class PanasonicPtzDevice extends DeviceWithState<TimelineState> implements IDevice {
    private _doOnTime;
    private _device;
    private _connected;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: DeviceOptionsPanasonicPTZInternal, options: any);
    /**
     * Initiates the device: set up ping for connection logic.
     */
    init(_initOptions: PanasonicPTZOptions): Promise<boolean>;
    /**
     * Converts a timeline state into a device state.
     * @param state
     */
    convertStateToPtz(state: TimelineState): PanasonicPtzState;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Handles a new state such that the device will be in that state at a specific point
     * in time.
     * @param newState
     */
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    private _getDefaultState;
    private _defaultCommandReceiver;
    /**
     * Queues an array of commands to be executed at `time`
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
    get canConnect(): boolean;
    get connected(): boolean;
    get deviceType(): DeviceType;
    get deviceName(): string;
    get queue(): {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    private _setConnected;
    private _connectionChanged;
    private getValue;
}
export {};
