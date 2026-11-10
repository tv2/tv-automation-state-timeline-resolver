import { EventEmitter } from 'eventemitter3'
import got from 'got'
import WebSocket = require('ws')
import {
	createEmptyObservedState,
	extractAccessToken,
	extractCapabilities,
	extractConfiguredVideoSources,
	extractTokenLifetime,
	hasMixerSnapshot,
	hasConfiguredState,
	M2LXCommand,
	M2LXCapabilities,
	M2LXObservedState,
	parseStatusMessage,
} from './protocol'

export interface M2LXConnectionOptions {
	baseUrl: string
	password: string
	eventId?: string
	eventTimeout?: number
	rejectUnauthorized?: boolean
	authenticationTimeout?: number
	webSocketConnectTimeout?: number
	commandTimeout?: number
	reconnectBackoff?: {
		minDelay?: number
		maxDelay?: number
	}
}

export type M2LXConnectionEvents = {
	connected: [sources: Set<string>, state: M2LXObservedState]
	disconnected: [reason: string]
	stateChanged: [state: M2LXObservedState]
	controllerMessage: [message: unknown]
	error: [error: Error]
	authenticationChanged: []
	eventStateChanged: [status: string]
}

export interface M2LXSendOptions {
	/** The command is done once the observed state satisfies this. */
	isComplete: (state: M2LXObservedState) => boolean
	/** The command is not sent if the observed state already satisfies this. Defaults to `isComplete`. */
	isRedundant?: (state: M2LXObservedState) => boolean
	/**
	 * The command is only sent once the observed state satisfies this (e.g. no transition running).
	 * If that does not happen within the command timeout plus the configured effect duration, the command
	 * fails without being sent.
	 */
	waitFor?: (state: M2LXObservedState) => boolean
	/** Throws on a native error even when a controller reply says OK. */
	checkState?: (state: M2LXObservedState, initial: M2LXObservedState) => void
}

export interface IM2LXConnection {
	on<K extends keyof M2LXConnectionEvents>(event: K, listener: (...args: M2LXConnectionEvents[K]) => void): this
	connect(): Promise<void>
	ensureFreshAuthentication(allowRenewal: boolean): Promise<void>
	disconnect(): Promise<void>
	cancelActivation(): void
	sendCommand(command: M2LXCommand, options: M2LXSendOptions): Promise<void>
	readonly connected: boolean
	readonly sources: ReadonlySet<string>
	readonly state: M2LXObservedState
	readonly tokenExpiresAt: number | undefined
	readonly capabilities?: M2LXCapabilities
	readonly eventStatus?: string
}

export const M2LX_AUTH_RENEWAL_MARGIN = 5 * 60 * 1000
const DEFAULT_AUTH_TIMEOUT = 5000
const DEFAULT_CONNECT_TIMEOUT = 5000
const DEFAULT_COMMAND_TIMEOUT = 3000
const DEFAULT_RECONNECT_MIN_DELAY = 1000
const DEFAULT_RECONNECT_MAX_DELAY = 30000
const DEFAULT_EVENT_TIMEOUT = 180000

interface M2LXEvent {
	event_id: string
	event_name: string
	status: string
}

const EVENT_STATUSES = ['Initializing', 'Starting', 'Running', 'Stopping', 'Stopped', 'Resetting', 'Failed', 'Dead']

interface M2LXControllerReply {
	code: number
	message: string
}

function toControllerReply(message: unknown): M2LXControllerReply | undefined {
	if (typeof message !== 'object' || message === null) return undefined
	const { code, message: text } = message as Record<string, unknown>
	if (typeof code !== 'number') return undefined
	return { code, message: typeof text === 'string' ? text : '' }
}

export class M2LXConnection extends EventEmitter<M2LXConnectionEvents> implements IM2LXConnection {
	private readonly _options: M2LXConnectionOptions
	private _controller?: WebSocket
	private _status?: WebSocket
	private _sources = new Set<string>()
	private _capabilities: M2LXCapabilities = { players: new Set(), audio: {}, routers: {} }
	private _state: M2LXObservedState = createEmptyObservedState()
	private _connected = false
	private _terminated = false
	private _connecting?: Promise<void>
	private _reconnectTimer?: NodeJS.Timeout
	private _reconnectAttempt = 0
	private _tokenExpiresAt?: number
	private _connectionGeneration = 0
	private _authenticationStatusTimer?: NodeJS.Timeout
	/** Controller replies carry no request id, so they are matched to sent commands in order. */
	private _pendingReplies: Array<(reply: M2LXControllerReply) => void> = []
	/** Commands and connection readiness waits; aborted when the sockets go away. */
	private _inFlight = new Set<(error: Error) => void>()
	private _sendQueue: Promise<void> = Promise.resolve()
	private _queuedCommands = 0
	private _activatingEvent = false
	private _activationGeneration = 0
	private _eventStatus?: string

