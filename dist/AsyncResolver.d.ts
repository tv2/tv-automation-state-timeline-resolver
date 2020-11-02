import { ResolvedStates } from 'superfly-timeline';
import { TimelineTriggerTimeResult } from './conductor';
import { TSRTimeline } from './types/src';
export declare class AsyncResolver {
    private readonly onSetTimelineTriggerTime;
    private cache;
    constructor(onSetTimelineTriggerTime: (res: TimelineTriggerTimeResult) => void);
    resolveTimeline(resolveTime: number, timeline: TSRTimeline, limitTime: number, useCache: boolean): Promise<{
        resolvedStates: ResolvedStates;
        objectsFixed: {
            id: string;
            time: number;
        }[];
    }>;
    getState(resolved: ResolvedStates, resolveTime: number): Promise<import("superfly-timeline").TimelineState>;
    private _fixNowObjects;
}
