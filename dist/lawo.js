"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ParameterType;
(function (ParameterType) {
    ParameterType["Null"] = "NULL";
    ParameterType["Integer"] = "INTEGER";
    ParameterType["Real"] = "REAL";
    ParameterType["String"] = "STRING";
    ParameterType["Boolean"] = "BOOLEAN";
    ParameterType["Trigger"] = "TRIGGER";
    ParameterType["Enum"] = "ENUM";
    ParameterType["Octets"] = "OCTETS";
})(ParameterType || (ParameterType = {}));
var MappingLawoType;
(function (MappingLawoType) {
    MappingLawoType["SOURCE"] = "source";
    MappingLawoType["SOURCES"] = "sources";
    MappingLawoType["FULL_PATH"] = "fullpath";
    MappingLawoType["TRIGGER_VALUE"] = "triggerValue";
})(MappingLawoType = exports.MappingLawoType || (exports.MappingLawoType = {}));
var LawoDeviceMode;
(function (LawoDeviceMode) {
    LawoDeviceMode[LawoDeviceMode["R3lay"] = 0] = "R3lay";
    LawoDeviceMode[LawoDeviceMode["Ruby"] = 1] = "Ruby";
    LawoDeviceMode[LawoDeviceMode["RubyManualRamp"] = 2] = "RubyManualRamp";
    LawoDeviceMode[LawoDeviceMode["MC2"] = 3] = "MC2";
    LawoDeviceMode[LawoDeviceMode["Manual"] = 4] = "Manual";
})(LawoDeviceMode = exports.LawoDeviceMode || (exports.LawoDeviceMode = {}));
var TimelineContentTypeLawo;
(function (TimelineContentTypeLawo) {
    TimelineContentTypeLawo["SOURCE"] = "lawosource";
    TimelineContentTypeLawo["SOURCES"] = "lawosources";
    TimelineContentTypeLawo["EMBER_PROPERTY"] = "lawofullpathemberproperty";
    TimelineContentTypeLawo["TRIGGER_VALUE"] = "triggervalue";
})(TimelineContentTypeLawo = exports.TimelineContentTypeLawo || (exports.TimelineContentTypeLawo = {}));
//# sourceMappingURL=lawo.js.map