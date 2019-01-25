import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, Mappings, TimelineContentTypePanasonicPtz } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface PanasonicPtzOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
        host?: string;
        port?: number;
        https?: boolean;
    };
}
export interface PanasonicPtzState {
    speed: number | undefined;
    preset: number | undefined;
    zoomSpeed: number | undefined;
    zoom: number | undefined;
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
}
declare type CommandContext = any;
export declare class PanasonicPtzDevice extends DeviceWithState<TimelineState> {
    private _doOnTime;
    private _device;
    private _connected;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: PanasonicPtzOptions, options: any);
    init(): Promise<boolean>;
    convertStateToPtz(state: TimelineState): PanasonicPtzState;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    private _getDefaultState;
    private _defaultCommandReceiver;
    private _addToQueue;
    private _diffStates;
    readonly canConnect: boolean;
    readonly connected: boolean;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        time: number;
    }[];
    mapping: Mappings;
    private _setConnected;
    private _connectionChanged;
}
export {};
