/// <reference types="node" />
import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
declare type EmberValue = number | string | boolean | Buffer | null;
declare enum ParameterType {
    Null = "NULL",
    Integer = "INTEGER",
    Real = "REAL",
    String = "STRING",
    Boolean = "BOOLEAN",
    Trigger = "TRIGGER",
    Enum = "ENUM",
    Octets = "OCTETS"
}
export interface MappingLawo extends Mapping {
    device: DeviceType.LAWO;
    mappingType: MappingLawoType;
    identifier?: string;
    emberType?: ParameterType;
    priority?: number;
}
export declare enum MappingLawoType {
    SOURCE = "source",
    SOURCES = "sources",
    FULL_PATH = "fullpath",
    TRIGGER_VALUE = "triggerValue"
}
export declare enum LawoDeviceMode {
    R3lay = 0,
    Ruby = 1,
    RubyManualRamp = 2,
    MC2 = 3,
    Manual = 4
}
export interface LawoOptions {
    setValueFn?: SetLawoValueFn;
    host?: string;
    port?: number;
    deviceMode: LawoDeviceMode;
    faderInterval?: number;
    /** Manual mode only: */
    sourcesPath?: string;
    dbPropertyName?: string;
    rampMotorFunctionPath?: string;
    faderThreshold?: number;
}
export declare type SetLawoValueFn = (command: LawoCommand, timelineObjId: string, logCommand?: boolean) => Promise<any>;
export interface LawoCommand {
    path: string;
    value: EmberValue;
    valueType: ParameterType;
    key: string;
    identifier: string;
    type: TimelineContentTypeLawo;
    transitionDuration?: number;
    from?: EmberValue;
    priority: number;
}
export declare enum TimelineContentTypeLawo {
    SOURCE = "lawosource",
    SOURCES = "lawosources",
    EMBER_PROPERTY = "lawofullpathemberproperty",
    TRIGGER_VALUE = "triggervalue"
}
export declare type TimelineObjLawoAny = TimelineObjLawoSources | TimelineObjLawoSource | TimelineObjLawoSourceDeprecated | TimelineObjLawoEmberProperty | TimelineObjLawoEmberRetrigger;
export interface ContentTimelineObjLawoSource {
    faderValue: number;
    transitionDuration?: number;
}
export interface TimelineObjLawoBase extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo;
    };
}
export interface TimelineObjLawoSources extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.SOURCES;
        sources: Array<{
            mappingName: string;
        } & ContentTimelineObjLawoSource>;
        overridePriority?: number;
    };
}
export interface TimelineObjLawoSourceDeprecated extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.SOURCE;
        'Fader/Motor dB Value': {
            value: number;
            transitionDuration?: number;
        };
    };
}
export interface TimelineObjLawoSource extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.SOURCE;
        overridePriority?: number;
    } & ContentTimelineObjLawoSource;
}
export interface TimelineObjLawoEmberProperty extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.EMBER_PROPERTY;
        value: EmberValue;
    };
}
export interface TimelineObjLawoEmberRetrigger extends TimelineObjLawoBase {
    content: {
        deviceType: DeviceType.LAWO;
        type: TimelineContentTypeLawo.TRIGGER_VALUE;
        triggerValue: string;
    };
}
export {};
