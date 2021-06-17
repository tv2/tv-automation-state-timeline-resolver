import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, HTTPSendOptions, HTTPSendCommandContent, DeviceOptionsHTTPSend, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface DeviceOptionsHTTPSendInternal extends DeviceOptionsHTTPSend {
    options: (DeviceOptionsHTTPSend['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: HTTPSendCommandContent, context: CommandContext, timelineObjId: string) => Promise<any>;
declare type CommandContext = string;
declare type HTTPSendState = TimelineState;
/**
 * This is a HTTPSendDevice, it sends http commands when it feels like it
 */
export declare class HTTPSendDevice extends DeviceWithState<HTTPSendState> implements IDevice {
    private _makeReadyCommands;
    private _makeReadyDoesReset;
    private _doOnTime;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: DeviceOptionsHTTPSendInternal, options: any);
    init(initOptions: HTTPSendOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    handleState(newState: TimelineState, newMappings: Mappings): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    get canConnect(): boolean;
    get connected(): boolean;
    convertStateToHttpSend(state: TimelineState): TimelineState;
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
     */
    private _diffStates;
    private _defaultCommandReceiver;
}
export {};
