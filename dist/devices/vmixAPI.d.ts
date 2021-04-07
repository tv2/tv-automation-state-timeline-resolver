/// <reference types="node" />
import { EventEmitter } from 'events';
import { VMixOptions, VMixCommand } from '../types/src';
import { VMixState } from './vmix';
export declare class VMix extends EventEmitter {
    state: VMixState;
    pingInterval: number;
    private _options;
    private _connected;
    private _disposed;
    private _socketKeepAliveTimeout;
    connect(options: VMixOptions): Promise<boolean>;
    get connected(): boolean;
    dispose(): Promise<void>;
    private _connectHTTP;
    private setConnected;
    private _stillAlive;
    sendCommand(command: VMixStateCommand): Promise<any>;
    getVMixState(): void;
    parseVMixState(responseBody: any): void;
    setState(state: VMixState): void;
    setPreviewInput(input: number | string, mix: number): Promise<any>;
    transition(input: number | string, effect: string, duration: number, mix: number): Promise<any>;
    setAudioLevel(input: number | string, volume: number, fade?: number): Promise<any>;
    setAudioBalance(input: number | string, balance: number): Promise<any>;
    setAudioOn(input: number | string): Promise<any>;
    setAudioOff(input: number | string): Promise<any>;
    setAudioAutoOn(input: number | string): Promise<any>;
    setAudioAutoOff(input: number | string): Promise<any>;
    setAudioBusOn(input: number | string, value: string): Promise<any>;
    setAudioBusOff(input: number | string, value: string): Promise<any>;
    setFader(position: number): Promise<any>;
    setPanX(input: number | string, value: number): Promise<any>;
    setPanY(input: number | string, value: number): Promise<any>;
    setZoom(input: number | string, value: number): Promise<any>;
    setAlpha(input: number | string, value: number): Promise<any>;
    startRecording(): Promise<any>;
    stopRecording(): Promise<any>;
    startStreaming(): Promise<any>;
    stopStreaming(): Promise<any>;
    fadeToBlack(): Promise<any>;
    addInput(file: string): Promise<any>;
    removeInput(name: string): Promise<any>;
    playInput(input: number | string): Promise<any>;
    pauseInput(input: number | string): Promise<any>;
    setPosition(input: number | string, value: number): Promise<any>;
    loopOn(input: number | string): Promise<any>;
    loopOff(input: number | string): Promise<any>;
    setInputName(input: number | string, value: string): Promise<any>;
    setOutput(name: string, value: string, input?: number | string): Promise<any>;
    startExternal(): Promise<any>;
    stopExternal(): Promise<any>;
    overlayInputIn(name: number, input: string | number): Promise<any>;
    overlayInputOut(name: number): Promise<any>;
    setInputOverlay(input: string | number, index: number, value: string | number): Promise<any>;
    sendCommandFunction(func: string, args: {
        input?: string | number;
        value?: string | number;
        extra?: string;
        duration?: number;
        mix?: number;
    }): Promise<any>;
}
export interface VMixStateCommandBase {
    command: VMixCommand;
}
export interface VMixStateCommandPreviewInput extends VMixStateCommandBase {
    command: VMixCommand.PREVIEW_INPUT;
    input: number | string;
    mix: number;
}
export interface VMixStateCommandTransition extends VMixStateCommandBase {
    command: VMixCommand.TRANSITION;
    input: number | string;
    effect: string;
    duration: number;
    mix: number;
}
export interface VMixStateCommandAudio extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_VOLUME;
    input: number | string;
    value: number;
    fade?: number;
}
export interface VMixStateCommandAudioBalance extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_BALANCE;
    input: number | string;
    value: number;
}
export interface VMixStateCommandAudioOn extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_ON;
    input: number | string;
}
export interface VMixStateCommandAudioOff extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_OFF;
    input: number | string;
}
export interface VMixStateCommandAudioAutoOn extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_AUTO_ON;
    input: number | string;
}
export interface VMixStateCommandAudioAutoOff extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_AUTO_OFF;
    input: number | string;
}
export interface VMixStateCommandAudioBusOn extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_BUS_ON;
    input: number | string;
    value: string;
}
export interface VMixStateCommandAudioBusOff extends VMixStateCommandBase {
    command: VMixCommand.AUDIO_BUS_OFF;
    input: number | string;
    value: string;
}
export interface VMixStateCommandFader extends VMixStateCommandBase {
    command: VMixCommand.FADER;
    value: number;
}
export interface VMixStateCommandSetPanX extends VMixStateCommandBase {
    command: VMixCommand.SET_PAN_X;
    input: number | string;
    value: number;
}
export interface VMixStateCommandSetPanY extends VMixStateCommandBase {
    command: VMixCommand.SET_PAN_Y;
    input: number | string;
    value: number;
}
export interface VMixStateCommandSetZoom extends VMixStateCommandBase {
    command: VMixCommand.SET_ZOOM;
    input: number | string;
    value: number;
}
export interface VMixStateCommandSetAlpha extends VMixStateCommandBase {
    command: VMixCommand.SET_ALPHA;
    input: number | string;
    value: number;
}
export interface VMixStateCommandStartStreaming extends VMixStateCommandBase {
    command: VMixCommand.START_STREAMING;
}
export interface VMixStateCommandStopStreaming extends VMixStateCommandBase {
    command: VMixCommand.STOP_STREAMING;
}
export interface VMixStateCommandStartRecording extends VMixStateCommandBase {
    command: VMixCommand.START_RECORDING;
}
export interface VMixStateCommandStopRecording extends VMixStateCommandBase {
    command: VMixCommand.STOP_RECORDING;
}
export interface VMixStateCommandFadeToBlack extends VMixStateCommandBase {
    command: VMixCommand.FADE_TO_BLACK;
}
export interface VMixStateCommandAddInput extends VMixStateCommandBase {
    command: VMixCommand.ADD_INPUT;
    value: string;
}
export interface VMixStateCommandRemoveInput extends VMixStateCommandBase {
    command: VMixCommand.REMOVE_INPUT;
    input: string;
}
export interface VMixStateCommandPlayInput extends VMixStateCommandBase {
    command: VMixCommand.PLAY_INPUT;
    input: number | string;
}
export interface VMixStateCommandPauseInput extends VMixStateCommandBase {
    command: VMixCommand.PAUSE_INPUT;
    input: number | string;
}
export interface VMixStateCommandSetPosition extends VMixStateCommandBase {
    command: VMixCommand.SET_POSITION;
    input: number | string;
    value: number;
}
export interface VMixStateCommandLoopOn extends VMixStateCommandBase {
    command: VMixCommand.LOOP_ON;
    input: number | string;
}
export interface VMixStateCommandLoopOff extends VMixStateCommandBase {
    command: VMixCommand.LOOP_OFF;
    input: number | string;
}
export interface VMixStateCommandSetInputName extends VMixStateCommandBase {
    command: VMixCommand.SET_INPUT_NAME;
    input: number | string;
    value: string;
}
export interface VMixStateCommandSetOuput extends VMixStateCommandBase {
    command: VMixCommand.SET_OUPUT;
    name: string;
    value: string;
    input?: number | string;
}
export interface VMixStateCommandStartExternal extends VMixStateCommandBase {
    command: VMixCommand.START_EXTERNAL;
}
export interface VMixStateCommandStopExternal extends VMixStateCommandBase {
    command: VMixCommand.STOP_EXTERNAL;
}
export interface VMixStateCommandOverlayInputIn extends VMixStateCommandBase {
    command: VMixCommand.OVERLAY_INPUT_IN;
    value: number;
    input: string | number;
}
export interface VMixStateCommandOverlayInputOut extends VMixStateCommandBase {
    command: VMixCommand.OVERLAY_INPUT_OUT;
    value: number;
}
export interface VMixStateCommandSetInputOverlay extends VMixStateCommandBase {
    command: VMixCommand.SET_INPUT_OVERLAY;
    input: string | number;
    index: number;
    value: string | number;
}
export declare type VMixStateCommand = VMixStateCommandPreviewInput | VMixStateCommandTransition | VMixStateCommandAudio | VMixStateCommandAudioBalance | VMixStateCommandAudioOn | VMixStateCommandAudioOff | VMixStateCommandAudioAutoOn | VMixStateCommandAudioAutoOff | VMixStateCommandAudioBusOn | VMixStateCommandAudioBusOff | VMixStateCommandFader | VMixStateCommandSetZoom | VMixStateCommandSetPanX | VMixStateCommandSetPanY | VMixStateCommandSetAlpha | VMixStateCommandStartStreaming | VMixStateCommandStopStreaming | VMixStateCommandStartRecording | VMixStateCommandStopRecording | VMixStateCommandFadeToBlack | VMixStateCommandAddInput | VMixStateCommandRemoveInput | VMixStateCommandPlayInput | VMixStateCommandPauseInput | VMixStateCommandSetPosition | VMixStateCommandLoopOn | VMixStateCommandLoopOff | VMixStateCommandSetInputName | VMixStateCommandSetOuput | VMixStateCommandStartExternal | VMixStateCommandStopExternal | VMixStateCommandOverlayInputIn | VMixStateCommandOverlayInputOut | VMixStateCommandSetInputOverlay;
