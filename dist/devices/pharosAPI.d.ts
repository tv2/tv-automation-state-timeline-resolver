/// <reference types="node" />
import { EventEmitter } from 'events';
/**
 * Note: This work is derived from
 * http://www.pharoscontrols.com/assets/documentation/manuals/Pharos%20Designer%202%20User%20Manual%20-%20A4.pdf
 */
declare type Primitives = string | number | boolean | null | undefined;
export interface Options {
    host: string;
    ssl?: boolean;
}
export interface SystemInfo {
    bootloader_version: string;
    channel_capacity: number;
    default_gateway: string;
    firmware_version: string;
    hardware_type: string;
    ip_address: string;
    last_boot_time: string;
    memory_free: string;
    memory_total: string;
    memory_used: string;
    reset_reason: string;
    serial_number: string;
    storage_size: string;
    subnet_mask: string;
}
export interface ProjectInfo {
    author: string;
    filename: string;
    name: string;
    unique_id: string;
    upload_date: string;
}
export interface CurrentTime {
    datetime: string;
    local_time: number;
    uptime: number;
}
export interface TimelineInfo {
    timelines: Array<{
        audio_band: number;
        audio_channel: 'left' | 'right' | 'combined';
        audio_peak: boolean;
        group: 'A' | 'B' | 'C' | 'D' | '';
        length: number;
        name: string;
        num: number;
        onstage: boolean;
        position: number;
        priority: 'high' | 'above_normal' | 'normal' | 'below_normal' | 'low';
        source_bus: 'internal' | 'timecode_1' | 'timecode_2' | 'timecode_3' | 'timecode_4' | 'timecode_5' | 'timecode_6' | 'audio_1' | 'audio_2' | 'audio_3' | 'audio_4';
        state: 'none' | 'running' | 'paused' | 'holding_at_end' | 'released';
        time_offset: number;
        timecode_format: string;
    }>;
}
export interface SceneInfo {
    scenes: Array<{
        name: string;
        num: number;
        state: 'none' | 'started';
        onstage: boolean;
    }>;
}
export interface GroupInfo {
    groups: Array<{
        level: number;
        name: string;
        num: number;
    }>;
}
export interface ContentTargetInfo {
}
export interface ControllerInfo {
    controllers: Array<{
        ip_address: string;
        name: string;
        num: number;
        online: boolean;
        serial: string;
        type: string;
    }>;
}
export interface RemoteDeviceInfo {
    remote_devices: Array<{
        num: number;
        type: string;
        serial: Array<string>;
        outputs: Array<{
            output: number;
            value: boolean;
        }>;
        inputs: Array<{
            input: number;
            type: string;
            value: boolean;
        }>;
        online: boolean;
    }>;
}
export interface Temperature {
    temp: {
        sys_temp: number;
        core1_temp: number;
        core2_temp: number;
        ambient_temp: number;
        cc_temp: number;
        gpu_temp: number;
    };
}
export interface FanSpeed {
    fan_speed: boolean | any;
}
export interface TextSlot {
    text_slots: Array<{
        name: string;
        value: string;
    }>;
}
export interface Protocols {
    outputs: Array<{
        disabled: boolean;
        name: string;
        type: number;
        universes: Array<{
            name: string;
            key: {
                index?: number;
                kinet_port?: number;
                kinet_power_supply_num?: number;
            };
        }>;
        dmx_proxy?: Array<{
            name: string;
            ip_address: string;
        }>;
    }>;
}
export interface Output {
    channels: Array<number>;
    disabled: boolean;
    proxied_tpc_name?: string;
}
export interface LuaVariables {
    [key: string]: any;
}
export interface Triggers {
    triggers: Array<{
        actions: Array<{
            text: string;
        }>;
        conditions: Array<{
            text: string;
        }>;
        name: string;
        num: number;
        trigger_text: string;
        type: string;
    }>;
}
export declare enum Protocol {
    DMX = "dmx",
    PATHPORT = "pathport",
    ARTNET = "art-net",
    KINET = "kinet",
    SACN = "sacn",
    DVI = "dvi",
    RIODMX = "rio-dmx"
}
export interface RGBOptions {
    intensity?: number;
    red?: number;
    green?: number;
    blue?: number;
    temperature?: number;
    fade?: number;
    path?: 'Default' | 'Linear' | 'Start' | 'End' | 'Braked' | 'Accelerated' | 'Damped' | 'Overshoot';
}
/**
 * Implementation of the Pharos V2 http API
 */
