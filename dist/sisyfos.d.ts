import { Mapping } from './mapping';
import { DeviceType, TSRTimelineObjBase } from '.';
export interface SisyfosOptions {
    host: string;
    port: number;
}
export declare enum MappingSisyfosType {
    CHANNEL = "channel",
    CHANNELS = "channels"
}
export declare type MappingSisyfos = MappingSisyfosChannel | MappingSisyfosChannels;
interface MappingSisyfosBase extends Mapping {
    device: DeviceType.SISYFOS;
    mappingType: MappingSisyfosType;
}
export interface MappingSisyfosChannel extends MappingSisyfosBase {
    mappingType: MappingSisyfosType.CHANNEL;
    channel: number;
}
export interface MappingSisyfosChannels extends MappingSisyfosBase {
    mappingType: MappingSisyfosType.CHANNELS;
}
export declare enum TimelineContentTypeSisyfos {
    /** @deprecated use CHANNEL instead */
    SISYFOS = "sisyfos",
    CHANNEL = "channel",
    CHANNELS = "channels"
}
export declare type TimelineObjSisyfosAny = TimelineObjSisyfosChannel | TimelineObjSisyfosChannels;
export interface TimelineObjSisyfos extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.SISYFOS;
        type: TimelineContentTypeSisyfos;
    };
}
export interface SisyfosChannelOptions {
    isPgm?: 0 | 1 | 2;
    faderLevel?: number;
    label?: string;
    visible?: boolean;
}
export interface TimelineObjSisyfosChannel extends TimelineObjSisyfos {
    content: {
        deviceType: DeviceType.SISYFOS;
        type: TimelineContentTypeSisyfos.CHANNEL;
        resync?: boolean;
        overridePriority?: number;
    } & SisyfosChannelOptions;
}
export interface TimelineObjSisyfosChannels extends TimelineObjSisyfos {
    content: {
        deviceType: DeviceType.SISYFOS;
        type: TimelineContentTypeSisyfos.CHANNELS;
        channels: ({
            /** The mapping layer to look up the channel from */
            mappedLayer: string;
        } & SisyfosChannelOptions)[];
        resync?: boolean;
        overridePriority?: number;
    };
}
/** @deprecated use TimelineObjSisyfosChannel instead */
export declare type TimelineObjSisyfosMessage = TimelineObjSisyfosChannel;
export {};
