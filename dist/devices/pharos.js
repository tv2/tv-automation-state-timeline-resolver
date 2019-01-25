"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const pharosAPI_1 = require("./pharosAPI");
class PharosDevice extends device_1.DeviceWithState {
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
        this._doOnTime.on('error', e => this.emit('error', 'doOnTime', e));
        this._pharos = new pharosAPI_1.Pharos();
        this._pharos.on('error', e => this.emit('error', 'Pharos', e));
        this._pharos.on('connected', () => {
            this._connectionChanged();
        });
        this._pharos.on('disconnected', () => {
            this._connectionChanged();
        });
    }
    /**
     * Initiates the connection with CasparCG through the ccg-connection lib.
     */
    init(connectionOptions) {
        return new Promise((resolve, reject) => {
            // This is where we would do initialization, like connecting to the devices, etc
            this._pharos.connect(connectionOptions)
                .then(() => {
                return this._pharos.getProjectInfo();
            })
                .then((systemInfo) => {
                this._pharosProjectInfo = systemInfo;
            })
                .then(() => resolve(true))
                .catch(e => reject(e));
        });
    }
    handleState(newState) {
        // Handle this new state, at the point in time specified
        let oldState = (this.getStateBefore(newState.time) || { state: { time: 0, LLayers: {}, GLayers: {} } }).state;
        let oldPharosState = this.convertStateToPharos(oldState);
        let newPharosState = this.convertStateToPharos(newState);
        let commandsToAchieveState = this._diffStates(oldPharosState, newPharosState);
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
        return this._pharos.dispose()
            .then(() => {
            return true;
        });
    }
    get canConnect() {
        return true;
    }
    get connected() {
        return this._pharos.connected;
    }
    convertStateToPharos(state) {
        return state;
    }
    get deviceType() {
        return src_1.DeviceType.PHAROS;
    }
    get deviceName() {
        return 'Pharos ' + this.deviceId + (this._pharosProjectInfo ? ', ' + this._pharosProjectInfo.name : '');
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    makeReady(okToDestroyStuff) {
        if (okToDestroyStuff) {
            this._doOnTime.clearQueueNowAndAfter(this.getCurrentTime());
        }
        return Promise.resolve();
    }
    getStatus() {
        return {
            statusCode: this._pharos.connected ? device_1.StatusCode.GOOD : device_1.StatusCode.BAD
        };
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, (cmd) => {
                return this._commandReceiver(time, cmd, cmd.context);
            }, cmd);
        });
    }
    _diffStates(oldPharosState, newPharosState) {
        // in this Pharos class, let's just cheat:
        let commands = [];
        let stoppedLayers = {};
        let stopLayer = (oldLayer, reason) => {
            let oldAttrs = oldLayer.content.attributes;
            if (stoppedLayers[oldLayer.id])
                return; // don't send several remove commands for the same object
            if (oldAttrs.noRelease)
                return; // override: don't stop / release
            stoppedLayers[oldLayer.id] = true;
            if (oldLayer.content.type === src_1.TimelineContentTypePharos.SCENE) {
                if (!reason)
                    reason = 'removed scene';
                commands.push({
                    content: {
                        args: [oldAttrs.scene, oldAttrs.fade],
                        fcn: (scene, fade) => this._pharos.releaseScene(scene, fade)
                    },
                    context: `${reason}: ${oldLayer.id} ${oldAttrs.scene}`
                });
            }
            else if (oldLayer.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                if (!reason)
                    reason = 'removed timeline';
                commands.push({
                    content: {
                        args: [oldAttrs.timeline, oldAttrs.fade],
                        fcn: (timeline, fade) => this._pharos.releaseTimeline(timeline, fade)
                    },
                    context: `${reason}: ${oldLayer.id} ${oldAttrs.timeline}`
                });
            }
        };
        let modifyTimelinePlay = (newLayer, oldLayer) => {
            let newAttrs = newLayer.content.attributes;
            let oldAttrs = oldLayer ? oldLayer.content.attributes : { pause: undefined, rate: undefined };
            if (newLayer.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                if ((newAttrs.pause || false) !== (oldAttrs.pause || false)) {
                    if (newAttrs.pause) {
                        commands.push({
                            content: {
                                args: [newAttrs.timeline],
                                fcn: (timeline) => this._pharos.pauseTimeline(timeline)
                            },
                            context: `pause timeline: ${newLayer.id} ${newAttrs.timeline}`
                        });
                    }
                    else {
                        commands.push({
                            content: {
                                args: [newAttrs.timeline],
                                fcn: (timeline) => this._pharos.resumeTimeline(timeline)
                            },
                            context: `resume timeline: ${newLayer.id} ${newAttrs.timeline}`
                        });
                    }
                }
                if ((newAttrs.rate || null) !== (oldAttrs.rate || null)) {
                    commands.push({
                        content: {
                            args: [newAttrs.timeline, newAttrs.rate],
                            fcn: (timeline, rate) => this._pharos.setTimelineRate(timeline, rate)
                        },
                        context: `pause timeline: ${newLayer.id} ${newAttrs.timeline}: ${newAttrs.rate}`
                    });
                }
                // @todo: support pause / setTimelinePosition
            }
        };
        let startLayer = (newLayer, reason) => {
            let newAttrs = newLayer.content.attributes;
            if (!newAttrs.stopped) {
                if (newLayer.content.type === src_1.TimelineContentTypePharos.SCENE) {
                    if (!reason)
                        reason = 'added scene';
                    commands.push({
                        content: {
                            args: [newAttrs.scene],
                            fcn: (scene) => this._pharos.startScene(scene)
                        },
                        context: `${reason}: ${newLayer.id} ${newAttrs.scene}`
                    });
                }
                else if (newLayer.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                    if (!reason)
                        reason = 'added timeline';
                    commands.push({
                        content: {
                            args: [newAttrs.timeline],
                            fcn: (timeline) => this._pharos.startTimeline(timeline)
                        },
                        context: `${reason}: ${newLayer.id} ${newAttrs.timeline}`
                    });
                    modifyTimelinePlay(newLayer);
                }
            }
            else {
                // Item is set to "stopped"
                stopLayer(newLayer);
            }
        };
        // Added / Changed things:
        _.each(newPharosState.LLayers, (newLayer, layerKey) => {
            let oldLayer = oldPharosState.LLayers[layerKey];
            if (!oldLayer) {
                // item is new
                startLayer(newLayer);
            }
            else {
                // item is not new, but maybe it has changed:
                if (newLayer.content.type !== oldLayer.content.type || // item has changed type!
                    (newLayer.content.attributes.stopped || false) !== (oldLayer.content.attributes.stopped || false) // item has stopped / unstopped
                ) {
                    if (!oldLayer.content.attributes.stopped) {
                        // If it was stopped before, we don't have to stop it now:
                        stopLayer(oldLayer);
                    }
                    startLayer(newLayer);
                }
                else {
                    if (newLayer.content.type === src_1.TimelineContentTypePharos.SCENE) {
                        if (newLayer.content.attributes.scene !== oldLayer.content.attributes.scene) {
                            // scene has changed
                            stopLayer(oldLayer, 'scene changed from');
                            startLayer(newLayer, 'scene changed to');
                        }
                    }
                    else if (newLayer.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                        if (newLayer.content.attributes.timeline !== oldLayer.content.attributes.timeline) {
                            // timeline has changed
                            stopLayer(oldLayer, 'timeline changed from');
                            startLayer(newLayer, 'timeline changed to');
                        }
                        else {
                            modifyTimelinePlay(newLayer, oldLayer);
                        }
                    }
                }
            }
        });
        // Removed things
        _.each(oldPharosState.LLayers, (oldLayer, layerKey) => {
            let newLayer = newPharosState.LLayers[layerKey];
            if (!newLayer) {
                // removed item
                stopLayer(oldLayer);
            }
        });
        return commands;
    }
    _defaultCommandReceiver(time, cmd, context) {
        time = time;
        // emit the command to debug:
        let cwc = {
            context: context,
            command: {
                // commandName: cmd.content.args,
                args: cmd.content.args
                // content: cmd.content
            }
        };
        this.emit('debug', cwc);
        // execute the command here
        return cmd.content.fcn(...cmd.content.args);
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.PharosDevice = PharosDevice;
//# sourceMappingURL=pharos.js.map