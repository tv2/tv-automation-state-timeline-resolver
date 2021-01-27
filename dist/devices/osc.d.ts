import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, OSCMessageCommandContent, OSCOptions, DeviceOptionsOSC, Mappings } from '../types/src';
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
export declare class OSCMessageDevice extends DeviceWithState<OSCDeviceState> implements IDevice {
    private _doOnTime;
    private _oscClient;
    private _oscClientStatus;
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
    handleState(newState: TimelineState, newMappings: Mappings): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(_okToDestroyStuff?: boolean): Promise<void>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    /**
     * Transform the timeline state into a device state, which is in this case also
     * a timeline state.
     * @param state
     */
    convertStateToOSCMessage(state: TimelineState): OSCDeviceState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
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
     * @param oldOscSendState The assumed current state
     * @param newOscSendState The desired state of the device
     */
    private _diffStates;
    private _defaultCommandReceiver;
    private _defaultOscSender;
    private runAnimation;
}
export {};
