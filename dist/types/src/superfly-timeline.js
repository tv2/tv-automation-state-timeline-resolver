"use strict";
// Note: These types are copies from superfly-timeline
Object.defineProperty(exports, "__esModule", { value: true });
// Enums ------------------------------------------------------------
var TriggerType;
(function (TriggerType) {
    TriggerType[TriggerType["TIME_ABSOLUTE"] = 0] = "TIME_ABSOLUTE";
    TriggerType[TriggerType["TIME_RELATIVE"] = 1] = "TIME_RELATIVE";
    TriggerType[TriggerType["LOGICAL"] = 3] = "LOGICAL";
})(TriggerType = exports.TriggerType || (exports.TriggerType = {}));
var EventType;
(function (EventType) {
    EventType[EventType["START"] = 0] = "START";
    EventType[EventType["END"] = 1] = "END";
    EventType[EventType["KEYFRAME"] = 2] = "KEYFRAME";
})(EventType = exports.EventType || (exports.EventType = {}));
var TraceLevel;
(function (TraceLevel) {
    TraceLevel[TraceLevel["ERRORS"] = 0] = "ERRORS";
    TraceLevel[TraceLevel["INFO"] = 1] = "INFO";
    TraceLevel[TraceLevel["TRACE"] = 2] = "TRACE";
})(TraceLevel = exports.TraceLevel || (exports.TraceLevel = {}));
exports.Enums = {
    TriggerType: TriggerType,
    TimelineEventType: EventType,
    TraceLevel: TraceLevel
};
class Resolver {
}
exports.Resolver = Resolver;
//# sourceMappingURL=superfly-timeline.js.map