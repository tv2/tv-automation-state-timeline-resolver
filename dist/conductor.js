"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const casparCG_1 = require("./devices/casparCG");
const abstract_1 = require("./devices/abstract");
const httpSend_1 = require("./devices/httpSend");
const src_1 = require("./types/src");
const atem_1 = require("./devices/atem");
const events_1 = require("events");
const lawo_1 = require("./devices/lawo");
const panasonicPTZ_1 = require("./devices/panasonicPTZ");
const hyperdeck_1 = require("./devices/hyperdeck");
const doOnTime_1 = require("./doOnTime");
const tcpSend_1 = require("./devices/tcpSend");
const pharos_1 = require("./devices/pharos");
const osc_1 = require("./devices/osc");
const deviceContainer_1 = require("./devices/deviceContainer");
exports.DeviceContainer = deviceContainer_1.DeviceContainer;
const threadedclass_1 = require("threadedclass");
const AsyncResolver_1 = require("./AsyncResolver");
const httpWatcher_1 = require("./devices/httpWatcher");
const quantel_1 = require("./devices/quantel");
const sisyfos_1 = require("./devices/sisyfos");
const singularLive_1 = require("./devices/singularLive");
const vizMSE_1 = require("./devices/vizMSE");
const p_queue_1 = require("p-queue");
const PAll = require("p-all");
const p_timeout_1 = require("p-timeout");
exports.LOOKAHEADTIME = 5000; // Will look ahead this far into the future
exports.PREPARETIME = 2000; // Will prepare commands this time before the event is to happen
exports.MINTRIGGERTIME = 10; // Minimum time between triggers
exports.MINTIMEUNIT = 1; // Minimum unit of time
/** When resolving and the timeline has repeating objects, only resolve this far into the future */
const RESOLVE_LIMIT_TIME = 10000;
exports.DEFAULT_PREPARATION_TIME = 20; // When resolving "now", move this far into the future, to account for computation times
var device_1 = require("./devices/device");
exports.Device = device_1.Device;
const CALLBACK_WAIT_TIME = 50;
/**
 * The Conductor class serves as the main class for interacting. It contains
 * methods for setting mappings, timelines and adding/removing devices. It keeps
 * track of when to resolve the timeline and updates the devices with new states.
 */
