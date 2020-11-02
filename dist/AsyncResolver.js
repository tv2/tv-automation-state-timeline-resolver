"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const superfly_timeline_1 = require("superfly-timeline");
const _ = require("underscore");
class AsyncResolver {
    constructor(onSetTimelineTriggerTime) {
        this.cache = {};
        this.onSetTimelineTriggerTime = onSetTimelineTriggerTime;
    }
    async resolveTimeline(resolveTime, timeline, limitTime, useCache) {
        let objectsFixed = this._fixNowObjects(timeline, resolveTime);
        const resolvedTimeline = superfly_timeline_1.Resolver.resolveTimeline(timeline, {
            limitCount: 999,
            limitTime: limitTime,
            time: resolveTime,
            cache: useCache ? this.cache : undefined
        });
        const resolvedStates = superfly_timeline_1.Resolver.resolveAllStates(resolvedTimeline);
        return {
            resolvedStates,
            objectsFixed
        };
    }
    async getState(resolved, resolveTime) {
        return superfly_timeline_1.Resolver.getState(resolved, resolveTime);
    }
    _fixNowObjects(timeline, now) {
        let objectsFixed = [];
        const timeLineMap = {};
        let setObjectTime = (o, time) => {
            if (!_.isArray(o.enable)) {
                o.enable.start = time; // set the objects to "now" so that they are resolved correctly temporarily
                const o2 = timeLineMap[o.id];
                if (o2 && !_.isArray(o2.enable)) {
                    o2.enable.start = time;
                }
                objectsFixed.push({
                    id: o.id,
                    time: time
                });
            }
        };
        _.each(timeline, (obj) => {
            timeLineMap[obj.id] = obj;
        });
        // First: fix the ones on the first level (i e not in groups), because they are easy (this also saves us one iteration time later):
        _.each(timeLineMap, (o) => {
            if (!_.isArray(o.enable)) {
                if (o.enable.start === 'now') {
                    setObjectTime(o, now);
                }
            }
        });
        // Then, resolve the timeline to be able to set "now" inside groups, relative to parents:
        let dontIterateAgain = false;
        let wouldLikeToIterateAgain = false;
        let resolvedTimeline;
        let fixObjects = (objs, parentObject) => {
            _.each(objs, (o) => {
                if (!_.isArray(o.enable) &&
                    o.enable.start === 'now') {
                    // find parent, and set relative to that
                    if (parentObject) {
                        let resolvedParent = resolvedTimeline.objects[parentObject.id];
                        let parentInstance = resolvedParent.resolved.instances[0];
                        if (resolvedParent.resolved.resolved && parentInstance) {
                            dontIterateAgain = false;
                            setObjectTime(o, now - (parentInstance.originalStart || parentInstance.start));
                        }
                        else {
                            // the parent isn't found, it's probably not resolved (yet), try iterating once more:
                            wouldLikeToIterateAgain = true;
                        }
                    }
                    else {
                        // no parent object
                        dontIterateAgain = false;
                        setObjectTime(o, now);
                    }
                }
                if (o.isGroup && o.children) {
                    fixObjects(o.children, o);
                }
            });
        };
        for (let i = 0; i < 10; i++) {
            wouldLikeToIterateAgain = false;
            dontIterateAgain = true;
            resolvedTimeline = superfly_timeline_1.Resolver.resolveTimeline(_.values(timeLineMap), {
                time: now
            });
            fixObjects(_.values(resolvedTimeline.objects));
            if (!wouldLikeToIterateAgain && dontIterateAgain)
                break;
        }
        if (objectsFixed.length) {
            this.onSetTimelineTriggerTime(objectsFixed);
        }
        return objectsFixed;
    }
}
exports.AsyncResolver = AsyncResolver;
//# sourceMappingURL=AsyncResolver.js.map