	constructor(options: M2LXConnectionOptions) {
		super()
		this._options = options
		if (options.eventId !== undefined && (!options.eventId || options.eventId.trim() !== options.eventId)) {
			throw new Error('M2L-X eventId must be a non-empty ID without surrounding whitespace')
		}
		if (options.eventTimeout !== undefined && (!Number.isFinite(options.eventTimeout) || options.eventTimeout <= 0)) {
			throw new Error('M2L-X eventTimeout must be positive and finite')
		}
	}

	get connected(): boolean {
		return this._connected
	}

	get sources(): ReadonlySet<string> {
		return this._sources
	}

	get state(): M2LXObservedState {
		return this._state
	}

	get capabilities(): M2LXCapabilities {
		return this._capabilities
	}

	get tokenExpiresAt(): number | undefined {
		return this._tokenExpiresAt
	}

	get eventStatus(): string | undefined {
		return this._eventStatus
	}

	async ensureFreshAuthentication(allowRenewal: boolean): Promise<void> {
		const activationGeneration = this._activationGeneration
		if (this._connecting) {
			const activatingEvent = this._activatingEvent
			await this._connecting
			if (!this._options.eventId || !allowRenewal || activatingEvent) {
				this._assertControllerOpen()
				return
			}
		}
		if (!allowRenewal) {
			this._assertControllerOpen()
			return
		}
		if (this._queuedCommands > 0 || this._inFlight.size > 0 || this._state.transition?.running) {
			throw new Error('M2L-X authentication cannot be renewed while commands or a transition are running')
		}
		if (activationGeneration !== this._activationGeneration) throw new Error('M2L-X activation was cancelled')
		await this._openConnection(!!this._options.eventId)
		this._assertControllerOpen()
	}

	async connect(): Promise<void> {
		return this._openConnection(false)
	}

	private async _openConnection(activateEvent: boolean): Promise<void> {
		this._terminated = false
		if (this._reconnectTimer) clearTimeout(this._reconnectTimer)
		this._reconnectTimer = undefined
		if (!this._connecting) {
			this._activatingEvent = activateEvent
			this._connecting = this._connect(activateEvent)
				.catch((error) => {
					this._closeSockets()
					this._setConnected(false, 'Connection failed')
					this._scheduleReconnect()
					throw this._redactError(error)
				})
				.finally(() => {
					this._connecting = undefined
					this._activatingEvent = false
				})
		}
		return this._connecting
	}

	async disconnect(): Promise<void> {
		this._terminated = true
		this._activationGeneration++
		if (this._reconnectTimer) clearTimeout(this._reconnectTimer)
		this._reconnectTimer = undefined
		this._closeSockets()
		this._setConnected(false, 'Disconnected')
	}

	cancelActivation(): void {
		this._activationGeneration++
		if (this._activatingEvent) {
			this._closeSockets()
			this._setConnected(false, 'M2L-X event activation cancelled')
		}
	}

	async sendCommand(command: M2LXCommand, options: M2LXSendOptions): Promise<void> {
		const generation = this._connectionGeneration
		this._queuedCommands++
		const result = this._sendQueue
			.then(async () => {
				this._assertConnectionCurrent(generation)
				await this._sendCommandNow(command, options)
			})
			.finally(() => {
				this._queuedCommands--
			})
		// The caller receives the rejection; later commands must not inherit a rejected queue tail.
		this._sendQueue = result.then(
			() => undefined,
			() => undefined
		)
		return result
	}

