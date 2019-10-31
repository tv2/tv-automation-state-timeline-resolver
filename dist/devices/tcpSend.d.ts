import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, TCPSendOptions, TcpSendCommandContent } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface TCPSendDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: (time: number, cmd: any) => Promise<any>;
    };
}
declare type CommandContext = string;
export declare type CommandReceiver = (time: number, cmd: TcpSendCommandContent, context: CommandContext, timelineObjId: string) => Promise<any>;
export declare class TCPSendDevice extends DeviceWithState<TimelineState> {
    private _makeReadyCommands;
    private _doOnTime;
    private _tcpClient;
    private _connected;
    private _host;
    private _port;
    private _bufferEncoding?;
    private _setDisconnected;
    private _retryConnectTimeout;
    private _commandReceiver;
    constructor(deviceId: string, deviceOptions: TCPSendDeviceOptions, options: any);
    init(options: TCPSendOptions): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    handleState(newState: TimelineState): void;
    clearFuture(clearAfterTime: number): void;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    terminate(): Promise<boolean>;
    readonly canConnect: boolean;
    readonly connected: boolean;
    convertStateToTCPSend(state: TimelineState): TimelineState;
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
    private _triggerRetryConnection;
    private _retryConnection;
    private _addToQueue;
    private _diffStates;
    private _disconnectTCPClient;
    private _connectTCPClient;
    private _sendTCPMessage;
    private _defaultCommandReceiver;
    private _connectionChanged;
}
export {};
