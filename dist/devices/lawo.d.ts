import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, TimelineContentTypeLawo, DeviceOptionsLawo, LawoCommand, LawoOptions, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { Types as EmberTypes, Model as EmberModel } from 'emberplus-connection';
export interface DeviceOptionsLawoInternal extends DeviceOptionsLawo {
    options: (DeviceOptionsLawo['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: LawoCommand, context: CommandContext, timelineObjId: string) => Promise<any>;
export interface LawoState {
    nodes: {
        [path: string]: LawoStateNode;
    };
    triggerValue?: string;
}
export interface LawoStateNode {
    type: TimelineContentTypeLawo;
    value: EmberTypes.EmberValue;
    valueType: EmberModel.ParameterType;
    key: string;
    identifier: string;
    transitionDuration?: number;
    priority: number;
    /** Reference to the original timeline object: */
    timelineObjId: string;
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
export declare class LawoDevice extends DeviceWithState<LawoState> implements IDevice {
    private _doOnTime;
    private _lawo;
    private _lastSentValue;
    private _connected;
    private _initialized;
    private _commandReceiver;
    private _sourcesPath;
    private _rampMotorFunctionPath;
    private _dbPropertyName;
    private _setValueFn;
    private _faderIntervalTime;
    private _faderThreshold;
    private _sourceNamePath;
    private _sourceNameToNodeName;
    private transitions;
    private transitionInterval;
    constructor(deviceId: string, deviceOptions: DeviceOptionsLawoInternal, options: any);
    /**
     * Initiates the connection with Lawo
     */
    init(_initOptions: LawoOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Handles a state such that the device will reflect that state at the given time.
     * @param newState
     */
    handleState(newState: TimelineState, newMappings: Mappings): void;
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
    get canConnect(): boolean;
    get connected(): boolean;
    /**
     * Converts a timeline state into a device state.
     * @param state
     */
    convertStateToLawo(state: TimelineState, mappings: Mappings): LawoState;
    get deviceType(): DeviceType;
    get deviceName(): string;
    get queue(): {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    getStatus(): DeviceStatus;
    private _setConnected;
    /**
     * Add commands to queue, to be executed at the right time
     */
    private _addToQueue;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     * @param oldLawoState The assumed device state
     * @param newLawoState The desired device state
     */
    private _diffStates;
    /**
     * Gets an ember node based on its path
     * @param path
     */
    private _getNodeByPath;
    private _identifierToNodeName;
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
    private _mapSourcesToNodeNames;
}
export {};
