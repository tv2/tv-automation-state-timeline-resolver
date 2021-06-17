/// <reference types="node" />
import { EventEmitter } from 'events';
export declare class ShotokuAPI extends EventEmitter {
    private _tcpClient;
    private _connected;
    private _host;
    private _port;
    private _setDisconnected;
    private _retryConnectTimeout;
    /**
     * Connnects to the OSC server.
     * @param host ip to connect to
     * @param port port the osc server is hosted on
     */
    connect(host: string, port: number): Promise<void>;
    dispose(): Promise<void>;
    get connected(): boolean;
    send(command: ShotokuCommand): Promise<void>;
    private _setConnected;
    private _triggerRetryConnection;
    private _retryConnection;
    private _disconnectTCPClient;
    private _connectTCPClient;
    private _sendTCPMessage;
}
export interface ShotokuCommand {
    type: ShotokuCommandType;
    show?: number;
    shot: number;
    changeOperatorScreen?: boolean;
}
export declare enum ShotokuCommandType {
    Cut = "cut",
    Fade = "fade"
}
