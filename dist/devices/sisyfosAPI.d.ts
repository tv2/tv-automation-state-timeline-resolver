/// <reference types="node" />
import { SisyfosCommand, SisyfosAPIState } from '../types/src/sisyfos';
import { EventEmitter } from 'events';
export declare class SisyfosInterface extends EventEmitter {
    host: string;
    port: number;
    private _oscClient;
    private _state;
    private _connectivityCheckInterval;
    private _pingCounter;
    private _connectivityTimeout;
    private _connected;
    /**
     * Connnects to the OSC server.
     * @param host ip to connect to
     * @param port port the osc server is hosted on
     */
    connect(host: string, port: number): Promise<void>;
    dispose(): void;
    send(command: SisyfosCommand): void;
    disconnect(): void;
    isInitialized(): boolean;
    readonly connected: boolean;
    readonly state: SisyfosAPIState;
    private _monitorConnectivity;
    private receiver;
    private updateIsConnected;
    private parseChannelCommand;
}
