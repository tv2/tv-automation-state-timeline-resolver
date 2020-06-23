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
export declare enum AtemMediaPoolType {
    Still = "still",
    Clip = "clip",
    Audio = "audio"
}
export interface AtemMediaPoolAsset {
    type: AtemMediaPoolType;
    position: number;
    path: string;
}
export interface AtemOptions {
    host: string;
    port?: number;
    mediaPoolAssets?: AtemMediaPoolAsset[];
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
export declare enum MediaSourceType {
    Still = 1,
    Clip = 2
}
export declare type SuperSourceBox = {
    enabled?: boolean;
    source?: number;
    /** -4800 - 4800 */
    x?: number;
    /** -2700 - 2700 */
    y?: number;
    /** 70 - 1000 */
    size?: number;
    cropped?: boolean;
    /** 0 - 18000 */
    cropTop?: number;
    /** 0 - 18000 */
    cropBottom?: number;
    /** 0 - 32000 */
    cropLeft?: number;
    /** 0 - 32000 */
    cropRight?: number;
};
export interface AtemTransitionSettings {
    mix?: {
        rate: number;
    };
    wipe?: {
        /** 1 - 250 frames */
        rate?: number;
        /** 0 - 17 */
        pattern?: number;
        /** 0 - 10000 */
        borderWidth?: number;
        borderInput?: number;
        /** 0 - 10000 */
        symmetry?: number;
        /** 0 - 10000 */
        borderSoftness?: number;
        /** 0 - 10000 */
        xPosition?: number;
        /** 0 - 10000 */
        yPosition?: number;
        reverseDirection?: boolean;
        flipFlop?: boolean;
    };
}
export declare type TimelineObjAtemAny = (TimelineObjAtemME | TimelineObjAtemDSK | TimelineObjAtemAUX | TimelineObjAtemSsrc | TimelineObjAtemSsrcProps | TimelineObjAtemMacroPlayer | TimelineObjAtemMediaPlayer);
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
            /** Must be used with transition property, sets input to transition to */
            input?: number;
            transition?: AtemTransitionStyle;
            /** Cut directly to program */
            programInput?: number;
            /**
             * Set preview input.
             * Cannot be used in conjunction with `input`;
             * `programInput` must be used instead if control of program and preview are both needed.
             */
            previewInput?: number;
            /** Is ME in transition state */
            inTransition?: boolean;
            /** Should preview transition */
            transitionPreview?: boolean;
            /** Position of T-bar */
            transitionPosition?: number;
            /** Settings for mix rate, wipe style */
            transitionSettings?: AtemTransitionSettings;
            upstreamKeyers?: {
                readonly upstreamKeyerId: number;
                onAir?: boolean;
                /** 0: Luma, 1: Chroma, 2: Pattern, 3: DVE */
                mixEffectKeyType?: number;
                /** Use flying key */
                flyEnabled?: boolean;
                /** Fill */
                fillSource?: number;
                /** Key */
                cutSource?: number;
                /** Mask keyer */
                maskEnabled?: boolean;
                /** -9000 -> 9000 */
                maskTop?: number;
                /** -9000 -> 9000 */
                maskBottom?: number;
                /** -16000 -> 16000 */
                maskLeft?: number;
                /** -16000 -> 16000 */
                maskRight?: number;
                lumaSettings?: {
                    /** Premultiply key */
                    preMultiplied?: boolean;
                    /** 0-1000 */
                    clip?: number;
                    /** 0-1000 */
                    gain?: number;
                    /** Invert key */
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
                /** Fill */
                fillSource: number;
                /** Key */
                cutSource: number;
            };
            properties?: {
                /** On at next transition */
                tie?: boolean;
                /** 1 - 250 frames */
                rate?: number;
                /** Premultiply key */
                preMultiply?: boolean;
                /** 0 - 1000 */
                clip?: number;
                /** 0 - 1000 */
                gain?: number;
                /** Invert key */
                invert?: boolean;
                mask?: {
                    enabled: boolean;
                    /** -9000 -> 9000 */
                    top?: number;
                    /** -9000 -> 9000 */
                    bottom?: number;
                    /** -16000 -> 16000 */
                    left?: number;
                    /** -16000 -> 16000 */
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
            /** Fill */
            artFillSource: number;
            /** Key */
            artCutSource: number;
            /** Foreground */
            artOption: number;
            /** Premultiply key */
            artPreMultiplied: boolean;
        };
    };
}
export interface TimelineObjAtemMediaPlayer extends TimelineObjAtemBase {
    content: {
        deviceType: DeviceType.ATEM;
        type: TimelineContentTypeAtem.MEDIAPLAYER;
        mediaPlayer: {
            sourceType: MediaSourceType;
            clipIndex: number;
            stillIndex: number;
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
            /** 0 - 65381 */
            gain?: number;
            /** -10000 - 10000 */
            balance?: number;
            /** 0: Off, 1: On, 2: AFV */
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
