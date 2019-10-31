import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, TimelineContentTypeLawo, EmberValueTypes, EmberTypes } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface LawoOptions extends DeviceOptions {
    options?: {
        commandReceiver?: CommandReceiver;
        setValueFn?: SetValueFn;
        host?: string;
        port?: number;
        sourcesPath?: string;
        rampMotorFunctionPath?: string;
        dbPropertyName?: string;
        faderInterval?: number;
    };
}
export declare type CommandReceiver = (time: number, cmd: LawoCommand, context: CommandContext, timelineObjId: string) => Promise<any>;
export declare type SetValueFn = (command: LawoCommand, timelineObjId: string, valueType?: EmberTypes) => Promise<any>;
export interface LawoState {
    nodes: {
        [path: string]: LawoStateNode;
    };
    triggerValue?: string;
}
export interface LawoStateNode {
    type: TimelineContentTypeLawo;
    value: EmberValueTypes;
    valueType: EmberTypes;
    key: string;
    identifier: string;
    transitionDuration?: number;
    priority: number;
    /** Reference to the original timeline object: */
    timelineObjId: string;
}
export interface LawoCommand {
    path: string;
    value: EmberValueTypes;
    valueType: EmberTypes;
    key: string;
    identifier: string;
    type: TimelineContentTypeLawo;
    transitionDuration?: number;
    from?: EmberValueTypes;
    priority: number;
}
export interface LawoCommandWithContext {
    cmd: LawoCommand;
    context: CommandContext;
    timelineObjId: string;
}
declare type CommandContext = string;
/**
 * This is a wrapper for a Lawo sound mixer
 *
 * It controls mutes and fades over Ember Plus.
 */
export declare class LawoDevice extends DeviceWithState<TimelineState> {
    private _doOnTime;
    private _lawo;
    private _savedNodes;
    private _lastSentValue;
    private _connected;
    private _commandReceiver;
    private _sourcesPath;
    private _rampMotorFunctionPath;
    private _dbPropertyName;
    private _setValueFn;
    private _faderIntervalTime;
    private transitions;
    private transitionInterval;
    constructor(deviceId: string, deviceOptions: LawoOptions, options: any);
    /**
     * Initiates the connection with Lawo
     */
    init(): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Handles a state such that the device will reflect that state at the given time.
     * @param newState
     */
    handleState(newState: TimelineState): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    /**
     * Safely disconnect from physical device such that this instance of the class
     * can be garbage collected.
     */
    terminate(): Promise<boolean>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    /**
     * Converts a timeline state into a device state.
     * @param state
     */
    convertStateToLawo(state: TimelineState): LawoState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    getStatus(): DeviceStatus;
    private _setConnected;
    private _addToQueue;
    /**
     * Generates commands to transition from one device state to another.
     * @param oldLawoState The assumed device state
     * @param newLawoState The desired device state
     */
    private _diffStates;
    /**
     * Gets an ember node based on its path
     * @param path
     */
    private _getNodeByPath;
    /**
     * Returns an attribute path
     * @param identifier
     * @param attributePath
     */
    private _sourceNodeAttributePath;
    private _defaultCommandReceiver;
    private setValueWrapper;
    private _connectionChanged;
    private runAnimation;
}
export {};
