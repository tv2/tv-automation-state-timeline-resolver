import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
export interface MappingSingularLive extends Mapping {
    device: DeviceType.SINGULAR_LIVE;
    compositionName: string;
}
export interface SingularLiveCompositionContent extends SingularLiveContent {
    type: TimelineContentTypeSingularLive.COMPOSITION;
    controlNode: {
        payload: {
            [key: string]: string;
        };
    };
}
export interface SingularLiveContent {
    type: TimelineContentTypeSingularLive;
    temporalPriority?: number;
    /** Commands in the same queue will be sent in order (will wait for the previous to finish before sending next */
    queueId?: string;
}
export interface SingularLiveOptions {
    accessToken: string;
}
export declare enum TimelineContentTypeSingularLive {
    COMPOSITION = "composition"
}
export declare type TimelineObjSingularLiveAny = TimelineObjSingularLiveComposition;
export interface TimelineObjSingularLiveBase extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.SINGULAR_LIVE;
    };
}
export interface TimelineObjSingularLiveComposition extends TimelineObjSingularLiveBase {
    content: {
        deviceType: DeviceType.SINGULAR_LIVE;
    } & SingularLiveCompositionContent;
}
