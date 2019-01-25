import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, Mappings, TimelineContentTypeLawo } from '../types/src';
import { TimelineState, TimelineResolvedObject } from 'superfly-timeline';
export interface LawoOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
        host?: string;
        port?: number;
        sourcesPath?: string;
        rampMotorFunctionPath?: string;
    };
}
export interface TimelineObjLawo extends TimelineResolvedObject {
    content: {
        type: TimelineContentTypeLawo;
        attributes: {
            [key: string]: {
                [attr: string]: any;
                triggerValue: string;
            };
        };
    };
}
export interface TimelineObjLawoSource extends TimelineObjLawo {
    content: {
        type: TimelineContentTypeLawo;
        attributes: {
            'Fader/Motor dB Value': {
                value: number;
                transitionDuration?: number;
                triggerValue: string;
            };
        };
    };
}
export declare type EmberPlusValue = boolean | number | string;
export interface LawoState {
    [path: string]: LawoStateNode;
}
export interface LawoStateNode {
    type: TimelineContentTypeLawo;
    value: EmberPlusValue;
    key: string;
    identifier: string;
    transitionDuration?: number;
    triggerValue: string;
}
export interface LawoCommand {
    path: string;
    value: EmberPlusValue;
    key: string;
    identifier: string;
    type: TimelineContentTypeLawo;
    transitionDuration?: number;
}
export interface LawoCommandWithContext {
    cmd: LawoCommand;
    context: CommandContext;
}
declare type CommandContext = string;
export declare class LawoDevice extends DeviceWithState<TimelineState> {
    private _doOnTime;
    private _lawo;
    private _savedNodes;
    private _connected;
    private _commandReceiver;
    private _sourcesPath;
    private _rampMotorFunctionPath;
    constructor(deviceId: string, deviceOptions: LawoOptions, options: any);
    /**
     * Initiates the connection with Lawo
     */
    init(): Promise<boolean>;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToLawo(state: TimelineState): LawoState;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        time: number;
    }[];
    mapping: Mappings;
    getStatus(): DeviceStatus;
    private _setConnected;
    private _addToQueue;
    private _diffStates;
    private _getNodeByPath;
    private _sourceNodeAttributePath;
    private _defaultCommandReceiver;
    private _connectionChanged;
}
export {};
