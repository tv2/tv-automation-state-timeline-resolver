"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const pharosAPI_1 = require("./pharosAPI");
/**
 * This is a wrapper for a Pharos-devices,
 * https://www.pharoscontrols.com/downloads/documentation/application-notes/
 */
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
        }, doOnTime_1.SendMode.BURST, this._deviceOptions);
        this.handleDoOnTime(this._doOnTime, 'Pharos');
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
     * Initiates the connection with Pharos through the PharosAPI.
     */
    init(initOptions) {
        return new Promise((resolve, reject) => {
            // This is where we would do initialization, like connecting to the devices, etc
            this._pharos.connect(initOptions)
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
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime);
        this.cleanUpStates(0, newStateTime);
    }
    /**
     * Handles a new state such that the device will be in that state at a specific point
     * in time.
     * @param newState
     */
    handleState(newState) {
        // Handle this new state, at the point in time specified
        let previousStateTime = Math.max(this.getCurrentTime(), newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: { time: 0, layers: {}, nextEvents: [] } }).state;
        let oldPharosState = this.convertStateToPharos(oldState);
        let newPharosState = this.convertStateToPharos(newState);
        let commandsToAchieveState = this._diffStates(oldPharosState, newPharosState);
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
    async makeReady(okToDestroyStuff) {
        if (okToDestroyStuff) {
            this._doOnTime.clearQueueNowAndAfter(this.getCurrentTime());
        }
    }
    getStatus() {
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (!this._pharos.connected) {
            statusCode = device_1.StatusCode.BAD;
            messages.push('Not connected');
        }
        return {
            statusCode: statusCode,
            messages: messages
        };
    }
    /**
     * Add commands to queue, to be executed at the right time
     */
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd, cmd.context, cmd.timelineObjId);
            }, cmd);
        });
    }
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    _diffStates(oldPharosState, newPharosState) {
        let commands = [];
        let stoppedLayers = {};
        let stopLayer = (oldLayer, reason) => {
            if (stoppedLayers[oldLayer.id])
                return; // don't send several remove commands for the same object
            if (oldLayer.content.noRelease)
                return; // override: don't stop / release
            stoppedLayers[oldLayer.id] = true;
            if (oldLayer.content.type === src_1.TimelineContentTypePharos.SCENE) {
                const oldScene = oldLayer;
                if (!reason)
                    reason = 'removed scene';
                commands.push({
                    content: {
                        args: [oldScene.content.scene, oldScene.content.fade],
                        fcn: (scene, fade) => this._pharos.releaseScene(scene, fade)
                    },
                    context: `${reason}: ${oldLayer.id} ${oldScene.content.scene}`,
                    timelineObjId: oldLayer.id
                });
            }
            else if (oldLayer.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                const oldTimeline = oldLayer;
                if (!reason)
                    reason = 'removed timeline';
                commands.push({
                    content: {
                        args: [oldTimeline.content.timeline, oldTimeline.content.fade],
                        fcn: (timeline, fade) => this._pharos.releaseTimeline(timeline, fade)
                    },
                    context: `${reason}: ${oldLayer.id} ${oldTimeline.content.timeline}`,
                    timelineObjId: oldLayer.id
                });
            }
        };
        let modifyTimelinePlay = (newLayer, oldLayer) => {
            if (newLayer.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                const newPharosTimeline = newLayer;
                const oldPharosTimeline = oldLayer;
                if ((newPharosTimeline.content.pause || false) !== (oldPharosTimeline.content.pause || false)) {
                    if (newPharosTimeline.content.pause) {
                        commands.push({
                            content: {
                                args: [newPharosTimeline.content.timeline],
                                fcn: (timeline) => this._pharos.pauseTimeline(timeline)
                            },
                            context: `pause timeline: ${newLayer.id} ${newPharosTimeline.content.timeline}`,
                            timelineObjId: newLayer.id
                        });
                    }
                    else {
                        commands.push({
                            content: {
                                args: [newPharosTimeline.content.timeline],
                                fcn: (timeline) => this._pharos.resumeTimeline(timeline)
                            },
                            context: `resume timeline: ${newLayer.id} ${newPharosTimeline.content.timeline}`,
                            timelineObjId: newLayer.id
                        });
                    }
                }
                if ((newPharosTimeline.content.rate || null) !== (oldPharosTimeline.content.rate || null)) {
                    commands.push({
                        content: {
                            args: [newPharosTimeline.content.timeline, newPharosTimeline.content.rate],
                            fcn: (timeline, rate) => this._pharos.setTimelineRate(timeline, rate)
                        },
                        context: `pause timeline: ${newLayer.id} ${newPharosTimeline.content.timeline}: ${newPharosTimeline.content.rate}`,
                        timelineObjId: newLayer.id
                    });
                }
                // @todo: support pause / setTimelinePosition
            }
        };
        let startLayer = (newLayer, reason) => {
            if (!newLayer.content.stopped) {
                if (newLayer.content.type === src_1.TimelineContentTypePharos.SCENE) {
                    const newPharosScene = newLayer;
                    if (!reason)
                        reason = 'added scene';
                    commands.push({
                        content: {
                            args: [newPharosScene.content.scene],
                            fcn: (scene) => this._pharos.startScene(scene)
                        },
                        context: `${reason}: ${newLayer.id} ${newPharosScene.content.scene}`,
                        timelineObjId: newLayer.id
                    });
                }
                else if (newLayer.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                    const newPharosTimeline = newLayer;
                    if (!reason)
                        reason = 'added timeline';
                    commands.push({
                        content: {
                            args: [newPharosTimeline.content.timeline],
                            fcn: (timeline) => this._pharos.startTimeline(timeline)
                        },
                        context: `${reason}: ${newLayer.id} ${newPharosTimeline.content.timeline}`,
                        timelineObjId: newLayer.id
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
        _.each(newPharosState.layers, (newLayer, layerKey) => {
            let oldPharosObj = oldPharosState.layers[layerKey];
            const pharosObj = newLayer;
            if (!oldPharosObj) {
                // item is new
                startLayer(pharosObj);
            }
            else {
                // item is not new, but maybe it has changed:
                if (pharosObj.content.type !== oldPharosObj.content.type || // item has changed type!
                    (pharosObj.content.stopped || false) !== (oldPharosObj.content.stopped || false) // item has stopped / unstopped
                ) {
                    if (!oldPharosObj.content.stopped) {
                        // If it was stopped before, we don't have to stop it now:
                        stopLayer(oldPharosObj);
                    }
                    startLayer(pharosObj);
                }
                else {
                    if (pharosObj.content.type === src_1.TimelineContentTypePharos.SCENE) {
                        const pharosObjScene = pharosObj;
                        const oldPharosObjScene = oldPharosObj;
                        if (pharosObjScene.content.scene !== oldPharosObjScene.content.scene) {
                            // scene has changed
                            stopLayer(oldPharosObj, 'scene changed from');
                            startLayer(pharosObj, 'scene changed to');
                        }
                    }
                    else if (pharosObj.content.type === src_1.TimelineContentTypePharos.TIMELINE) {
                        const pharosObjTimeline = pharosObj;
                        const oldPharosObjTimeline = oldPharosObj;
                        if (pharosObjTimeline.content.timeline !== oldPharosObjTimeline.content.timeline) {
                            // timeline has changed
                            stopLayer(oldPharosObj, 'timeline changed from');
                            startLayer(pharosObj, 'timeline changed to');
                        }
                        else {
                            modifyTimelinePlay(pharosObj, oldPharosObj);
                        }
                    }
                }
            }
        });
        // Removed things
        _.each(oldPharosState.layers, (oldLayer, layerKey) => {
            const oldPharosObj = oldLayer;
            let newLayer = newPharosState.layers[layerKey];
            if (!newLayer) {
                // removed item
                stopLayer(oldPharosObj);
            }
        });
        return commands;
    }
    async _defaultCommandReceiver(_time, cmd, context, timelineObjId) {
        // emit the command to debug:
        let cwc = {
            context: context,
            command: {
                // commandName: cmd.content.args,
                args: cmd.content.args
                // content: cmd.content
            },
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        // execute the command here
        try {
            await cmd.content.fcn(...cmd.content.args);
        }
        catch (e) {
            this.emit('commandError', e, cwc);
        }
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
}
exports.PharosDevice = PharosDevice;
//# sourceMappingURL=pharos.js.map