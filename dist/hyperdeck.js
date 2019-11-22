"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var MappingHyperdeckType;
(function (MappingHyperdeckType) {
    MappingHyperdeckType["TRANSPORT"] = "transport";
})(MappingHyperdeckType = exports.MappingHyperdeckType || (exports.MappingHyperdeckType = {}));
var TimelineContentTypeHyperdeck;
(function (TimelineContentTypeHyperdeck) {
    TimelineContentTypeHyperdeck["TRANSPORT"] = "transport";
})(TimelineContentTypeHyperdeck = exports.TimelineContentTypeHyperdeck || (exports.TimelineContentTypeHyperdeck = {}));
// Note: These are copied from hyperdeck-connection -----------
var TransportStatus;
(function (TransportStatus) {
    TransportStatus["PREVIEW"] = "preview";
    TransportStatus["STOPPED"] = "stopped";
    TransportStatus["PLAY"] = "play";
    TransportStatus["FORWARD"] = "forward";
    TransportStatus["REWIND"] = "rewind";
    TransportStatus["JOG"] = "jog";
    TransportStatus["SHUTTLE"] = "shuttle";
    TransportStatus["RECORD"] = "record";
})(TransportStatus = exports.TransportStatus || (exports.TransportStatus = {}));
var SlotId;
(function (SlotId) {
    SlotId[SlotId["ONE"] = 1] = "ONE";
    SlotId[SlotId["TWO"] = 2] = "TWO";
})(SlotId = exports.SlotId || (exports.SlotId = {}));
var SlotStatus;
(function (SlotStatus) {
    SlotStatus["EMPTY"] = "empty";
    SlotStatus["MOUNTING"] = "mounting";
    SlotStatus["ERROR"] = "error";
    SlotStatus["MOUNTED"] = "mounted";
})(SlotStatus = exports.SlotStatus || (exports.SlotStatus = {}));
var VideoFormat;
(function (VideoFormat) {
    VideoFormat["NTSC"] = "NTSC";
    VideoFormat["PAL"] = "PAL";
    VideoFormat["NTSCp"] = "NTSCp";
    VideoFormat["PALp"] = "PALp";
    VideoFormat["_720p50"] = "720p50";
    VideoFormat["_720p5994"] = "720p5994";
    VideoFormat["_720p60"] = "720p60";
    VideoFormat["_1080p23976"] = "1080p23976";
    VideoFormat["_1080p24"] = "1080p24";
    VideoFormat["_1080p25"] = "1080p25";
    VideoFormat["_1080p2997"] = "1080p2997";
    VideoFormat["_1080p30"] = "1080p30";
    VideoFormat["_1080i50"] = "1080i50";
    VideoFormat["_1080i5994"] = "1080i5994";
    VideoFormat["_1080i60"] = "1080i60";
    VideoFormat["_4Kp23976"] = "4Kp23976";
    VideoFormat["_4Kp24"] = "4Kp24";
    VideoFormat["_4Kp25"] = "4Kp25";
    VideoFormat["_4Kp2997"] = "4Kp2997";
    VideoFormat["_4Kp30"] = "4Kp30";
    VideoFormat["_4Kp50"] = "4Kp50";
    VideoFormat["_4Kp5994"] = "4Kp5994";
    VideoFormat["_4Kp60"] = "4Kp60";
})(VideoFormat = exports.VideoFormat || (exports.VideoFormat = {}));
//# sourceMappingURL=hyperdeck.js.map