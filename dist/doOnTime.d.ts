/// <reference types="node" />
import { EventEmitter } from 'events';
export declare type DoOrderFunction = (...args: any[]) => void | Promise<any> | any;
export declare class DoOnTime extends EventEmitter {
    getCurrentTime: () => number;
    private _i;
    private _queue;
    private _checkQueueTimeout;
    constructor(getCurrentTime: () => number);
    queue(time: any, fcn: DoOrderFunction, ...args: any[]): string;
    remove(id: string): void;
    getQueue(): {
        id: string;
        time: number;
    }[];
    clearQueueAfter(time: any): void;
    clearQueueNowAndAfter(time: any): void;
    dispose(): void;
    private _checkQueue;
}
