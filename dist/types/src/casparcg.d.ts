import { TimelineObject, TimelineKeyframe } from './superfly-timeline';
import { Mapping, DeviceType } from './mapping';
export interface MappingCasparCG extends Mapping {
    device: DeviceType.CASPARCG;
    channel: number;
    layer: number;
}
export interface CasparCGOptions {
    host: string;
    port: number;
    useScheduling?: boolean;
    launcherHost: string;
    launcherPort: string;
}
export declare enum TimelineContentTypeCasparCg {
    VIDEO = "video",
    AUDIO = "audio",
    MEDIA = "media",
    IP = "ip",
    INPUT = "input",
    TEMPLATE = "template",
    HTMLPAGE = "htmlpage",
    ROUTE = "route",
    RECORD = "record"
}
export declare type TimelineObjCCGAny = TimelineObjCCGAudio | TimelineObjCCGVideo | TimelineObjCCGInput | TimelineObjCCGHTMLPage | TimelineObjCCGRecord | TimelineObjCCGRoute | TimelineObjCCGTemplate;
export interface TimelineTransition {
    type: Transition;
    duration?: number;
    easing?: Ease;
    direction?: Direction;
    maskFile?: string;
    delay?: number;
    overlayFile?: string;
}
export interface TimelineObjCCGProducerContentBase {
    keyframes?: Array<TimelineKeyframe>;
    type: TimelineContentTypeCasparCg;
    transitions?: {
        inTransition?: TimelineTransition;
        outTransition?: TimelineTransition;
    };
    mixer?: Mixer;
}
export interface TimelineObjCCGAudio extends TimelineObject {
    content: {
        type: TimelineContentTypeCasparCg.AUDIO;
        attributes: {
            file: string;
            loop?: boolean;
            audioFilter?: string;
            channelLayout?: string;
        };
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGVideo extends TimelineObject {
    content: {
        type: TimelineContentTypeCasparCg.VIDEO;
        attributes: {
            file: string;
            loop?: boolean;
            seek?: number;
            videoFilter?: string;
            audioFilter?: string;
            channelLayout?: string;
        };
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGInput extends TimelineObject {
    content: {
        type: TimelineContentTypeCasparCg.INPUT;
        attributes: {
            type: string;
            device: number;
            deviceFormat: ChannelFormat;
            videoFilter?: string;
            audioFilter?: string;
            channelLayout?: string;
        };
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGHTMLPage extends TimelineObject {
    content: {
        type: TimelineContentTypeCasparCg.HTMLPAGE;
        attributes: {
            url: string;
        };
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGTemplate extends TimelineObject {
    content: {
        type: TimelineContentTypeCasparCg.TEMPLATE;
        attributes: {
            type?: 'html' | 'flash';
            name: string;
            data?: any;
            useStopCommand: boolean;
        };
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGRoute extends TimelineObject {
    content: {
        type: TimelineContentTypeCasparCg.ROUTE;
        attributes: {
            channel?: number;
            layer?: number;
            LLayer?: string;
            mode?: 'BACKGROUND' | 'NEXT';
            channelLayout?: string;
        };
    } & TimelineObjCCGProducerContentBase;
}
export interface TimelineObjCCGRecord extends TimelineObject {
    content: {
        keyframes?: Array<TimelineKeyframe>;
        type: TimelineContentTypeCasparCg.RECORD;
        attributes: {
            file?: string;
            encoderOptions: string;
        };
    };
}
export declare enum Transition {
    MIX = "MIX",
    CUT = "CUT",
    PUSH = "PUSH",
    WIPE = "WIPE",
    SLIDE = "SLIDE",
    STING = "STING"
}
export declare enum Ease {
    LINEAR = "LINEAR",
    NONE = "NONE",
    EASEINBACK = "EASEINBACK",
    EASEINBOUNCE = "EASEINBOUNCE",
    EASEINCIRC = "EASEINCIRC",
    EASEINCUBIC = "EASEINCUBIC",
    EASEINELASTIC = "EASEINELASTIC",
    EASEINEXPO = "EASEINEXPO",
    EASEINOUTBACK = "EASEINOUTBACK",
    EASEINOUTBOUNCE = "EASEINOUTBOUNCE",
    EASEINOUTCIRC = "EASEINOUTCIRC",
    EASEINOUTCUBIC = "EASEINOUTCUBIC",
    EASEINOUTELASTIC = "EASEINOUTELASTIC",
    EASEINOUTEXPO = "EASEINOUTEXPO",
    EASEINOUTQUAD = "EASEINOUTQUAD",
    EASEINOUTQUART = "EASEINOUTQUART",
    EASEINOUTQUINT = "EASEINOUTQUINT",
    EASEINOUTSINE = "EASEINOUTSINE",
    EASEINQUAD = "EASEINQUAD",
    EASEINQUART = "EASEINQUART",
    EASEINQUINT = "EASEINQUINT",
    EASEINSINE = "EASEINSINE",
    EASELINEAR = "EASELINEAR",
    EASENONE = "EASENONE",
    EASEOUTBACK = "EASEOUTBACK",
    EASEOUTBOUNCE = "EASEOUTBOUNCE",
    EASEOUTCIRC = "EASEOUTCIRC",
    EASEOUTCUBIC = "EASEOUTCUBIC",
    EASEOUTELASTIC = "EASEOUTELASTIC",
    EASEOUTEXPO = "EASEOUTEXPO",
    EASEOUTINBACK = "EASEOUTINBACK",
    EASEOUTINBOUNCE = "EASEOUTINBOUNCE",
    EASEOUTINCIRC = "EASEOUTINCIRC",
    EASEOUTINCUBIC = "EASEOUTINCUBIC",
    EASEOUTINELASTIC = "EASEOUTINELASTIC",
    EASEOUTINEXPO = "EASEOUTINEXPO",
    EASEOUTINQUAD = "EASEOUTINQUAD",
    EASEOUTINQUART = "EASEOUTINQUART",
    EASEOUTINQUINT = "EASEOUTINQUINT",
    EASEOUTINSINE = "EASEOUTINSINE",
    EASEOUTQUAD = "EASEOUTQUAD",
    EASEOUTQUART = "EASEOUTQUART",
    EASEOUTQUINT = "EASEOUTQUINT",
    EASEOUTSINE = "EASEOUTSINE",
    IN_BACK = "IN_BACK",
    IN_BOUNCE = "IN_BOUNCE",
    IN_CIRC = "IN_CIRC",
    IN_CUBIC = "IN_CUBIC",
    IN_ELASTIC = "IN_ELASTIC",
    IN_EXPO = "IN_EXPO",
    IN_OUT_BACK = "IN_OUT_BACK",
    IN_OUT_BOUNCE = "IN_OUT_BOUNCE",
    IN_OUT_CIRC = "IN_OUT_CIRC",
    IN_OUT_CUBIC = "IN_OUT_CUBIC",
    IN_OUT_ELASTIC = "IN_OUT_ELASTIC",
    IN_OUT_EXPO = "IN_OUT_EXPO",
    IN_OUT_QUAD = "IN_OUT_QUAD",
    IN_OUT_QUART = "IN_OUT_QUART",
    IN_OUT_QUINT = "IN_OUT_QUINT",
    IN_OUT_SINE = "IN_OUT_SINE",
    IN_QUAD = "IN_QUAD",
    IN_QUART = "IN_QUART",
    IN_QUINT = "IN_QUINT",
    IN_SINE = "IN_SINE",
    OUT_BACK = "OUT_BACK",
    OUT_BOUNCE = "OUT_BOUNCE",
    OUT_CIRC = "OUT_CIRC",
    OUT_CUBIC = "OUT_CUBIC",
    OUT_ELASTIC = "OUT_ELASTIC",
    OUT_EXPO = "OUT_EXPO",
    OUT_IN_BACK = "OUT_IN_BACK",
    OUT_IN_BOUNCE = "OUT_IN_BOUNCE",
    OUT_IN_CIRC = "OUT_IN_CIRC",
    OUT_IN_CUBIC = "OUT_IN_CUBIC",
    OUT_IN_ELASTIC = "OUT_IN_ELASTIC",
    OUT_IN_EXPO = "OUT_IN_EXPO",
    OUT_IN_QUAD = "OUT_IN_QUAD",
    OUT_IN_QUART = "OUT_IN_QUART",
    OUT_IN_QUINT = "OUT_IN_QUINT",
    OUT_IN_SINE = "OUT_IN_SINE",
    OUT_QUAD = "OUT_QUAD",
    OUT_QUART = "OUT_QUART",
    OUT_QUINT = "OUT_QUINT"
}
export declare enum Direction {
    LEFT = "LEFT",
    RIGHT = "RIGHT"
}
export declare enum BlendMode {
    ADD = "ADD",
    AVERAGE = "AVERAGE",
    COLOR = "COLOR",
    COLOR_BURN = "COLOR_BURN",
    COLOR_DODGE = "COLOR_DODGE",
    CONTRAST = "CONTRAST",
    DARKEN = "DARKEN",
    DIFFERENCE = "DIFFERENCE",
    EXCLUSION = "EXCLUSION",
    GLOW = "GLOW",
    HARD_LIGHT = "HARD_LIGHT",
    HARD_MIX = "HARD_MIX",
    LIGHTEN = "LIGHTEN",
    LINEAR_BURN = "LINEAR_BURN",
    LINEAR_DODGE = "LINEAR_DODGE",
    LINEAR_LIGHT = "LINEAR_LIGHT",
    LUMINOSITY = "LUMINOSITY",
    MULTIPLY = "MULTIPLY",
    NEGATION = "NEGATION",
    NORMAL = "NORMAL",
    OVERLAY = "OVERLAY",
    PHOENIX = "PHOENIX",
    PIN_LIGHT = "PIN_LIGHT",
    REFLECT = "REFLECT",
    SATURATION = "SATURATION",
    SCREEN = "SCREEN",
    SOFT_LIGHT = "SOFT_LIGHT",
    SUBTRACT = "SUBTRACT",
    VIVID_LIGHT = "VIVID_LIGHT"
}
export declare enum ChannelFormat {
    PAL = "PAL",
    NTSC = "NTSC",
    SD_576P2500 = "SD_576P2500",
    HD_720P2398 = "HD_720P2398",
    HD_720P2400 = "HD_720P2400",
    HD_720P2500 = "HD_720P2500",
    HD_720P2997 = "HD_720P2997",
    HD_720P3000 = "HD_720P3000",
    HD_720P5000 = "HD_720P5000",
    HD_720P5994 = "HD_720P5994",
    HD_720P6000 = "HD_720P6000",
    HD_1080I5000 = "HD_1080I5000",
    HD_1080I5994 = "HD_1080I5994",
    HD_1080I6000 = "HD_1080I6000",
    HD_1080P2398 = "HD_1080P2398",
    HD_1080P2400 = "HD_1080P2400",
    HD_1080P2500 = "HD_1080P2500",
    HD_1080P2997 = "HD_1080P2997",
    HD_1080P3000 = "HD_1080P3000",
    HD_1080P5000 = "HD_1080P5000",
    HD_1080P5994 = "HD_1080P5994",
    HD_1080P6000 = "HD_1080P6000",
    DCI_1080P2398 = "DCI_1080P2398",
    DCI_1080P2400 = "DCI_1080P2400",
    DCI_1080P2500 = "DCI_1080P2500",
    DCI_2160P2398 = "DCI_2160P2398",
    DCI_2160P2400 = "DCI_2160P2400",
    DCI_2160P2500 = "DCI_2160P2500",
    UCH_2160P2400 = "UCH_2160P2400",
    UHD_1556P2398 = "UHD_1556P2398",
    UHD_1556P2400 = "UHD_1556P2400",
    UHD_1556P2500 = "UHD_1556P2500",
    UHD_2160P2398 = "UHD_2160P2398",
    UHD_2160P2500 = "UHD_2160P2500",
    UHD_2160P2997 = "UHD_2160P2997",
    UHD_2160P3000 = "UHD_2160P3000",
    UHD_2160P5000 = "UHD_2160P5000",
    UHD_2160P5994 = "UHD_2160P5994",
    INVALID = "INVALID"
}
export declare enum Chroma {
    BLUE = "BLUE",
    GREEN = "GREEN",
    NONE = "NONE"
}
export interface Mixer {
    inTransition?: ITransition;
    changeTransition?: ITransition;
    outTransition?: ITransition;
    anchor?: {
        x: number;
        y: number;
    } | TransitionObject;
    blend?: BlendMode | TransitionObject;
    brightness?: number | TransitionObject;
    chroma?: {
        keyer: Chroma;
        threshold: number;
        softness: number;
        spill: number;
    } | TransitionObject;
    clip?: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | TransitionObject;
    contrast?: number | TransitionObject;
    crop?: {
        left: number;
        top: number;
        right: number;
        bottom: number;
    } | TransitionObject;
    fill?: {
        x: number;
        y: number;
        xScale: number;
        yScale: number;
    } | TransitionObject;
    keyer?: boolean | TransitionObject;
    levels?: {
        minInput: number;
        maxInput: number;
        gamma: number;
        minOutput: number;
        maxOutput: number;
    } | TransitionObject;
    mastervolume?: number | TransitionObject;
    opacity?: number | TransitionObject;
    perspective?: {
        topLeftX: number;
        topLeftY: number;
        topRightX: number;
        topRightY: number;
        bottomRightX: number;
        bottomRightY: number;
        bottomLeftX: number;
        bottomLeftY: number;
    } | TransitionObject;
    rotation?: number | TransitionObject;
    saturation?: number | TransitionObject;
    straightAlpha?: boolean | TransitionObject;
    volume?: number | TransitionObject;
    bundleWithCommands?: number;
}
export interface TransitionObject {
    _value: string | number | boolean;
    inTransition: Transition0;
    changeTransition: Transition0;
    outTransition: Transition0;
}
export interface ITransition {
    type?: string;
    duration: number;
    easing?: string;
    direction?: string;
}
export interface Transition0 extends ITransition {
    type: string;
    duration: number;
    easing: string;
    direction: string;
}
