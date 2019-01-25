"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const WebSocket = require("ws");
const events_1 = require("events");
const request = require("request");
const _ = require("underscore");
const CONNECT_TIMEOUT = 3000;
const PING_TIMEOUT = 10 * 1000;
var Protocol;
(function (Protocol) {
    Protocol["DMX"] = "dmx";
    Protocol["PATHPORT"] = "pathport";
    Protocol["ARTNET"] = "art-net";
    Protocol["KINET"] = "kinet";
    Protocol["SACN"] = "sacn";
    Protocol["DVI"] = "dvi";
    Protocol["RIODMX"] = "rio-dmx";
})(Protocol = exports.Protocol || (exports.Protocol = {}));
/**
 * Implementation of the Pharos V2 http API
 */
class Pharos extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this._keepAlive = false;
        this._replyReceived = false;
        this._queryString = '';
        this._serverSessionKey = null;
        this._reconnectAttempts = 0;
        this._isConnecting = false;
        this._isReconnecting = false;
        this._aboutToReconnect = false;
        this._pendingMessages = [];
        this._requestPromises = {};
        this._broadcastCallbacks = {};
        this._connected = false;
        this._webSocketKeepAliveTimeout = null;
    }
    // constructor () {}
    connect(options) {
        this._isConnecting = true;
        return this._connectSocket(options)
            .then(() => {
            this._isConnecting = false;
        });
    }
    get connected() {
        return this._connected;
    }
    dispose() {
        return new Promise((resolve) => {
            _.each(this._requestPromises, (rp, id) => {
                _.each(rp, (promise) => {
                    promise.reject('Disposing');
                });
                delete this._requestPromises[id];
            });
            _.each(this._broadcastCallbacks, (_fcns, id) => {
                delete this._broadcastCallbacks[id];
            });
            if (this.connected) {
                this.once('disconnected', resolve);
            }
            if (this._socket)
                this._socket.close();
            if (!this.connected) {
                resolve();
            }
        });
    }
    getSystemInfo() {
        return this.request('system');
    }
    getProjectInfo() {
        return this.request('project');
    }
    getCurrentTime() {
        return this.request('time');
    }
    /**
     * @param params Example: { num: '1,2,5-9' }
     */
    getTimelineInfo(num) {
        let params = {};
        if (num)
            params.num = num + '';
        return this.request('timeline', params);
    }
    /**
     * @param params Example: { num: '1,2,5-9' }
     */
    getSceneInfo(num) {
        let params = {};
        if (num)
            params.num = num + '';
        return this.request('scene', params);
    }
    /**
     * @param params Example: { num: '1,2,5-9' }
     */
    getGroupInfo(num) {
        let params = {};
        if (num)
            params.num = num + '';
        return this.request('group', params);
    }
    getContentTargetInfo() {
        return this.request('content_target');
    }
    getControllerInfo() {
        return this.request('controller');
    }
    getRemoteDeviceInfo() {
        return this.request('remote_device');
    }
    getTemperature() {
        return this.request('temperature');
    }
    getFanSpeed() {
        return this.request('fan_speed');
    }
    getTextSlot(names) {
        let params = {};
        if (names) {
            if (!_.isArray(names))
                names = [names];
            params.names = names.join(','); // TODO: test that this actually works
        }
        return this.request('text_slot', params);
    }
    getProtocols() {
        return this.request('protocol');
    }
    /**
     * @param key {universe?: universeKey} Example: "dmx:1", "rio-dmx:rio44:1" // DMX, Pathport, sACN and Art-Net, protocol:kinetPowerSupplyNum:kinetPort for KiNET and protocol:remoteDeviceType:remoteDeviceNum for RIO DMX
     */
    getOutput(universe) {
        let params = {};
        if (universe)
            params.universe = universe;
        return this.request('output', params);
    }
    getLuaVariables(vars) {
        let params = {};
        if (vars) {
            if (!_.isArray(vars))
                vars = [vars];
            params.variables = vars.join(',');
        }
        return this.request('lua', params);
    }
    getTriggers() {
        return this.request('trigger');
    }
    subscribeTimelineStatus(callback) {
        return this.subscribe('timeline', callback);
    }
    subscribeSceneStatus(callback) {
        return this.subscribe('scene', callback);
    }
    subscribeGroupStatus(callback) {
        return this.subscribe('group', callback);
    }
    subscribeContentTargetStatus(callback) {
        return this.subscribe('content_target', callback);
    }
    subscribeRemoteDeviceStatus(callback) {
        return this.subscribe('remote_device', callback);
    }
    subscribeBeacon(callback) {
        return this.subscribe('beacon', callback);
    }
    subscribeLua(callback) {
        return this.subscribe('lua', callback);
    }
    startTimeline(timelineNum) {
        return this.command('POST', '/api/timeline', { action: 'start', num: timelineNum });
    }
    startScene(sceneNum) {
        return this.command('POST', '/api/scene', { action: 'start', num: sceneNum });
    }
    releaseTimeline(timelineNum, fade) {
        return this.command('POST', '/api/timeline', { action: 'release', num: timelineNum, fade: fade });
    }
    releaseScene(sceneNum, fade) {
        return this.command('POST', '/api/scene', { action: 'release', num: sceneNum, fade: fade });
    }
    toggleTimeline(timelineNum, fade) {
        return this.command('POST', '/api/timeline', { action: 'toggle', num: timelineNum, fade: fade });
    }
    toggleScene(sceneNum, fade) {
        return this.command('POST', '/api/scene', { action: 'toggle', num: sceneNum, fade: fade });
    }
    pauseTimeline(timelineNum) {
        return this.command('POST', '/api/timeline', { action: 'pause', num: timelineNum });
    }
    resumeTimeline(timelineNum) {
        return this.command('POST', '/api/timeline', { action: 'resume', num: timelineNum });
    }
    pauseAll() {
        return this.command('POST', '/api/timeline', { action: 'pause' });
    }
    resumeAll() {
        return this.command('POST', '/api/timeline', { action: 'resume' });
    }
    releaseAllTimelines(group, fade) {
        return this.command('POST', '/api/timeline', { action: 'release', group: group, fade: fade });
    }
    releaseAllScenes(group, fade) {
        return this.command('POST', '/api/scene', { action: 'release', group: group, fade: fade });
    }
    releaseAll(group, fade) {
        return this.command('POST', '/api/release_all', { group: group, fade: fade });
    }
    setTimelineRate(timelineNum, rate) {
        return this.command('POST', '/api/timeline', { action: 'set_rate', num: timelineNum, rate: rate });
    }
    setTimelinePosition(timelineNum, position) {
        return this.command('POST', '/api/timeline', { action: 'set_position', num: timelineNum, position: position });
    }
    fireTrigger(triggerNum, vars, testConditions) {
        return this.command('POST', '/api/trigger', {
            num: triggerNum,
            var: (vars || []).join(','),
            conditions: !!testConditions
        });
    }
    runCommand(input) {
        return this.command('POST', '/api/cmdline', {
            input: input
        });
    }
    /**
     * Master the intensity of a group (applied as a multiplier to output levels)
     * @param groupNum
     * @param level integer
     * @param fade float
     * @param delay float
     */
    masterIntensity(groupNum, level, fade, delay) {
        return this.command('POST', '/api/group', {
            action: 'master_intensity',
            num: groupNum,
            level: level,
            fade: fade,
            delay: delay
        });
    }
    /**
     * VLC/VLC +: Master the intensity of a content target (applied as a multiplier to output levels)
     * @param type type - of content target, 'primary', 'secondary', 'overlay_1', 'overlay_2'...
     * @param level integer
     * @param fade float
     * @param delay float
     */
    masterContentTargetIntensity(type, level, fade, delay) {
        return this.command('POST', '/api/content_target', {
            action: 'master_intensity',
            type: type,
            level: level,
            fade: fade,
            delay: delay
        });
    }
    setGroupOverride(groupNum, options) {
        let params = _.extend({}, options, {
            num: groupNum,
            target: 'group'
        });
        return this.command('PUT', '/api/override', params);
    }
    setFixtureOverride(fixtureNum, options) {
        let params = _.extend({}, options, {
            num: fixtureNum,
            target: 'fixture'
        });
        return this.command('PUT', '/api/override', params);
    }
    clearGroupOverrides(groupNum, fade) {
        let params = {
            target: 'group'
        };
        if (groupNum !== undefined)
            params.num = groupNum;
        if (fade !== undefined)
            params.fade = fade;
        return this.command('DELETE', '/api/override', params);
    }
    clearFixtureOverrides(fixtureNum, fade) {
        let params = {
            target: 'fixture'
        };
        if (fixtureNum !== undefined)
            params.num = fixtureNum;
        if (fade !== undefined)
            params.fade = fade;
        return this.command('DELETE', '/api/override', params);
    }
    clearAllOverrides(fade) {
        let params = {};
        if (fade !== undefined)
            params.fade = fade;
        return this.command('DELETE', '/api/override', params);
    }
    enableOutput(protocol) {
        return this.command('POST', '/api/output', { action: 'enable', protocol: protocol });
    }
    disableOutput(protocol) {
        return this.command('POST', '/api/output', { action: 'disable', protocol: protocol });
    }
    setTextSlot(slot, value) {
        return this.command('PUT', '/api/text_slot', {
            name: slot,
            value: value
        });
    }
    flashBeacon() {
        return this.command('POST', '/api/beacon');
    }
    parkChannel(universeKey, channelList, level) {
        return this.command('POST', '/api/channel', {
            universe: universeKey,
            channels: (channelList || []).join(','),
            level: level
        });
    }
    unparkChannel(universeKey, channelList) {
        return this.command('DELETE', '/api/channel', {
            universe: universeKey,
            channels: (channelList || []).join(',')
        });
    }
    getLog() {
        return this.command('GET', '/api/log');
    }
    clearLog() {
        return this.command('DELETE', '/api/log');
    }
    /**
     * power reboot
     */
    resetHardware() {
        return this.command('POST', '/api/reset');
    }
    setInternalPage(isInternal) {
        this._queryString = (isInternal ? '?internal_page' : '');
    }
    request(id, params) {
        let p = new Promise((resolve, reject) => {
            if (!this._requestPromises[id])
                this._requestPromises[id] = [];
            this._requestPromises[id].push({ resolve, reject });
            let json = { 'request': id };
            if (params) {
                for (let name in params) {
                    json[name] = params[name];
                }
            }
            this._sendMessage(JSON.stringify(json))
                .catch(e => {
                reject(e);
            });
        });
        return p;
    }
    subscribe(id, callback) {
        if (!this._broadcastCallbacks[id])
            this._broadcastCallbacks[id] = [];
        this._broadcastCallbacks[id].push(callback);
        let json = { 'subscribe': id };
        return this._sendMessage(JSON.stringify(json))
            .then(() => {
            return;
        });
    }
    command(method, url0, data0) {
        return new Promise((resolve, reject) => {
            let url = `${this._options.ssl ? 'https' : 'http'}://${this._options.host}${url0}${this._queryString}`;
            let data = {};
            if (data0) {
                _.each(data0, (value, key) => {
                    if (value !== undefined && value !== null) {
                        data[key] = value;
                    }
                });
            }
            let handleResponse = (error, response) => {
                if (error) {
                    this.emit('error', new Error(`Error ${method}: ${error}`));
                    reject(error);
                }
                else if (response.statusCode === 400) {
                    reject(new Error(`Error: [400]: Bad request`));
                    // TODO: Maybe handle other response-codes?
                }
                else if (response.statusCode >= 200 && response.statusCode <= 299) {
                    resolve(response.body);
                }
                else {
                    reject(new Error(`Error: StatusCode: [${response.statusCode}]`));
                }
            };
            if (method === 'POST') {
                request.post(url, { json: data }, handleResponse);
            }
            else if (method === 'PUT') {
                request.put(url, { json: data }, handleResponse);
            }
            else if (method === 'GET') {
                request.get(url, { json: data }, handleResponse);
            }
            else if (method === 'DELETE') {
                request.delete(url, { json: data }, handleResponse);
            }
            else {
                reject(`Unknown method: "${method}"`);
            }
        });
    }
    _connectSocket(options) {
        if (options) {
            this._options = options;
        }
        return new Promise((resolve, reject) => {
            let pathName = `${this._options.ssl ? 'wss:' : 'ws:'}//${this._options.host}/query${this._queryString}`;
            this._socket = new WebSocket(pathName);
            this._socket.binaryType = 'arraybuffer';
            this.once('connected', () => {
                resolve();
            });
            this.once('error', (e) => {
                reject(e);
            });
            setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, CONNECT_TIMEOUT);
            this._socket.on('open', () => {
                this._connectionChanged(true);
                this._reconnectAttempts = 0; // reset reconnection attempts
                if (this._socket) {
                    while (this._pendingMessages.length) {
                        let m = this._pendingMessages.shift();
                        if (m) {
                            this._socket.send(m.msg, (err) => {
                                if (m) {
                                    if (err)
                                        m.reject(err);
                                    else
                                        m.resolve();
                                }
                            });
                        }
                    }
                }
                this._keepAlive = true;
                this._replyReceived = true;
                this._webSocketKeepAlive();
            });
            this._socket.on('message', (data) => {
                // let data: WebSocket.Data = ev.data
                this._replyReceived = true;
                if (typeof data === 'object') {
                    // @ts-ignore data type
                    let array = new Int32Array(data);
                    if (this._serverSessionKey) {
                        // need to compare primitives as two objects are never the same
                        if ((this._serverSessionKey[0] !== array[0]) ||
                            (this._serverSessionKey[1] !== array[1]) ||
                            (this._serverSessionKey[2] !== array[2]) ||
                            (this._serverSessionKey[3] !== array[3])) {
                            this.emit('restart');
                            this._serverSessionKey = array;
                        }
                    }
                    else {
                        this._serverSessionKey = array;
                    }
                }
                else {
                    let json = JSON.parse(data);
                    this._onReceiveMessage(json);
                }
            });
            this._socket.on('error', (e) => {
                this._handleWebsocketReconnection(e);
            });
            this._socket.on('close', () => {
                // this._connectionChanged(false)
                this._handleWebsocketReconnection();
            });
        });
    }
    _sendMessage(msg) {
        return new Promise((resolve, reject) => {
            if (this._socket && this._socket.readyState === this._socket.OPEN) {
                this._socket.send(msg, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            }
            else {
                this._pendingMessages.push({
                    msg: msg,
                    resolve: resolve,
                    reject: reject
                });
                if (!this._socket || this._socket.readyState !== this._socket.CONNECTING) {
                    this._connectSocket()
                        .catch((err) => {
                        this.emit('error', err);
                    });
                }
            }
        });
    }
    _webSocketKeepAlive() {
        // send a zero length message as a ping to keep the connection alive
        if (this._webSocketKeepAliveTimeout) {
            clearTimeout(this._webSocketKeepAliveTimeout); // to prevent multiple loops of pings
        }
        this._webSocketKeepAliveTimeout = null;
        if (this._keepAlive) {
            if (this._replyReceived) {
                if (this._connected) { // we only have to ping if we think we're connected
                    this._sendMessage('')
                        .catch(e => this.emit('error', e));
                }
                this._webSocketKeepAliveTimeout = setTimeout(() => {
                    this._webSocketKeepAlive();
                }, PING_TIMEOUT);
                this._replyReceived = false;
            }
            else {
                // never got a reply, throw an error
                this._handleWebsocketReconnection(new Error('ping timeout'));
            }
        }
    }
    _reconnect() {
        if (this._isConnecting)
            return; // don't reconnect while a connect is already running
        if (!this._isReconnecting) {
            // try to _reconnect
            this._reconnectAttempts++;
            this._isReconnecting = true;
            this._connectSocket()
                .then(() => {
                this._isReconnecting = false;
            })
                .catch(e => {
                this._isReconnecting = false;
                this.emit('error', e);
                // If the reconnection failed and another reconnection attempt was ignored, do that now instead:
                if (this._aboutToReconnect) {
                    this._aboutToReconnect = false;
                    this._reconnect();
                }
            });
        }
        else {
            // Nothing, ignore if we're already trying to reconnect
            this._aboutToReconnect = true;
        }
    }
    _onReceiveMessage(json) {
        if (json.broadcast) {
            let bc = this._broadcastCallbacks[json.broadcast];
            if (bc) {
                if (bc.length) {
                    _.each(bc, (fcn) => {
                        fcn(json.data);
                    });
                }
                else {
                    this.emit('error', new Error(`no broadcastCallbacks found for ${json.broadcast}`));
                }
            }
            else {
                this.emit('error', new Error(`no broadcastCallbacks array found for ${json.broadcast}`));
            }
        }
        else if (json.request) {
            let rp = this._requestPromises[json.request];
            if (rp) {
                let p = rp.shift();
                if (p) {
                    p.resolve(json.data);
                }
                else {
                    this.emit('error', new Error(`no requestPromise found for ${json.request}`));
                }
            }
            else {
                this.emit('error', new Error(`no requestPromise array found for ${json.request}`));
            }
        }
        else if (json.redirect) {
            this.emit('error', `Redirect to ${json.redirect}`);
        }
        else {
            this.emit('error', `Unknown reply: ${json}`);
        }
    }
    _handleWebsocketReconnection(e) {
        // Called when a socket connection is closed for whatever reason
        this._keepAlive = false;
        this._socket = null;
        this._connectionChanged(false);
        if (e) {
            if (this._reconnectAttempts === 0) { // Only emit error on first error
                this.emit('error', e);
            }
        }
        setTimeout(() => {
            this._reconnect();
        }, Math.min(60, this._reconnectAttempts) * 1000);
    }
    _connectionChanged(connected) {
        if (this._connected !== connected) {
            this._connected = connected;
            if (connected) {
                this.emit('connected');
            }
            else {
                this.emit('disconnected');
            }
        }
    }
}
exports.Pharos = Pharos;
// Test it:
// async function aaa () {
// 	let ph = new Pharos()
// 	await ph.connect({
// 		host: '10.0.1.251'
// 	})
// 	console.log('connected!')
// 	console.log('subscribeSceneStatus', await ph.subscribeSceneStatus((data) => {
// 		console.log('sub data', data)
// 	}))
// 	console.log('subscribed')
// 	// console.log('toggleScene', await ph.startScene(1))
// 	// await ph.toggleScene(1)
// 	// await ph.toggleScene(2)
// 	// await ph.toggleScene(2)
// }
// aaa()
// .then(console.log)
// .catch(console.log)
//# sourceMappingURL=pharosAPI.js.map