import { Mapping } from './mapping';
import { TSRTimelineObjBase, DeviceType } from '.';
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
    SuperSourceProperties = 5,
    AudioChannel = 6,
    MacroPlayer = 7
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
    MEDIAPLAYER = "mp",
    AUDIOCHANNEL = "audioChan",
    MACROPLAYER = "macroPlayer"
}
export declare enum AtemTransitionStyle {
    MIX = 0,
    DIP = 1,
    WIPE = 2,
    DVE = 3,
    STING = 4,
    CUT = 5,
    DUMMY = 6
}
export declare type SuperSourceBox = {
    enabled?: boolean;
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
export declare type TimelineObjAtemAny = (TimelineObjAtemME | TimelineObjAtemDSK | TimelineObjAtemAUX | TimelineObjAtemSsrc | TimelineObjAtemSsrcProps | TimelineObjAtemMacroPlayer);
export interface TimelineObjAtemBase extends TSRTimelineObjBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem;
    };
}
export interface TimelineObjAtemME extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.ME;
        me: {
            input?: number;
            transition?: AtemTransitionStyle;
            /** Cut directly to program */
            programInput?: number;
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
export interface TimelineObjAtemDSK extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.DSK;
        dsk: {
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
export interface TimelineObjAtemAUX extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.AUX;
        aux: {
            input: number;
        };
    };
}
export interface TimelineObjAtemSsrc extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.SSRC;
        ssrc: {
            boxes: Array<SuperSourceBox>;
        };
    };
}
export interface TimelineObjAtemSsrcProps extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.SSRCPROPS;
        ssrcProps: {
            artFillSource: number;
            artCutSource: number;
            artOption: number;
            artPreMultiplied: boolean;
        };
    };
}
export interface TimelineObjAtemMediaPlayer extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.MEDIAPLAYER;
        mediaPlayer: {
            playing: boolean;
            loop: boolean;
            atBeginning: boolean;
            clipFrame: number;
        };
    };
}
export interface TimelineObjAtemAudioChannel extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.AUDIOCHANNEL;
        audioChannel: {
            gain?: number;
            balance?: number;
            mixOption?: number;
        };
    };
}
export interface TimelineObjAtemMacroPlayer extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.MACROPLAYER;
        macroPlayer: {
            macroIndex: number;
            isRunning: boolean;
            loop?: boolean;
        };
    };
}
