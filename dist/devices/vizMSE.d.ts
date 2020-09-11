import { DeviceWithState, DeviceStatus, IDevice } from './device';
import { DeviceType, VizMSEOptions, TimelineContentTypeVizMSE, ExpectedPlayoutItemContent, VIZMSEPlayoutItemContent, DeviceOptionsVizMSE, VIZMSEOutTransition } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export declare function getHash(str: string): string;
export interface DeviceOptionsVizMSEInternal extends DeviceOptionsVizMSE {
    options: (DeviceOptionsVizMSE['options'] & {
        commandReceiver?: CommandReceiver;
    });
}
export declare type CommandReceiver = (time: number, cmd: VizMSECommand, context: string, timelineObjId: string) => Promise<any>;
/**
 * This class is used to interface with a vizRT Media Sequence Editor, through the v-connection library.
 * It features playing both "internal" graphics element and vizPilot elements.
 */
export declare class VizMSEDevice extends DeviceWithState<VizMSEState> implements IDevice {
    private _vizMSE?;
    private _vizmseManager?;
    private _commandReceiver;
    private _doOnTime;
    private _doOnTimeBurst;
    private _initOptions?;
    private _vizMSEConnected;
    constructor(deviceId: string, deviceOptions: DeviceOptionsVizMSEInternal, options: any);
    init(initOptions: VizMSEOptions): Promise<boolean>;
    /**
     * Terminates the device safely such that things can be garbage collected.
     */
    terminate(): Promise<boolean>;
    /** Called by the Conductor a bit before a .handleState is called */
    prepareForHandleState(newStateTime: number): void;
    /**
     * Generates an array of VizMSE commands by comparing the newState against the oldState, or the current device state.
     */
    handleState(newState: TimelineState): void;
    /**
     * Clear any scheduled commands after this time
     * @param clearAfterTime
     */
    clearFuture(clearAfterTime: number): void;
    readonly canConnect: boolean;
    readonly connected: boolean;
    readonly deviceType: DeviceType;
    readonly deviceName: string;
    readonly queue: {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    readonly supportsExpectedPlayoutItems: boolean;
    handleExpectedPlayoutItems(expectedPlayoutItems: Array<ExpectedPlayoutItemContent>): void;
    getCurrentState(): VizMSEState | undefined;
    connectionChanged(connected?: boolean): void;
    /**
     * Takes a timeline state and returns a VizMSE State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToVizMSE(timelineState: TimelineState): VizMSEState;
    /**
     * Prepares the physical device for playout.
     * @param okToDestroyStuff Whether it is OK to do things that affects playout visibly
     */
    makeReady(okToDestroyStuff?: boolean, activeRundownId?: string): Promise<void>;
    /**
     * The standDown event could be triggered at a time after broadcast
     * @param okToDestroyStuff If true, the device may do things that might affect the visible output
     */
    standDown(okToDestroyStuff?: boolean): Promise<void>;
    getStatus(): DeviceStatus;
    /**
     * Compares the new timeline-state with the old one, and generates commands to account for the difference
     */
    private _diffStates;
    private _doCommand;
    /**
     * Add commands to queue, to be executed at the right time
     */
    private _addToQueue;
    /**
     * Sends commands to the VizMSE server
     * @param time deprecated
     * @param cmd Command to execute
     */
    private _defaultCommandReceiver;
    ignoreWaitsInTests(): void;
}
interface VizMSEState {
    time: number;
    layer: {
        [layerId: string]: VizMSEStateLayer;
    };
    /** Special: If this is set, all other state will be disregarded and all graphics will be cleared */
    isClearAll?: {
        timelineObjId: string;
        channelsToSendCommands?: string[];
    };
}
declare type VizMSEStateLayer = VizMSEStateLayerInternal | VizMSEStateLayerPilot | VizMSEStateLayerContinue | VizMSEStateLayerLoadAllElements;
interface VizMSEStateLayerBase {
    timelineObjId: string;
    lookahead?: boolean;
    /** Whether this element should have its take delayed until after an out transition has finished */
    delayTakeAfterOutTransition?: boolean;
}
interface VizMSEStateLayerElementBase extends VizMSEStateLayerBase {
    contentType: TimelineContentTypeVizMSE;
    continueStep?: number;
    cue?: boolean;
    outTransition?: VIZMSEOutTransition;
}
interface VizMSEStateLayerInternal extends VizMSEStateLayerElementBase {
    contentType: TimelineContentTypeVizMSE.ELEMENT_INTERNAL;
    templateName: string;
    templateData: Array<string>;
    channelName?: string;
}
interface VizMSEStateLayerPilot extends VizMSEStateLayerElementBase {
    contentType: TimelineContentTypeVizMSE.ELEMENT_PILOT;
    templateVcpId: number;
    channelName?: string;
}
interface VizMSEStateLayerContinue extends VizMSEStateLayerBase {
    contentType: TimelineContentTypeVizMSE.CONTINUE;
    direction?: 1 | -1;
    reference: string;
    referenceContent?: VizMSEStateLayerInternal | VizMSEStateLayerPilot;
}
interface VizMSEStateLayerLoadAllElements extends VizMSEStateLayerBase {
    contentType: TimelineContentTypeVizMSE.LOAD_ALL_ELEMENTS;
}
interface VizMSECommandBase {
    time: number;
    type: VizMSECommandType;
    timelineObjId: string;
    fromLookahead?: boolean;
    layerId?: string;
}
export declare enum VizMSECommandType {
    PREPARE_ELEMENT = "prepare",
    CUE_ELEMENT = "cue",
    TAKE_ELEMENT = "take",
    TAKEOUT_ELEMENT = "out",
    CONTINUE_ELEMENT = "continue",
    CONTINUE_ELEMENT_REVERSE = "continuereverse",
    LOAD_ALL_ELEMENTS = "load_all_elements",
    CLEAR_ALL_ELEMENTS = "clear_all_elements",
    CLEAR_ALL_ENGINES = "clear_all_engines"
}
interface VizMSECommandElementBase extends VizMSECommandBase, VizMSEPlayoutItemContentInternal {
}
interface VizMSECommandPrepare extends VizMSECommandElementBase {
    type: VizMSECommandType.PREPARE_ELEMENT;
}
interface VizMSECommandCue extends VizMSECommandElementBase {
    type: VizMSECommandType.CUE_ELEMENT;
}
interface VizMSECommandTake extends VizMSECommandElementBase {
    type: VizMSECommandType.TAKE_ELEMENT;
    transition?: VIZMSEOutTransition;
}
interface VizMSECommandTakeOut extends VizMSECommandElementBase {
    type: VizMSECommandType.TAKEOUT_ELEMENT;
    transition?: VIZMSEOutTransition;
}
interface VizMSECommandContinue extends VizMSECommandElementBase {
    type: VizMSECommandType.CONTINUE_ELEMENT;
}
interface VizMSECommandContinueReverse extends VizMSECommandElementBase {
    type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE;
}
interface VizMSECommandLoadAllElements extends VizMSECommandBase {
    type: VizMSECommandType.LOAD_ALL_ELEMENTS;
}
interface VizMSECommandClearAllElements extends VizMSECommandBase {
    type: VizMSECommandType.CLEAR_ALL_ELEMENTS;
    templateName: string;
}
interface VizMSECommandClearAllEngines extends VizMSECommandBase {
    type: VizMSECommandType.CLEAR_ALL_ENGINES;
    channels: string[] | 'all';
    commands: string[];
}
declare type VizMSECommand = VizMSECommandPrepare | VizMSECommandCue | VizMSECommandTake | VizMSECommandTakeOut | VizMSECommandContinue | VizMSECommandContinueReverse | VizMSECommandLoadAllElements | VizMSECommandClearAllElements | VizMSECommandClearAllEngines;
interface VizMSEPlayoutItemContentInternal extends VIZMSEPlayoutItemContent {
    /** Name of the instance of the element in MSE, generated by us */
    templateInstance: string;
}
export {};
