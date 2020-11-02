"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const _ = require("underscore");
const underScoreDeepExtend = require("underscore-deep-extend");
const path = require("path");
const device_1 = require("./device");
const src_1 = require("../types/src");
const doOnTime_1 = require("../doOnTime");
const vmixAPI_1 = require("./vmixAPI");
const vmix_1 = require("../types/src/vmix");
_.mixin({ deepExtend: underScoreDeepExtend(_) });
function deepExtend(destination, ...sources) {
    // @ts-ignore (mixin)
    return _.deepExtend(destination, ...sources);
}
/**
 * This is a VMixDevice, it sends commands when it feels like it
 */
class VMixDevice extends device_1.DeviceWithState {
    constructor(deviceId, deviceOptions, options) {
        super(deviceId, deviceOptions, options);
        this._connected = false;
        this._initialized = false;
        if (deviceOptions.options) {
            if (deviceOptions.options.commandReceiver)
                this._commandReceiver = deviceOptions.options.commandReceiver;
            else
                this._commandReceiver = this._defaultCommandReceiver;
        }
        this._doOnTime = new doOnTime_1.DoOnTime(() => {
            return this.getCurrentTime();
        }, doOnTime_1.SendMode.IN_ORDER, this._deviceOptions);
        this._doOnTime.on('error', e => this.emit('error', 'VMix.doOnTime', e));
        this._doOnTime.on('slowCommand', msg => this.emit('slowCommand', this.deviceName + ': ' + msg));
    }
    init(options) {
        this._vmix = new vmixAPI_1.VMix();
        this._vmix.on('connected', () => {
            let time = this.getCurrentTime();
            let state = this._getDefaultState();
            deepExtend(state, { reportedState: this._vmix.state });
            this.setState(state, time);
            this._initialized = true;
            this._setConnected(true);
            this.emit('resetResolver');
        });
        this._vmix.on('disconnected', () => {
            this._setConnected(false);
        });
        this._vmix.on('error', (e) => this.emit('error', 'VMix', e));
        this._vmix.on('stateChanged', (state) => this._onVMixStateChanged(state));
        this._vmix.on('debug', (...args) => this.emit('debug', ...args));
        return this._vmix.connect(options);
    }
    _connectionChanged() {
        this.emit('connectionChanged', this.getStatus());
    }
    _setConnected(connected) {
        if (this._connected !== connected) {
            this._connected = connected;
            this._connectionChanged();
        }
    }
    _onVMixStateChanged(newState) {
        const time = this.getCurrentTime();
        let oldState = (this.getStateBefore(time) || { state: this._getDefaultState() }).state;
        oldState.reportedState = newState;
        this.setState(oldState, time);
    }
    _getDefaultInputState(num) {
        return {
            number: num,
            position: 0,
            muted: true,
            loop: false,
            playing: false,
            volume: 100,
            balance: 0,
            fade: 0,
            audioBuses: 'M',
            audioAuto: true,
            transform: {
                zoom: 1,
                panX: 0,
                panY: 0,
                alpha: 255
            },
            overlays: {}
        };
    }
    _getDefaultInputsState(count) {
        const defaultInputs = {};
        for (let i = 1; i <= count; i++) {
            defaultInputs[i] = this._getDefaultInputState(i);
        }
        return defaultInputs;
    }
    _getDefaultState() {
        return {
            reportedState: {
                version: '',
                edition: '',
                fixedInputsCount: 0,
                inputs: this._getDefaultInputsState(this._vmix.state.fixedInputsCount),
                overlays: _.map([1, 2, 3, 4, 5, 6], num => {
                    return {
                        number: num,
                        input: undefined
                    };
                }),
                mixes: _.map([1, 2, 3, 4], num => {
                    return {
                        number: num,
                        program: undefined,
                        preview: undefined,
                        transition: { effect: vmix_1.VMixTransitionType.Cut, duration: 0 }
                    };
                }),
                fadeToBlack: false,
                faderPosition: 0,
                recording: false,
                external: false,
                streaming: false,
                playlist: false,
                multiCorder: false,
                fullscreen: false,
                audio: []
            },
            outputs: {
                '2': { source: 'Program' },
                '3': { source: 'Program' },
                '4': { source: 'Program' },
                'External2': { source: 'Program' },
                'Fullscreen': { source: 'Program' },
                'Fullscreen2': { source: 'Program' }
            },
            inputLayers: {}
        };
    }
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime) {
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(newStateTime + 0.1);
        this.cleanUpStates(0, newStateTime + 0.1);
    }
    handleState(newState, newMappings) {
        super.onHandleState(newState, newMappings);
        if (!this._initialized) { // before it's initialized don't do anything
            this.emit('warning', 'VMix not initialized yet');
            return;
        }
        let previousStateTime = Math.max(this.getCurrentTime() + 0.1, newState.time);
        let oldState = (this.getStateBefore(previousStateTime) || { state: this._getDefaultState() }).state;
        let newVMixState = this.convertStateToVMix(newState, newMappings);
        let commandsToAchieveState = this._diffStates(oldState, newVMixState);
        // clear any queued commands later than this time:
        this._doOnTime.clearQueueNowAndAfter(previousStateTime);
        // add the new commands to the queue:
        this._addToQueue(commandsToAchieveState, newState.time);
        // store the new state, for later use:
        this.setState(newVMixState, newState.time);
    }
    clearFuture(clearAfterTime) {
        // Clear any scheduled commands after this time
        this._doOnTime.clearQueueAfter(clearAfterTime);
    }
    async terminate() {
        this._doOnTime.dispose();
        await this._vmix.dispose();
        return Promise.resolve(true);
    }
    getStatus() {
        let statusCode = device_1.StatusCode.GOOD;
        let messages = [];
        if (!this._connected) {
            statusCode = device_1.StatusCode.BAD;
            messages.push('Not connected');
        }
        return {
            statusCode: statusCode,
            messages: messages,
            active: this.isActive
        };
    }
    async makeReady(okToDestroyStuff) {
        if (okToDestroyStuff) {
            // do something?
        }
    }
    get canConnect() {
        return false;
    }
    get connected() {
        return false;
    }
    convertStateToVMix(state, mappings) {
        if (!this._initialized)
            throw Error('convertStateToVMix cannot be used before inititialized');
        let deviceState = this._getDefaultState();
        // Sort layer based on Mapping type (to make sure audio is after inputs) and Layer name
        const sortedLayers = _.sortBy(_.map(state.layers, (tlObject, layerName) => ({ layerName, tlObject, mapping: mappings[layerName] }))
            .sort((a, b) => a.layerName.localeCompare(b.layerName)), o => o.mapping.mappingType);
        _.each(sortedLayers, ({ tlObject, layerName, mapping }) => {
            if (mapping) {
                switch (mapping.mappingType) {
                    case vmix_1.MappingVMixType.Program:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.PROGRAM) {
                            let vmixTlProgram = tlObject;
                            let mixProgram = (mapping.index || 1) - 1;
                            if (vmixTlProgram.content.input !== undefined) {
                                this.switchToInput(vmixTlProgram.content.input, deviceState, mixProgram, vmixTlProgram.content.transition);
                            }
                            else if (vmixTlProgram.content.inputLayer) {
                                this.switchToInput(vmixTlProgram.content.inputLayer, deviceState, mixProgram, vmixTlProgram.content.transition, true);
                            }
                        }
                        break;
                    case vmix_1.MappingVMixType.Preview:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.PREVIEW) {
                            let vmixTlPreview = tlObject;
                            let mixPreview = (mapping.index || 1) - 1;
                            if (vmixTlPreview.content.input)
                                deviceState.reportedState.mixes[mixPreview].preview = vmixTlPreview.content.input;
                        }
                        break;
                    case vmix_1.MappingVMixType.AudioChannel:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.AUDIO) {
                            let vmixTlAudio = tlObject;
                            let vmixTlAudioPicked = _.pick(vmixTlAudio.content, 'volume', 'balance', 'audioAuto', 'audioBuses', 'muted', 'fade');
                            let vmixAudioMapping = mapping;
                            if (vmixAudioMapping.index) {
                                deviceState.reportedState.inputs = this.modifyInput(deviceState, vmixTlAudioPicked, { key: vmixAudioMapping.index });
                            }
                            else if (vmixAudioMapping.inputLayer) {
                                deviceState.reportedState.inputs = this.modifyInput(deviceState, vmixTlAudioPicked, { layer: vmixAudioMapping.inputLayer });
                            }
                        }
                        break;
                    case vmix_1.MappingVMixType.Fader:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.FADER) {
                            let vmixTlFader = tlObject;
                            deviceState.reportedState.faderPosition = vmixTlFader.content.position;
                        }
                        break;
                    case vmix_1.MappingVMixType.Recording:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.RECORDING) {
                            let vmixTlRecording = tlObject;
                            deviceState.reportedState.recording = vmixTlRecording.content.on;
                        }
                        break;
                    case vmix_1.MappingVMixType.Streaming:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.STREAMING) {
                            let vmixTlStreaming = tlObject;
                            deviceState.reportedState.streaming = vmixTlStreaming.content.on;
                        }
                        break;
                    case vmix_1.MappingVMixType.External:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.EXTERNAL) {
                            let vmixTlExternal = tlObject;
                            deviceState.reportedState.external = vmixTlExternal.content.on;
                        }
                        break;
                    case vmix_1.MappingVMixType.FadeToBlack:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.FADE_TO_BLACK) {
                            let vmixTlFTB = tlObject;
                            deviceState.reportedState.fadeToBlack = vmixTlFTB.content.on;
                        }
                        break;
                    case vmix_1.MappingVMixType.Input:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.INPUT) {
                            let vmixTlMedia = tlObject;
                            deviceState.reportedState.inputs = this.modifyInput(deviceState, {
                                type: vmixTlMedia.content.inputType,
                                playing: vmixTlMedia.content.playing,
                                loop: vmixTlMedia.content.loop,
                                position: vmixTlMedia.content.seek,
                                transform: vmixTlMedia.content.transform,
                                overlays: vmixTlMedia.content.overlays
                            }, { key: mapping.index || vmixTlMedia.content.filePath }, layerName);
                        }
                        break;
                    case vmix_1.MappingVMixType.Output:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.OUTPUT) {
                            let tlObjSetOutput = tlObject;
                            deviceState.outputs[mapping.index] = {
                                source: tlObjSetOutput.content.source,
                                input: tlObjSetOutput.content.input
                            };
                        }
                        break;
                    case vmix_1.MappingVMixType.Overlay:
                        if (tlObject.content.type === vmix_1.TimelineContentTypeVMix.OVERLAY) {
                            let tlObjOverlayInputIn = tlObject;
                            let overlayIndex = mapping.index - 1;
                            deviceState.reportedState.overlays[overlayIndex].input = tlObjOverlayInputIn.content.input;
                        }
                        break;
                }
            }
        });
        return deviceState;
    }
    getFilename(filePath) {
        return path.basename(filePath);
    }
    modifyInput(deviceState, newInput, input, layerName) {
        let inputs = deviceState.reportedState.inputs;
        let newInputPicked = _.pick(newInput, x => !_.isUndefined(x));
        let inputKey;
        if (input.layer) {
            inputKey = deviceState.inputLayers[input.layer];
        }
        else {
            inputKey = input.key;
        }
        if (inputKey) {
            if (inputKey in inputs) {
                deepExtend(inputs[inputKey], newInputPicked);
            }
            else {
                let inputState = this._getDefaultInputState(0);
                deepExtend(inputState, newInputPicked);
                inputs[inputKey] = inputState;
            }
            if (layerName) {
                deviceState.inputLayers[layerName] = inputKey;
            }
        }
        return inputs;
    }
    switchToInput(input, deviceState, mix, transition, layerToProgram = false) {
        let mixState = deviceState.reportedState.mixes[mix];
        if (mixState.program === undefined ||
            mixState.program !== input // mixing numeric and string input names can be dangerous
        ) {
            mixState.preview = mixState.program;
            mixState.program = input;
            mixState.transition = transition || { effect: vmix_1.VMixTransitionType.Cut, duration: 0 };
            mixState.layerToProgram = layerToProgram;
        }
    }
    get deviceType() {
        return src_1.DeviceType.VMIX;
    }
    get deviceName() {
        return 'VMix ' + this.deviceId;
    }
    get queue() {
        return this._doOnTime.getQueue();
    }
    _addToQueue(commandsToAchieveState, time) {
        _.each(commandsToAchieveState, (cmd) => {
            // add the new commands to the queue:
            this._doOnTime.queue(time, undefined, (cmd) => {
                return this._commandReceiver(time, cmd, cmd.context, cmd.timelineId);
            }, cmd);
        });
    }
    _resolveMixState(oldVMixState, newVMixState) {
        let commands = [];
        for (let i = 0; i < 4; i++) {
            let oldMixState = oldVMixState.reportedState.mixes[i];
            let newMixState = newVMixState.reportedState.mixes[i];
            if (newMixState.program !== undefined) {
                let nextInput = newMixState.program;
                let changeOnLayer = false;
                if (newMixState.layerToProgram) {
                    nextInput = newVMixState.inputLayers[newMixState.program];
                    changeOnLayer = newVMixState.inputLayers[newMixState.program] !== oldVMixState.inputLayers[newMixState.program];
                }
                if (oldMixState.program !== newMixState.program || changeOnLayer) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.TRANSITION,
                            effect: changeOnLayer ? vmix_1.VMixTransitionType.Cut : newMixState.transition.effect,
                            input: nextInput,
                            duration: changeOnLayer ? 0 : newMixState.transition.duration,
                            mix: i
                        },
                        context: null,
                        timelineId: ''
                    });
                }
            }
            if (oldMixState.program === newMixState.program && // if we're not switching what is on program, because it could break a transition
                newMixState.preview !== undefined &&
                newMixState.preview !== oldMixState.preview) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.PREVIEW_INPUT,
                        input: newMixState.preview,
                        mix: i
                    },
                    context: null,
                    timelineId: ''
                });
            }
        }
        // Only set fader bar position if no other transitions are happening
        if (oldVMixState.reportedState.mixes[0].program === newVMixState.reportedState.mixes[0].program) {
            if (newVMixState.reportedState.faderPosition !== oldVMixState.reportedState.faderPosition) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.FADER,
                        value: newVMixState.reportedState.faderPosition || 0
                    },
                    context: null,
                    timelineId: ''
                });
                // newVMixState.reportedState.program = undefined
                // newVMixState.reportedState.preview = undefined
                newVMixState.reportedState.fadeToBlack = false;
            }
        }
        if (oldVMixState.reportedState.fadeToBlack !== newVMixState.reportedState.fadeToBlack) {
            // Danger: Fade to black is toggled, we can't explicitly say that we want it on or off
            commands.push({
                command: {
                    command: vmix_1.VMixCommand.FADE_TO_BLACK
                },
                context: null,
                timelineId: ''
            });
        }
        return commands;
    }
    _resolveInputsState(oldVMixState, newVMixState) {
        let commands = [];
        _.each(newVMixState.reportedState.inputs, (input, key) => {
            if (input.name === undefined) {
                input.name = key;
            }
            if (!_.has(oldVMixState.reportedState.inputs, key) && input.type !== undefined) {
                let addCommands = [];
                addCommands.push({
                    command: {
                        command: vmix_1.VMixCommand.ADD_INPUT,
                        value: `${input.type}|${input.name}`
                    },
                    context: null,
                    timelineId: ''
                });
                addCommands.push({
                    command: {
                        command: vmix_1.VMixCommand.SET_INPUT_NAME,
                        input: this.getFilename(input.name),
                        value: input.name
                    },
                    context: null,
                    timelineId: ''
                });
                this._addToQueue(addCommands, this.getCurrentTime());
            }
            let oldInput = oldVMixState.reportedState.inputs[key] || this._getDefaultInputState(0); // or {} but we assume that a new input has all parameters default
            if (input.playing !== undefined && oldInput.playing !== input.playing && !input.playing) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.PAUSE_INPUT,
                        input: input.name
                    },
                    context: null,
                    timelineId: ''
                });
            }
            if (oldInput.position !== input.position) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.SET_POSITION,
                        input: key,
                        value: input.position ? input.position : 0
                    },
                    context: null,
                    timelineId: ''
                });
            }
            if (input.loop !== undefined && oldInput.loop !== input.loop) {
                if (input.loop) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.LOOP_ON,
                            input: input.name
                        },
                        context: null,
                        timelineId: ''
                    });
                }
                else {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.LOOP_OFF,
                            input: input.name
                        },
                        context: null,
                        timelineId: ''
                    });
                }
            }
            if (input.muted !== undefined && oldInput.muted !== input.muted && input.muted) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.AUDIO_OFF,
                        input: key
                    },
                    context: null,
                    timelineId: ''
                });
            }
            if (oldInput.volume !== input.volume && input.volume !== undefined) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.AUDIO_VOLUME,
                        input: key,
                        value: input.volume,
                        fade: input.fade
                    },
                    context: null,
                    timelineId: ''
                });
            }
            if (oldInput.balance !== input.balance && input.balance !== undefined) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.AUDIO_BALANCE,
                        input: key,
                        value: input.balance
                    },
                    context: null,
                    timelineId: ''
                });
            }
            if (input.audioAuto !== undefined && oldInput.audioAuto !== input.audioAuto) {
                if (!input.audioAuto) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.AUDIO_AUTO_OFF,
                            input: key
                        },
                        context: null,
                        timelineId: ''
                    });
                }
                else {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.AUDIO_AUTO_ON,
                            input: key
                        },
                        context: null,
                        timelineId: ''
                    });
                }
            }
            if (input.audioBuses !== undefined && oldInput.audioBuses !== input.audioBuses) {
                let oldBuses = (oldInput.audioBuses || '').split(',').filter(x => x);
                let newBuses = input.audioBuses.split(',').filter(x => x);
                _.difference(newBuses, oldBuses).forEach(bus => {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.AUDIO_BUS_ON,
                            input: key,
                            value: bus
                        },
                        context: null,
                        timelineId: ''
                    });
                });
                _.difference(oldBuses, newBuses).forEach(bus => {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.AUDIO_BUS_OFF,
                            input: key,
                            value: bus
                        },
                        context: null,
                        timelineId: ''
                    });
                });
            }
            if (input.muted !== undefined && oldInput.muted !== input.muted && !input.muted) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.AUDIO_ON,
                        input: key
                    },
                    context: null,
                    timelineId: ''
                });
            }
            if (input.transform !== undefined && !_.isEqual(oldInput.transform, input.transform)) {
                if (oldInput.transform === undefined || input.transform.zoom !== oldInput.transform.zoom) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.SET_ZOOM,
                            input: key,
                            value: input.transform.zoom
                        },
                        context: null,
                        timelineId: ''
                    });
                }
                if (oldInput.transform === undefined || input.transform.alpha !== oldInput.transform.alpha) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.SET_ALPHA,
                            input: key,
                            value: input.transform.alpha
                        },
                        context: null,
                        timelineId: ''
                    });
                }
                if (oldInput.transform === undefined || input.transform.panX !== oldInput.transform.panX) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.SET_PAN_X,
                            input: key,
                            value: input.transform.panX
                        },
                        context: null,
                        timelineId: ''
                    });
                }
                if (oldInput.transform === undefined || input.transform.panY !== oldInput.transform.panY) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.SET_PAN_Y,
                            input: key,
                            value: input.transform.panY
                        },
                        context: null,
                        timelineId: ''
                    });
                }
            }
            if (input.overlays !== undefined && !_.isEqual(oldInput.overlays, input.overlays)) {
                _.difference(Object.keys(input.overlays), Object.keys(oldInput.overlays || {}))
                    .forEach(index => {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.SET_INPUT_OVERLAY,
                            input: key,
                            value: input.overlays[index],
                            index: Number(index)
                        },
                        context: null,
                        timelineId: ''
                    });
                });
                _.difference(Object.keys(oldInput.overlays || {}), Object.keys(input.overlays))
                    .forEach(index => {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.SET_INPUT_OVERLAY,
                            input: key,
                            value: '',
                            index: Number(index)
                        },
                        context: null,
                        timelineId: ''
                    });
                });
            }
            if (input.playing !== undefined && oldInput.playing !== input.playing && input.playing) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.PLAY_INPUT,
                        input: input.name
                    },
                    context: null,
                    timelineId: ''
                });
            }
        });
        return commands;
    }
    _resolveInputsRemovalState(oldVMixState, newVMixState) {
        let commands = [];
        _.difference(Object.keys(oldVMixState.reportedState.inputs), Object.keys(newVMixState.reportedState.inputs))
            .forEach(input => {
            if (oldVMixState.reportedState.inputs[input].type !== undefined) {
                // TODO: either schedule this command for later or make the timeline object long enough to prevent removing while transitioning
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.REMOVE_INPUT,
                        input: oldVMixState.reportedState.inputs[input].name || input
                    },
                    context: null,
                    timelineId: ''
                });
            }
        });
        return commands;
    }
    _resolveOverlaysState(oldVMixState, newVMixState) {
        let commands = [];
        _.each(newVMixState.reportedState.overlays, (overlay, index) => {
            let oldOverlay = oldVMixState.reportedState.overlays[index];
            if (oldOverlay.input !== overlay.input) {
                if (overlay.input === undefined) {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.OVERLAY_INPUT_OUT,
                            value: overlay.number
                        },
                        context: null,
                        timelineId: ''
                    });
                }
                else {
                    commands.push({
                        command: {
                            command: vmix_1.VMixCommand.OVERLAY_INPUT_IN,
                            input: overlay.input,
                            value: overlay.number
                        },
                        context: null,
                        timelineId: ''
                    });
                }
            }
        });
        return commands;
    }
    _resolveRecordingState(oldVMixState, newVMixState) {
        let commands = [];
        if (oldVMixState.reportedState.recording !== newVMixState.reportedState.recording) {
            if (newVMixState.reportedState.recording) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.START_RECORDING
                    },
                    context: null,
                    timelineId: ''
                });
            }
            else {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.STOP_RECORDING
                    },
                    context: null,
                    timelineId: ''
                });
            }
        }
        return commands;
    }
    _resolveStreamingState(oldVMixState, newVMixState) {
        let commands = [];
        if (oldVMixState.reportedState.streaming !== newVMixState.reportedState.streaming) {
            if (newVMixState.reportedState.streaming) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.START_STREAMING
                    },
                    context: null,
                    timelineId: ''
                });
            }
            else {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.STOP_STREAMING
                    },
                    context: null,
                    timelineId: ''
                });
            }
        }
        return commands;
    }
    _resolveExternalState(oldVMixState, newVMixState) {
        let commands = [];
        if (oldVMixState.reportedState.external !== newVMixState.reportedState.external) {
            if (newVMixState.reportedState.external) {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.START_EXTERNAL
                    },
                    context: null,
                    timelineId: ''
                });
            }
            else {
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.STOP_EXTERNAL
                    },
                    context: null,
                    timelineId: ''
                });
            }
        }
        return commands;
    }
    _resolveOutputsState(oldVMixState, newVMixState) {
        let commands = [];
        _.map(newVMixState.outputs, (output, name) => {
            if (!_.isEqual(output, oldVMixState.outputs[name])) {
                let value = output.source === 'Program' ? 'Output' : output.source;
                commands.push({
                    command: {
                        command: vmix_1.VMixCommand.SET_OUPUT,
                        value,
                        input: output.input,
                        name
                    },
                    context: null,
                    timelineId: ''
                });
            }
        });
        return commands;
    }
    _diffStates(oldVMixState, newVMixState) {
        let commands = [];
        commands = commands.concat(this._resolveInputsState(oldVMixState, newVMixState));
        commands = commands.concat(this._resolveMixState(oldVMixState, newVMixState));
        commands = commands.concat(this._resolveOverlaysState(oldVMixState, newVMixState));
        commands = commands.concat(this._resolveRecordingState(oldVMixState, newVMixState));
        commands = commands.concat(this._resolveStreamingState(oldVMixState, newVMixState));
        commands = commands.concat(this._resolveExternalState(oldVMixState, newVMixState));
        commands = commands.concat(this._resolveOutputsState(oldVMixState, newVMixState));
        commands = commands.concat(this._resolveInputsRemovalState(oldVMixState, newVMixState));
        return commands;
    }
    _defaultCommandReceiver(_time, cmd, context, timelineObjId) {
        let cwc = {
            context: context,
            command: cmd,
            timelineObjId: timelineObjId
        };
        this.emit('debug', cwc);
        return this._vmix.sendCommand(cmd.command)
            .catch(error => {
            this.emit('commandError', error, cwc);
        });
    }
}
exports.VMixDevice = VMixDevice;
class VMixStateExtended {
}
exports.VMixStateExtended = VMixStateExtended;
class VMixState {
}
exports.VMixState = VMixState;
//# sourceMappingURL=vmix.js.map