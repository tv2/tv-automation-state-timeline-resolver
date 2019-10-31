"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const osc = require("osc");
const sisyfos_1 = require("../types/src/sisyfos");
const events_1 = require("events");
/** How often to check connection status */
const CONNECTIVITY_INTERVAL = 3000; // ms
const CONNECTIVITY_TIMEOUT = 1000; // ms
class SisyfosInterface extends events_1.EventEmitter {
    constructor() {
        super(...arguments);
        this._pingCounter = Math.round(Math.random() * 10000);
        this._connectivityTimeout = null;
        this._connected = false;
    }
    /**
     * Connnects to the OSC server.
     * @param host ip to connect to
     * @param port port the osc server is hosted on
     */
    connect(host, port) {
        this.host = host;
        this.port = port;
        this._oscClient = new osc.UDPPort({
            localAddress: '0.0.0.0',
            localPort: 5256,
            remoteAddress: this.host,
            remotePort: this.port,
            metadata: true
        });
        this._oscClient.on('error', (error) => this.emit('error', error));
        this._oscClient.on('message', (received) => this.receiver(received));
        return new Promise((resolve) => {
            this._oscClient.once('ready', () => {
                // Monitor connectivity:
                this._monitorConnectivity();
                // Request initial, full state:
                this._oscClient.send({ address: '/state/full', args: [] });
            });
            this._oscClient.open();
            if (this.isInitialized()) {
                resolve();
            }
            else {
                // Wait for the state to be received from sisyfos
                this.once('initialized', () => {
                    resolve();
                });
            }
        });
    }
    dispose() {
        this.updateIsConnected(false);
        if (this._connectivityCheckInterval) {
            clearInterval(this._connectivityCheckInterval);
        }
        this._oscClient.close();
    }
    send(command) {
        if (command.type === sisyfos_1.Commands.TAKE) {
            this._oscClient.send({ address: '/take', args: [] });
        }
        else if (command.type === sisyfos_1.Commands.FADE_TO_BLACK) {
            this._oscClient.send({ address: '/fadetoblack', args: [] });
        }
        else if (command.type === sisyfos_1.Commands.CLEAR_PST_ROW) {
            this._oscClient.send({ address: '/clearpst', args: [] });
        }
        else if (command.type === sisyfos_1.Commands.LABEL) {
            this._oscClient.send({ address: `/ch/${command.channel + 1}/label`, args: [{
                        type: 's',
                        value: command.value
                    }] });
        }
        else if (command.type === sisyfos_1.Commands.TOGGLE_PGM) {
            this._oscClient.send({ address: `/ch/${command.channel + 1}/pgm`, args: [{
                        type: 'i',
                        value: command.value
                    }] });
        }
        else if (command.type === sisyfos_1.Commands.TOGGLE_PST) {
            this._oscClient.send({ address: `/ch/${command.channel + 1}/pst`, args: [{
                        type: 'i',
                        value: command.value
                    }] });
        }
        else if (command.type === sisyfos_1.Commands.SET_FADER) {
            this._oscClient.send({ address: `/ch/${command.channel + 1}/faderlevel`, args: [{
                        type: 'f',
                        value: command.value
                    }] });
        }
    }
    disconnect() {
        this._oscClient.close();
    }
    isInitialized() {
        return !!this._state;
    }
    get connected() {
        return this._connected;
    }
    get state() {
        return this._state;
    }
    _monitorConnectivity() {
        const pingSisyfos = () => {
            this._oscClient.send({ address: `/ping/${this._pingCounter}`, args: [] });
            const waitingForPingCounter = this._pingCounter;
            // Expect a reply within a certain time:
            if (this._connectivityTimeout) {
                clearTimeout(this._connectivityTimeout);
            }
            this._connectivityTimeout = setTimeout(() => {
                if (waitingForPingCounter === this._pingCounter) {
                    // this._pingCounter hasn't changed, ie no response has been received
                    this.updateIsConnected(false);
                }
            }, CONNECTIVITY_TIMEOUT);
        };
        // Ping Sisyfos and expect a reply back:
        pingSisyfos();
        this._connectivityCheckInterval = setInterval(() => {
            pingSisyfos();
        }, CONNECTIVITY_INTERVAL);
    }
    receiver(message) {
        const address = message.address.substr(1).split('/');
        if (address[0] === 'state') {
            if (address[1] === 'full') {
                const extState = JSON.parse(message.args[0].value);
                this._state = {
                    channels: extState.channel
                };
                this.emit('initialized');
            }
            else if (address[1] === 'ch') {
                const ch = address[2];
                this._state.channels[ch] = Object.assign(Object.assign({}, this._state.channels[ch]), this.parseChannelCommand(message, address.slice(3)));
            }
        }
        else if (address[0] === 'pong') { // a reply to "/ping"
            let pingValue = parseInt(message.args[0].value, 10);
            if (pingValue && this._pingCounter === pingValue) {
                if (this._connectivityTimeout) {
                    clearTimeout(this._connectivityTimeout);
                    this._connectivityTimeout = null;
                }
                this.updateIsConnected(true);
                this._pingCounter++;
            }
        }
    }
    updateIsConnected(connected) {
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
    parseChannelCommand(message, address) {
        if (address[0] === 'pgm') {
            return { pgmOn: message.args[0].value };
        }
        else if (address[0] === 'pst') {
            return { pstOn: message.args[0].value };
        }
        else if (address[0] === 'faderlevel') {
            return { faderLevel: message.args[0].value };
        }
        return {};
    }
}
exports.SisyfosInterface = SisyfosInterface;
//# sourceMappingURL=sisyfosAPI.js.map