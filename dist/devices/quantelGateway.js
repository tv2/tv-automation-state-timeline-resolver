"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const request = require("request");
const events_1 = require("events");
const _ = require("underscore");
const CHECK_STATUS_INTERVAL = 3000;
const CALL_TIMEOUT = 1000;
class QuantelGateway extends events_1.EventEmitter {
    constructor() {
        super();
        this.checkStatusInterval = CHECK_STATUS_INTERVAL;
        this._initialized = false;
        this._statusMessage = 'Initializing...'; // null = all good
        this._monitorPorts = {};
        this._connected = false;
    }
    init(gatewayUrl, ISAUrl, zoneId, serverId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            this._gatewayUrl = (gatewayUrl
                .replace(/\/$/, '') // trim trailing slash
            );
            if (!this._gatewayUrl.match(/http/))
                this._gatewayUrl = 'http://' + this._gatewayUrl;
            // Connect to ISA:
            yield this.connectToISA(ISAUrl);
            this._zoneId = zoneId || 'default';
            this._serverId = serverId;
            // TODO: this is not implemented yet in Quantel gw:
            // const zones = await this.getZones()
            // const zone = _.find(zones, zone => zone.zoneName === this._zoneId)
            // if (!zone) throw new Error(`Zone ${this._zoneId} not found!`)
            const server = yield this.getServer();
            if (!server)
                throw new Error(`Server ${this._serverId} not found!`);
            this._initialized = true;
        });
    }
    connectToISA(ISAUrl) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (ISAUrl) {
                this._ISAUrl = ISAUrl.replace(/^https?:\/\//, ''); // trim any https://
            }
            if (!this._ISAUrl)
                throw new Error('Quantel connectToIsa: ISAUrl not set!');
            return this._ensureGoodResponse(this.sendRaw('post', `connect/${encodeURIComponent(this._ISAUrl)}`));
        });
    }
    dispose() {
        clearInterval(this._monitorInterval);
    }
    monitorServerStatus(callbackOnStatusChange) {
        const getServerStatus = () => tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                this._connected = false;
                if (!this._gatewayUrl)
                    return `Gateway URL not set`;
                if (!this._serverId)
                    return `Server id not set`;
                const servers = yield this.getServers(this._zoneId);
                const server = _.find(servers, s => s.ident === this._serverId);
                if (!server)
                    return `Server ${this._serverId} not present on ISA`;
                if (server.down)
                    return `Server ${this._serverId} is down`;
                this._connected = true;
                const serverErrors = [];
                _.each(this._monitorPorts, (monitorPort, monitorPortId) => {
                    const portExists = _.find(server.portNames || [], portName => portName === monitorPortId);
                    if (!portExists && // our port is NOT set up on server
                        _.compact(server.portNames).length === (server.numChannels || 0) // There is no more room on server
                    ) {
                        serverErrors.push(`Not able to assign port "${monitorPortId}", due to all ports being already used`);
                    }
                    else {
                        _.each(monitorPort.channels, (monitorChannel) => {
                            const channelPort = (server.chanPorts || [])[monitorChannel];
                            if (channelPort && // The channel is assigned to a port
                                channelPort !== monitorPortId // The channel is NOT assigned to our port!
                            ) {
                                serverErrors.push(`Not able to assign channel to port "${monitorPortId}", the channel ${monitorChannel} is already assigned to another port "${channelPort}"!`);
                            }
                        });
                    }
                });
                if (serverErrors.length)
                    return serverErrors.join(', ');
                if (!this._initialized)
                    return `Not initialized`;
                return null; // all good
            }
            catch (e) {
                return `Error when monitoring status: ${(e && e.message) || e.toString()}`;
            }
        });
        const checkServerStatus = () => {
            getServerStatus()
                .then((statusMessage) => {
                if (statusMessage !== this._statusMessage) {
                    this._statusMessage = statusMessage;
                    callbackOnStatusChange(statusMessage === null, statusMessage);
                }
            })
                .catch((e) => this.emit('error', e));
        };
        this._monitorInterval = setInterval(() => {
            checkServerStatus();
        }, this.checkStatusInterval);
        checkServerStatus(); // also run one right away
    }
    get connected() {
        return this._connected;
    }
    get statusMessage() {
        return this._statusMessage;
    }
    get initialized() {
        return this._initialized;
    }
    get gatewayUrl() {
        return this._gatewayUrl;
    }
    get ISAUrl() {
        return this._ISAUrl;
    }
    get zoneId() {
        return this._zoneId;
    }
    get serverId() {
        return this._serverId;
    }
    getZones() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this._ensureGoodResponse(this.sendRaw('get', ''));
        });
    }
    getServers(zoneId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this._ensureGoodResponse(this.sendRaw('get', `${zoneId}/server`));
        });
    }
    /** Return the (possibly cached) server */
    getServer() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this._cachedServer !== undefined)
                return this._cachedServer;
            const servers = yield this.getServers(this._zoneId);
            const server = _.find(servers, (server) => {
                return server.ident === this._serverId;
            }) || null;
            this._cachedServer = server;
            return server;
        });
    }
    /** Create a port and connect it to a channel */
    getPort(portId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.sendServer('get', `port/${portId}`);
            }
            catch (e) {
                if (e.status === 404)
                    return null;
                throw e;
            }
        });
    }
    /**
     * Create (allocate) a new port
     */
    createPort(portId, channelId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendServer('put', `port/${portId}/channel/${channelId}`);
        });
    }
    /**
     * Release (remove) an allocated port
     */
    releasePort(portId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendServer('delete', `port/${portId}`);
        });
    }
    /**
     * Reset a port, this removes all fragments and resets the playhead of the port
     */
    resetPort(portId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendServer('post', `port/${portId}/reset`);
        });
    }
    /** Get info about a clip */
    getClip(clipId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            try {
                return yield this.sendZone('get', `clip/${clipId}`);
            }
            catch (e) {
                if (e.status === 404)
                    return null;
                throw e;
            }
        });
    }
    searchClip(searchQuery) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendZone('get', `clip`, searchQuery);
        });
    }
    getClipFragments(clipId, inPoint, outPoint) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (inPoint !== undefined && outPoint !== undefined) {
                return this.sendZone('get', `clip/${clipId}/fragments/${inPoint}-${outPoint}`);
            }
            else {
                return this.sendZone('get', `clip/${clipId}/fragments`);
            }
        });
    }
    /** Load specified fragments onto a port */
    loadFragmentsOntoPort(portId, fragments, offset) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendServer('post', `port/${portId}/fragments`, {
                offset: offset
            }, fragments);
        });
    }
    /** Query the port for which fragments are loaded. */
    getFragmentsOnPort(portId, rangeStart, rangeEnd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendServer('get', `port/${portId}/fragments`, {
                start: rangeStart,
                finish: rangeEnd
            });
            // /:zoneID/server/:serverID/port/:portID/fragments(?start=:start&finish=:finish)
        });
    }
    /** Start playing on a port */
    portPlay(portId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendServer('post', `port/${portId}/trigger/START`);
            if (!response.success)
                throw Error(`Quantel trigger start: Server returned success=${response.success}`);
            return response;
        });
    }
    /** Stop (pause) playback on a port. If stopAtFrame is provided, the playback will stop at the frame specified. */
    portStop(portId, stopAtFrame) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendServer('post', `port/${portId}/trigger/STOP`, {
                offset: stopAtFrame
            });
            if (!response.success)
                throw Error(`Quantel trigger stop: Server returned success=${response.success}`);
            return response;
        });
    }
    /** Schedule a jump. When the playhead reaches the frame, it'll jump */
    portScheduleJump(portId, jumpToFrame) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendServer('post', `port/${portId}/trigger/JUMP`, {
                offset: jumpToFrame
            });
            if (!response.success)
                throw Error(`Quantel scheduled jump: Server returned success=${response.success}`);
            return response;
        });
    }
    /** Jump directly to a frame, note that this might cause flicker on the output, as the frames haven't been preloaded  */
    portHardJump(portId, jumpToFrame) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendServer('post', `port/${portId}/jump`, {
                offset: jumpToFrame
            });
            if (!response.success)
                throw Error(`Quantel hard jump: Server returned success=${response.success}`);
            return response;
        });
    }
    /** Prepare a jump to a frame (so that those frames are preloaded into memory) */
    portPrepareJump(portId, jumpToFrame) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendServer('put', `port/${portId}/jump`, {
                offset: jumpToFrame
            });
            if (!response.success)
                throw Error(`Quantel prepare jump: Server returned success=${response.success}`);
            return response;
        });
    }
    /** After having preloading a jump, trigger the jump */
    portTriggerJump(portId) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendServer('post', `port/${portId}/trigger/JUMP`);
            if (!response.success)
                throw Error(`Quantel trigger jump: Server returned success=${response.success}`);
            return response;
        });
    }
    /** Clear all fragments from a port.
     * If rangeStart and rangeEnd is provided, will clear the fragments for that time range,
     * if not, the fragments up until (but not including) the playhead, will be cleared
     */
    portClearFragments(portId, rangeStart, rangeEnd) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendServer('delete', `port/${portId}/fragments`, {
                start: rangeStart,
                finish: rangeEnd
            });
            if (!response.wiped)
                throw Error(`Quantel clear port: Server returned wiped=${response.wiped}`);
            return response;
        });
    }
    setMonitoredPorts(monitorPorts) {
        this._monitorPorts = monitorPorts;
    }
    kill() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendBase('post', 'kill/me/if/you/are/sure');
        });
    }
    sendServer(method, resource, queryParameters, bodyData) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendZone(method, `server/${this._serverId}/${resource}`, queryParameters, bodyData);
        });
    }
    sendZone(method, resource, queryParameters, bodyData) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            return this.sendBase(method, `${this._zoneId}/${resource}`, queryParameters, bodyData);
        });
    }
    sendBase(method, resource, queryParameters, bodyData) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._initialized) {
                throw new Error('Quantel not initialized yet');
            }
            return this._ensureGoodResponse(this.sendRaw(method, `${resource}`, queryParameters, bodyData));
        });
    }
    // private sendRaw (
    // 	method: Methods,
    // 	resource: string,
    // 	queryParameters?: QueryParameters,
    // 	bodyData?: object
    // ): Promise<any> {
    // 	// This is a temporary implementation, to make the stuff run in order
    // 	return new Promise((resolve, reject) => {
    // 		this._doOnTime.queue(
    // 			0, // run as soon as possible
    // 			undefined,
    // 			(method, resource, bodyData) => {
    // 				return this.sendRaw2(method, resource, queryParameters, bodyData)
    // 				.then(resolve)
    // 				.catch(reject)
    // 			},
    // 			method,
    // 			resource,
    // 			bodyData
    // 		)
    // 	})
    // }
    sendRaw(method, resource, queryParameters, bodyData) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield this.sendRawInner(method, resource, queryParameters, bodyData);
            if (this._isAnErrorResponse(response) &&
                response.status === 502 && //
                (response.message + '').match(/first provide a quantel isa/i) // First provide a Quantel ISA connection URL (e.g. POST to /connect)
            ) {
                yield this.connectToISA();
                // Then try again:
                return this.sendRawInner(method, resource, queryParameters, bodyData);
            }
            else {
                return response;
            }
        });
    }
    sendRawInner(method, resource, queryParameters, bodyData) {
        return new Promise((resolve, reject) => {
            let requestMethod = request[method];
            if (requestMethod) {
                const url = this.urlQuery(this._gatewayUrl + '/' + resource, queryParameters);
                this.emit('debug', `QuantelGateway send ${method} ${url} ${queryParameters ? JSON.stringify(queryParameters) : ''}`);
                requestMethod(url, {
                    json: bodyData,
                    timeout: CALL_TIMEOUT
                }, (error, response) => {
                    if (error) {
                        reject(`Quantel Gateway error ${error}`);
                    }
                    else if (response.statusCode === 200) {
                        try {
                            resolve(typeof response.body === 'string' ? JSON.parse(response.body) : response.body);
                        }
                        catch (e) {
                            reject(e);
                        }
                    }
                    else {
                        try {
                            reject(typeof response.body === 'string' ? JSON.parse(response.body) : response.body);
                        }
                        catch (e) {
                            reject(e);
                        }
                    }
                });
            }
            else
                reject(`Unknown request method: "${method}"`);
        }).then(res => {
            return res;
        });
    }
    urlQuery(url, params = {}) {
        let queryString = _.compact(_.map(params, (value, key) => {
            if (value !== undefined) {
                return `${key}=${encodeURIComponent(value.toString())}`;
            }
            return null;
        })).join('&');
        return url + (queryString ? `?${queryString}` : '');
    }
    _ensureGoodResponse(pResponse, if404ThenNull) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const response = yield Promise.resolve(pResponse); // Wrapped in Promise.resolve due to for some reason, tslint doen't understand that pResponse is a Promise
            if (this._isAnErrorResponse(response)) {
                if (response.status === 404) {
                    if (if404ThenNull) {
                        return null;
                    }
                    if ((response.message || '').match(/Not found\. Request/)) {
                        throw new Error(`${response.status} ${response.message}\n${response.stack}`);
                    }
                    else {
                        return response;
                    }
                }
                else {
                    throw new Error(`${response.status} ${response.message}\n${response.stack}`);
                }
            }
            return response;
        });
    }
    _isAnErrorResponse(response) {
        return !!(response &&
            _.isObject(response) &&
            response.status &&
            _.isNumber(response.status) &&
            _.isString(response.message) &&
            _.isString(response.stack) &&
            response.status !== 200);
    }
}
exports.QuantelGateway = QuantelGateway;
// Note: These typings are a copied from https://github.com/nrkno/tv-automation-quantel-gateway
var Q;
(function (Q) {
    let Trigger;
    (function (Trigger) {
        Trigger["START"] = "START";
        Trigger["STOP"] = "STOP";
        Trigger["JUMP"] = "JUMP";
        Trigger["TRANSITION"] = "TRANSITION"; // quantel.TRANSITION
    })(Trigger = Q.Trigger || (Q.Trigger = {}));
    let Priority;
    (function (Priority) {
        Priority["STANDARD"] = "STANDARD";
        Priority["HIGH"] = "HIGH"; // quantel.HIGH
    })(Priority = Q.Priority || (Q.Priority = {}));
})(Q = exports.Q || (exports.Q = {}));
//# sourceMappingURL=quantelGateway.js.map