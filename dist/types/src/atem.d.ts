import { TimelineObject, TimelineKeyframe } from './superfly-timeline';
import { Mapping, DeviceType } from './mapping';
export interface MappingAtem extends Mapping {
    device: DeviceType.ATEM;
    mappingType: MappingAtemType;
    index?: number;
}
export declare enum MappingAtemType {
    MixEffect = 0,
    DownStreamKeyer = 1,
    SuperSourceBox = 2,
    Auxilliary = 3,
    MediaPlayer = 4,
    SuperSourceProperties = 5
}
export interface AtemOptions {
    host: string;
    port?: number;
}
export declare enum TimelineContentTypeAtem {
    ME = "me",
    DSK = "dsk",
    AUX = "aux",
    SSRC = "ssrc",
    SSRCPROPS = "ssrcProps",
    MEDIAPLAYER = "mp"
}
export declare enum AtemTransitionStyle {
    MIX = 0,
    DIP = 1,
    WIPE = 2,
    DVE = 3,
    STING = 4,
    CUT = 5
}
export declare type TimelineObjAtemAny = TimelineObjAtemME | TimelineObjAtemDSK | TimelineObjAtemAUX | TimelineObjAtemSsrc | TimelineObjAtemSsrcProps;
export declare type SuperSourceBox = {
    enabled: boolean;
    source?: number;
    x?: number;
    y?: number;
    size?: number;
    cropped?: boolean;
    cropTop?: number;
    cropBottom?: number;
    cropLeft?: number;
    cropRight?: number;
};
export interface AtemTransitionSettings {
    mix?: {
        rate: number;
    };
    wipe?: {
        rate?: number;
        pattern?: number;
        borderWidth?: number;
        borderInput?: number;
        symmetry?: number;
        borderSoftness?: number;
        xPosition?: number;
        yPosition?: number;
        reverseDirection?: boolean;
        flipFlop?: boolean;
    };
}
export interface TimelineObjAtemME extends TimelineObject {
    content: {
        keyframes?: Array<TimelineKeyframe>;
        type: TimelineContentTypeAtem.ME;
        attributes: {
            input?: number;
            transition?: AtemTransitionStyle;
            previewInput?: number;
            inTransition?: boolean;
            transitionPreview?: boolean;
            transitionPosition?: number;
            transitionSettings?: AtemTransitionSettings;
            upstreamKeyers?: {
                readonly upstreamKeyerId: number;
                onAir?: boolean;
                mixEffectKeyType?: number;
                flyEnabled?: boolean;
                fillSource?: number;
                cutSource?: number;
                maskEnabled?: boolean;
                maskTop?: number;
                maskBottom?: number;
                maskLeft?: number;
                maskRight?: number;
                lumaSettings?: {
                    preMultiplied?: boolean;
                    clip?: number;
                    gain?: number;
                    invert?: boolean;
                };
            }[];
        };
    };
}
export interface TimelineObjAtemDSK extends TimelineObject {
    content: {
        keyframes?: Array<TimelineKeyframe>;
        type: TimelineContentTypeAtem.DSK;
        attributes: {
            onAir: boolean;
            sources?: {
                fillSource: number;
                cutSource: number;
            };
            properties?: {
                tie?: boolean;
                rate?: number;
                preMultiply?: boolean;
                clip?: number;
                gain?: number;
                invert?: boolean;
                mask?: {
                    enabled: boolean;
                    top?: number;
                    bottom?: number;
                    left?: number;
                    right?: number;
                };
            };
        };
    };
}
export interface TimelineObjAtemAUX extends TimelineObject {
    content: {
        keyframes?: Array<TimelineKeyframe>;
        type: TimelineContentTypeAtem.AUX;
        attributes: {
            input: number;
        };
    };
}
export interface TimelineObjAtemSsrc extends TimelineObject {
    content: {
        keyframes?: Array<TimelineKeyframe>;
        type: TimelineContentTypeAtem.SSRC;
        attributes: {
            boxes: Array<SuperSourceBox>;
        };
    };
}
export interface TimelineObjAtemSsrcProps extends TimelineObject {
    content: {
        keyframes?: Array<TimelineKeyframe>;
        type: TimelineContentTypeAtem.SSRCPROPS;
        attributes: {
            artFillSource: number;
            artCutSource: number;
            artOption: number;
            artPreMultiplied: boolean;
        };
    };
}
