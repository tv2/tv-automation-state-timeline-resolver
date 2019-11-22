/// <reference types="node" />
import { EventEmitter } from 'events';
import { SlowReportOptions } from './types/src/device';
export declare type DoOrderFunction = (...args: any[]) => void | Promise<any> | any;
export declare type DoOrderFunctionNothing = () => void | Promise<any> | any;
export declare type DoOrderFunction0<A> = (arg0: A) => void | Promise<any> | any;
export declare type DoOrderFunction1<A, B> = (arg0: A, arg1: B) => void | Promise<any> | any;
export declare type DoOrderFunction2<A, B, C> = (arg0: A, arg1: B, arg2: C) => void | Promise<any> | any;
export declare enum SendMode {
    /** Send messages as quick as possible */
    BURST = 1,
    /** Send messages in order, wait for the previous message to be acknowledged before sending the next */
    IN_ORDER = 2
}
export interface DoOnTimeOptions extends SlowReportOptions {
}
export declare class DoOnTime extends EventEmitter {
    getCurrentTime: () => number;
    private _i;
    private _queues;
    private _checkQueueTimeout;
    private _sendMode;
    private _commandsToSendNow;
    private _sendingCommands;
    private _options;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'slowCommand', listener: (commandInfo: string) => void): this;
    on(event: 'commandReport', listener: (commandReport: CommandReport) => void): this;
    emit(event: 'error', err: Error): boolean;
    emit(event: 'slowCommand', commandInfo: string): boolean;
    emit(event: 'commandReport', commandReport: CommandReport): boolean;
    constructor(getCurrentTime: () => number, sendMode?: SendMode, options?: DoOnTimeOptions);
    queue(time: number, queueId: string | undefined, fcn: DoOrderFunctionNothing): string;
    queue<A>(time: number, queueId: string | undefined, fcn: DoOrderFunction0<A>, arg0: A): string;
    queue<A, B>(time: number, queueId: string | undefined, fcn: DoOrderFunction1<A, B>, arg0: A, arg1: B): string;
    queue<A, B, C>(time: number, queueId: string | undefined, fcn: DoOrderFunction2<A, B, C>, arg0: A, arg1: B, arg2: C): string;
    getQueue(): {
        id: string;
        queueId: string;
        time: number;
        args: any[];
    }[];
    clearQueueAfter(time: number): void;
    clearQueueNowAndAfter(time: number): number;
    dispose(): void;
    private _remove;
    private _checkQueue;
    private _sendNextCommand;
    private representArguments;
    private _verifySendCommand;
    private _verifyFulfillCommand;
    private _sendCommandReport;
}
export interface CommandReport {
    /** The time the command is planned to execute */
    plannedSend: number;
    /** The queue the command is put into */
    queueId: string;
    /** Command is added to list of planned (future) events */
    added: number;
    /** Command is picked from list of events and put into queue for immediade execution  */
    prepareTime: number;
    /** Command is starting to exeute */
    send: number;
    /** Command has finished executing */
    fullfilled: number;
    /** Arguments of command */
    args: any;
}
