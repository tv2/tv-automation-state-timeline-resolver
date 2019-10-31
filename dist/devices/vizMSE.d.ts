import { DeviceWithState, DeviceStatus } from './device';
import { DeviceType, DeviceOptions, VizMSEOptions, TimelineContentTypeVizMSE, ExpectedPlayoutItemContent, ExpectedPlayoutItemContentVizMSE } from '../types/src';
import { TimelineState } from 'superfly-timeline';
export declare function getHash(str: string): string;
export interface VizMSEDeviceOptions extends DeviceOptions {
    options?: {
        commandReceiver?: CommandReceiver;
    };
}
export declare type CommandReceiver = (time: number, cmd: VizMSECommand, context: string, timelineObjId: string) => Promise<any>;
/**
 * This class is used to interface with a vizRT Media Sequence Editor, through the v-connection library
 */
export declare class VizMSEDevice extends DeviceWithState<VizMSEState> {
    private _vizMSE?;
    private _vizmseManager?;
    private _commandReceiver;
    private _doOnTime;
    private _connectionOptions?;
    private _vizMSEConnected;
    constructor(deviceId: string, deviceOptions: VizMSEDeviceOptions, options: any);
    init(connectionOptions: VizMSEOptions): Promise<boolean>;
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
    /**
     * Takes a timeline state and returns a VizMSE State that will work with the state lib.
     * @param timelineState The timeline state to generate from.
     */
    convertStateToVizMSE(timelineState: TimelineState): VizMSEState;
    /**
     * Prepares the physical device for playout.
     * @param okToDestroyStuff Whether it is OK to do things that affects playout visibly
     */
    makeReady(okToDestroyStuff?: boolean): Promise<void>;
    /**
     * The standDown event could be triggered at a time after broadcast
     * @param okToDestroyStuff If true, the device may do things that might affect the visible output
     */
    standDown(okToDestroyStuff?: boolean): Promise<void>;
    getStatus(): DeviceStatus;
    private _diffStates;
    private _doCommand;
    /**
     * Use either AMCP Command Scheduling or the doOnTime to execute commands at
     * {@code time}.
     * @param commandsToAchieveState Commands to be added to queue
     * @param time Point in time to send commands at
     */
    private _addToQueue;
    /**
     * Sends commands to the VizMSE ISA server
     * @param time deprecated
     * @param cmd Command to execute
     */
    private _defaultCommandReceiver;
    private _connectionChanged;
}
interface VizMSEState {
    time: number;
    layer: {
        [layerId: string]: VizMSEStateLayer;
    };
}
declare type VizMSEStateLayer = VizMSEStateLayerInternal | VizMSEStateLayerPilot;
interface VizMSEStateLayerBase {
    timelineObjId: string;
    contentType: TimelineContentTypeVizMSE;
    continueStep?: number;
    lookahead?: boolean;
}
interface VizMSEStateLayerInternal extends VizMSEStateLayerBase {
    contentType: TimelineContentTypeVizMSE.ELEMENT_INTERNAL;
    templateName: string;
    templateData: Array<string>;
}
interface VizMSEStateLayerPilot extends VizMSEStateLayerBase {
    contentType: TimelineContentTypeVizMSE.ELEMENT_PILOT;
    templateVcpId: number;
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
    CONTINUE_ELEMENT_REVERSE = "continuereverse"
}
interface VizMSECommandElementBase extends VizMSECommandBase, ExpectedPlayoutItemContentVizMSEInternal {
}
interface VizMSECommandPrepare extends VizMSECommandElementBase {
    type: VizMSECommandType.PREPARE_ELEMENT;
}
interface VizMSECommandCue extends VizMSECommandElementBase {
    type: VizMSECommandType.CUE_ELEMENT;
}
interface VizMSECommandTake extends VizMSECommandElementBase {
    type: VizMSECommandType.TAKE_ELEMENT;
}
interface VizMSECommandTakeOut extends VizMSECommandBase {
    type: VizMSECommandType.TAKEOUT_ELEMENT;
    elementName: string | number;
}
interface VizMSECommandContinue extends VizMSECommandBase {
    type: VizMSECommandType.CONTINUE_ELEMENT;
    templateInstance: string | number;
}
interface VizMSECommandContinueReverse extends VizMSECommandBase {
    type: VizMSECommandType.CONTINUE_ELEMENT_REVERSE;
    templateInstance: string | number;
}
declare type VizMSECommand = VizMSECommandPrepare | VizMSECommandCue | VizMSECommandTake | VizMSECommandTakeOut | VizMSECommandContinue | VizMSECommandContinueReverse;
/** Tracked state of the vizMSE */
interface ExpectedPlayoutItemContentVizMSEInternal extends ExpectedPlayoutItemContentVizMSE {
    /** Name of the instance of the element in MSE, generated by us */
    templateInstance: string;
}
export {};