	private async _sendCommandNow(command: M2LXCommand, options: M2LXSendOptions): Promise<void> {
		const isRedundant = options.isRedundant ?? options.isComplete
		this._assertControllerOpen()

		if (options.waitFor && !options.waitFor(this._state)) {
			await this._waitForState(command, options.waitFor)
			this._assertControllerOpen()
		}
		const initial = this._state
		options.checkState?.(initial, initial)
		if (isRedundant(this._state)) return

		const timeout =
			(this._options.commandTimeout ?? DEFAULT_COMMAND_TIMEOUT) +
			(command.command === 'transition' && command.args.effect_enabled
				? Math.ceil((this._state.transition?.effect?.duration ?? 0) * 1000)
				: 0)
		await new Promise<void>((resolve, reject) => {
			let acknowledged = false
			const onStateChanged = (state: M2LXObservedState) => {
				if (!acknowledged) return
				try {
					options.checkState?.(state, initial)
					if (options.isComplete(state)) {
						cleanup()
						resolve()
					}
				} catch (error) {
					cleanup()
					reject(error)
				}
			}
			const onReply = (reply: M2LXControllerReply) => {
				if (reply.code === 200) {
					acknowledged = true
					onStateChanged(this._state)
					return
				}
				cleanup()
				reject(new Error(`M2L-X rejected ${command.command}: ${reply.code} ${reply.message}`))
			}
			const onAbort = (error: Error) => {
				cleanup()
				reject(error)
			}
			const cleanup = () => {
				clearTimeout(timer)
				this.off('stateChanged', onStateChanged)
				this._inFlight.delete(onAbort)
				const index = this._pendingReplies.indexOf(onReply)
				if (index >= 0) this._pendingReplies.splice(index, 1)
			}

			this.on('stateChanged', onStateChanged)
			this._pendingReplies.push(onReply)
			this._inFlight.add(onAbort)
			const timer = setTimeout(() => {
				cleanup()
				reject(new Error(`M2L-X command timed out after ${timeout} ms`))
				if (!acknowledged) this._handleSocketClosed('M2L-X command timed out; reconnecting to restore reply alignment')
			}, timeout)

			this._controller?.send(JSON.stringify(command), (error) => {
				if (error) {
					cleanup()
					reject(this._redactError(error))
				}
			})
		})
	}

	private _assertControllerOpen(): void {
		if (!this._controller || this._controller.readyState !== WebSocket.OPEN || !this._connected) {
			throw new Error('M2L-X controller is not connected')
		}
		if (this._tokenExpiresAt !== undefined && this._tokenExpiresAt <= Date.now()) {
			throw new Error('M2L-X access token has expired; stand down before renewing the production connection')
		}
	}

	/** Waits until the observed state satisfies the precondition, allowing a running effect to play out. */
	private async _waitForState(command: M2LXCommand, waitFor: (state: M2LXObservedState) => boolean): Promise<void> {
		const effectDuration = this._state.transition?.effect?.duration ?? 0
		const timeout = (this._options.commandTimeout ?? DEFAULT_COMMAND_TIMEOUT) + Math.ceil(effectDuration * 1000)
		await new Promise<void>((resolve, reject) => {
			const onStateChanged = (state: M2LXObservedState) => {
				if (waitFor(state)) {
					cleanup()
					resolve()
				}
			}
			const onAbort = (error: Error) => {
				cleanup()
				reject(error)
			}
			const cleanup = () => {
				clearTimeout(timer)
				this.off('stateChanged', onStateChanged)
				this._inFlight.delete(onAbort)
			}
			this.on('stateChanged', onStateChanged)
			this._inFlight.add(onAbort)
			const timer = setTimeout(() => {
				cleanup()
				reject(new Error(`M2L-X ${command.command} was not sent: the device was not ready within ${timeout} ms`))
			}, timeout)
		})
	}

