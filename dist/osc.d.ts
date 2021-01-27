import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
export declare type OSCEasingType = 'Linear' | 'Quadratic' | 'Cubic' | 'Quartic' | 'Quintic' | 'Sinusoidal' | 'Exponential' | 'Circular' | 'Elastic' | 'Back' | 'Bounce';
export declare enum OSCDeviceType {
    TCP = "tcp",
    UDP = "udp"
}
export interface OSCOptions {
    host: string;
    port: number;
    type: OSCDeviceType;
}
export interface MappingOSC extends Mapping {
    device: DeviceType.OSC;
}
export declare enum TimelineContentTypeOSC {
    OSC = "osc"
}
export declare enum OSCValueType {
    INT = "i",
    FLOAT = "f",
    STRING = "s",
    BLOB = "b"
}
export interface OSCValueNumber {
    type: OSCValueType.INT | OSCValueType.FLOAT;
    value: number;
}
export interface OSCValueString {
    type: OSCValueType.STRING;
    value: string;
}
export interface OSCValueBlob {
    type: OSCValueType.BLOB;
    value: Uint8Array;
}
export declare type SomeOSCValue = OSCValueNumber | OSCValueString | OSCValueBlob;
export interface OSCMessageCommandContent {
    type: TimelineContentTypeOSC.OSC;
    path: string;
    values: SomeOSCValue[];
    transition?: {
        duration: number;
        type: OSCEasingType;
        direction: 'In' | 'Out' | 'InOut' | 'None';
    };
    from?: SomeOSCValue[];
}
export declare type TimelineObjOSCAny = TimelineObjOSCMessage;
export interface TimelineObjOSC extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.OSC;
        type: TimelineContentTypeOSC;
    };
}
export interface TimelineObjOSCMessage extends TimelineObjOSC {
    content: {
        deviceType: DeviceType.OSC;
    } & OSCMessageCommandContent;
}
