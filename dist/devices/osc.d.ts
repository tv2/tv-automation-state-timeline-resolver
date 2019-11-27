import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, OSCMessageCommandContent, OSCOptions, DeviceOptionsOSC } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import * as osc from 'osc';
export interface DeviceOptionsOSCInternal extends DeviceOptionsOSC {
    options: (DeviceOptionsOSC['options'] & {
        commandReceiver?: CommandReceiver;
        oscSender?: (msg: osc.OscMessage, address?: string | undefined, port?: number | undefined) => void;
    });
}
export declare type CommandReceiver = (time: number, cmd: OSCMessageCommandContent, context: CommandContext, timelineObjId: string) => Promise<any>;
declare type CommandContext = string;
interface OSCDeviceState {
    [address: string]: OSCDeviceStateContent;
}
interface OSCDeviceStateContent extends OSCMessageCommandContent {
    fromTlObject: string;
}
/**
 * This is a generic wrapper for any osc-enabled device.
 */
export declare class OSCMessageDevice extends DeviceWithState<TimelineState> implements IDevice {
    private _doOnTime;
    private _oscClient;
    private transitions;
    private transitionInterval;
    private _commandReceiver;
    private _oscSender;
    constructor(deviceId: string, deviceOptions: DeviceOptionsOSCInternal, options: any);
    init(initOptions: OSCOptions): Promise<boolean>;
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
    makeReady(_okToDestroyStuff?: boolean): Promise<void>;
    get canConnect(): boolean;
    get connected(): boolean;
    /**
     * Transform the timeline state into a device state, which is in this case also
     * a timeline state.
     * @param state
     */
    convertStateToOSCMessage(state: TimelineState): OSCDeviceState;
    get deviceType(): DeviceType;
    get deviceName(): string;
    get queue(): {
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
    private _defaultOscSender;
    private runAnimation;
}
export {};
