"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const _ = require("underscore");
var SendMode;
(function (SendMode) {
    /** Send messages as quick as possible */
    SendMode[SendMode["BURST"] = 1] = "BURST";
    /** Send messages in order, wait for the previous message to be acknowledged before sending the next */
    SendMode[SendMode["IN_ORDER"] = 2] = "IN_ORDER";
})(SendMode = exports.SendMode || (exports.SendMode = {}));
class DoOnTime extends events_1.EventEmitter {
    /* tslint:enable:unified-signatures */
    constructor(getCurrentTime, sendMode = SendMode.BURST, options) {
        super();
        this._i = 0;
        this._queues = {};
        this._checkQueueTimeout = 0;
        this._commandsToSendNow = {};
        this._sendingCommands = {};
        this.getCurrentTime = getCurrentTime;
        this._sendMode = sendMode;
        this._options = options || {};
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    queue(time, queueId, fcn, ...args) {
        if (!(time >= 0))
            throw Error(`DoOnTime: time argument must be >= 0 (${time})`);
        if (!_.isFunction(fcn))
            throw Error(`DoOnTime: fcn argument must be a function! (${typeof fcn})`);
        let id = '_' + (this._i++);
        if (!queueId)
            queueId = '_'; // default
        if (!this._queues[queueId])
            this._queues[queueId] = {};
        this._queues[queueId][id] = {
            time: time,
            fcn: fcn,
            args: args,
            addedTime: this.getCurrentTime(),
            prepareTime: 0
        };
        this._checkQueueTimeout = setTimeout(() => {
            this._checkQueue();
        }, 0);
        return id;
    }
    getQueue() {
        const fullQueue = [];
        _.each(this._queues, (queue, queueId) => {
            _.each(queue, (q, id) => {
                fullQueue.push({
                    id: id,
                    queueId: queueId,
                    time: q.time,
                    args: q.args
                });
            });
        });
        return fullQueue;
    }
    clearQueueAfter(time) {
        _.each(this._queues, (queue, queueId) => {
            _.each(queue, (q, id) => {
                if (q.time > time) {
                    this._remove(queueId, id);
                }
            });
        });
    }
    clearQueueNowAndAfter(time) {
        let removed = 0;
        _.each(this._queues, (queue, queueId) => {
            _.each(queue, (q, id) => {
                if (q.time >= time) {
                    this._remove(queueId, id);
                    removed++;
                }
            });
        });
        return removed;
    }
    dispose() {
        this.clearQueueAfter(0); // clear all
        clearTimeout(this._checkQueueTimeout);
    }
    _remove(queueId, id) {
        delete this._queues[queueId][id];
    }
    _checkQueue() {
        clearTimeout(this._checkQueueTimeout);
        let now = this.getCurrentTime();
        let nextTime = now + 99999;
        _.each(this._queues, (queue, queueId) => {
            _.each(queue, (o, id) => {
                if (o.time <= now) {
                    o.prepareTime = this.getCurrentTime();
                    if (!this._commandsToSendNow[queueId])
                        this._commandsToSendNow[queueId] = [];
                    this._commandsToSendNow[queueId].push(() => {
                        try {
                            let startSend = this.getCurrentTime();
                            let sentTooSlow = false;
                            let p = Promise.resolve(o.fcn(...o.args))
                                .then(() => {
                                if (!sentTooSlow)
                                    this._verifyFulfillCommand(o, startSend, queueId);
                                this._sendCommandReport(o, startSend, queueId);
                            });
                            sentTooSlow = this._verifySendCommand(o, startSend, queueId);
                            return p;
                        }
                        catch (e) {
                            return Promise.reject(e);
                        }
                    });
                    this._remove(queueId, id);
                }
                else {
                    if (o.time < nextTime)
                        nextTime = o.time;
                }
            });
            // Go through the commands to be sent:
            this._sendNextCommand(queueId);
        });
        // schedule next check:
        let timeToNext = Math.min(1000, nextTime - now);
        this._checkQueueTimeout = setTimeout(() => {
            this._checkQueue();
        }, timeToNext);
    }
    _sendNextCommand(queueId) {
        if (this._sendingCommands[queueId]) {
            return;
        }
        this._sendingCommands[queueId] = true;
        try {
            if (!this._commandsToSendNow[queueId])
                this._commandsToSendNow[queueId] = [];
            const commandToSend = this._commandsToSendNow[queueId].shift();
            if (commandToSend) {
                if (this._sendMode === SendMode.BURST) {
                    // send all at once:
                    commandToSend()
                        .catch((e) => {
                        this.emit('error', e);
                    });
                    this._sendingCommands[queueId] = false;
                    // send next message:
                    setTimeout(() => {
                        this._sendNextCommand(queueId);
                    }, 0);
                }
                else { // SendMode.IN_ORDER
                    // send one, wait for it to finish, then send next:
                    commandToSend()
                        .catch((e) => {
                        this.emit('error', e);
                    })
                        .then(() => {
                        this._sendingCommands[queueId] = false;
                        // send next message:
                        this._sendNextCommand(queueId);
                    })
                        .catch((e) => {
                        this._sendingCommands[queueId] = false;
                        this.emit('error', e);
                    });
                }
            }
            else {
                this._sendingCommands[queueId] = false;
            }
        }
        catch (e) {
            this._sendingCommands[queueId] = false;
            throw e;
        }
    }
    representArguments(o) {
        if (o.args && o.args[0] && o.args[0].serialize && _.isFunction(o.args[0].serialize)) {
            return o.args[0].serialize();
        }
        else {
            return o.args;
        }
    }
    _verifySendCommand(o, send, queueId) {
        if (this._options.limitSlowSentCommand) {
            let sendDelay = send - o.time;
            let addedDelay = o.time - o.addedTime;
            if (sendDelay > this._options.limitSlowSentCommand) {
                let output = {
                    added: o.addedTime,
                    prepareTime: o.prepareTime,
                    plannedSend: o.time,
                    send: send,
                    queueId: queueId,
                    args: this.representArguments(o)
                };
                this.emit('slowCommand', `Slow sent command, should have been sent at ${o.time}, was ${sendDelay} ms slow (was added ${(addedDelay >= 0) ? `${addedDelay} ms before` : `${-addedDelay} ms after`} planned), sendMode: ${SendMode[this._sendMode]}. Command: ${JSON.stringify(output)}`);
                return true;
            }
        }
        return false;
    }
    _verifyFulfillCommand(o, send, queueId) {
        if (this._options.limitSlowFulfilledCommand) {
            let fullfilled = this.getCurrentTime();
            let fulfilledDelay = fullfilled - o.time;
            let output = {
                added: o.addedTime,
                prepareTime: o.prepareTime,
                plannedSend: o.time,
                send: send,
                queueId: queueId,
                fullfilled: fullfilled,
                args: this.representArguments(o)
            };
            if (fulfilledDelay > this._options.limitSlowFulfilledCommand) {
                this.emit('slowCommand', `Slow fulfilled command, should have been fulfilled at ${o.time}, was ${fulfilledDelay} ms slow. Command: ${JSON.stringify(output)}`);
            }
        }
    }
    _sendCommandReport(o, send, queueId) {
        let fullfilled = this.getCurrentTime();
        if (this.listenerCount('commandReport') > 0) {
            // let sendDelay: number = endSend - o.time
            // let fulfilledDelay: number = fullfilled - o.time
            const output = {
                added: o.addedTime,
                prepareTime: o.prepareTime,
                plannedSend: o.time,
                send: send,
                queueId: queueId,
                fullfilled: fullfilled,
                args: this.representArguments(o)
            };
            this.emit('commandReport', output);
        }
    }
}
exports.DoOnTime = DoOnTime;
//# sourceMappingURL=doOnTime.js.map