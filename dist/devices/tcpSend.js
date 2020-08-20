"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const net_1 = require("net");
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const TIMEOUT = 3000; // ms
const RETRY_TIMEOUT = 5000; // ms
/**
 * This is a TCPSendDevice, it sends commands over tcp when it feels like it
 */
class TCPSendDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._tcpClient = null;
        this._connected = false;
        this._setDisconnected = false; // set to true if disconnect() has been called (then do not trye to reconnect)
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.IN_ORDER, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'TCPSend');
    }
    init(initOptions) {
        this._makeReadyCommands = initOptions.makeReadyCommands || [];
        this._makeReadyDoesReset = initOptions.makeReadyDoesReset || false;
        this._host = initOptions.host;
        this._port = initOptions.port;
        this._bufferEncoding = initOptions.bufferEncoding;
        return this._connectTCPClient()
            .then(() => {
            return true;
        });
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    handleState(newState) {
        // Handle this new state, at the point in time specified
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: { time: 0, layers: {}, nextEvents: [] } }).state;
        let oldAbstractState = this.convertStateToTCPSend(oldState);
        let newAbstractState = this.convertStateToTCPSend(newState);
        let commandsToAchieveState = this._diffStates(oldAbstractState, newAbstractState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newState, newState.time);
    }
    clearFuture(clearAfterTime) {
        // Clear any scheduled commands after this time
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    async makeReady(okToDestroyStuff) {
        if (okToDestroyStuff) {
            await this._disconnectTCPClient();
            await this._connectTCPClient();
            const time = this.getCurrentTime();
            if (this._makeReadyDoesReset) {
                this.clearStates();
                this._doOnTime.clearQueueAfter(0);
            }
            for (const cmd of this._makeReadyCommands || []) {
                await this._commandReceiver(time, cmd, 'makeReady', '');
            }
        }
    }
    async terminate() {
        this._doOnTime.dispose();
        clearTimeout(this._retryConnectTimeout);
        await this._disconnectTCPClient();
        return true;
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._connected;
    }
    convertStateToTCPSend(state) {
        // convert the timeline state into something we can use
        // (won't even use this.mapping)
        return state;
    }
    get deviceType() {
        return src_1.DeviceType.TCPSEND;
    }
    get deviceName() {
        return 'TCP-Send ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    getStatus() {
        return {
            statusCode: this._connected ? device_1.StatusCode.GOOD : device_1.StatusCode.BAD,
            active: this.isActive
        };
    }
    _setConnected(connected) {
        if (this._connected !== connected) {
            this._connected = connected;
            this._connectionChanged();
            if (!connected) {
                this._triggerRetryConnection();
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
        clearTimeout(this._retryConnectTimeout);
        if (!this.connected && !this._setDisconnected) {
            this._connectTCPClient()
                .catch((err) => {
                this.emit('error', 'reconnect TCP', err);
            });
        }
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                if (cmd.commandName === 'added' ||
                    cmd.commandName === 'changed') {
                    return this._commandReceiver(time, cmd.content, cmd.context, cmd.timelineObjId);
                }
                else {
                    return null;
                }
            }, cmd);
        });
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    _diffStates(oldTCPSendState, newTCPSendState) {
        // in this TCPSend class, let's just cheat:
        let commands = [];
        _.each(newTCPSendState.layers, (newLayer, layerKey) => {
            let oldLayer = oldTCPSendState.layers[layerKey];
            // added/changed
            if (newLayer.content) {
                if (!oldLayer) {
                    // added!
                    commands.push({
                        commandName: 'added',
                        content: newLayer.content,
                        context: `added: ${newLayer.id}`,
                        timelineObjId: newLayer.id
                    });
                }
                else {
                    // changed?
                    if (!_.isEqual(oldLayer.content, newLayer.content)) {
                        // changed!
                        commands.push({
                            commandName: 'changed',
                            content: newLayer.content,
                            context: `changed: ${newLayer.id}`,
                            timelineObjId: newLayer.id
                        });
                    }
                }
            }
        });
        // removed
        _.each(oldTCPSendState.layers, (oldLayer, layerKey) => {
            let newLayer = newTCPSendState.layers[layerKey];
            if (!newLayer) {
                // removed!
                commands.push({
                    commandName: 'removed',
                    content: oldLayer.content,
                    context: `removed: ${oldLayer.id}`,
                    timelineObjId: oldLayer.id
                });
            }
        });
        return commands
            .sort((a, b) => {
            return (a.content.temporalPriority || 0) - (b.content.temporalPriority || 0);
        });
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
            });
            this._tcpClient.on('end', () => {
                this._setConnected(false);
            });
        }
        if (!this.connected) {
            return new Promise((resolve, reject) => {
                this._tcpClient.connect(this._port, this._host, () => {
                    resolve();
                    // client.write('Hello, server! Love, Client.');
                });
                setTimeout(() => {
                    reject(`TCP timeout: Unable to connect to ${this._host}:${this._port}`);
                }, TIMEOUT);
            });
        }
        else {
            return Promise.resolve();
        }
    }
    _sendTCPMessage(message) {
        // Do we have a client?
        return this._connectTCPClient()
            .then(() => {
            if (this._tcpClient) {
                this._tcpClient.write(Buffer.from(message, this._bufferEncoding));
            }
            else
                throw Error('_sendTCPMessage: _tcpClient is falsy!');
        });
    }
    _defaultCommandReceiver(_time, cmd, context, timelineObjId) {
        // this.emit('info', 'TCTSend ', cmd)
        let cwc = {
            context: context,
            command: cmd,
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        if (cmd.message) {
            return this._sendTCPMessage(cmd.message);
        }
        else {
            return Promise.reject('tcpCommand.message not set');
        }
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.TCPSendDevice = TCPSendDevice;
//# sourceMappingURL=tcpSend.js.map