	private async _connect(activateEvent: boolean): Promise<void> {
		this._closeSockets()
		this._setConnected(false, 'Connecting')
		this._state = createEmptyObservedState()
		const generation = this._connectionGeneration

		const token = await this._authenticate()
		this._assertConnectionCurrent(generation)
		if (this._options.eventId) {
			if (activateEvent) await this._selectEvent(token, generation)
			const events = await this._getEvents(token, generation)
			const selected = this._selectedEvent(events)
			if (selected.status !== 'Running') {
				this._scheduleReconnect()
				return
			}
			if (
				events.some(
					(event) => event.event_id !== selected.event_id && !['Stopped', 'Failed', 'Dead'].includes(event.status)
				)
			) {
				throw new Error('Another M2L-X event is active; selected-event mixer readiness is ambiguous')
			}
			await this._verifyEventEndpoint(token, generation, selected.event_id)
		}
		const configuration = await this._getSwitcherConfiguration(token)
		this._assertConnectionCurrent(generation)
		const sources = extractConfiguredVideoSources(configuration)
		this._capabilities = extractCapabilities(configuration)
		const webSocketBaseUrl = this._getWebSocketBaseUrl()
		const controllerUrl = this._withToken(`${webSocketBaseUrl}/api/v1/switcher_controller`, token)
		const statusUrl = this._withToken(`${webSocketBaseUrl}/api/v1/switcher_status`, token)

		const socketOptions: WebSocket.ClientOptions = {
			rejectUnauthorized: this._options.rejectUnauthorized ?? true,
		}
		const controller = new WebSocket(controllerUrl, socketOptions)
		const status = new WebSocket(statusUrl, socketOptions)
		this._controller = controller
		this._status = status

		await this._waitForReady(controller, status)
		this._assertConnectionCurrent(generation)
		this._sources = sources
		this._reconnectAttempt = 0
		this._setConnected(true, 'Connected')
		this.emit('connected', new Set(this._sources), this._state)
		this._assertConnectionCurrent(generation)
		this._scheduleAuthenticationStatus()
	}

	private async _eventRequest(
		token: string,
		generation: number,
		method: 'GET' | 'POST',
		path: string,
		deadline?: number
	): Promise<unknown> {
		this._assertConnectionCurrent(generation)
		if (deadline !== undefined && Date.now() >= deadline) throw new Error('M2L-X event activation timed out')
		const request = got(`${this._getHttpBaseUrl()}${path}`, {
			method,
			headers: { authorization: `Bearer ${token}` },
			retry: 0,
			timeout: {
				request: Math.min(
					this._options.authenticationTimeout ?? DEFAULT_AUTH_TIMEOUT,
					deadline === undefined ? Infinity : Math.max(1, deadline - Date.now())
				),
			},
			https: { rejectUnauthorized: this._options.rejectUnauthorized ?? true },
		})
		const abort = () => request.cancel()
		this._inFlight.add(abort)
		try {
			const response = await request
			this._assertConnectionCurrent(generation)
			return method === 'GET' ? JSON.parse(response.body) : undefined
		} catch (error) {
			this._assertConnectionCurrent(generation)
			// Management errors can contain Bearer credentials; do not forward request details.
			const status = error instanceof got.HTTPError ? error.response.statusCode : 'network, timeout or invalid response'
			throw new Error(`M2L-X event ${method} ${path} failed (${status})`)
		} finally {
			this._inFlight.delete(abort)
		}
	}

	private async _getEvents(token: string, generation: number, deadline?: number): Promise<M2LXEvent[]> {
		const response = await this._eventRequest(token, generation, 'GET', '/api/events/overview', deadline)
		if (!Array.isArray(response)) throw new Error('M2L-X event overview must be an array')
		const ids = new Set<string>()
		return response.map((value: unknown) => {
			if (typeof value !== 'object' || value === null) throw new Error('Invalid M2L-X event overview entry')
			const { event_id, event_name, status } = value as Record<string, unknown>
			if (
				typeof event_id !== 'string' ||
				!event_id ||
				ids.has(event_id) ||
				typeof event_name !== 'string' ||
				typeof status !== 'string' ||
				!EVENT_STATUSES.includes(status)
			) {
				throw new Error('Invalid M2L-X event identity or status')
			}
			ids.add(event_id)
			return { event_id, event_name, status }
		})
	}

	private _selectedEvent(events: M2LXEvent[]): M2LXEvent {
		const selected = events.find((event) => event.event_id === this._options.eventId)
		if (!selected) throw new Error(`Configured M2L-X event ${this._options.eventId} was not found`)
		if (selected.status !== this._eventStatus) {
			this._eventStatus = selected.status
			this.emit('eventStateChanged', selected.status)
		}
		return selected
	}

	private async _eventDelay(generation: number, deadline: number): Promise<void> {
		this._assertConnectionCurrent(generation)
		if (Date.now() >= deadline) throw new Error('M2L-X event activation timed out')
		await new Promise<void>((resolve, reject) => {
			const abort = (error: Error) => {
				clearTimeout(timer)
				this._inFlight.delete(abort)
				reject(error)
			}
			const timer = setTimeout(() => {
				this._inFlight.delete(abort)
				resolve()
			}, Math.min(1000, deadline - Date.now()))
			this._inFlight.add(abort)
		})
		this._assertConnectionCurrent(generation)
	}