export declare class Pharos extends EventEmitter {
    private _socket;
    private _keepAlive;
    private _replyReceived;
    private _queryString;
    private _serverSessionKey;
    private _reconnectAttempts;
    private _isConnecting;
    private _isReconnecting;
    private _aboutToReconnect;
    private _pendingMessages;
    private _requestPromises;
    private _broadcastCallbacks;
    private _options;
    private _connected;
    private _webSocketKeepAliveTimeout;
    connect(options: Options): Promise<void>;
    readonly connected: boolean;
    dispose(): Promise<void>;
    getSystemInfo(): Promise<SystemInfo>;
    getProjectInfo(): Promise<ProjectInfo>;
    getCurrentTime(): Promise<CurrentTime>;
    /**
     * @param params Example: { num: '1,2,5-9' }
     */
    getTimelineInfo(num?: string | number): Promise<TimelineInfo>;
    /**
     * @param params Example: { num: '1,2,5-9' }
     */
    getSceneInfo(num?: string | number): Promise<SceneInfo>;
    /**
     * @param params Example: { num: '1,2,5-9' }
     */
    getGroupInfo(num?: string | number): Promise<GroupInfo>;
    getContentTargetInfo(): Promise<ContentTargetInfo>;
    getControllerInfo(): Promise<ControllerInfo>;
    getRemoteDeviceInfo(): Promise<RemoteDeviceInfo>;
    getTemperature(): Promise<Temperature>;
    getFanSpeed(): Promise<FanSpeed>;
    getTextSlot(names?: string | Array<string>): Promise<TextSlot>;
    getProtocols(): Promise<Protocols>;
    /**
     * @param key {universe?: universeKey} Example: "dmx:1", "rio-dmx:rio44:1" // DMX, Pathport, sACN and Art-Net, protocol:kinetPowerSupplyNum:kinetPort for KiNET and protocol:remoteDeviceType:remoteDeviceNum for RIO DMX
     */
    getOutput(universe?: string): Promise<Output>;
    getLuaVariables(vars?: string | Array<string>): Promise<LuaVariables>;
    getTriggers(): Promise<Triggers>;
    subscribeTimelineStatus(callback: any): Promise<void>;
    subscribeSceneStatus(callback: any): Promise<void>;
    subscribeGroupStatus(callback: any): Promise<void>;
    subscribeContentTargetStatus(callback: any): Promise<void>;
    subscribeRemoteDeviceStatus(callback: any): Promise<void>;
    subscribeBeacon(callback: any): Promise<void>;
    subscribeLua(callback: any): Promise<void>;
    startTimeline(timelineNum: number): Promise<{}>;
    startScene(sceneNum: number): Promise<{}>;
    releaseTimeline(timelineNum: number, fade?: number): Promise<{}>;
    releaseScene(sceneNum: number, fade?: number): Promise<{}>;
    toggleTimeline(timelineNum: number, fade?: number): Promise<{}>;
    toggleScene(sceneNum: number, fade?: number): Promise<{}>;
    pauseTimeline(timelineNum: number): Promise<{}>;
    resumeTimeline(timelineNum: number): Promise<{}>;
    pauseAll(): Promise<{}>;
    resumeAll(): Promise<{}>;
    releaseAllTimelines(group?: string | null, fade?: number): Promise<{}>;
    releaseAllScenes(group?: string, fade?: number): Promise<{}>;
    releaseAll(group?: string, fade?: number): Promise<{}>;
    setTimelineRate(timelineNum: number, rate: number): Promise<{}>;
    setTimelinePosition(timelineNum: number, position: number): Promise<{}>;
    fireTrigger(triggerNum: number, vars?: Array<any>, testConditions?: boolean): Promise<{}>;
    runCommand(input: string): Promise<{}>;
    /**
     * Master the intensity of a group (applied as a multiplier to output levels)
     * @param groupNum
     * @param level integer
     * @param fade float
     * @param delay float
     */
    masterIntensity(groupNum: number, level: number, fade?: number, delay?: number): Promise<{}>;
    /**
     * VLC/VLC +: Master the intensity of a content target (applied as a multiplier to output levels)
     * @param type type - of content target, 'primary', 'secondary', 'overlay_1', 'overlay_2'...
     * @param level integer
     * @param fade float
     * @param delay float
     */
    masterContentTargetIntensity(type: string, level: number, fade?: number, delay?: number): Promise<{}>;
    setGroupOverride(groupNum: number, options: RGBOptions): Promise<{}>;
    setFixtureOverride(fixtureNum: number, options: RGBOptions): Promise<{}>;
    clearGroupOverrides(groupNum?: number, fade?: number): Promise<{}>;
    clearFixtureOverrides(fixtureNum?: number, fade?: number): Promise<{}>;
    clearAllOverrides(fade?: number): Promise<{}>;
    enableOutput(protocol: Protocol): Promise<{}>;
    disableOutput(protocol: Protocol): Promise<{}>;
    setTextSlot(slot: string, value: string): Promise<{}>;
    flashBeacon(): Promise<{}>;
    parkChannel(universeKey: string, channelList: Array<number | string>, level: number): Promise<{}>;
    unparkChannel(universeKey: string, channelList: Array<number | string>): Promise<{}>;
    getLog(): Promise<{}>;
    clearLog(): Promise<{}>;
    /**
     * power reboot
     */
    resetHardware(): Promise<{}>;
    setInternalPage(isInternal: any): void;
    request(id: string, params?: {
        [name: string]: any;
    }): Promise<any>;
    subscribe(id: string, callback: Function): Promise<void>;
    command(method: 'GET' | 'POST' | 'DELETE' | 'PUT', url0: string, data0?: {
        [key: string]: Primitives;
    }): Promise<{}>;
    private _connectSocket;
    private _sendMessage;
    private _webSocketKeepAlive;
    private _reconnect;
    private _onReceiveMessage;
    private _handleWebsocketReconnection;
    private _connectionChanged;
}
export {};
