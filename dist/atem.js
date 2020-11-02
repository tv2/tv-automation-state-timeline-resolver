"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var MappingAtemType;
(function (MappingAtemType) {
    MappingAtemType[MappingAtemType["MixEffect"] = 0] = "MixEffect";
    MappingAtemType[MappingAtemType["DownStreamKeyer"] = 1] = "DownStreamKeyer";
    MappingAtemType[MappingAtemType["SuperSourceBox"] = 2] = "SuperSourceBox";
    MappingAtemType[MappingAtemType["Auxilliary"] = 3] = "Auxilliary";
    MappingAtemType[MappingAtemType["MediaPlayer"] = 4] = "MediaPlayer";
    MappingAtemType[MappingAtemType["SuperSourceProperties"] = 5] = "SuperSourceProperties";
    MappingAtemType[MappingAtemType["AudioChannel"] = 6] = "AudioChannel";
    MappingAtemType[MappingAtemType["MacroPlayer"] = 7] = "MacroPlayer";
})(MappingAtemType = exports.MappingAtemType || (exports.MappingAtemType = {}));
var AtemMediaPoolType;
(function (AtemMediaPoolType) {
    AtemMediaPoolType["Still"] = "still";
    AtemMediaPoolType["Clip"] = "clip";
    AtemMediaPoolType["Audio"] = "audio";
})(AtemMediaPoolType = exports.AtemMediaPoolType || (exports.AtemMediaPoolType = {}));
var TimelineContentTypeAtem;
(function (TimelineContentTypeAtem) {
    TimelineContentTypeAtem["ME"] = "me";
    TimelineContentTypeAtem["DSK"] = "dsk";
    TimelineContentTypeAtem["AUX"] = "aux";
    TimelineContentTypeAtem["SSRC"] = "ssrc";
    TimelineContentTypeAtem["SSRCPROPS"] = "ssrcProps";
    TimelineContentTypeAtem["MEDIAPLAYER"] = "mp";
    TimelineContentTypeAtem["AUDIOCHANNEL"] = "audioChan";
    TimelineContentTypeAtem["MACROPLAYER"] = "macroPlayer";
})(TimelineContentTypeAtem = exports.TimelineContentTypeAtem || (exports.TimelineContentTypeAtem = {}));
var AtemTransitionStyle;
(function (AtemTransitionStyle) {
    AtemTransitionStyle[AtemTransitionStyle["MIX"] = 0] = "MIX";
    AtemTransitionStyle[AtemTransitionStyle["DIP"] = 1] = "DIP";
    AtemTransitionStyle[AtemTransitionStyle["WIPE"] = 2] = "WIPE";
    AtemTransitionStyle[AtemTransitionStyle["DVE"] = 3] = "DVE";
    AtemTransitionStyle[AtemTransitionStyle["STING"] = 4] = "STING";
    AtemTransitionStyle[AtemTransitionStyle["CUT"] = 5] = "CUT";
    AtemTransitionStyle[AtemTransitionStyle["DUMMY"] = 6] = "DUMMY";
})(AtemTransitionStyle = exports.AtemTransitionStyle || (exports.AtemTransitionStyle = {}));
var MediaSourceType;
(function (MediaSourceType) {
    MediaSourceType[MediaSourceType["Still"] = 1] = "Still";
    MediaSourceType[MediaSourceType["Clip"] = 2] = "Clip";
})(MediaSourceType = exports.MediaSourceType || (exports.MediaSourceType = {}));
//# sourceMappingURL=atem.js.map