	private async _waitForEvent(
		token: string,
		generation: number,
		id: string,
		status: string,
		deadline: number
	): Promise<void> {
		while (Date.now() < deadline) {
			const events = await this._getEvents(token, generation, deadline)
			this._selectedEvent(events)
			const event = events.find((value) => value.event_id === id)
			if (!event) throw new Error(`M2L-X event ${id} disappeared during activation`)
			if (event.status === status) return
			if (['Failed', 'Dead', 'Initializing', 'Resetting'].includes(event.status)) {
				throw new Error(`M2L-X event ${id} entered ${event.status} during activation`)
			}
			await this._eventDelay(generation, deadline)
		}
		throw new Error(`M2L-X event ${id} did not reach ${status}: activation timed out`)
	}

	private async _selectEvent(token: string, generation: number): Promise<void> {
		const deadline = Date.now() + (this._options.eventTimeout ?? DEFAULT_EVENT_TIMEOUT)
		const events = await this._getEvents(token, generation, deadline)
		const selected = this._selectedEvent(events)
		if (!['Stopped', 'Starting', 'Running', 'Stopping'].includes(selected.status)) {
			throw new Error(`Configured M2L-X event cannot activate from ${selected.status}`)
		}
		await this._verifyEventEndpoint(token, generation, selected.event_id, false, deadline)
		if (
			events.some(
				(event) => event.event_id !== selected.event_id && ['Initializing', 'Resetting'].includes(event.status)
			)
		) {
			throw new Error('Another M2L-X event is initializing or resetting; refusing activation')
		}
		const others = events.filter(
			(event) => event.event_id !== selected.event_id && ['Starting', 'Running', 'Stopping'].includes(event.status)
		)
		if (others.length > 1) throw new Error('Multiple other M2L-X events are active; refusing activation')
		for (const event of others) {
			await this._verifyEventEndpoint(token, generation, event.event_id, false, deadline)
			if (event.status !== 'Stopping') {
				await this._eventRequest(
					token,
					generation,
					'POST',
					`/api/events/stop/${encodeURIComponent(event.event_id)}`,
					deadline
				)
			}
			await this._waitForEvent(token, generation, event.event_id, 'Stopped', deadline)
		}
		if (selected.status === 'Stopping') {
			await this._waitForEvent(token, generation, selected.event_id, 'Stopped', deadline)
		}
		const fresh = await this._getEvents(token, generation, deadline)
		if (
			fresh.some(
				(event) => event.event_id !== selected.event_id && !['Stopped', 'Failed', 'Dead'].includes(event.status)
			)
		) {
			throw new Error('Another M2L-X event became active during activation')
		}
		const target = this._selectedEvent(fresh)
		if (target.status === 'Stopped') {
			await this._eventRequest(
				token,
				generation,
				'POST',
				`/api/events/start/${encodeURIComponent(target.event_id)}`,
				deadline
			)
		} else if (!['Starting', 'Running'].includes(target.status)) {
			throw new Error(`Configured M2L-X event cannot start from ${target.status}`)
		}
		await this._waitForEvent(token, generation, target.event_id, 'Running', deadline)
	}

	private async _verifyEventEndpoint(
		token: string,
		generation: number,
		eventId: string,
		requireRunning = true,
		deadline?: number
	): Promise<void> {
		const detail = await this._eventRequest(
			token,
			generation,
			'GET',
			`/api/events/detail/${encodeURIComponent(eventId)}`,
			deadline
		)
		if (typeof detail !== 'object' || detail === null) throw new Error('Invalid M2L-X event detail')
		const record = detail as Record<string, unknown>
		if (
			record.event_id !== eventId ||
			(requireRunning && record.status !== 'Running') ||
			!Array.isArray(record.endpoints)
		) {
			throw new Error('M2L-X event detail does not confirm the selected running event')
		}
		const endpoint: unknown = record.endpoints.find((value) => value?.name === 'switcher')?.url
		if (typeof endpoint !== 'string') throw new Error('M2L-X event has no switcher endpoint')
		const base = new URL(this._getHttpBaseUrl())
		const target = new URL(`${base.protocol}//${endpoint}`)
		if (
			target.origin !== base.origin ||
			target.username ||
			target.password ||
			target.pathname !== '/' ||
			target.search ||
			target.hash
		) {
			throw new Error('M2L-X event switcher endpoint must match the configured baseUrl origin')
		}
	}

