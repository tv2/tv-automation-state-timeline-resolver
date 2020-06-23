/// <reference types="node" />
import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
export interface MappingTCPSend extends Mapping {
    device: DeviceType.TCPSEND;
}
export interface TcpSendCommandContent {
    message: string;
    temporalPriority?: number;
    /** Commands in the same queue will be sent in order (will wait for the previous to finish before sending next */
    queueId?: string;
}
export interface TCPSendOptions {
    makeReadyCommands?: TcpSendCommandContent[];
    /** Whether a makeReady should be treated as a reset of the device. It should be assumed clean, with the queue discarded, and state reapplied from empty */
    makeReadyDoesReset?: boolean;
    host: string;
    port: number;
    bufferEncoding?: BufferEncoding;
}
export declare enum TimelineContentTypeTcp {
    GET = "get",
    POST = "post",
    PUT = "put",
    DELETE = "delete"
}
export declare type TimelineObjTCPSendAny = TimelineObjTCPRequest;
export interface TimelineObjTCPSendBase extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.TCPSEND;
    };
}
export interface TimelineObjTCPRequest extends TimelineObjTCPSendBase {
    content: {
        deviceType: DeviceType.TCPSEND;
    } & TcpSendCommandContent;
}
