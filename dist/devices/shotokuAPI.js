"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const net_1 = require("net");
const TIMEOUT = 3000; // ms
const RETRY_TIMEOUT = 5000; // ms
class ShotokuAPI extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this._tcpClient = null;
        this._connected = false;
        this._setDisconnected = false; // set to true if disconnect() has been called (then do not trye to reconnect)
    }
    /**
     * Connnects to the OSC server.
     * @param host ip to connect to
     * @param port port the osc server is hosted on
     */
    async connect(host, port) {
        this._host = host;
        this._port = port;
        return this._connectTCPClient();
    }
    async dispose() {
        return this._disconnectTCPClient();
    }
    get connected() {
        return this._connected;
    }
    send(command) {
        const codes = {
            [ShotokuCommandType.Fade]: 0x01,
            [ShotokuCommandType.Cut]: 0x02
        };
        let commandCode = codes[command.type];
        const show = command.show || 1;
        if (command.changeOperatorScreen)
            commandCode += 0x20;
        const cmd = [0xF9, 0x01, commandCode, 0x00, show, command.shot, 0x00, 0x00];
        cmd.push(0x40 - cmd.reduce((a, b) => a + b)); // add checksum
        return this._sendTCPMessage(Buffer.from(cmd));
    }
    _setConnected(connected) {
        if (this._connected !== connected) {
            this._connected = connected;
            if (!connected) {
                this.emit('disconnected');
                this._triggerRetryConnection();
            }
            else {
                this.emit('connected');
            }
        }
    }
    _triggerRetryConnection() {
        if (!this._retryConnectTimeout) {
            this._retryConnectTimeout = setTimeout(() => {
                this._retryConnection();
            }, RETRY_TIMEOUT);
        }
    }
    _retryConnection() {
        if (this._retryConnectTimeout) {
            clearTimeout(this._retryConnectTimeout);
            this._retryConnectTimeout = undefined;
        }
        if (!this.connected && !this._setDisconnected) {
            this._connectTCPClient()
                .catch((err) => {
                this.emit('error', 'reconnect TCP', err);
            });
        }
    }
    _disconnectTCPClient() {
        return new Promise((resolve) => {
            this._setDisconnected = true;
            if (this._tcpClient) {
                if (this.connected) {
                    this._tcpClient.once('close', () => {
                        resolve();
                    });
                    this._tcpClient.once('end', () => {
                        resolve();
                    });
                    this._tcpClient.end();
                    setTimeout(() => {
                        resolve();
                    }, TIMEOUT);
                    setTimeout(() => {
                        if (this._tcpClient && this.connected) {
                            // Forcefully destroy the connection:
                            this._tcpClient.destroy();
                        }
                    }, Math.floor(TIMEOUT / 2));
                }
                else {
                    resolve();
                }
            }
            else {
                resolve();
            }
        })
            .then(() => {
            if (this._tcpClient) {
                this._tcpClient.removeAllListeners('connect');
                this._tcpClient.removeAllListeners('close');
                this._tcpClient.removeAllListeners('end');
                this._tcpClient.removeAllListeners('error');
                this._tcpClient = null;
            }
            this._setConnected(false);
        });
    }
    _connectTCPClient() {
        this._setDisconnected = false;
        if (!this._tcpClient) {
            this._tcpClient = new net_1.Socket();
            this._tcpClient.on('connect', () => {
                this._setConnected(true);
            });
            this._tcpClient.on('close', () => {
                this._setConnected(false);
                delete this._tcpClient;
            });
            this._tcpClient.on('end', () => {
                this._setConnected(false);
                delete this._tcpClient;
            });
            this._tcpClient.on('error', (e) => {
                if (e.message.match(/econn/i)) {
                    // disconnection
                    this._setConnected(false);
                }
                else {
                    this.emit('error', e);
                }
            });
        }
        if (!this.connected) {
            return new Promise((resolve, reject) => {
                let resolved = false;
                this._tcpClient.connect(this._port, this._host, () => {
                    resolve();
                    resolved = true;
                    // client.write('Hello, server! Love, Client.');
                });
                setTimeout(() => {
                    reject(`TCP timeout: Unable to connect to ${this._host}:${this._port}`);
                    this._triggerRetryConnection();
                    if (!resolved && this._tcpClient) {
                        this._tcpClient.destroy();
                        delete this._tcpClient;
                    }
                }, TIMEOUT);
            });
        }
        else {
            return Promise.resolve();
        }
    }
    async _sendTCPMessage(message) {
        // Do we have a client?
        if (this._tcpClient) {
            this._tcpClient.write(message);
        }
        else
            throw Error('_shotokuAPI: _tcpClient is falsy!');
    }
}
exports.ShotokuAPI = ShotokuAPI;
var ShotokuCommandType;
(function (ShotokuCommandType) {
    ShotokuCommandType["Cut"] = "cut";
    ShotokuCommandType["Fade"] = "fade";
})(ShotokuCommandType = exports.ShotokuCommandType || (exports.ShotokuCommandType = {}));
//# sourceMappingURL=shotokuAPI.js.map