import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, TCPSendOptions, TcpSendCommandContent, DeviceOptionsTCPSend } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export interface DeviceOptionsTCPSendInternal extends DeviceOptionsTCPSend {
    options: (DeviceOptionsTCPSend['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: TcpSendCommandContent, context: CommandContext, timelineObjId: string) => Promise<any>;
declare type CommandContext = string;
/**
 * This is a TCPSendDevice, it sends commands over tcp when it feels like it
 */
export declare class TCPSendDevice extends DeviceWithState<TimelineState> implements IDevice {
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
    constructor(deviceId: string, deviceOptions: DeviceOptionsTCPSendInternal, options: any);
    init(initOptions: TCPSendOptions): Promise<boolean>;
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
