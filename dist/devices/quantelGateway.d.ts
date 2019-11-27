/// <reference types="node" />
import { EventEmitter } from 'events';
export declare class QuantelGateway extends EventEmitter {
    checkStatusInterval: number;
    private _gatewayUrl;
    private _initialized;
    private _ISAUrl;
    private _zoneId;
    private _serverId;
    private _monitorInterval;
    private _statusMessage;
    private _cachedServer?;
    private _monitorPorts;
    private _connected;
    constructor();
    init(gatewayUrl: string, ISAUrl: string, zoneId: string | undefined, serverId: number): Promise<void>;
    connectToISA(ISAUrl?: string): Promise<any>;
    dispose(): void;
    monitorServerStatus(callbackOnStatusChange: (connected: boolean, errorMessage: string | null) => void): void;
    get connected(): boolean;
    get statusMessage(): string | null;
    get initialized(): boolean;
    get gatewayUrl(): string;
    get ISAUrl(): string;
    get zoneId(): string;
    get serverId(): number;
    getZones(): Promise<Q.ZoneInfo[]>;
    getServers(zoneId: string): Promise<Q.ServerInfo[]>;
    /** Return the (possibly cached) server */
    getServer(): Promise<Q.ServerInfo | null>;
    /** Create a port and connect it to a channel */
    getPort(portId: string): Promise<Q.PortStatus | null>;
    /**
     * Create (allocate) a new port
     */
    createPort(portId: string, channelId: number): Promise<Q.PortInfo>;
    /**
     * Release (remove) an allocated port
     */
    releasePort(portId: string): Promise<Q.ReleaseStatus>;
    /**
     * Reset a port, this removes all fragments and resets the playhead of the port
     */
    resetPort(portId: string): Promise<Q.ReleaseStatus>;
    /** Get info about a clip */
    getClip(clipId: number): Promise<Q.ClipData | null>;
    searchClip(searchQuery: ClipSearchQuery): Promise<Q.ClipDataSummary[]>;
    getClipFragments(clipId: number): Promise<Q.ServerFragments>;
    getClipFragments(clipId: number, inPoint: number, outPoint: number): Promise<Q.ServerFragments>;
    /** Load specified fragments onto a port */
    loadFragmentsOntoPort(portId: string, fragments: Q.ServerFragmentTypes[], offset?: number): Promise<Q.PortLoadStatus>;
    /** Query the port for which fragments are loaded. */
    getFragmentsOnPort(portId: string, rangeStart?: number, rangeEnd?: number): Promise<Q.ServerFragments>;
    /** Start playing on a port */
    portPlay(portId: string): Promise<Q.TriggerResult>;
    /** Stop (pause) playback on a port. If stopAtFrame is provided, the playback will stop at the frame specified. */
    portStop(portId: string, stopAtFrame?: number): Promise<Q.TriggerResult>;
    /** Schedule a jump. When the playhead reaches the frame, it'll jump */
    portScheduleJump(portId: string, jumpToFrame: number): Promise<Q.JumpResult>;
    /** Jump directly to a frame, note that this might cause flicker on the output, as the frames haven't been preloaded  */
    portHardJump(portId: string, jumpToFrame?: number): Promise<Q.JumpResult>;
    /** Prepare a jump to a frame (so that those frames are preloaded into memory) */
    portPrepareJump(portId: string, jumpToFrame?: number): Promise<Q.JumpResult>;
    /** After having preloading a jump, trigger the jump */
    portTriggerJump(portId: string): Promise<Q.TriggerResult>;
    /** Clear all fragments from a port.
     * If rangeStart and rangeEnd is provided, will clear the fragments for that time range,
     * if not, the fragments up until (but not including) the playhead, will be cleared
     */
    portClearFragments(portId: string, rangeStart?: number, rangeEnd?: number): Promise<Q.WipeResult>;
    setMonitoredPorts(monitorPorts: MonitorPorts): void;
    kill(): Promise<any>;
    private sendServer;
    private sendZone;
    private sendBase;
    private sendRaw;
    private sendRawInner;
    private urlQuery;
    /**
     * If the response is an error, instead throw the error instead of returning it
     */
    private _ensureGoodResponse;
    private _isAnErrorResponse;
}
export interface MonitorPorts {
    [portId: string]: {
        channels: number[];
    };
}
export interface QuantelErrorResponse {
    status: number;
    message: string;
    stack: string;
}
export declare type Optional<T> = {
    [K in keyof T]?: T[K];
};
export declare type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export interface ClipSearchQuery {
    /** Limit the maximum number of clips returned */
    limit?: number;
    ClipID?: number;
    CloneID?: number;
    Completed?: string;
    Created?: string;
    Description?: string;
    Frames?: string;
    Owner?: string;
    PoolID?: number;
    Title?: string;
    Category?: string;
    CloneZone?: number;
    Destination?: number;
    Expiry?: string;
    HasEditData?: number;
    Inpoint?: number;
    JobID?: number;
    Modified?: string;
    NumAudTracks?: number;
    Number?: number;
    NumVidTracks?: number;
    Outpoint?: number;
    PlayAspect?: string;
    PublishedBy?: string;
    Register?: string;
    Tape?: string;
    Template?: number;
    UnEdited?: number;
    PlayMode?: string;
    Division?: string;
    AudioFormats?: string;
    VideoFormats?: string;
    ClipGUID?: string;
    Protection?: string;
    VDCPID?: string;
    PublishCompleted?: string;
    [index: string]: string | number | undefined;
}
export declare namespace Q {
    type DateString = string;
    interface ZoneInfo {
        type: 'ZonePortal';
        zoneNumber: number;
        zoneName: string;
        isRemote: boolean;
    }
    interface ServerInfo {
        type: 'Server';
        ident: number;
        down: boolean;
        name?: string;
        numChannels?: number;
        pools?: number[];
        portNames?: string[];
        chanPorts?: string[];
    }
    interface PortRef {
        serverID: number | string;
        portName: string;
    }
    interface PortInfo extends PortRef {
        type?: 'PortInfo';
        channelNo: number;
        portID?: number;
        audioOnly?: boolean;
        assigned?: boolean;
    }
    interface PortStatus extends PortRef {
        type: 'PortStatus';
        portID: number;
        refTime: string;
        portTime: string;
        speed: number;
        offset: number;
        status: string;
        endOfData: number;
        framesUnused: number;
        outputTime: string;
        channels: number[];
        videoFormat: string;
    }
    interface ReleaseRef extends PortRef {
        resetOnly?: boolean;
    }
    interface ReleaseStatus extends ReleaseRef {
        type: 'ReleaseStatus';
        released: boolean;
        resetOnly: boolean;
    }
    interface ClipRef {
        clipID: number;
    }
    interface FragmentRef extends ClipRef {
        start?: number;
        finish?: number;
    }
    interface PortFragmentRef extends PortRef {
        start?: number;
        finish?: number;
    }
    interface ClipPropertyList {
        [name: string]: string | number;
    }
    interface ClipDataSummary {
        type: 'ClipDataSummary' | 'ClipData';
        ClipID: number;
        ClipGUID: string;
        CloneId: number | null;
        Completed: DateString | null;
        Created: DateString;
        Description: string;
        Frames: string;
        Owner: string;
        PoolID: number | null;
        Title: string;
    }
    interface ClipData extends ClipDataSummary {
        type: 'ClipData';
        Category: string;
        CloneZone: number | null;
        Destination: number | null;
        Expiry: DateString | null;
        HasEditData: number | null;
        Inpoint: number | null;
        JobID: number | null;
        Modified: string | null;
        NumAudTracks: number | null;
        Number: number | null;
        NumVidTracks: number | null;
        Outpoint: number | null;
        PlaceHolder: boolean;
        PlayAspect: string;
        PublishedBy: string;
        Register: string;
        Tape: string;
        Template: number | null;
        UnEdited: number | null;
        PlayMode: string;
        MosActive: boolean;
        Division: string;
        AudioFormats: string;
        VideoFormats: string;
        Protection: string;
        VDCPID: string;
        PublishCompleted: DateString | null;
    }
    interface ServerFragment {
        type: string;
        trackNum: number;
        start: number;
        finish: number;
    }
    type ServerFragmentTypes = VideoFragment | AudioFragment | AUXFragment | FlagsFragment | TimecodeFragment | AspectFragment | CropFragment | PanZoomFragment | SpeedFragment | MultiCamFragment | CCFragment | NoteFragment | EffectFragment;
    interface PositionData extends ServerFragment {
        rushID: string;
        format: number;
        poolID: number;
        poolFrame: number;
        skew: number;
        rushFrame: number;
    }
    interface VideoFragment extends PositionData {
        type: 'VideoFragment';
    }
    interface AudioFragment extends PositionData {
        type: 'AudioFragment';
    }
    interface AUXFragment extends PositionData {
        type: 'AUXFragment';
    }
    interface FlagsFragment extends ServerFragment {
        type: 'FlagsFragment';
        flags: number;
    }
    interface TimecodeFragment extends ServerFragment {
        startTimecode: string;
        userBits: number;
    }
    interface AspectFragment extends ServerFragment {
        type: 'AspectFragment';
        width: number;
        height: number;
    }
    interface CropFragment extends ServerFragment {
        type: 'CropFragment';
        x: number;
        y: number;
        width: number;
        height: number;
    }
    interface PanZoomFragment extends ServerFragment {
        type: 'PanZoomFragment';
        x: number;
        y: number;
        hZoom: number;
        vZoon: number;
    }
    interface SpeedFragment extends ServerFragment {
        type: 'SpeedFragment';
        speed: number;
        profile: number;
    }
    interface MultiCamFragment extends ServerFragment {
        type: 'MultiCamFragment';
        stream: number;
    }
    interface CCFragment extends ServerFragment {
        type: 'CCFragment';
        ccID: string;
        ccType: number;
        effectID: number;
    }
    interface NoteFragment extends ServerFragment {
        type: 'NoteFragment';
        noteID: number;
        aux: number;
        mask: number;
        note: string | null;
    }
    interface EffectFragment extends ServerFragment {
        type: 'EffectFragment';
        effectID: number;
    }
    interface ServerFragments extends ClipRef {
        type: 'ServerFragments';
        fragments: ServerFragmentTypes[];
    }
    interface PortServerFragments extends ServerFragments, PortRef {
        clipID: -1;
    }
    interface PortLoadInfo extends PortRef {
        fragments: ServerFragmentTypes[];
        offset?: number;
    }
    interface PortLoadStatus extends PortRef {
        type: 'PortLoadStatus';
        fragmentCount: number;
        offset: number;
    }
    enum Trigger {
        START = "START",
        STOP = "STOP",
        JUMP = "JUMP",
        TRANSITION = "TRANSITION"
    }
    enum Priority {
        STANDARD = "STANDARD",
        HIGH = "HIGH"
    }
    interface TriggerInfo extends PortRef {
        trigger: Trigger;
        offset?: number;
    }
    interface TriggerResult extends TriggerInfo {
        type: 'TriggerResult';
        success: boolean;
    }
    interface JumpInfo extends PortRef {
        offset: number;
    }
    interface JumpResult extends JumpInfo {
        type: 'HardJumpResult' | 'TriggeredJumpResult';
        success: boolean;
    }
    interface ThumbnailSize {
        width: number;
        height: number;
    }
    interface ThumbnailOrder extends ClipRef {
        offset: number;
        stride: number;
        count: number;
    }
    interface ConnectionDetails {
        type: string;
        isaIOR: string;
        href: string;
        refs: string[];
        robin: number;
    }
    interface CloneRequest extends ClipRef {
        poolID: number;
        highPriority?: boolean;
    }
    interface WipeInfo extends PortRef {
        start?: number;
        frames?: number;
    }
    interface WipeResult extends WipeInfo {
        type: 'WipeResult';
        wiped: boolean;
    }
    interface FormatRef {
        formatNumber: number;
    }
    interface FormatInfo extends FormatRef {
        type: 'FormatInfo';
        essenceType: 'VideoFragment' | 'AudioFragment' | 'AUXFragment' | 'FlagsFragment' | 'TimecodeFragment' | 'AspectFragment' | 'CropFragment' | 'PanZoomFragment' | 'MultiCamFragment' | 'CCFragment' | 'NoteFragment' | 'EffectFragment' | 'Unknown';
        frameRate: number;
        height: number;
        width: number;
        samples: number;
        compressionFamily: number;
        protonsPerAtom: number;
        framesPerAtom: number;
        quark: number;
        formatName: string;
        layoutName: string;
        compressionName: string;
    }
    interface CloneInfo {
        zoneID?: number;
        clipID: number;
        poolID: number;
        priority?: number;
        history?: boolean;
    }
    interface CloneResult extends CloneInfo {
        type: 'CloneResult';
        copyID: number;
        copyCreated: boolean;
    }
    interface CopyProgress extends ClipRef {
        type: 'CopyProgress';
        totalProtons: number;
        protonsLeft: number;
        secsLeft: number;
        priority: number;
        ticketed: boolean;
    }
}