class Conductor extends events_1.EventEmitter {
    constructor(options = {}) {
        super();
        this._logDebug = false;
        this._timeline = [];
        this._mapping = {};
        this.devices = {};
        this._nextResolveTime = 0;
        this._resolvedStates = {
            resolvedStates: null,
            resolveTime: 0
        };
        this._isInitialized = false;
        this._multiThreadedResolver = false;
        this._callbackInstances = {};
        this._triggerSendStartStopCallbacksTimeout = null;
        this._sentCallbacks = {};
        this._actionQueue = new p_queue_1.default({
            concurrency: 1
        });
        this._statMeasureStart = 0;
        this._statMeasureReason = '';
        this._statReports = [];
        this._resolveTimelineRunning = false;
        this._resolveTimelineOnQueue = false;
        this._options = options;
        this._multiThreadedResolver = !!options.multiThreadedResolver;
        if (options.getCurrentTime)
            this._getCurrentTime = options.getCurrentTime;
        this._interval = setInterval(() => {
            if (this.timeline) {
                this._resolveTimeline();
            }
        }, 2500);
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        });
        this._doOnTime.on('error', e => this.emit('error', e));
        // this._doOnTime.on('callback', (...args) => {
        // 	this.emit('timelineCallback', ...args)
        // })
        if (options.autoInit) {
            this.init()
                .catch((e) => {
                this.emit('error', 'Error during auto-init: ', e);
            });
        }
    }
    /**
     * Initializates the resolver, with optional multithreading
     */
    async init() {
        this._resolver = await threadedclass_1.threadedClass('../dist/AsyncResolver.js', AsyncResolver_1.AsyncResolver, [
            r => { this.emit('setTimelineTriggerTime', r); }
        ], {
            threadUsage: this._multiThreadedResolver ? 1 : 0,
            autoRestart: true,
            disableMultithreading: !this._multiThreadedResolver,
            instanceName: 'resolver'
        });
        this._isInitialized = true;
        this.resetResolver();
    }
    /**
     * Returns a nice, synchronized time.
     */
    getCurrentTime() {
        if (this._getCurrentTime) {
            // return 0
            return this._getCurrentTime();
        }
        else {
            return Date.now();
        }
    }
    /**
     * Returns the mappings
     */
    get mapping() {
        return this._mapping;
    }
    /**
     * Updates the mappings in the Conductor class and all devices and forces
     * a resolve timeline.
     * @param mapping The new mappings
     */
    async setMapping(mapping) {
        // Set mapping
        // re-resolve timeline
        this._mapping = mapping;
        await this._mapAllDevices(d => d.device.setMapping(mapping));
        if (this._timeline) {
            this._resolveTimeline();
        }
    }
    /**
     * Returns the current timeline
     */
    get timeline() {
        return this._timeline;
    }
    /**
     * Sets a new timeline and resets the resolver.
     */
    set timeline(timeline) {
        this.statStartMeasure('timeline received');
        this._timeline = timeline;
        // We've got a new timeline, anything could've happened at this point
        // Highest priority right now is to determine if any commands have to be sent RIGHT NOW
        // After that, we'll move further ahead in time, creating commands ready for scheduling
        this.resetResolver();
    }
    get logDebug() {
        return this._logDebug;
    }
    set logDebug(val) {
        this._logDebug = val;
    }
    getDevices() {
        return _.values(this.devices);
    }
    getDevice(deviceId) {
        return this.devices[deviceId];
    }
    /**
     * Adds a a device that can be referenced by the timeline and mappings.
     * @param deviceId Id used by the mappings to reference the device.
     * @param deviceOptions The options used to initalize the device
     * @returns A promise that resolves with the created device, or rejects with an error message.
     */
    async addDevice(deviceId, deviceOptions) {
        try {
            let newDevice;
            let threadedClassOptions = {
                threadUsage: deviceOptions.threadUsage || 1,
                autoRestart: false,
                disableMultithreading: !deviceOptions.isMultiThreaded,
                instanceName: deviceId
            };
            let getCurrentTime = () => { return this.getCurrentTime(); };
            if (deviceOptions.type === src_1.DeviceType.ABSTRACT) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/abstract.js', abstract_1.AbstractDevice, deviceId, deviceOptions, getCurrentTime, {
                    threadUsage: deviceOptions.isMultiThreaded ? .1 : 0,
                    autoRestart: false,
                    disableMultithreading: !deviceOptions.isMultiThreaded,
                    instanceName: deviceId
                });
            }
            else if (deviceOptions.type === src_1.DeviceType.CASPARCG) {
                // Add CasparCG device:
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/casparCG.js', casparCG_1.CasparCGDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.ATEM) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/atem.js', atem_1.AtemDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.HTTPSEND) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/httpSend.js', httpSend_1.HTTPSendDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.HTTPWATCHER) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/httpWatcher.js', httpWatcher_1.HTTPWatcherDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.LAWO) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/lawo.js', lawo_1.LawoDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.TCPSEND) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/tcpSend.js', tcpSend_1.TCPSendDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.PANASONIC_PTZ) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/panasonicPTZ.js', panasonicPTZ_1.PanasonicPtzDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.HYPERDECK) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/hyperdeck.js', hyperdeck_1.HyperdeckDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.PHAROS) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/pharos.js', pharos_1.PharosDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.OSC) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/osc.js', osc_1.OSCMessageDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.QUANTEL) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/quantel.js', quantel_1.QuantelDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.SISYFOS) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/sisyfos.js', sisyfos_1.SisyfosMessageDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.VIZMSE) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/vizMSE.js', vizMSE_1.VizMSEDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else if (deviceOptions.type === src_1.DeviceType.SINGULAR_LIVE) {
                newDevice = await new deviceContainer_1.DeviceContainer().create('../../dist/devices/singularLive.js', singularLive_1.SingularLiveDevice, deviceId, deviceOptions, getCurrentTime, threadedClassOptions);
            }
            else {
                // @ts-ignore deviceOptions.type is of type "never"
                const type = deviceOptions.type;
                return Promise.reject(`No matching device type for "${type}" ("${src_1.DeviceType[type]}") found in conductor`);
            }
            newDevice.device.on('debug', (...e) => {
                if (this.logDebug) {
                    this.emit('debug', newDevice.deviceId, ...e);
                }
            }).catch(console.error);
            newDevice.device.on('resetResolver', () => this.resetResolver()).catch(console.error);
            // Temporary listening to events, these are removed after the devide has been initiated.
            // Todo: split the addDevice function into two separate functions, so that the device is
            // first created, then initated by the consumer, allowing for setup of listeners in between...
            const onDeviceInfo = (...args) => this.emit('info', newDevice.instanceId, ...args);
            const onDeviceWarning = (...args) => this.emit('warning', newDevice.instanceId, ...args);
            const onDeviceError = (...args) => this.emit('error', newDevice.instanceId, ...args);
            const onDeviceDebug = (...args) => this.emit('debug', newDevice.instanceId, ...args);
            newDevice.device.on('info', onDeviceInfo).catch(console.error);
            newDevice.device.on('warning', onDeviceWarning).catch(console.error);
            newDevice.device.on('error', onDeviceError).catch(console.error);
            newDevice.device.on('debug', onDeviceDebug).catch(console.error);
            this.emit('info', `Initializing device ${newDevice.deviceId} (${newDevice.instanceId}) of type ${src_1.DeviceType[deviceOptions.type]}...`);
            this.devices[deviceId] = newDevice;
            // @ts-ignore
            await newDevice.device.setMapping(this.mapping);
            // TODO - should the device be on this.devices yet? sounds like we could instruct it to do things before it has initialised?
            await newDevice.device.init(deviceOptions.options);
            await newDevice.reloadProps(); // because the device name might have changed after init
            this.emit('info', `Device ${newDevice.deviceId} (${newDevice.instanceId}) initialized!`);
            // Remove listeners, expect consumer to subscribe to them now.
            newDevice.device.removeListener('info', onDeviceInfo).catch(console.error);
            newDevice.device.removeListener('warning', onDeviceWarning).catch(console.error);
            newDevice.device.removeListener('error', onDeviceError).catch(console.error);
            newDevice.device.removeListener('debug', onDeviceDebug).catch(console.error);
            return newDevice;
        }
        catch (e) {
            this.emit('error', 'conductor.addDevice', e);
            return Promise.reject(e);
        }
    }
    /**
     * Safely remove a device
     * @param deviceId The id of the device to be removed
     */
    async removeDevice(deviceId) {
        let device = this.devices[deviceId];
        if (device) {
            try {
                await device.device.terminate();
            }
            catch (e) {
                // An error while terminating is probably not that important, since we'll kill the instance anyway
                this.emit('warning', 'Error when terminating device', e);
            }
            await device.terminate();
            delete this.devices[deviceId];
        }
        else {
            return Promise.reject('No device found');
        }
    }
    /**
     * Remove all devices
     */
    async destroy() {
        clearTimeout(this._interval);
        if (this._triggerSendStartStopCallbacksTimeout)
            clearTimeout(this._triggerSendStartStopCallbacksTimeout);
        await this._mapAllDevices(d => this.removeDevice(d.deviceId));
    }
    /**
     * Resets the resolve-time, so that the resolving will happen for the point-in time NOW
     * next time
     */
    resetResolver() {
        this._nextResolveTime = 0; // This will cause _resolveTimeline() to generate the state for NOW
        this._resolvedStates = {
            resolvedStates: null,
            resolveTime: 0
        };
        this._triggerResolveTimeline();
    }
    /**
     * Send a makeReady-trigger to all devices
     */
    async devicesMakeReady(okToDestroyStuff, activeRundownId) {
        await this._actionQueue.add(async () => {
            await this._mapAllDevices((d) => p_timeout_1.default(d.device.makeReady(okToDestroyStuff, activeRundownId), 10000, `makeReady for "${d.deviceId}" timed out`));
            this._triggerResolveTimeline();
        });
    }
    /**
     * Send a standDown-trigger to all devices
     */
    async devicesStandDown(okToDestroyStuff) {
        await this._actionQueue.add(async () => {
            await this._mapAllDevices((d) => p_timeout_1.default(d.device.standDown(okToDestroyStuff), 10000, `standDown for "${d.deviceId}" timed out`));
        });
    }
    _mapAllDevices(fcn) {
        return PAll(_.map(_.values(this.devices), d => () => fcn(d)), {
            stopOnError: false
        });
    }
    /**
     * This is the main resolve-loop.
     */
    _triggerResolveTimeline(timeUntilTrigger) {
        // this.emit('info', '_triggerResolveTimeline', timeUntilTrigger)
        if (this._resolveTimelineTrigger) {
            clearTimeout(this._resolveTimelineTrigger);
        }
        if (timeUntilTrigger) {
            // resolve at a later stage
            this._resolveTimelineTrigger = setTimeout(() => {
                this._resolveTimeline();
            }, timeUntilTrigger);
        }
        else {
            // resolve right away:
            this._resolveTimeline();
        }
    }
    /**
     * Resolves the timeline for the next resolve-time, generates the commands and passes on the commands.
     */
    _resolveTimeline() {
        if (this._resolveTimelineRunning) {
            // If a resolve is already running, put in queue to run later:
            this._resolveTimelineOnQueue = true;
            return;
        }
        this._resolveTimelineRunning = true;
        this._actionQueue.add(() => {
            return this._resolveTimelineInner()
                .catch(e => {
                this.emit('error', 'Caught error in _resolveTimelineInner' + e);
            });
        })
            .then((nextResolveTime) => {
            this._resolveTimelineRunning = false;
            if (this._resolveTimelineOnQueue) {
                // re-run the resolver right away, again
                this._resolveTimelineOnQueue = false;
                this._triggerResolveTimeline(0);
            }
            else {
                this._nextResolveTime = nextResolveTime || 0;
            }
        })
            .catch(e => {
            this._resolveTimelineRunning = false;
            this.emit('error', 'Caught error in _resolveTimeline.then' + e);
        });
    }
    async _resolveTimelineInner() {
        if (!this._isInitialized) {
            this.emit('warning', 'TSR is not initialized yet');
            return;
        }
        let nextResolveTime = 0;
        let timeUntilNextResolve = exports.LOOKAHEADTIME;
        let startTime = Date.now();
        let statMeasureStart = this._statMeasureStart;
        let statTimeStateHandled = 0;
        let statTimeTimelineStartResolve = 0;
        let statTimeTimelineResolved = 0;
        try {
            /** The point in time this function is run. ( ie "right now") */
            const now = this.getCurrentTime();
            /** The point in time we're targeting. (This can be in the future) */
            let resolveTime = this._nextResolveTime;
            const estimatedResolveTime = this.estimateResolveTime();
            if (resolveTime === 0 || // About to be resolved ASAP
                resolveTime < now + estimatedResolveTime // We're late
            ) {
                resolveTime = now + estimatedResolveTime;
                this.emit('debug', `resolveTimeline ${resolveTime} (${resolveTime - now} from now) (${estimatedResolveTime}) ---------`);
            }
            else {
                this.emit('debug', `resolveTimeline ${resolveTime} (${resolveTime - now} from now) -----------------------------`);
                if (resolveTime > now + exports.LOOKAHEADTIME) {
                    // If the resolveTime is too far ahead, we'd rather wait and resolve it later.
                    this.emit('debug', 'Too far ahead (' + resolveTime + ')');
                    this._triggerResolveTimeline(exports.LOOKAHEADTIME);
                    return;
                }
            }
            // Let all devices know that a new state is about to come in.
            // This is done so that they can clear future commands a bit earlier, possibly avoiding double or conflicting commands
            // const pPrepareForHandleStates = this._mapAllDevices(async (device: DeviceContainer) => {
            // 	await device.device.prepareForHandleState(resolveTime)
            // }).catch(error => {
            // 	this.emit('error', error)
            // })
            // TODO - the PAll way of doing this provokes https://github.com/nrkno/tv-automation-state-timeline-resolver/pull/139
            // The doOnTime calls fire before this, meaning we cleanup the state for a time we have already sent commands for
            const pPrepareForHandleStates = Promise.all(_.map(this.devices, async (device) => {
                await device.device.prepareForHandleState(resolveTime);
            })).catch(error => {
                this.emit('error', error);
            });
            const applyRecursively = (o, func) => {
                func(o);
                if (o.isGroup) {
                    _.each(o.children || [], (child) => {
                        applyRecursively(child, func);
                    });
                }
            };
            statTimeTimelineStartResolve = Date.now();
            let timeline = this.timeline;
            // To prevent trying to transfer circular references over IPC we remove
            // any references to the parent property:
            const deleteParent = (o) => { delete o['parent']; };
            _.each(timeline, (o) => applyRecursively(o, deleteParent));
            // Determine if we can use the pre-resolved timeline:
            let resolvedStates;
            if (this._resolvedStates.resolvedStates &&
                resolveTime >= this._resolvedStates.resolveTime &&
                resolveTime < this._resolvedStates.resolveTime + RESOLVE_LIMIT_TIME) {
                // Yes, we can use the previously resolved timeline:
                resolvedStates = this._resolvedStates.resolvedStates;
            }
            else {
                // No, we need to resolve the timeline again:
                let o = await this._resolver.resolveTimeline(resolveTime, timeline, resolveTime + RESOLVE_LIMIT_TIME);
                resolvedStates = o.resolvedStates;
                this._resolvedStates.resolvedStates = resolvedStates;
                this._resolvedStates.resolveTime = resolveTime;
                // Apply changes to fixed objects (set "now" triggers to an actual time):
                // This gets persisted on this.timeline, so we only have to do this once
                const nowIds = {};
                _.each(o.objectsFixed, (o) => nowIds[o.id] = o.time);
                const fixNow = (o) => { if (nowIds[o.id])
                    o.enable.start = nowIds[o.id]; };
                _.each(timeline, (o) => applyRecursively(o, fixNow));
            }
            let tlState = await this._resolver.getState(resolvedStates, resolveTime);
            await pPrepareForHandleStates;
            statTimeTimelineResolved = Date.now();
            if (this.getCurrentTime() > resolveTime) {
                this.emit('warn', `Resolver is ${this.getCurrentTime() - resolveTime} ms late`);
            }
            // Push state to the right device:
            await this._mapAllDevices(async (device) => {
                // The subState contains only the parts of the state relevant to that device:
                let subState = {
                    time: tlState.time,
                    layers: this.getFilteredLayers(tlState.layers, device),
                    nextEvents: []
                };
                const removeParent = (o) => {
                    for (let key in o) {
                        if (key === 'parent') {
                            delete o['parent'];
                        }
                        else if (typeof o[key] === 'object') {
                            o[key] = removeParent(o[key]);
                        }
                    }
                    return o;
                };
                // Pass along the state to the device, it will generate its commands and execute them:
                try {
                    await device.device.handleState(removeParent(subState));
                }
                catch (e) {
                    this.emit('error', 'Error in device "' + device.deviceId + '"' + e + ' ' + e.stack);
                }
            });
            statTimeStateHandled = Date.now();
            // Now that we've handled this point in time, it's time to determine what the next point in time is:
            let nextEventTime = null;
            _.each(tlState.nextEvents, event => {
                if (event.time &&
                    event.time > now &&
                    (!nextEventTime ||
                        event.time < nextEventTime)) {
                    nextEventTime = event.time;
                }
            });
            // let nextEventTime = await this._resolver.getNextTimelineEvent(timeline, tlState.time)
            const nowPostExec = this.getCurrentTime();
            if (nextEventTime) {
                timeUntilNextResolve = (Math.max(exports.MINTRIGGERTIME, // At minimum, we should wait this time
                Math.min(exports.LOOKAHEADTIME, // We should wait maximum this time, because we might have deferred a resolving this far ahead
                RESOLVE_LIMIT_TIME, // We should wait maximum this time, because we've only resolved repeating objects this far
                (nextEventTime - nowPostExec) - exports.PREPARETIME)));
                // resolve at nextEventTime next time:
                nextResolveTime = Math.min(tlState.time + exports.LOOKAHEADTIME, nextEventTime);
            }
            else {
                // there's nothing ahead in the timeline,
                // Tell the devices that the future is clear:
                await this._mapAllDevices(async (device) => {
                    try {
                        await device.device.clearFuture(tlState.time);
                    }
                    catch (e) {
                        this.emit('error', 'Error in device "' + device.deviceId + '", clearFuture: ' + e + ' ' + e.stack);
                    }
                });
                // resolve at this time then next time (or later):
                nextResolveTime = Math.min(tlState.time);
            }
            // Special function: send callback to Core
            this._doOnTime.clearQueueNowAndAfter(tlState.time);
            let activeObjects = {};
            _.each(tlState.layers, (instance) => {
                try {
                    if (instance.content.callBack || instance.content.callBackStopped) {
                        let callBackId = (instance.id +
                            instance.content.callBack +
                            instance.content.callBackStopped +
                            instance.instance.start +
                            JSON.stringify(instance.content.callBackData));
                        activeObjects[callBackId] = {
                            time: instance.instance.start || 0,
                            id: instance.id,
                            callBack: instance.content.callBack,
                            callBackStopped: instance.content.callBackStopped,
                            callBackData: instance.content.callBackData,
                            startTime: instance.instance.start
                        };
                    }
                }
                catch (e) {
                    this.emit('error', `callback to core, obj "${instance.id}"`, e);
                }
            });
            this._doOnTime.queue(tlState.time, undefined, (sentCallbacksNew) => {
                this._diffStateForCallbacks(sentCallbacksNew);
            }, activeObjects);
            this.emit('debug', 'resolveTimeline at time ' + resolveTime + ' done in ' + (Date.now() - startTime) + 'ms (size: ' + timeline.length + ')');
        }
        catch (e) {
            this.emit('error', 'resolveTimeline' + e + '\nStack: ' + e.stack);
        }
        // Report time taken to resolve
        this.statReport(statMeasureStart, {
            timelineStartResolve: statTimeTimelineStartResolve,
            timelineResolved: statTimeTimelineResolved,
            stateHandled: statTimeStateHandled,
            done: Date.now()
        });
        // Try to trigger the next resolval
        try {
            this._triggerResolveTimeline(timeUntilNextResolve);
        }
        catch (e) {
            this.emit('error', 'triggerResolveTimeline', e);
        }
        return nextResolveTime;
    }
    /**
     * Returns a time estimate for the resolval duration based on the amount of
     * objects on the timeline. If the proActiveResolve option is falsy this
     * returns 0.
     */
    estimateResolveTime() {
        if (this._options.proActiveResolve) {
            let objectCount = this.timeline.length;
            let sizeFactor = Math.pow(objectCount / 50, 0.5) * 50; // a pretty nice-looking graph that levels out when objectCount is larger
            return (Math.min(200, Math.floor(exports.DEFAULT_PREPARATION_TIME +
                sizeFactor * 0.5 // add ms for every object (ish) in timeline
            )));
        }
        else {
            return 0;
        }
    }
    _diffStateForCallbacks(activeObjects) {
        let sentCallbacks = this._sentCallbacks;
        const time = this.getCurrentTime();
        // clear callbacks scheduled after the current tlState
        _.each(sentCallbacks, (o, callbackId) => {
            if (o.time >= time) {
                delete sentCallbacks[callbackId];
            }
        });
        // Send callbacks for started objects
        _.each(activeObjects, (cb, callBackId) => {
            if (cb.callBack && cb.startTime) {
                if (!sentCallbacks[callBackId]) {
                    // Object has started playing
                    this._queueCallback(true, {
                        type: 'start',
                        time: cb.startTime,
                        instanceId: cb.id,
                        callBack: cb.callBack,
                        callBackData: cb.callBackData
                    });
                }
                else {
                    // callback already sent, do nothing
                }
            }
        });
        // Send callbacks for stopped objects
        _.each(sentCallbacks, (cb, callBackId) => {
            if (cb.callBackStopped && !activeObjects[callBackId]) {
                // Object has stopped playing
                this._queueCallback(false, {
                    type: 'stop',
                    time: time,
                    instanceId: cb.id,
                    callBack: cb.callBackStopped,
                    callBackData: cb.callBackData
                });
            }
        });
        this._sentCallbacks = activeObjects;
    }
    _queueCallback(playing, cb) {
        let o;
        if (this._callbackInstances[cb.instanceId]) {
            o = this._callbackInstances[cb.instanceId];
        }
        else {
            o = {
                playing: undefined,
                playChanged: false,
                endChanged: false
            };
            this._callbackInstances[cb.instanceId] = o;
        }
        if (o.playing !== playing) {
            this.emit('debug', `_queueCallback ${playing ? 'playing' : 'stopping'} instance ${cb.instanceId}`);
            if (playing) {
                if (o.endChanged &&
                    o.endTime &&
                    Math.abs(cb.time - o.endTime) < CALLBACK_WAIT_TIME) {
                    // Too little time has passed since last time. Annihilate that event instead:
                    o.playing = playing;
                    o.endTime = undefined;
                    o.endCallback = undefined;
                    o.endChanged = false;
                }
                else {
                    o.playing = playing;
                    o.playChanged = true;
                    o.playTime = cb.time;
                    o.playCallback = cb;
                }
            }
            else {
                if (o.playChanged &&
                    o.playTime &&
                    Math.abs(cb.time - o.playTime) < CALLBACK_WAIT_TIME) {
                    // Too little time has passed since last time. Annihilate that event instead:
                    o.playing = playing;
                    o.playTime = undefined;
                    o.playCallback = undefined;
                    o.playChanged = false;
                }
                else {
                    o.playing = playing;
                    o.endChanged = true;
                    o.endTime = cb.time;
                    o.endCallback = cb;
                }
            }
        }
        else {
            this.emit('warning', `_queueCallback ${playing ? 'playing' : 'stopping'} instance ${cb.instanceId} already playing/stopped`);
        }
        this._triggerSendStartStopCallbacks();
    }
    _triggerSendStartStopCallbacks() {
        if (!this._triggerSendStartStopCallbacksTimeout) {
            this._triggerSendStartStopCallbacksTimeout = setTimeout(() => {
                this._triggerSendStartStopCallbacksTimeout = null;
                this._sendStartStopCallbacks();
            }, CALLBACK_WAIT_TIME);
        }
    }
    _sendStartStopCallbacks() {
        const now = this.getCurrentTime();
        let haveThingsToSendLater = false;
        const callbacks = [];
        _.each(this._callbackInstances, (o, instanceId) => {
            if (o.endChanged &&
                o.endTime &&
                o.endCallback) {
                if (o.endTime < now - CALLBACK_WAIT_TIME) {
                    callbacks.push(o.endCallback);
                    o.endChanged = false;
                }
                else {
                    haveThingsToSendLater = true;
                }
            }
            if (o.playChanged &&
                o.playTime &&
                o.playCallback) {
                if (o.playTime < now - CALLBACK_WAIT_TIME) {
                    callbacks.push(o.playCallback);
                    o.playChanged = false;
                }
                else {
                    haveThingsToSendLater = true;
                }
            }
            if (!haveThingsToSendLater &&
                !o.playChanged &&
                !o.endChanged) {
                delete this._callbackInstances[instanceId];
            }
        });
        // Sort the callbacks:
        let callbacksArray = _.values(callbacks).sort((a, b) => {
            if (a.type === 'start' && b.type !== 'start')
                return 1;
            if (a.type !== 'start' && b.type === 'start')
                return -1;
            if ((a.time || 0) > (b.time || 0))
                return 1;
            if ((a.time || 0) < (b.time || 0))
                return -1;
            return 0;
        });
        // emit callbacks
        _.each(callbacksArray, cb => {
            this.emit('timelineCallback', cb.time, cb.instanceId, cb.callBack, cb.callBackData);
        });
        if (haveThingsToSendLater) {
            this._triggerSendStartStopCallbacks();
        }
    }
    statStartMeasure(reason) {
        // Start a measure of response times
        if (!this._statMeasureStart) {
            this._statMeasureStart = Date.now();
            this._statMeasureReason = reason;
        }
    }
    statReport(startTime, report) {
        // Check if the report is from the start of a measuring
        if (this._statMeasureStart &&
            this._statMeasureStart === startTime) {
            // Save the report:
            const reportDuration = {
                reason: this._statMeasureReason,
                timelineStartResolve: report.timelineStartResolve - startTime,
                timelineResolved: report.timelineResolved - startTime,
                stateHandled: report.stateHandled - startTime,
                done: report.done - startTime
            };
            this._statReports.push(reportDuration);
            this._statMeasureStart = 0;
            this._statMeasureReason = '';
            this.emit('info', 'statReport', JSON.stringify(reportDuration));
            this.emit('statReport', reportDuration);
        }
    }
    /**
     * Split the state into substates that are relevant for each device
     */
    getFilteredLayers(layers, device) {
        let filteredState = {};
        const deviceId = device.deviceId;
        const deviceType = device.deviceType;
        _.each(layers, (o, layerId) => {
            const oExt = o;
            let mapping = this._mapping[o.layer + ''];
            if (!mapping && oExt.isLookahead && oExt.lookaheadForLayer) {
                mapping = this._mapping[oExt.lookaheadForLayer];
            }
            if (mapping) {
                if (mapping.deviceId === deviceId &&
                    mapping.device === deviceType) {
                    filteredState[layerId] = o;
                }
            }
        });
        return filteredState;
    }
}
exports.Conductor = Conductor;
//# sourceMappingURL=conductor.js.map