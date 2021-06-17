import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptionsVMix, VMixOptions, Mappings } from '../types/src';
import { TimelineState } from 'superfly-timeline';
import { VMixStateCommand } from './vmixAPI';
import { VMixTransition, VMixInputType, VMixTransform, VMixInputOverlays } from '../types/src/vmix';
export interface DeviceOptionsVMixInternal extends DeviceOptionsVMix {
    options: (DeviceOptionsVMix['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: VMixStateCommandWithContext, context: CommandContext, timelineObjId: string) => Promise<any>;
declare type CommandContext = any;
export interface VMixStateCommandWithContext {
    command: VMixStateCommand;
    context: CommandContext;
    timelineId: string;
}
/**
 * This is a VMixDevice, it sends commands when it feels like it
 */
export declare class VMixDevice extends DeviceWithState<VMixStateExtended> {
    private _doOnTime;
    private _commandReceiver;
    private _vmix;
    private _connected;
    private _initialized;
    constructor(deviceId: string, deviceOptions: DeviceOptionsVMixInternal, options: any);
    init(options: VMixOptions): Promise<boolean>;
    private _connectionChanged;
    private _setConnected;
    private _onVMixStateChanged;
    private _getDefaultInputState;
    private _getDefaultInputsState;
    private _getDefaultState;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    handleState(newState: TimelineState, newMappings: Mappings): void;
    clearFuture(clearAfterTime: number): void;
    terminate(): Promise<boolean>;
    getStatus(): DeviceStatus;
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    get canConnect(): boolean;
    get connected(): boolean;
    convertStateToVMix(state: TimelineState, mappings: Mappings): VMixStateExtended;
    getFilename(filePath: string): string;
    modifyInput(deviceState: VMixStateExtended, newInput: VMixInput, input: {
        key?: string | number;
        layer?: string;
    }, layerName?: string): {
        [key: string]: VMixInput;
    };
    switchToInput(input: number | string, deviceState: VMixStateExtended, mix: number, transition?: VMixTransition, layerToProgram?: boolean): void;
    get deviceType(): DeviceType;
    get deviceName(): string;
    get queue(): {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    private _addToQueue;
    private _resolveMixState;
    private _resolveInputsState;
    private _resolveInputsRemovalState;
    private _resolveOverlaysState;
    private _resolveRecordingState;
    private _resolveStreamingState;
    private _resolveExternalState;
    private _resolveOutputsState;
    private _diffStates;
    private _defaultCommandReceiver;
}
interface VMixOutput {
    source: 'Preview' | 'Program' | 'MultiView' | 'Input';
    input?: number | string;
}
export declare class VMixStateExtended {
    reportedState: VMixState;
    outputs: {
        'External2': VMixOutput;
        '2': VMixOutput;
        '3': VMixOutput;
        '4': VMixOutput;
        'Fullscreen': VMixOutput;
        'Fullscreen2': VMixOutput;
    };
    inputLayers: {
        [key: string]: string;
    };
}
export declare class VMixState {
    version: string;
    edition: string;
    fixedInputsCount: number;
    inputs: {
        [key: string]: VMixInput;
    };
    overlays: VMixOverlay[];
    mixes: VMixMix[];
    fadeToBlack: boolean;
    faderPosition?: number;
    recording: boolean;
    external: boolean;
    streaming: boolean;
    playlist: boolean;
    multiCorder: boolean;
    fullscreen: boolean;
    audio: VMixAudioChannel[];
}
export interface VMixMix {
    number: number;
    program: string | number | undefined;
    preview: string | number | undefined;
    transition: VMixTransition;
    layerToProgram?: boolean;
}
export interface VMixInput {
    number?: number;
    type?: VMixInputType | string;
    name?: string;
    filePath?: string;
    state?: 'Paused' | 'Running' | 'Completed';
    playing?: boolean;
    position?: number;
    duration?: number;
    loop?: boolean;
    muted?: boolean;
    volume?: number;
    balance?: number;
    fade?: number;
    solo?: boolean;
    audioBuses?: string;
    audioAuto?: boolean;
    transform?: VMixTransform;
    overlays?: VMixInputOverlays;
}
export interface VMixOverlay {
    number: number;
    input: string | number | undefined;
}
export interface VMixAudioChannel {
    volume: number;
    muted: boolean;
    meterF1: number;
    meterF2: number;
    headphonesVolume: number;
}
export {};
