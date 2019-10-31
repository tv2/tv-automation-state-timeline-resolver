import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
export interface MappingLawo extends Mapping {
    device: DeviceType.LAWO;
    mappingType: MappingLawoType;
    identifier?: string;
    emberType?: EmberTypes;
    priority?: number;
}
export declare enum MappingLawoType {
    SOURCE = "source",
    FULL_PATH = "fullpath",
    TRIGGER_VALUE = "triggerValue"
}
export declare enum TimelineContentTypeLawo {
    SOURCE = "lawosource",
    EMBER_PROPERTY = "lawofullpathemberproperty",
    TRIGGER_VALUE = "triggervalue"
}
export declare type TimelineObjLawoAny = TimelineObjLawoSource | TimelineObjLawoEmberProperty | TimelineObjLawoEmberRetrigger;
export declare enum EmberTypes {
    STRING = "string",
    INTEGER = "integer",
    REAL = "real",
    BOOLEAN = "bool"
}
export declare type EmberValueTypes = string | number | boolean;
export interface TimelineObjLawoBase extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo;
    };
}
export interface TimelineObjLawoSource extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.SOURCE;
        'Fader/Motor dB Value': {
            value: number;
            transitionDuration?: number;
        };
    };
}
export interface TimelineObjLawoEmberProperty extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.EMBER_PROPERTY;
        value: EmberValueTypes;
    };
}
export interface TimelineObjLawoEmberRetrigger extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.TRIGGER_VALUE;
        triggerValue: string;
    };
}
