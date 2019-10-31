/// <reference types="node" />
import { ResolvedStates } from 'superfly-timeline';
import { EventEmitter } from 'events';
import { TSRTimeline } from './types/src';
export declare class AsyncResolver extends EventEmitter {
    resolveTimeline(resolveTime: number, timeline: TSRTimeline, limitTime: number): Promise<{
        resolvedStates: ResolvedStates;
        objectsFixed: {
            id: string;
            time: number;
        }[];
    }>;
    getState(resolved: ResolvedStates, resolveTime: number): Promise<import("superfly-timeline").TimelineState>;
    private _fixNowObjects;
}
