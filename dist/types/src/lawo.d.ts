import { TimelineObject } from './superfly-timeline';
import { Mapping, DeviceType } from './mapping';
export interface MappingLawo extends Mapping {
    device: DeviceType.LAWO;
    mappingType: MappingLawoType;
    identifier: string;
}
export declare enum MappingLawoType {
    SOURCE = "source"
}
export declare enum TimelineContentTypeLawo {
    SOURCE = "lawosource"
}
export declare type TimelineObjLawoAny = TimelineObjLawoSource;
export interface TimelineObjLawo extends TimelineObject {
    content: {
        type: TimelineContentTypeLawo;
        attributes: {
            [key: string]: {
                [attr: string]: any;
                triggerValue?: string;
            };
        };
    };
}
export interface TimelineObjLawoSource extends TimelineObjLawo {
    content: {
        type: TimelineContentTypeLawo;
        attributes: {
            'Fader/Motor dB Value': {
                value: number;
                transitionDuration?: number;
                triggerValue?: string;
            };
        };
    };
}
