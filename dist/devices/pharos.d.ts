import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, PharosOptions, TimelineObjPharos, DeviceOptionsPharos, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface DeviceOptionsPharosInternal extends DeviceOptionsPharos {
    options: (DeviceOptionsPharos['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: Command, context: CommandContext, timelineObjId: string) => Promise<any>;
export interface Command {
    content: CommandContent;
    context: CommandContext;
    timelineObjId: string;
}
export interface PharosState extends TimelineState {
    Layers: {
        [Layer: string]: TimelineObjPharos;
    };
}
interface CommandContent {
    fcn: (...args: any[]) => Promise<any>;
    args: any[];
}
declare type CommandContext = string;
/**
 * This is a wrapper for a Pharos-devices,
 * https://www.pharoscontrols.com/downloads/documentation/application-notes/
 */
export declare class PharosDevice extends DeviceWithState<PharosState> implements IDevice {
    private _doOnTime;
    private _pharos;
    private _pharosProjectInfo?;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: DeviceOptionsPharosInternal, options: any);
    /**
     * Initiates the connection with Pharos through the PharosAPI.
     */
    init(initOptions: PharosOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Handles a new state such that the device will be in that state at a specific point
     * in time.
     * @param newState
     */
    handleState(newState: TimelineState, newMappings: Mappings): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToPharos(state: TimelineState): PharosState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    getStatus(): DeviceStatus;
    /**
     * Add commands to queue, to be executed at the right time
     */
    private _addToQueue;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    private _diffStates;
    private _defaultCommandReceiver;
    private _connectionChanged;
}
export {};