	private _scheduleAuthenticationStatus(): void {
		if (!this._connected || this._tokenExpiresAt === undefined) return
		const remaining = this._tokenExpiresAt - Date.now()
		if (remaining <= M2LX_AUTH_RENEWAL_MARGIN) this.emit('authenticationChanged')
		if (remaining <= 0) return
		const delay = remaining > M2LX_AUTH_RENEWAL_MARGIN ? remaining - M2LX_AUTH_RENEWAL_MARGIN : remaining
		// These timers only publish status; they must never recycle a production connection.
		this._authenticationStatusTimer = setTimeout(() => {
			this._authenticationStatusTimer = undefined
			this._scheduleAuthenticationStatus()
		}, Math.min(delay, 2147483647))
	}

	private async _authenticate(): Promise<string> {
		const requestedAt = Date.now()
		const response = await got
			.post(`${this._getHttpBaseUrl()}/api/local_auth/signin`, {
				json: {
					alias: 'admin',
					password: this._options.password,
				},
				timeout: {
					request: this._options.authenticationTimeout ?? DEFAULT_AUTH_TIMEOUT,
				},
				https: {
					rejectUnauthorized: this._options.rejectUnauthorized ?? true,
				},
			})
			.json<unknown>()
		const token = extractAccessToken(response)
		const lifetime = extractTokenLifetime(response)
		this._tokenExpiresAt = lifetime === undefined ? undefined : requestedAt + lifetime * 1000
		return token
	}

	private _assertConnectionCurrent(generation: number): void {
		if (this._terminated || generation !== this._connectionGeneration) {
			throw new Error('M2L-X connection attempt was cancelled')
		}
	}

	private async _getSwitcherConfiguration(token: string): Promise<unknown> {
		return got
			.get(`${this._getHttpBaseUrl()}/api/v1/switcher_configuration`, {
				searchParams: { access_token: token },
				timeout: {
					request: this._options.authenticationTimeout ?? DEFAULT_AUTH_TIMEOUT,
				},
				https: {
					rejectUnauthorized: this._options.rejectUnauthorized ?? true,
				},
			})
			.json<unknown>()
	}

	private async _waitForReady(controller: WebSocket, status: WebSocket): Promise<void> {
		const timeoutMs = this._options.webSocketConnectTimeout ?? DEFAULT_CONNECT_TIMEOUT
		return new Promise((resolve, reject) => {
			let controllerOpen = false
			let receivedUsableStatus = false
			let receivedMixerSnapshot = false
			const receivedNodes = new Set<string>()
			const requiredNodes = [
				...this._capabilities.players,
				...Object.keys(this._capabilities.audio),
				...Object.keys(this._capabilities.routers),
			]
			const cleanup = () => {
				clearTimeout(timer)
				this._inFlight.delete(onAbort)
				controller.off('open', onControllerOpen)
				controller.off('error', onError)
				status.off('error', onError)
			}
			const finishIfReady = () => {
				if (controllerOpen && receivedUsableStatus) {
					cleanup()
					resolve()
				}
			}
			const onControllerOpen = () => {
				controllerOpen = true
				finishIfReady()
			}
			const onError = (error: Error) => {
				cleanup()
				reject(this._redactError(error))
			}
			const onAbort = (error: Error) => {
				cleanup()
				reject(error)
			}

			this._inFlight.add(onAbort)
			controller.on('open', onControllerOpen)
			controller.on('error', onError)
			status.on('error', onError)
			controller.on('message', (data) => {
				const text = data.toString()
				let message: unknown = text
				try {
					message = JSON.parse(text)
				} catch {
					// Not JSON; forward the raw text
				}
				this.emit('controllerMessage', message)
				const reply = toControllerReply(message)
				if (reply) this._pendingReplies.shift()?.(reply)
			})
			status.on('message', (data) => {
				try {
					const message: unknown = JSON.parse(data.toString())
					this._state = parseStatusMessage(message, this._state, this._capabilities)
					if (hasMixerSnapshot(message)) receivedMixerSnapshot = true
					if (typeof message === 'object' && message !== null) {
						const entries = (message as Record<string, unknown>).status
						if (Array.isArray(entries)) {
							for (const entry of entries) {
								if (
									typeof entry?.node === 'string' &&
									entry.path === '/' &&
									entry.state &&
									typeof entry.state === 'object'
								) {
									receivedNodes.add(entry.node)
								}
							}
						}
					}
					if (
						receivedMixerSnapshot &&
						(this._state.program || this._state.preview) &&
						requiredNodes.every((node) => receivedNodes.has(node)) &&
						hasConfiguredState(this._state, this._capabilities)
					)
						receivedUsableStatus = true
					this.emit('stateChanged', this._state)
					finishIfReady()
				} catch (error) {
					this.emit('error', this._redactError(error))
				}
			})
			const onClosed = () => this._handleSocketClosed('M2L-X WebSocket closed')
			controller.on('close', onClosed)
			status.on('close', onClosed)
			controller.on('error', (error) => this.emit('error', this._redactError(error)))
			status.on('error', (error) => this.emit('error', this._redactError(error)))

			const timer = setTimeout(() => {
				cleanup()
				reject(new Error(`M2L-X WebSocket connection timed out after ${timeoutMs} ms`))
			}, timeoutMs)
		})
	}

