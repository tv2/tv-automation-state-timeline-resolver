"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const request = require("request");
const xml = require("xml-js");
const src_1 = require("../types/src");
const _ = require("underscore");
const PING_INTERVAL = 10 * 1000;
class VMix extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.pingInterval = PING_INTERVAL;
        this._connected = false;
        this._disposed = false;
        this._socketKeepAliveTimeout = null;
    }
    connect(options) {
        return this._connectHTTP(options);
    }
    get connected() {
        return this._connected;
    }
    dispose() {
        return new Promise((resolve) => {
            this._connected = false;
            this._disposed = true;
            if (this._socketKeepAliveTimeout) {
                clearTimeout(this._socketKeepAliveTimeout);
                this._socketKeepAliveTimeout = null;
            }
            resolve();
        });
    }
    _connectHTTP(options) {
        if (options) {
            if (!(options.host.startsWith('http://') || options.host.startsWith('https://'))) {
                options.host = `http://${options.host}`;
            }
            this._options = options;
        }
        return new Promise((resolve) => {
            this.once('initialized', () => {
                this.emit('stateChanged', this.state);
                resolve(true);
            });
            this.getVMixState();
        });
    }
    setConnected(connected) {
        if (connected !== this._connected) {
            this._connected = connected;
            if (connected) {
                this.emit('connected');
            }
            else {
                this.emit('disconnected');
            }
        }
    }
    _stillAlive() {
        if (this._socketKeepAliveTimeout) {
            clearTimeout(this._socketKeepAliveTimeout);
            this._socketKeepAliveTimeout = null;
        }
        if (!this._disposed) {
            this._socketKeepAliveTimeout = setTimeout(() => {
                this.getVMixState();
            }, this.pingInterval);
        }
    }
    async sendCommand(command) {
        switch (command.command) {
            case src_1.VMixCommand.PREVIEW_INPUT:
                return this.setPreviewInput(command.input, command.mix);
            case src_1.VMixCommand.TRANSITION:
                return this.transition(command.input, command.effect, command.duration, command.mix);
            case src_1.VMixCommand.AUDIO_VOLUME:
                return this.setAudioLevel(command.input, command.value, command.fade);
            case src_1.VMixCommand.AUDIO_BALANCE:
                return this.setAudioBalance(command.input, command.value);
            case src_1.VMixCommand.AUDIO_ON:
                return this.setAudioOn(command.input);
            case src_1.VMixCommand.AUDIO_OFF:
                return this.setAudioOff(command.input);
            case src_1.VMixCommand.AUDIO_AUTO_ON:
                return this.setAudioAutoOn(command.input);
            case src_1.VMixCommand.AUDIO_AUTO_OFF:
                return this.setAudioAutoOff(command.input);
            case src_1.VMixCommand.AUDIO_BUS_ON:
                return this.setAudioBusOn(command.input, command.value);
            case src_1.VMixCommand.AUDIO_BUS_OFF:
                return this.setAudioBusOff(command.input, command.value);
            case src_1.VMixCommand.FADER:
                return this.setFader(command.value);
            case src_1.VMixCommand.START_RECORDING:
                return this.startRecording();
            case src_1.VMixCommand.STOP_RECORDING:
                return this.stopRecording();
            case src_1.VMixCommand.START_STREAMING:
                return this.startStreaming();
            case src_1.VMixCommand.STOP_STREAMING:
                return this.stopStreaming();
            case src_1.VMixCommand.FADE_TO_BLACK:
                return this.fadeToBlack();
            case src_1.VMixCommand.ADD_INPUT:
                return this.addInput(command.value);
            case src_1.VMixCommand.REMOVE_INPUT:
                return this.removeInput(command.input);
            case src_1.VMixCommand.PLAY_INPUT:
                return this.playInput(command.input);
            case src_1.VMixCommand.PAUSE_INPUT:
                return this.pauseInput(command.input);
            case src_1.VMixCommand.SET_POSITION:
                return this.setPosition(command.input, command.value);
            case src_1.VMixCommand.SET_PAN_X:
                return this.setPanX(command.input, command.value);
            case src_1.VMixCommand.SET_PAN_Y:
                return this.setPanY(command.input, command.value);
            case src_1.VMixCommand.SET_ZOOM:
                return this.setZoom(command.input, command.value);
            case src_1.VMixCommand.SET_ALPHA:
                return this.setAlpha(command.input, command.value);
            case src_1.VMixCommand.LOOP_ON:
                return this.loopOn(command.input);
            case src_1.VMixCommand.LOOP_OFF:
                return this.loopOff(command.input);
            case src_1.VMixCommand.SET_INPUT_NAME:
                return this.setInputName(command.input, command.value);
            case src_1.VMixCommand.SET_OUPUT:
                return this.setOutput(command.name, command.value, command.input);
            case src_1.VMixCommand.START_EXTERNAL:
                return this.startExternal();
            case src_1.VMixCommand.STOP_EXTERNAL:
                return this.stopExternal();
            case src_1.VMixCommand.OVERLAY_INPUT_IN:
                return this.overlayInputIn(command.value, command.input);
            case src_1.VMixCommand.OVERLAY_INPUT_OUT:
                return this.overlayInputOut(command.value);
            case src_1.VMixCommand.SET_INPUT_OVERLAY:
                return this.setInputOverlay(command.input, command.index, command.value);
            default:
                throw new Error(`vmixAPI: Command ${(command || {}).command} not implemented`);
        }
    }
    getVMixState() {
        request.get(`${this._options.host}:${this._options.port}/api`, {}, (error, res) => {
            if (error) {
                this.setConnected(false);
            }
            else {
                this.parseVMixState(res.body);
                this.emit('initialized');
                this.setConnected(true);
            }
            this._stillAlive();
        });
    }
    parseVMixState(responseBody) {
        const preParsed = xml.xml2json(responseBody, { compact: true, spaces: 4 });
        const xmlState = JSON.parse(preParsed);
        let mixes = xmlState['vmix']['mix'];
        mixes = Array.isArray(mixes) ? mixes : (mixes ? [mixes] : []);
        let fixedInputsCount = 0;
        // For what lies ahead I apologise - Tom
        let state = {
            version: xmlState['vmix']['version']['_text'],
            edition: xmlState['vmix']['edition']['_text'],
            inputs: _.indexBy(xmlState['vmix']['inputs']['input']
                .map((input) => {
                if (!(input['_attributes']['type'] in src_1.VMixInputType)) {
                    fixedInputsCount++;
                }
                return {
                    number: Number(input['_attributes']['number']),
                    type: input['_attributes']['type'],
                    state: input['_attributes']['state'],
                    position: Number(input['_attributes']['position']) || 0,
                    duration: Number(input['_attributes']['duration']) || 0,
                    loop: (input['_attributes']['loop'] === 'False') ? false : true,
                    muted: (input['_attributes']['muted'] === 'False') ? false : true,
                    volume: Number(input['_attributes']['volume'] || 100),
                    balance: Number(input['_attributes']['balance'] || 0),
                    audioBuses: input['_attributes']['audiobusses'],
                    transform: {
                        panX: Number(input['position'] ? input['position']['_attributes']['panX'] || 0 : 0),
                        panY: Number(input['position'] ? input['position']['_attributes']['panY'] || 0 : 0),
                        alpha: -1,
                        zoom: Number(input['position'] ? input['position']['_attributes']['zoomX'] || 1 : 1) // assume that zoomX==zoomY
                    }
                };
            }), 'number'),
            overlays: xmlState['vmix']['overlays']['overlay'].map(overlay => {
                return {
                    number: Number(overlay['_attributes']['number']),
                    input: overlay['_text']
                };
            }),
            mixes: [
                {
                    number: 1,
                    program: Number(xmlState['vmix']['active']['_text']),
                    preview: Number(xmlState['vmix']['preview']['_text']),
                    transition: { effect: src_1.VMixTransitionType.Cut, duration: 0 }
                },
                ...mixes.map((mix) => {
                    return {
                        number: Number(mix['_attributes']['number']),
                        program: Number(mix['active']['_text']),
                        preview: Number(mix['preview']['_text']),
                        transition: { effect: src_1.VMixTransitionType.Cut, duration: 0 }
                    };
                })
            ],
            fadeToBlack: (xmlState['vmix']['fadeToBlack']['_text'] === 'True') ? true : false,
            recording: (xmlState['vmix']['recording']['_text'] === 'True') ? true : false,
            external: (xmlState['vmix']['external']['_text'] === 'True') ? true : false,
            streaming: (xmlState['vmix']['streaming']['_text'] === 'True') ? true : false,
            playlist: (xmlState['vmix']['playList']['_text'] === 'True') ? true : false,
            multiCorder: (xmlState['vmix']['multiCorder']['_text'] === 'True') ? true : false,
            fullscreen: (xmlState['vmix']['fullscreen']['_text'] === 'True') ? true : false,
            audio: [
                {
                    volume: Number(xmlState['vmix']['audio']['master']['_attributes']['volume']),
                    muted: (xmlState['vmix']['audio']['master']['_attributes']['muted'] === 'True') ? true : false,
                    meterF1: Number(xmlState['vmix']['audio']['master']['_attributes']['meterF1']),
                    meterF2: Number(xmlState['vmix']['audio']['master']['_attributes']['meterF2']),
                    headphonesVolume: Number(xmlState['vmix']['audio']['master']['_attributes']['headphonesVolume'])
                }
            ],
            fixedInputsCount
        };
        this.setState(state);
    }
    setState(state) {
        this.state = state;
    }
    setPreviewInput(input, mix) {
        return this.sendCommandFunction('PreviewInput', { input, mix });
    }
    transition(input, effect, duration, mix) {
        return this.sendCommandFunction(effect, { input, duration, mix });
    }
    setAudioLevel(input, volume, fade) {
        let value = Math.min(Math.max(volume, 0), 100).toString();
        if (fade) {
            value += ',' + fade.toString();
        }
        return this.sendCommandFunction(`SetVolume${fade ? 'Fade' : ''}`, { input: input, value });
    }
    setAudioBalance(input, balance) {
        return this.sendCommandFunction(`SetBalance`, { input, value: Math.min(Math.max(balance, -1), 1) });
    }
    setAudioOn(input) {
        return this.sendCommandFunction(`AudioOn`, { input });
    }
    setAudioOff(input) {
        return this.sendCommandFunction(`AudioOff`, { input });
    }
    setAudioAutoOn(input) {
        return this.sendCommandFunction(`AudioAutoOn`, { input });
    }
    setAudioAutoOff(input) {
        return this.sendCommandFunction(`AudioAutoOff`, { input });
    }
    setAudioBusOn(input, value) {
        return this.sendCommandFunction(`AudioBusOn`, { input, value });
    }
    setAudioBusOff(input, value) {
        return this.sendCommandFunction(`AudioBusOff`, { input, value });
    }
    setFader(position) {
        return this.sendCommandFunction(`SetFader`, { value: Math.min(Math.max(position, 0), 255) });
    }
    setPanX(input, value) {
        return this.sendCommandFunction(`SetPanX`, { input, value: Math.min(Math.max(value, -2), 2) });
    }
    setPanY(input, value) {
        return this.sendCommandFunction(`SetPanY`, { input, value: Math.min(Math.max(value, -2), 2) });
    }
    setZoom(input, value) {
        return this.sendCommandFunction(`SetZoom`, { input, value: Math.min(Math.max(value, 0), 5) });
    }
    setAlpha(input, value) {
        return this.sendCommandFunction(`SetAlpha`, { input, value: Math.min(Math.max(value, 0), 255) });
    }
    startRecording() {
        return this.sendCommandFunction(`StartRecording`, {});
    }
    stopRecording() {
        return this.sendCommandFunction(`StopRecording`, {});
    }
    startStreaming() {
        return this.sendCommandFunction(`StartStreaming`, {});
    }
    stopStreaming() {
        return this.sendCommandFunction(`StopStreaming`, {});
    }
    fadeToBlack() {
        return this.sendCommandFunction(`FadeToBlack`, {});
    }
    addInput(file) {
        return this.sendCommandFunction(`AddInput`, { value: file });
    }
    removeInput(name) {
        return this.sendCommandFunction(`RemoveInput`, { input: name });
    }
    playInput(input) {
        return this.sendCommandFunction(`Play`, { input: input });
    }
    pauseInput(input) {
        return this.sendCommandFunction(`Pause`, { input: input });
    }
    setPosition(input, value) {
        return this.sendCommandFunction(`SetPosition`, { input: input, value: value });
    }
    loopOn(input) {
        return this.sendCommandFunction(`LoopOn`, { input: input });
    }
    loopOff(input) {
        return this.sendCommandFunction(`LoopOff`, { input: input });
    }
    setInputName(input, value) {
        return this.sendCommandFunction(`SetInputName`, { input: input, value: value });
    }
    setOutput(name, value, input) {
        return this.sendCommandFunction(`SetOutput${name}`, { value, input });
    }
    startExternal() {
        return this.sendCommandFunction(`StartExternal`, {});
    }
    stopExternal() {
        return this.sendCommandFunction(`StopExternal`, {});
    }
    overlayInputIn(name, input) {
        return this.sendCommandFunction(`OverlayInput${name}In`, { input: input });
    }
    overlayInputOut(name) {
        return this.sendCommandFunction(`OverlayInput${name}Out`, {});
    }
    setInputOverlay(input, index, value) {
        let val = `${index},${value}`;
        return this.sendCommandFunction(`SetMultiViewOverlay`, { input, value: val });
    }
    sendCommandFunction(func, args) {
        const inp = args.input !== undefined ? `&Input=${args.input}` : '';
        const val = args.value !== undefined ? `&Value=${args.value}` : '';
        const dur = args.duration !== undefined ? `&Duration=${args.duration}` : '';
        const mix = args.mix !== undefined ? `&Mix=${args.mix}` : '';
        const ext = args.extra !== undefined ? args.extra : '';
        const command = `${this._options.host}:${this._options.port}/api/?Function=${func}${inp}${val}${dur}${mix}${ext}`;
        this.emit('debug', `Sending command: ${command}`);
        return new Promise((resolve, reject) => {
            request.get(command, {}, (error) => {
                if (error) {
                    this.setConnected(false);
                    reject(error);
                }
                else {
                    this._stillAlive();
                    this.setConnected(true);
                    resolve();
                }
            });
        });
    }
}
exports.VMix = VMix;
//# sourceMappingURL=vmixAPI.js.map