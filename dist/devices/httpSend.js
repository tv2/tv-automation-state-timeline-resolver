"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const request = require("request");
/**
 * This is a HTTPSendDevice, it sends http commands when it feels like it
 */
class HTTPSendDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.IN_ORDER, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'HTTPSend');
    }
    init(initOptions) {
        this._makeReadyCommands = initOptions.makeReadyCommands || [];
        return Promise.resolve(true); // This device doesn't have any initialization procedure
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
        let oldAbstractState = this.convertStateToHttpSend(oldState);
        let newAbstractState = this.convertStateToHttpSend(newState);
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
    terminate() {
        this._doOnTime.dispose();
        return Promise.resolve(true);
    }
    getStatus() {
        // Good, since this device has no status, really
        return {
            statusCode: device_1.StatusCode.GOOD
        };
    }
    makeReady(okToDestroyStuff) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (okToDestroyStuff && this._makeReadyCommands && this._makeReadyCommands.length > 0) {
                const time = this.getCurrentTime();
                _.each(this._makeReadyCommands, (cmd) => {
                    // add the new commands to the queue:
                    this._doOnTime.queue(time, cmd.queueId, (cmd) => {
                        return this._commandReceiver(time, cmd, 'makeReady', '');
                    }, cmd);
                });
            }
        });
    }
    get canConnect() {
        return false;
    }
    get connected() {
        return false;
    }
    convertStateToHttpSend(state) {
        // convert the timeline state into something we can use
        // (won't even use this.mapping)
        return state;
    }
    get deviceType() {
        return src_1.DeviceType.HTTPSEND;
    }
    get deviceName() {
        return 'HTTP-Send ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, cmd.content.queueId, (cmd) => {
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
    _diffStates(oldhttpSendState, newhttpSendState) {
        // in this httpSend class, let's just cheat:
        let commands = [];
        _.each(newhttpSendState.layers, (newLayer, layerKey) => {
            let oldLayer = oldhttpSendState.layers[layerKey];
            if (!oldLayer) {
                // added!
                commands.push({
                    timelineObjId: newLayer.id,
                    commandName: 'added',
                    content: newLayer.content,
                    context: `added: ${newLayer.id}`,
                    layer: layerKey
                });
            }
            else {
                // changed?
                if (!_.isEqual(oldLayer.content, newLayer.content)) {
                    // changed!
                    commands.push({
                        timelineObjId: newLayer.id,
                        commandName: 'changed',
                        content: newLayer.content,
                        context: `changed: ${newLayer.id} (previously: ${oldLayer.id})`,
                        layer: layerKey
                    });
                }
            }
        });
        // removed
        _.each(oldhttpSendState.layers, (oldLayer, layerKey) => {
            let newLayer = newhttpSendState.layers[layerKey];
            if (!newLayer) {
                // removed!
                commands.push({
                    timelineObjId: oldLayer.id,
                    commandName: 'removed',
                    content: oldLayer.content,
                    context: `removed: ${oldLayer.id}`,
                    layer: layerKey
                });
            }
        });
        return commands
            .sort((a, b) => a.layer.localeCompare(b.layer))
            .sort((a, b) => {
            return (a.content.temporalPriority || 0) - (b.content.temporalPriority || 0);
        });
    }
    _defaultCommandReceiver(_time, cmd, context, timelineObjId) {
        let cwc = {
            context: context,
            command: cmd,
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        return new Promise((resolve, reject) => {
            let handleResponse = (error, response) => {
                if (error) {
                    this.emit('error', `HTTPSend.response error ${cmd.type} (${context}`, error);
                    reject(error);
                }
                else if (response.statusCode === 200) {
                    this.emit('debug', `HTTPSend: ${cmd.type}: Good statuscode response on url "${cmd.url}": ${response.statusCode} (${context})`);
                    resolve();
                }
                else {
                    this.emit('warning', `HTTPSend: ${cmd.type}: Bad statuscode response on url "${cmd.url}": ${response.statusCode} (${context})`);
                    resolve();
                }
            };
            // send the http request:
            let requestMethod = request[cmd.type];
            if (requestMethod) {
                requestMethod(cmd.url, { json: cmd.params }, handleResponse);
            }
            else {
                reject(`Unknown HTTP-send type: "${cmd.type}"`);
            }
        })
            .catch(error => {
            this.emit('commandError', error, cwc);
        });
    }
}
exports.HTTPSendDevice = HTTPSendDevice;
//# sourceMappingURL=httpSend.js.map