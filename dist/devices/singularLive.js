"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const request = require("request");
const SINGULAR_LIVE_API = 'https://app.singular.live/apiv1/control/';
/**
 * This is a Singular.Live device, it talks to a Singular.Live App Instance using an Access Token
 */
class SingularLiveDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._deviceStatus = {
            statusCode: device_1.StatusCode.GOOD
        };
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.IN_ORDER, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'SingularLive');
    }
    init(options) {
        // this._makeReadyCommands = options.makeReadyCommands || []
        this._accessToken = options.accessToken || '';
        if (!this._accessToken)
            throw new Error('Singular.Live bad connection option: accessToken. An accessToken is required.');
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
        let oldAbstractState = this.convertStateToSingularLive(oldState);
        let newAbstractState = this.convertStateToSingularLive(newState);
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
        return this._deviceStatus;
    }
    makeReady(_okToDestroyStuff) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            // if (okToDestroyStuff && this._makeReadyCommands && this._makeReadyCommands.length > 0) {
            // 	const time = this.getCurrentTime()
            // 	_.each(this._makeReadyCommands, (cmd: SingularLiveCommandContent) => {
            // 		// add the new commands to the queue:
            // 		this._doOnTime.queue(time, undefined, (cmd: SingularLiveCommandContent) => {
            // 			return this._commandReceiver(time, cmd, 'makeReady', '')
            // 		}, cmd)
            // 	})
            // }
        });
    }
    get canConnect() {
        return false;
    }
    get connected() {
        return false;
    }
    _getDefaultState() {
        return {
            compositions: {}
        };
    }
    convertStateToSingularLive(state) {
        // convert the timeline state into something we can use
        // (won't even use this.mapping)
        const singularState = this._getDefaultState();
        _.each(state.layers, (tlObject, layerName) => {
            const mapping = this.getMapping()[layerName];
            if (mapping && mapping.device === src_1.DeviceType.SINGULAR_LIVE) {
                let tlObjectSource = tlObject;
                if (tlObjectSource.content.type === src_1.TimelineContentTypeSingularLive.COMPOSITION) {
                    singularState.compositions[mapping.compositionName] = Object.assign(singularState.compositions[mapping.compositionName] || {}, {
                        timelineObjId: tlObject.id,
                        controlNode: tlObjectSource.content.controlNode
                    });
                }
            }
        });
        return singularState;
    }
    get deviceType() {
        return src_1.DeviceType.SINGULAR_LIVE;
    }
    get deviceName() {
        return 'Singular.Live ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd.content, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    _diffStates(oldSingularLiveState, newSingularLiveState) {
        let commands = [];
        _.each(newSingularLiveState.compositions, (composition, compositionName) => {
            let oldComposition = oldSingularLiveState.compositions[compositionName];
            if (!oldComposition) {
                // added!
                commands.push({
                    timelineObjId: composition.timelineObjId,
                    commandName: 'added',
                    content: device_1.literal({
                        compositionName: compositionName,
                        animation: {
                            action: composition.animation.action,
                            to: 'In'
                        }
                    }),
                    context: `added: ${composition.timelineObjId}`,
                    layer: compositionName
                });
                commands.push({
                    timelineObjId: composition.timelineObjId,
                    commandName: 'added',
                    content: device_1.literal({
                        compositionName: compositionName,
                        controlNode: {
                            payload: composition.controlNode.payload
                        }
                    }),
                    context: `added: ${composition.timelineObjId}`,
                    layer: compositionName
                });
            }
            else {
                // changed?
                if (!_.isEqual(oldComposition.controlNode, composition.controlNode)) {
                    // changed!
                    commands.push({
                        timelineObjId: composition.timelineObjId,
                        commandName: 'changed',
                        content: device_1.literal({
                            compositionName: compositionName,
                            controlNode: {
                                payload: composition.controlNode.payload
                            }
                        }),
                        context: `changed: ${composition.timelineObjId}  (previously: ${oldComposition.timelineObjId})`,
                        layer: compositionName
                    });
                }
            }
        });
        // removed
        _.each(oldSingularLiveState.compositions, (composition, compositionName) => {
            let newComposition = newSingularLiveState.compositions[compositionName];
            if (!newComposition) {
                // removed!
                commands.push({
                    timelineObjId: composition.timelineObjId,
                    commandName: 'removed',
                    content: device_1.literal({
                        compositionName: compositionName,
                        animation: {
                            action: composition.animation.action,
                            to: 'Out'
                        }
                    }),
                    context: `removed: ${composition.timelineObjId}`,
                    layer: compositionName
                });
            }
        });
        return commands
            .sort((a, b) => a.content.controlNode && !b.content.controlNode ? 1 :
            !a.content.controlNode && b.content.controlNode ? -1 :
                0)
            .sort((a, b) => a.layer.localeCompare(b.layer));
    }
    _defaultCommandReceiver(_time, cmd, context, timelineObjId) {
        let cwc = {
            context: context,
            command: cmd,
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        const url = SINGULAR_LIVE_API + this._accessToken;
        return new Promise((resolve, reject) => {
            let handleResponse = (error, response) => {
                if (error) {
                    this.emit('error', `SingularLive.response error ${cmd.compositionName} (${context}`, error);
                    reject(error);
                }
                else if (response.statusCode === 200) {
                    this.emit('debug', `SingularLive: ${cmd.compositionName}: Good statuscode response on url "${url}": ${response.statusCode} (${context})`);
                    resolve();
                }
                else {
                    this.emit('warning', `SingularLive: ${cmd.compositionName}: Bad statuscode response on url "${url}": ${response.statusCode} (${context})`);
                    resolve();
                }
            };
            request.put(url, { json: [
                    cmd
                ] }, handleResponse);
        })
            .catch(error => {
            this.emit('commandError', error, cwc);
        });
    }
}
exports.SingularLiveDevice = SingularLiveDevice;
//# sourceMappingURL=singularLive.js.map