	private _handleSocketClosed(reason: string): void {
		if (this._terminated) return
		this._closeSockets()
		this._setConnected(false, reason)
		this._scheduleReconnect()
	}

	private _scheduleReconnect(): void {
		if (this._terminated || this._reconnectTimer) return
		const minDelay = this._options.reconnectBackoff?.minDelay ?? DEFAULT_RECONNECT_MIN_DELAY
		const maxDelay = this._options.reconnectBackoff?.maxDelay ?? DEFAULT_RECONNECT_MAX_DELAY
		const baseDelay = Math.min(maxDelay, minDelay * Math.pow(2, this._reconnectAttempt++))
		const delay = Math.round(baseDelay * (0.8 + Math.random() * 0.4))

		this._reconnectTimer = setTimeout(() => {
			this._reconnectTimer = undefined
			this.connect().catch((error) => this.emit('error', this._redactError(error)))
		}, delay)
	}

	private _setConnected(connected: boolean, reason: string): void {
		if (this._connected === connected) return
		this._connected = connected
		if (!connected) this.emit('disconnected', reason)
	}

	private _closeSockets(): void {
		this._connectionGeneration++
		if (this._authenticationStatusTimer) clearTimeout(this._authenticationStatusTimer)
		this._authenticationStatusTimer = undefined
		const sockets = [this._controller, this._status]
		this._controller = undefined
		this._status = undefined
		const inFlight = [...this._inFlight]
		this._pendingReplies = []
		this._inFlight.clear()
		for (const onAbort of inFlight) onAbort(new Error('M2L-X connection closed before the command completed'))
		for (const socket of sockets) {
			if (socket && socket.readyState !== WebSocket.CLOSED) {
				socket.removeAllListeners()
				socket.on('error', (error) => this.emit('error', this._redactError(error)))
				socket.close()
			}
		}
	}

	private _getHttpBaseUrl(): string {
		const url = new URL(this._options.baseUrl)
		if (url.protocol !== 'https:' && url.protocol !== 'http:') {
			throw new Error('M2L-X baseUrl must use http or https')
		}
		return url.toString().replace(/\/$/, '')
	}

	private _getWebSocketBaseUrl(): string {
		const url = new URL(this._getHttpBaseUrl())
		url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
		return url.toString().replace(/\/$/, '')
	}

	private _withToken(baseUrl: string, token: string, extra?: Record<string, string>): string {
		const url = new URL(baseUrl)
		url.searchParams.set('access_token', token)
		for (const [key, value] of Object.entries(extra ?? {})) url.searchParams.set(key, value)
		return url.toString()
	}

	private _redactError(error: unknown): Error {
		const original = error instanceof Error ? error : new Error(String(error))
		let message = original.message.replace(/access_token=[^&\s]+/gi, 'access_token=[REDACTED]')
		if (this._options.password) message = message.split(this._options.password).join('[REDACTED]')
		return new Error(message)
	}
}
