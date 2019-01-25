"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const request = require("request");
class HttpSendDevice extends device_1.DeviceWithState {
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
        });
        this._doOnTime.on('error', e => this.emit('error', e));
    }
    init(options) {
        this._makeReadyCommands = options.makeReadyCommands || [];
        return Promise.resolve(true); // This device doesn't have any initialization procedure
    }
    handleState(newState) {
        // Handle this new state, at the point in time specified
        // console.log('handleState')
        let oldState = (this.getStateBefore(newState.time) || { state: { time: 0, LLayers: {}, GLayers: {} } }).state;
        let oldAbstractState = this.convertStateToHttpSend(oldState);
        let newAbstractState = this.convertStateToHttpSend(newState);
        let commandsToAchieveState = this._diffStates(oldAbstractState, newAbstractState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newState.time);
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
        if (okToDestroyStuff && this._makeReadyCommands && this._makeReadyCommands.length > 0) {
            const time = this.getCurrentTime();
            _.each(this._makeReadyCommands, (cmd) => {
                // add the new commands to the queue:
                this._doOnTime.queue(time, (cmd) => {
                    return this._commandReceiver(time, cmd, 'makeReady');
                }, cmd);
            });
        }
        return Promise.resolve();
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
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                if (cmd.commandName === 'added' ||
                    cmd.commandName === 'changed') {
                    return this._commandReceiver(time, cmd.content, cmd.context);
                }
                else {
                    return null;
                }
            }, cmd);
        });
    }
    _diffStates(oldhttpSendState, newhttpSendState) {
        // in this httpSend class, let's just cheat:
        let commands = [];
        _.each(newhttpSendState.LLayers, (newLayer, layerKey) => {
            let oldLayer = oldhttpSendState.LLayers[layerKey];
            if (!oldLayer) {
                // added!
                commands.push({
                    commandName: 'added',
                    content: newLayer.content,
                    context: `added: ${newLayer.id}`
                });
            }
            else {
                // changed?
                if (!_.isEqual(oldLayer.content, newLayer.content)) {
                    // changed!
                    commands.push({
                        commandName: 'changed',
                        content: newLayer.content,
                        context: `changed: ${newLayer.id}`
                    });
                }
            }
        });
        // removed
        _.each(oldhttpSendState.LLayers, (oldLayer, layerKey) => {
            let newLayer = newhttpSendState.LLayers[layerKey];
            if (!newLayer) {
                // removed!
                commands.push({
                    commandName: 'removed',
                    content: oldLayer.content,
                    context: `removed: ${oldLayer.id}`
                });
            }
        });
        return commands;
    }
    _defaultCommandReceiver(time, cmd, context) {
        time = time;
        // this.emit('info', 'HTTP: Send ', cmd)
        let cwc = {
            context: context,
            command: cmd
        };
        this.emit('debug', cwc);
        return new Promise((resolve, reject) => {
            let handleResponse = (error, response) => {
                if (error) {
                    this.emit('error', `HTTPSend: Error ${cmd.type}`, error);
                    reject(error);
                }
                else if (response.statusCode === 200) {
                    // console.log('200 Response from ' + cmd.url, body)
                    this.emit('debug', `HTTPSend: ${cmd.type}: Good statuscode response on url "${cmd.url}": ${response.statusCode}`);
                    resolve();
                }
                else {
                    this.emit('warning', `HTTPSend: ${cmd.type}: Bad statuscode response on url "${cmd.url}": ${response.statusCode}`);
                    // console.log(response.statusCode + ' Response from ' + cmd.url, body)
                    resolve();
                }
            };
            if (cmd.type === src_1.TimelineContentTypeHttp.POST) {
                request.post(cmd.url, { json: cmd.params }, handleResponse);
            }
            else if (cmd.type === src_1.TimelineContentTypeHttp.PUT) {
                request.put(cmd.url, { json: cmd.params }, handleResponse);
            }
            else if (cmd.type === src_1.TimelineContentTypeHttp.GET) {
                request.get(cmd.url, { json: cmd.params }, handleResponse);
            }
            else if (cmd.type === src_1.TimelineContentTypeHttp.DELETE) {
                request.delete(cmd.url, { json: cmd.params }, handleResponse);
            }
            else {
                reject(`Unknown HTTP-send type: "${cmd.type}"`);
            }
        });
    }
}
exports.HttpSendDevice = HttpSendDevice;
//# sourceMappingURL=httpSend.js.map