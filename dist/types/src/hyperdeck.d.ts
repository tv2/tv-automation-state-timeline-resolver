import { TimelineObject } from './superfly-timeline';
import { Mapping, DeviceType } from './mapping';
export interface MappingHyperdeck extends Mapping {
    device: DeviceType.HYPERDECK;
    mappingType: MappingHyperdeckType;
    index?: number;
}
export declare enum MappingHyperdeckType {
    TRANSPORT = "transport"
}
export interface HyperdeckOptions {
    host: string;
    port?: number;
}
export declare enum TimelineContentTypeHyperdeck {
    TRANSPORT = "transport"
}
export declare enum HyperdeckTransportStatus {
    PREVIEW = "preview",
    STOPPED = "stopped",
    PLAY = "play",
    FORWARD = "forward",
    REWIND = "rewind",
    JOG = "jog",
    SHUTTLE = "shuttle",
    RECORD = "record"
}
export declare type TimelineObjHyperdeckAny = TimelineObjHyperdeckTransport;
export interface TimelineObjHyperdeckTransport extends TimelineObject {
    content: {
        type: TimelineContentTypeHyperdeck;
        attributes: {
            status: HyperdeckTransportStatus;
            recordFilename?: string;
        };
    };
}
