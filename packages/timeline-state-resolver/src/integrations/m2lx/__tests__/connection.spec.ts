import * as http from 'http'
import { AddressInfo } from 'net'
import WebSocket = require('ws')
import { DeviceType } from 'timeline-state-resolver-types'
import { M2LXDevice } from '..'
import { M2LXConnection, M2LX_AUTH_RENEWAL_MARGIN } from '../connection'
import { createSetInputCommand, createSetKeyerCommand, createTransitionCommand, M2LXCommand } from '../protocol'
import { diffM2LXStates, M2LXState } from '../state'

// Talk to a real local server instead of the repo-wide got/ws manual mocks
jest.unmock('got')
jest.unmock('ws')

/**
 * A minimal stand-in for the M2L-X that reproduces the behaviour measured on the real device:
 * REST sign-in + configuration, a status stream (full snapshot, then path-scoped deltas)
 * and a controller socket that answers `{code, message}` without request ids.
 */
class FakeM2LX {
	readonly server: http.Server
	readonly controllers = new Set<WebSocket>()
	readonly statuses = new Set<WebSocket>()
	readonly received: any[] = []
	readonly changesDuringTransition: M2LXCommand[] = []
	readonly completedPrograms: string[] = []
	signIns = 0
	configurationRequests = 0
	tokenLifetime: number | undefined = 86399
	rejectSignIn = false
	signInDelay = 0
	sendInitialSnapshot = true
	sendPartialStatus = false
	extended = false
	deferExtendedSnapshots = false
	replyDelay = 0
	dropReplies = false
	rejectAcceptedCommands = false
	failNextLoad = false
	events?: Array<{ event_id: string; event_name: string; status: string }>
	eventRequests: Array<{ method: string; path: string; body: string; authorization?: string; contentType?: string }> =
		[]
	eventOperationStatus = { start: 200, stop: 200 }
	holdEventTransitions = false
	holdEventOverview = false
	switcherEndpoint?: string
	otherSwitcherEndpoint?: string
	detailEventId?: string
	eventRequestObserver?: (path: string) => void
	readonly player = {
		clip: { loaded: true, asset_id: 'original.mp4', duration: 300, frame_rate: '50' },
		playback: { paused: true, rate: 0, time: 0 },
		loop_enabled: false,
		error: { code: '', message: '', severity: 'none' },
	}
	readonly audioInputs: Record<string, { volume: number; muted: boolean }> = {
		'vtr3.1': { volume: 1, muted: false },
	}
	readonly routes = [{ input: 'ndi1', output: 'ch1' }]
	configuredSources = ['ndi1', 'ndi2', 'vtr1', 'replay1']
	program = 'vtr1'
	preview = 'replay1'
	/** Milliseconds a `transition {effect_enabled: true}` takes; reported as seconds in the status. */
	effectDuration = 100
	effectName = 'wipe_up_right'
	effectArgs?: { fade?: number }
	/** When set, an effect transition starts but never finishes. */
	stuckTransition = false
	running = false
	/** Keys with an empty source accept the command but never change state. */
	keyers: Record<'program' | 'preview', Array<{ visible: boolean; source: string; [property: string]: unknown }>> = {
		program: [{ visible: false, source: 'ndi1' }],
		preview: [
			{ visible: false, source: 'ndi1' },
			{ visible: false, source: '' },
		],
	}
	private readonly _wss: WebSocket.Server

	constructor() {
		this.server = http.createServer((req, res) => this._handleHttp(req, res))
		this._wss = new WebSocket.Server({ server: this.server })
		this._wss.on('connection', (socket, req) => {
			const url = new URL(req.url ?? '/', 'http://localhost')
			if (url.searchParams.get('access_token') !== 'token') {
				socket.close(4001, 'unauthorized')
				return
			}
			if (url.pathname === '/api/v1/switcher_controller') {
				this.controllers.add(socket)
				socket.on('message', (data) => this._handleCommand(socket, JSON.parse(data.toString())))
				socket.on('close', () => this.controllers.delete(socket))
			} else if (url.pathname === '/api/v1/switcher_status') {
				this.statuses.add(socket)
				socket.on('close', () => this.statuses.delete(socket))
				if (this.sendInitialSnapshot) this.broadcastSnapshot()
				else if (this.sendPartialStatus) this._broadcast('/program/background', { source: this.program })
			} else {
				socket.close(4004, 'not found')
			}
		})
	}

	async listen(): Promise<string> {
		await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve))
		return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
	}

	async close(): Promise<void> {
		for (const socket of [...this.controllers, ...this.statuses]) socket.terminate()
		await new Promise<void>((resolve) => this._wss.close(() => resolve()))
		await new Promise<void>((resolve) => this.server.close(() => resolve()))
	}

	broadcastSnapshot(): void {
		this._broadcast('/', this._mixerState())
		if (this.extended && !this.deferExtendedSnapshots) this.broadcastExtendedSnapshot()
	}

	broadcastExtendedSnapshot(): void {
		this.broadcastNode('vtr3', '/', this.player)
		this.broadcastNode('audio_mixer', '/', { inputs: this.audioInputs })
		this.broadcastNode('router', '/', { connections: this.routes })
	}

	broadcastNode(node: string, path: string, state: unknown): void {
		const message = JSON.stringify({ status: [{ node, path, state }], timestamp: Date.now() })
		for (const socket of this.statuses) socket.send(message)
	}

	private _handleHttp(req: http.IncomingMessage, res: http.ServerResponse): void {
		const url = new URL(req.url ?? '/', 'http://localhost')
		let body = ''
		req.on('data', (chunk) => (body += chunk))
		req.on('end', () => {
			if (this.events && url.pathname.startsWith('/api/events/')) {
				this.eventRequests.push({
					method: req.method ?? '',
					path: url.pathname,
					body,
					authorization: req.headers.authorization,
					contentType: req.headers['content-type'],
				})
				this.eventRequestObserver?.(url.pathname)
				if (req.headers.authorization !== 'Bearer token' || url.searchParams.has('access_token')) {
					res.writeHead(401)
					res.end()
					return
				}
				if (url.pathname === '/api/events/overview') {
					if (this.holdEventOverview) return
					res.writeHead(200, { 'Content-Type': 'application/json' })
					res.end(JSON.stringify(this.events))
					return
				}
				const match = /^\/api\/events\/(detail|start|stop)\/(.+)$/.exec(url.pathname)
				const event = match && this.events.find((value) => value.event_id === decodeURIComponent(match[2]))
				if (!match || !event) {
					res.writeHead(404)
					res.end()
					return
				}
				const operation = match[1]
				if (operation === 'detail' && req.method === 'GET') {
					res.writeHead(200, { 'Content-Type': 'application/json' })
					res.end(
						JSON.stringify({
							...event,
							event_id: this.detailEventId ?? event.event_id,
							endpoints: [
								{
									name: 'switcher',
									url:
										(event.event_id === 'other' ? this.otherSwitcherEndpoint : undefined) ??
										this.switcherEndpoint ??
										req.headers.host,
								},
							],
						})
					)
				} else if ((operation === 'start' || operation === 'stop') && req.method === 'POST') {
					const code = this.eventOperationStatus[operation]
					if (code === 200) {
						event.status =
							operation === 'start'
								? this.holdEventTransitions
									? 'Starting'
									: 'Running'
								: this.holdEventTransitions
								? 'Stopping'
								: 'Stopped'
					}
					res.writeHead(code)
					res.end()
				} else {
					res.writeHead(405)
					res.end()
				}
				return
			}
			if (req.method === 'POST' && url.pathname === '/api/local_auth/signin') {
				this.signIns++
				const { alias, password } = JSON.parse(body)
				setTimeout(() => {
					if (alias === 'admin' && password === 'secret' && !this.rejectSignIn) {
						res.writeHead(200, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ access_token: 'token', refresh_token: 'refresh', expires_in: this.tokenLifetime }))
					} else {
						res.writeHead(401, { 'Content-Type': 'application/json' })
						res.end(JSON.stringify({ message: 'invalid credentials' }))
					}
				}, this.signInDelay)
			} else if (req.method === 'GET' && url.pathname === '/api/v1/switcher_configuration') {
				this.configurationRequests++
				if (this.events && !this.events.some((event) => event.status === 'Running')) {
					res.writeHead(404)
					res.end()
					return
				}
				if (url.searchParams.get('access_token') !== 'token') {
					res.writeHead(401)
					res.end()
					return
				}
				res.writeHead(200, { 'Content-Type': 'application/json' })
				res.end(
					JSON.stringify({
						nodes: [
							{ name: 'mixer', type: 'video_mixer', config: { sources: this.configuredSources } },
							...(this.extended
								? [
										{ name: 'vtr3', type: 'media_player' },
										{ name: 'audio_mixer', type: 'audio_mixer', config: { inputs: ['vtr3.1'], maximum_volume: 1 } },
										{ name: 'router', type: 'video_router', config: { inputs: ['ndi1', 'ndi2'], outputs: ['ch1'] } },
								  ]
								: []),
						],
					})
				)
			} else {
				res.writeHead(404)
				res.end()
			}
		})
	}

	private _handleCommand(socket: WebSocket, command: any): void {
		this.received.push(command)
		if (this.running) this.changesDuringTransition.push(command)
		const reply = (code: number, message: string) => {
			if (this.dropReplies) return
			if (this.rejectAcceptedCommands && code === 200) {
				code = 400
				message = 'Rejected after status update'
			}
			const send = () => socket.send(JSON.stringify({ code, message }))
			if (this.replyDelay) setTimeout(send, this.replyDelay)
			else send()
		}
		if (this.extended && command.node === 'vtr3') {
			if (command.command === 'pause' && !this.player.clip.loaded) {
				return reply(412, 'Invalid state: media file not loaded')
			}
			reply(200, 'OK')
			if (command.command === 'load') {
				if (this.failNextLoad) {
					this.failNextLoad = false
					this.player.clip.loaded = false
					this.player.error = { code: 'missing', message: 'Asset missing', severity: 'error' }
				} else {
					this.player.clip = {
						loaded: true,
						asset_id: command.args.id,
						duration: 15.482133333333334,
						frame_rate: '29.97',
					}
					this.player.playback = { paused: true, rate: 0, time: 0 }
					this.player.loop_enabled = true
					this.player.error = { code: '', message: '', severity: 'none' }
				}
			} else if (command.command === 'unload') this.player.clip.loaded = false
			else if (command.command === 'set_loop_enabled') this.player.loop_enabled = command.args
			else if (command.command === 'seek') this.player.playback.time = command.args.time
			else if (command.command === 'pause' || command.command === 'play') {
				this.player.playback.paused = command.command === 'pause'
				this.player.playback.rate = command.command === 'pause' ? 0 : 1
			}
			this.broadcastNode('vtr3', '/', this.player)
			return
		}
		if (this.extended && command.node === 'audio_mixer') {
			for (const input of command.args) {
				if (!this.audioInputs[input.name]) return reply(400, 'Unknown audio input')
				if (command.command === 'set_input_volume') this.audioInputs[input.name].volume = input.volume
				else if (command.command === 'set_input_muted') this.audioInputs[input.name].muted = input.muted
			}
			reply(200, 'OK')
			this.broadcastNode('audio_mixer', '/inputs', this.audioInputs)
			return
		}
		if (this.extended && command.node === 'router' && command.command === 'connect') {
			const route = this.routes.find((route) => route.output === command.args.output)
			if (!route || !['ndi1', 'ndi2'].includes(command.args.input)) return reply(400, 'Unknown route')
			route.input = command.args.input
			reply(200, 'OK')
			this.broadcastNode('router', '/connections', this.routes)
			return
		}
		if (command.node !== 'mixer') return reply(400, `Invalid request: unknown node ${command.node}`)

		switch (command.command) {
			case 'configure_effect':
				if (command.args.name !== undefined) this.effectName = command.args.name
				if (command.args.duration !== undefined)
					this.effectDuration = Number(command.args.duration.replace(/s$/, '')) * 1000
				if (command.args.args !== undefined) this.effectArgs = { fade: Math.fround(command.args.args.fade) }
				reply(200, 'OK')
				this._broadcast('/transition/effect', {
					name: this.effectName,
					duration: this.effectDuration / 1000,
					args: this.effectArgs,
				})
				return
			case 'set_input_property': {
				const source = command.args.property.value
				if (!['ndi1', 'ndi2', 'vtr1', 'replay1'].includes(source)) return reply(400, `invalid source name ${source}`)
				reply(200, 'OK')
				this[command.args.input_type as 'program' | 'preview'] = source
				this._broadcast(`/${command.args.input_type}/background`, { source, source_type: 'video' })
				return
			}
			case 'transition': {
				reply(200, 'OK')
				if (!command.args.effect_enabled) {
					this._finishTransition()
					return
				}
				this.running = true
				this._broadcast('/transition/progress', { automatic: true, inverted: false, running: true, value: 0 })
				if (this.stuckTransition) return
				setTimeout(() => {
					this.running = false
					this._finishTransition()
					this._broadcast('/transition/progress', { automatic: true, inverted: false, running: false, value: 1 })
				}, this.effectDuration)
				return
			}
			case 'set_key_property': {
				reply(200, 'OK')
				const bus = command.args.target as 'program' | 'preview'
				const key = this.keyers[bus][command.args.key_index]
				if (!key || (key.source === '' && command.args.property.name === 'visible')) return
				const property = command.args.property
				if (property.name === 'visible') key.visible = property.value
				else if (property.name === 'video' || property.name === 'image') {
					key.source = property.value
					key.source_type = property.name
				} else key[property.name] = property.value
				this._broadcast(`/${bus}/upstream_keys/${command.args.key_index}`, { chroma_key: {}, key })
				return
			}
			default:
				return reply(400, `Invalid request: schema not found for video_mixer/${command.command}`)
		}
	}

	/** Like the real device: program takes whatever is on preview at the end of the transition. */
	private _finishTransition(): void {
		this.program = this.preview
		this.keyers.program = JSON.parse(JSON.stringify(this.keyers.preview))
		this.completedPrograms.push(this.program)
		this.broadcastSnapshot()
	}

	private _mixerState() {
		const bus = (name: 'program' | 'preview') => ({
			background: { source: this[name], source_type: 'video' },
			upstream_keys: this.keyers[name].map((key) => ({ chroma_key: {}, key })),
			downstream_keys: [],
		})
		return {
			program: bus('program'),
			preview: bus('preview'),
			transition: {
				effect: {
					name: this.effectName,
					duration: this.effectDuration / 1000,
					...(this.effectArgs ? { args: this.effectArgs } : {}),
				},
				progress: { automatic: false, inverted: false, running: this.running, value: 1 },
			},
		}
	}

	private _broadcast(path: string, state: unknown): void {
		const message = JSON.stringify({ status: [{ node: 'mixer', path, state }], timestamp: Date.now() })
		for (const socket of this.statuses) socket.send(message)
	}
}

describe('M2LXConnection', () => {
	let device: FakeM2LX
	let baseUrl: string
	let connection: M2LXConnection

	beforeEach(async () => {
		device = new FakeM2LX()
		baseUrl = await device.listen()
	})

	afterEach(async () => {
		await connection?.disconnect()
		await device.close()
		jest.restoreAllMocks()
	})

	test.each(['cut', 'effect'] as const)(
		'takes and clears native PiPs on the same background using %s',
		async (transition) => {
			device.effectDuration = 150
			device.keyers.preview = JSON.parse(JSON.stringify(device.keyers.program))
			connection = new M2LXConnection({ baseUrl, password: 'secret', commandTimeout: 100 })
			await connection.connect()
			const before: M2LXState = {
				mixer: { program: 'vtr1', preview: 'replay1', timelineObjId: 'before' },
				keyers: {},
			}
			const next: M2LXState = {
				mixer: {
					program: 'vtr1',
					preview: 'replay1',
					transition,
					composition: {
						pip: {
							0: {
								visible: true,
								source: { type: 'video', name: 'ndi2' },
								translation: { x: 108, y: 308 },
								scale: { x: 0.43, y: 0.43 },
								crop: { x: 0, y: 0, width: 1, height: 1 },
							},
						},
					},
					timelineObjId: 'layout',
				},
				keyers: {},
			}
			for (const command of diffM2LXStates(before, next)) await connection.sendCommand(command.command, command)
			expect(connection.state).toMatchObject({
				program: 'vtr1',
				preview: 'replay1',
				keyers: {
					program: {
						0: { visible: true, source: 'ndi2', translation: { x: 108, y: 308 }, scale: { x: 0.43, y: 0.43 } },
					},
				},
			})
			expect(device.running).toBe(false)
			expect(device.changesDuringTransition).toEqual([])
			expect(diffM2LXStates(next, next)).toEqual([])
			const cleanup: M2LXState = {
				...next,
				mixer: { ...next.mixer, timelineObjId: 'clear', composition: { pip: { 0: { visible: false } } } },
			}
			for (const command of diffM2LXStates(next, cleanup)) await connection.sendCommand(command.command, command)
			expect(connection.state.keyers.program[0].visible).toBe(false)
			expect(connection.state.preview).toBe('replay1')
			expect(device.received.filter((command) => command.command === 'transition')).toHaveLength(2)
			expect(
				device.received.filter((command) => command.command === 'set_key_property' && command.args.target === 'program')
			).toEqual([])
		}
	)

	describe('configured event lifecycle', () => {
		const selectedId = 'selected/event ?'
		beforeEach(() => {
			device.events = [
				{ event_id: 'other', event_name: 'Other', status: 'Stopped' },
				{ event_id: selectedId, event_name: 'Selected', status: 'Stopped' },
			]
			connection = new M2LXConnection({
				baseUrl,
				password: 'secret',
				eventId: selectedId,
				eventTimeout: 500,
				reconnectBackoff: { minDelay: 60000, maxDelay: 60000 },
			})
		})
		const mutations = () =>
			device.eventRequests.filter((request) => request.method === 'POST').map((request) => request.path)

		test('initializes a stopped event without switcher requests, then activates with Bearer/no-body/encoded-ID requests', async () => {
			await connection.connect()
			expect(connection.connected).toBe(false)
			expect(connection.eventStatus).toBe('Stopped')
			expect(device.configurationRequests).toBe(0)
			expect(mutations()).toEqual([])
			await connection.ensureFreshAuthentication(true)
			expect(mutations()).toEqual([`/api/events/start/${encodeURIComponent(selectedId)}`])
			expect(connection.connected).toBe(true)
			expect(connection.eventStatus).toBe('Running')
			expect(connection.state).toMatchObject({ program: 'vtr1', preview: 'replay1' })
			expect(device.eventRequests.every((request) => request.authorization === 'Bearer token')).toBe(true)
			expect(device.eventRequests.filter((request) => request.method === 'POST')).toEqual([
				expect.objectContaining({ body: '', contentType: undefined }),
			])
		})

		test('fully stops the different running event before starting the selected one', async () => {
			device.events![0].status = 'Running'
			await connection.connect()
			await connection.ensureFreshAuthentication(true)
			expect(mutations()).toEqual(['/api/events/stop/other', `/api/events/start/${encodeURIComponent(selectedId)}`])
			expect(device.events!.map((event) => event.status)).toEqual(['Stopped', 'Running'])
			expect(connection.connected).toBe(true)
		})

		test.each(['other', 'Starting', 'Stopping'])(
			'waits for %s lifecycle completion without duplicate stop/start requests',
			async (pending) => {
				device.holdEventTransitions = true
				if (pending === 'other') device.events![0].status = 'Running'
				else device.events![1].status = pending
				await connection.disconnect()
				connection = new M2LXConnection({
					baseUrl,
					password: 'secret',
					eventId: selectedId,
					eventTimeout: 2500,
					reconnectBackoff: { minDelay: 60000 },
				})
				await connection.connect()
				const polling = new Promise<void>((resolve) => {
					device.eventRequestObserver = (path) => {
						if (path === '/api/events/overview' && (pending !== 'other' || device.events![0].status === 'Stopping'))
							resolve()
					}
				})
				const ready = connection.ensureFreshAuthentication(true)
				await polling
				await new Promise<void>((resolve) => setTimeout(resolve, 20))
				expect(mutations()).toEqual(pending === 'other' ? ['/api/events/stop/other'] : [])
				device.holdEventTransitions = false
				if (pending === 'other') device.events![0].status = 'Stopped'
				else device.events![1].status = pending === 'Starting' ? 'Running' : 'Stopped'
				await ready
				expect(mutations()).toEqual(
					pending === 'Starting'
						? []
						: [
								...(pending === 'other' ? ['/api/events/stop/other'] : []),
								`/api/events/start/${encodeURIComponent(selectedId)}`,
						  ]
				)
				expect(connection.connected).toBe(true)
			}
		)

		test('never restarts the already running selected event or recycles active authentication', async () => {
			device.events![1].status = 'Running'
			await connection.connect()
			await connection.ensureFreshAuthentication(true)
			const controller = [...device.controllers][0]
			await connection.ensureFreshAuthentication(false)
			expect(mutations()).toEqual([])
			expect(device.signIns).toBe(2)
			expect([...device.controllers]).toContain(controller)
		})

		test('reconnects with fresh mixer state but never restarts an externally stopped event', async () => {
			device.events![1].status = 'Running'
			await connection.disconnect()
			connection = new M2LXConnection({
				baseUrl,
				password: 'secret',
				eventId: selectedId,
				reconnectBackoff: { minDelay: 10, maxDelay: 10 },
			})
			await connection.connect()
			const recovered = new Promise<void>((resolve) => connection.once('connected', () => resolve()))
			device.program = 'ndi2'
			for (const socket of device.controllers) socket.terminate()
			await recovered
			await connection.connect()
			expect(connection.state.program).toBe('ndi2')
			device.events![0].status = 'Running'
			device.events![1].status = 'Stopped'
			await connection.connect()
			expect(connection.connected).toBe(false)
			expect(mutations()).toEqual([])
			await expect(connection.ensureFreshAuthentication(false)).rejects.toThrow('not connected')
		})

		test.each(['start', 'stop'] as const)(
			'does not retry a failed %s or declare mixer readiness',
			async (operation) => {
				if (operation === 'stop') device.events![0].status = 'Running'
				device.eventOperationStatus[operation] = 503
				await connection.connect()
				await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow('failed (503)')
				expect(mutations()).toEqual([
					operation === 'stop' ? '/api/events/stop/other' : `/api/events/start/${encodeURIComponent(selectedId)}`,
				])
				expect(connection.connected).toBe(false)
				expect(device.configurationRequests).toBe(0)
				await expect(
					connection.sendCommand(createTransitionCommand(false), { isComplete: () => false })
				).rejects.toThrow('not connected')
				expect(device.received).toEqual([])
			}
		)

		test.each(['missing', 'Failed', 'invalid-status', 'endpoint', 'other-endpoint', 'identity', 'multiple-active'])(
			'rejects %s before event mutations',
			async (problem) => {
				if (problem === 'missing') device.events!.pop()
				else if (problem === 'endpoint') device.switcherEndpoint = 'different.example.test:443'
				else if (problem === 'other-endpoint') {
					device.events![0].status = 'Running'
					device.otherSwitcherEndpoint = 'different.example.test:443'
				} else if (problem === 'identity') device.detailEventId = 'other'
				else if (problem === 'multiple-active') {
					device.events![0].status = 'Running'
					device.events!.push({ event_id: 'third', event_name: 'Third', status: 'Running' })
				} else device.events![1].status = problem
				await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow(/event|identity/i)
				expect(mutations()).toEqual([])
				expect(connection.connected).toBe(false)
				expect(device.configurationRequests).toBe(0)
			}
		)

		test('bounds lifecycle polling without resending accepted start', async () => {
			device.holdEventTransitions = true
			await connection.connect()
			await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow('timed out')
			expect(mutations()).toHaveLength(1)
			expect(connection.connected).toBe(false)
		})

		test.each(['stand-down', 'terminate'])(
			'cancels %s during stop polling without starting the selected event',
			async (cancel) => {
				device.events![0].status = 'Running'
				device.holdEventTransitions = true
				await connection.connect()
				const stopping = new Promise<void>((resolve) => {
					device.eventRequestObserver = (path) => {
						if (path === '/api/events/stop/other') resolve()
					}
				})
				const preparing = connection.ensureFreshAuthentication(true).catch((error: Error) => error)
				await stopping
				if (cancel === 'terminate') await connection.disconnect()
				else connection.cancelActivation()
				expect(await preparing).toBeInstanceOf(Error)
				expect(mutations()).toEqual(['/api/events/stop/other'])
				expect(connection.connected).toBe(false)
				expect(device.controllers.size).toBe(0)
				expect(device.configurationRequests).toBe(0)
			}
		)

		test('aborts an outstanding management read on termination', async () => {
			device.holdEventOverview = true
			const reading = new Promise<void>((resolve) => {
				device.eventRequestObserver = () => resolve()
			})
			const preparing = connection.ensureFreshAuthentication(true).catch((error: Error) => error)
			await reading
			await connection.disconnect()
			expect(await preparing).toMatchObject({ message: 'M2L-X connection attempt was cancelled' })
			expect(mutations()).toEqual([])
		})

		test('does not declare readiness after event start without a fresh full mixer snapshot', async () => {
			device.sendInitialSnapshot = false
			device.sendPartialStatus = true
			await connection.disconnect()
			connection = new M2LXConnection({
				baseUrl,
				password: 'secret',
				eventId: selectedId,
				webSocketConnectTimeout: 50,
				reconnectBackoff: { minDelay: 60000 },
			})
			await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow('connection timed out')
			expect(mutations()).toHaveLength(1)
			expect(connection.connected).toBe(false)
		})

		test('device initialization defers stopped-event mixer readiness; activation and stand-down respect the lifecycle', async () => {
			const integration = new M2LXDevice('event-device', { type: DeviceType.M2LX, connection }, async () => Date.now())
			await expect(integration.init({ baseUrl, password: 'secret', eventId: selectedId })).resolves.toBe(true)
			expect(integration.connected).toBe(false)
			expect(integration.getStatus().messages[0]).toContain('Stopped')
			integration.handleState({ time: Date.now(), layers: {}, nextEvents: [] }, {})
			expect(device.received).toEqual([])
			await integration.makeReady()
			const signIns = device.signIns
			await integration.makeReady()
			expect(device.signIns).toBe(signIns)
			expect(integration.connected).toBe(true)
			await integration.standDown()
			expect(device.events![1].status).toBe('Running')
			expect(integration.connected).toBe(true)
			await integration.makeReady()
			expect(device.signIns).toBe(signIns + 1)
			await integration.terminate()
			expect(device.events![1].status).toBe('Running')
			expect(mutations()).toEqual([`/api/events/start/${encodeURIComponent(selectedId)}`])
		})

		test.each(['stand-down', 'terminate'])(
			'device %s cancels in-progress activation without a late start',
			async (cancel) => {
				device.events![0].status = 'Running'
				device.holdEventTransitions = true
				const integration = new M2LXDevice('event-device', { type: DeviceType.M2LX, connection }, async () =>
					Date.now()
				)
				await integration.init({ baseUrl, password: 'secret', eventId: selectedId })
				const stopping = new Promise<void>((resolve) => {
					device.eventRequestObserver = (path) => {
						if (path === '/api/events/stop/other') resolve()
					}
				})
				const ready = integration.makeReady().catch((error: Error) => error)
				await stopping
				let stopped: unknown
				if (cancel === 'stand-down') {
					stopped = await integration.standDown().catch((error: Error) => error)
				} else stopped = await integration.terminate()
				expect(stopped instanceof Error).toBe(cancel === 'stand-down')
				expect(await ready).toBeInstanceOf(Error)
				expect(integration.connected).toBe(false)
				expect(mutations()).toEqual(['/api/events/stop/other'])
				await integration.terminate()
			}
		)
	})

	test('waits for configured media/audio/router snapshots, not only mixer status', async () => {
		device.extended = true
		device.deferExtendedSnapshots = true
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		const firstStatus = new Promise<void>((resolve) => connection.once('stateChanged', () => resolve()))
		const connecting = connection.connect()
		await firstStatus
		expect(connection.connected).toBe(false)
		const emptyStatus = new Promise<void>((resolve) => connection.once('stateChanged', () => resolve()))
		device.broadcastNode('vtr3', '/', {})
		device.broadcastNode('audio_mixer', '/', {})
		device.broadcastNode('router', '/', {})
		await emptyStatus
		await new Promise<void>((resolve) => setTimeout(resolve, 10))
		expect(connection.connected).toBe(false)
		device.broadcastExtendedSnapshot()
		await connecting
		expect(connection.capabilities.players.has('vtr3')).toBe(true)
		expect(connection.state.players?.vtr3).toMatchObject({ loaded: true, assetId: 'original.mp4' })
	})

	test('executes the verified omitted/object/boolean/array media/audio/router payloads against native state', async () => {
		device.extended = true
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const old: M2LXState = {
			keyers: {},
			players: { vtr3: { assetId: 'original.mp4', loop: false, playing: false, timelineObjId: '' } },
		}
		const next: M2LXState = {
			keyers: {},
			players: { vtr3: { assetId: 'alternate.mp4', loop: false, seek: 10, playing: true, timelineObjId: 'clip' } },
			audio: { input: { node: 'audio_mixer', input: 'vtr3.1', muted: true, volume: 0.5, timelineObjId: 'audio' } },
			routers: { output: { node: 'router', input: 'ndi2', output: 'ch1', timelineObjId: 'router' } },
		}
		for (const command of diffM2LXStates(old, next)) await connection.sendCommand(command.command, command)
		expect(connection.state.players?.vtr3).toMatchObject({
			loaded: true,
			assetId: 'alternate.mp4',
			loop: false,
			time: 10,
			playing: true,
			frameRate: 29.97,
		})
		expect(connection.state.audio?.audio_mixer['vtr3.1']).toEqual({ volume: 0.5, muted: true })
		expect(connection.state.routers?.router.ch1).toBe('ndi2')
		expect(device.received.find((c) => c.command === 'set_loop_enabled').args).toBe(false)
		expect(device.received.find((c) => c.command === 'play')).not.toHaveProperty('args')
		const unloaded = diffM2LXStates(next, { keyers: {}, players: { vtr3: { assetId: null, timelineObjId: 'empty' } } })
		for (const command of unloaded) await connection.sendCommand(command.command, command)
		expect(device.player.clip.asset_id).toBe('alternate.mp4')
		expect(connection.state.players?.vtr3.loaded).toBe(false)
		expect(connection.state.players?.vtr3.assetId).toBeUndefined()
	})

	test('does not send pause for an unloaded player with retained playback flags', async () => {
		device.extended = true
		device.player.clip.loaded = false
		device.player.playback = { paused: false, rate: 1, time: 10 }
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const commands = diffM2LXStates(
			{ keyers: {} },
			{ keyers: {}, players: { vtr3: { playing: false, timelineObjId: 'stop' } } }
		)
		expect(commands.map((command) => command.command.command)).toEqual(['pause'])
		for (const command of commands) await connection.sendCommand(command.command, command)
		expect(device.received).toEqual([])
		expect(connection.state.players?.vtr3.loaded).toBe(false)
	})

	test('rejects player errors even after the controller accepted a load with code 200', async () => {
		device.extended = true
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		device.failNextLoad = true
		const load = diffM2LXStates(
			{ keyers: {} },
			{ keyers: {}, players: { vtr3: { assetId: 'missing.mp4', timelineObjId: 'clip' } } }
		).find((c) => c.command.command === 'load')!
		await expect(connection.sendCommand(load.command, load)).rejects.toThrow(/Asset missing/)
	})

	test('serializes callers and waits for acceptance even when status arrives before the reply', async () => {
		device.replyDelay = 100
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const first = connection.sendCommand(createSetInputCommand('preview', 'ndi1'), {
			isComplete: (state) => state.preview === 'ndi1',
		})

		const second = connection.sendCommand(createSetInputCommand('program', 'ndi2'), {
			isComplete: (state) => state.program === 'ndi2',
		})
		await new Promise<void>((resolve) => setTimeout(resolve, 40))
		expect(device.received).toHaveLength(1)
		await Promise.all([first, second])
		expect(device.received).toHaveLength(2)
		expect(connection.state.program).toBe('ndi2')
	})

	test('does not treat matching status as success when the delayed controller reply rejects it', async () => {
		device.replyDelay = 80
		device.rejectAcceptedCommands = true
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		await expect(
			connection.sendCommand(createSetInputCommand('preview', 'ndi1'), {
				isComplete: (state) => state.preview === 'ndi1',
			})
		).rejects.toThrow(/Rejected after status update/)
	})

	test('discards an unacknowledged reply stream and invalidates already queued commands', async () => {
		device.dropReplies = true
		connection = new M2LXConnection({
			baseUrl,
			password: 'secret',
			commandTimeout: 80,
			reconnectBackoff: { minDelay: 60000, maxDelay: 60000 },
		})
		await connection.connect()
		const first = connection.sendCommand(createSetInputCommand('preview', 'ndi1'), {
			isComplete: (state) => state.preview === 'ndi1',
		})
		const second = connection.sendCommand(createSetInputCommand('program', 'ndi2'), {
			isComplete: (state) => state.program === 'ndi2',
		})
		const results = await Promise.allSettled([first, second])
		expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
		expect(connection.connected).toBe(false)
		expect(device.received).toHaveLength(1)
	})

	test('executes effect configuration and upstream source/geometry before showing the key', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const next: M2LXState = {
			mixer: { effect: { name: 'wipe_up', duration: 2, args: { fade: 0.02 } }, timelineObjId: 'effect' },
			keyers: {
				'preview/0': {
					index: 0,
					keyerType: 'pip',
					bus: 'preview',
					visible: true,
					source: { type: 'video', name: 'ndi2' },
					translation: { x: 1042, y: 50 },
					scale: { x: 0.44, y: 0.44 },
					crop: { x: 0.01, y: 0, width: 0.99, height: 1 },
					rotation: 1,
					timelineObjId: 'pip',
				},
			},
		}
		for (const command of diffM2LXStates({ keyers: {} }, next)) await connection.sendCommand(command.command, command)
		expect(connection.state.transition?.effect).toMatchObject({ name: 'wipe_up', duration: 2 })
		expect(connection.state.keyers.preview[0]).toMatchObject({
			visible: true,
			source: 'ndi2',
			sourceType: 'video',
			translation: { x: 1042, y: 50 },
			scale: { x: 0.44, y: 0.44 },
			crop: { x: 0.01, y: 0, width: 0.99, height: 1 },
			rotation: 1,
		})
		expect(connection.state.program).toBe('vtr1')
	})

	test('renews even a fresh connection at an inactive activation boundary', async () => {
		const now = Date.now()
		jest.spyOn(Date, 'now').mockReturnValue(now)
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const controller = [...device.controllers][0]
		await connection.ensureFreshAuthentication(true)
		expect(connection.tokenExpiresAt).toBe(now + 86399000)
		expect(device.signIns).toBe(2)
		expect([...device.controllers]).not.toContain(controller)
	})

	test('starts a ten-hour production with the full lifetime instead of an eight-hour-old remainder', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const hour = 60 * 60 * 1000
		clock.mockReturnValue(connection.tokenExpiresAt! - 8 * hour)
		await connection.ensureFreshAuthentication(true)
		expect(device.signIns).toBe(2)
		expect(connection.tokenExpiresAt! - Date.now()).toBe(86399000)
		clock.mockReturnValue(Date.now() + 10 * hour)
		await connection.ensureFreshAuthentication(false)
		await connection.sendCommand(createSetInputCommand('preview', 'ndi2'), {
			isComplete: (state) => state.preview === 'ndi2',
		})
		expect(device.signIns).toBe(2)
		expect(connection.state.preview).toBe('ndi2')
	})

	test('renews near expiry while inactive and reloads configuration and observed state', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		clock.mockReturnValue(connection.tokenExpiresAt! - M2LX_AUTH_RENEWAL_MARGIN)
		device.program = 'ndi2'
		device.preview = 'vtr1'
		device.configuredSources = ['ndi2', 'vtr1']
		device.keyers.preview[0] = { visible: true, source: 'ndi2' }
		await connection.ensureFreshAuthentication(true)
		expect(device.signIns).toBe(2)
		expect(device.configurationRequests).toBe(2)
		expect(connection.connected).toBe(true)
		expect(connection.sources).toEqual(new Set(['ndi2', 'vtr1']))
		expect(connection.state).toMatchObject({ program: 'ndi2', preview: 'vtr1' })
		expect(connection.state.keyers.preview[0]).toEqual({ visible: true, source: 'ndi2' })
		expect(connection.tokenExpiresAt).toBe(Date.now() + 86399000)
	})

	test('never proactively renews an active connection, including after expiry', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const expiresAt = connection.tokenExpiresAt!
		clock.mockReturnValue(expiresAt - 1000)
		await connection.ensureFreshAuthentication(false)
		expect(device.signIns).toBe(1)
		expect(connection.connected).toBe(true)
		clock.mockReturnValue(expiresAt)
		await expect(connection.ensureFreshAuthentication(false)).rejects.toThrow('access token has expired')
		await expect(
			connection.sendCommand(createSetInputCommand('preview', 'ndi2'), { isComplete: () => false })
		).rejects.toThrow('access token has expired')
		expect(device.signIns).toBe(1)
		expect(device.received).toEqual([])
		await connection.ensureFreshAuthentication(true)
		expect(device.signIns).toBe(2)
	})

	test('shares an in-progress renewal between simultaneous activation checks', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		clock.mockReturnValue(connection.tokenExpiresAt!)
		await Promise.all([connection.ensureFreshAuthentication(true), connection.ensureFreshAuthentication(true)])
		expect(device.signIns).toBe(2)
		expect(device.configurationRequests).toBe(2)
		expect(connection.connected).toBe(true)
	})

	test('treats an unknown lifetime explicitly and only renews it while inactive', async () => {
		device.tokenLifetime = undefined
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		expect(connection.tokenExpiresAt).toBeUndefined()
		await connection.ensureFreshAuthentication(false)
		expect(device.signIns).toBe(1)
		await connection.ensureFreshAuthentication(true)
		expect(device.signIns).toBe(2)
	})

	test.each([false, true])('publishes expiry status once despite early timers (manual renewal: %s)', async (renew) => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		const timers = jest.spyOn(global, 'setTimeout')
		device.tokenLifetime = 0.5
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		const notice = jest.fn()
		connection.on('authenticationChanged', notice)
		const fireStatusTimer = (remaining: number) => {
			const index = timers.mock.calls.length - 1
			const [callback] = timers.mock.calls[index]
			clearTimeout(timers.mock.results[index].value)
			clock.mockReturnValue(connection.tokenExpiresAt! - remaining)
			callback()
		}
		await connection.connect()
		expect(notice).toHaveBeenCalledTimes(1)
		expect(timers).toHaveBeenLastCalledWith(expect.any(Function), 500)
		fireStatusTimer(1)
		expect(notice).toHaveBeenCalledTimes(1)
		if (renew) {
			await connection.ensureFreshAuthentication(true)
		}
		expect(notice).toHaveBeenCalledTimes(renew ? 2 : 1)
		fireStatusTimer(1)
		expect(notice).toHaveBeenCalledTimes(renew ? 2 : 1)
		fireStatusTimer(0)
		expect(notice).toHaveBeenCalledTimes(renew ? 3 : 2)
		expect(device.signIns).toBe(renew ? 2 : 1)
		expect(connection.connected).toBe(true)
	})

	test('refuses renewal while an effect is running, even when called from an inactive boundary', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		clock.mockReturnValue(connection.tokenExpiresAt! - M2LX_AUTH_RENEWAL_MARGIN)
		await connection.sendCommand(createTransitionCommand(true), {
			isComplete: (state) => state.transition?.running === true,
		})
		await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow('commands or a transition are running')
		expect(device.signIns).toBe(1)
	})

	test('refuses renewal while a command is awaiting confirmation', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		clock.mockReturnValue(connection.tokenExpiresAt! - M2LX_AUTH_RENEWAL_MARGIN)
		const pending = connection.sendCommand(createSetKeyerCommand(1, 'pip', true, 'preview'), {
			isComplete: () => false,
		})
		const aborted = pending.catch((error: Error) => error)
		await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow('commands or a transition are running')
		expect(device.signIns).toBe(1)
		await connection.disconnect()
		expect(await aborted).toMatchObject({ message: 'M2L-X connection closed before the command completed' })
	})

	test('reports failed renewal without declaring the connection ready', async () => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({
			baseUrl,
			password: 'secret',
			reconnectBackoff: { minDelay: 60000 },
		})
		await connection.connect()
		clock.mockReturnValue(connection.tokenExpiresAt!)
		device.rejectSignIn = true
		await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow('401')
		expect(connection.connected).toBe(false)
		expect(device.signIns).toBe(2)
	})

	test.each([false, true])('requires a fresh full snapshot after renewal (partial status: %s)', async (partial) => {
		const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.now())
		connection = new M2LXConnection({ baseUrl, password: 'secret', webSocketConnectTimeout: 100 })
		await connection.connect()
		clock.mockReturnValue(connection.tokenExpiresAt!)
		device.sendInitialSnapshot = false
		device.sendPartialStatus = partial
		await expect(connection.ensureFreshAuthentication(true)).rejects.toThrow('connection timed out')
		expect(connection.connected).toBe(false)
		expect(connection.state.program).toBe(partial ? 'vtr1' : undefined)
	})

	test('recovers a lost production connection with new authentication and fresh state', async () => {
		connection = new M2LXConnection({
			baseUrl,
			password: 'secret',
			reconnectBackoff: { minDelay: 10, maxDelay: 10 },
		})
		await connection.connect()
		device.program = 'ndi2'
		const recovered = new Promise<void>((resolve) => connection.once('connected', () => resolve()))
		for (const socket of device.controllers) socket.terminate()
		await recovered
		expect(device.signIns).toBe(2)
		expect(connection.state.program).toBe('ndi2')
		expect(connection.connected).toBe(true)
	})

	test('does not reopen sockets if terminated during sign-in', async () => {
		device.signInDelay = 50
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		const connecting = connection.connect()
		const rejected = connecting.catch((error: Error) => error)
		await connection.disconnect()
		expect(await rejected).toMatchObject({ message: 'M2L-X connection attempt was cancelled' })
		expect(connection.connected).toBe(false)
		expect(device.configurationRequests).toBe(0)
		expect(device.controllers.size).toBe(0)
	})

	test('aborts readiness immediately if terminated while waiting for the initial snapshot', async () => {
		device.sendInitialSnapshot = false
		device.sendPartialStatus = true
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		const partialStatus = new Promise<void>((resolve) => connection.once('stateChanged', () => resolve()))
		const connecting = connection.connect()
		const rejected = connecting.catch((error: Error) => error)
		await partialStatus
		await connection.disconnect()
		expect(await rejected).toMatchObject({ message: 'M2L-X connection closed before the command completed' })
		expect(connection.connected).toBe(false)
	})

	test('signs in, reads the configuration and waits for a usable status snapshot', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		const connected = new Promise((resolve) =>
			connection.once('connected', (sources, state) => resolve({ sources, state }))
		)

		await connection.connect()

		expect(connection.connected).toBe(true)
		expect(connection.sources).toEqual(new Set(['ndi1', 'ndi2', 'vtr1', 'replay1']))
		expect(connection.state).toMatchObject({
			program: 'vtr1',
			preview: 'replay1',
			keyers: {
				program: { 0: { visible: false, source: 'ndi1' } },
				preview: { 0: { visible: false, source: 'ndi1' }, 1: { visible: false, source: '' } },
			},
			transition: { running: false, progress: 1, effect: { name: 'wipe_up_right', duration: 0.1 } },
		})
		await expect(connected).resolves.toMatchObject({ state: { program: 'vtr1' } })
	})

	test('fails to connect with a wrong password without leaking it', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'wrong', reconnectBackoff: { minDelay: 60000 } })

		const error: Error = await connection.connect().then(
			() => {
				throw new Error('Expected connect to fail')
			},
			(error) => error
		)
		expect(error.message).toMatch(/401/)
		expect(error.message).not.toContain('wrong')
		expect(connection.connected).toBe(false)
	})

	test('resolves a command once the status stream confirms it', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()

		await connection.sendCommand(createSetInputCommand('preview', 'ndi2'), {
			isComplete: (state) => state.preview === 'ndi2',
		})
		expect(connection.state.preview).toBe('ndi2')

		await connection.sendCommand(createTransitionCommand(false), { isComplete: (state) => state.program === 'ndi2' })
		expect(connection.state.program).toBe('ndi2')

		await connection.sendCommand(createSetKeyerCommand(0, 'pip', true, 'preview'), {
			isComplete: (state) => state.keyers.preview[0]?.visible === true,
		})
		expect(connection.state.keyers.preview[0]).toEqual({ visible: true, source: 'ndi1' })
		expect(connection.state.keyers.program[0]).toEqual({ visible: false, source: 'ndi1' })
	})

	test('does not send a command that is already satisfied', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()

		await connection.sendCommand(createSetInputCommand('preview', 'replay1'), {
			isComplete: (state) => state.preview === 'replay1',
		})
		expect(device.received).toEqual([])
	})

	test('uses a separate redundancy check for skipping when given', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()

		// Completion would already be satisfied, but the redundancy check is not: the command must be sent
		await connection.sendCommand(createSetInputCommand('preview', 'ndi2'), {
			isComplete: () => true,
			isRedundant: (state) => state.preview === 'ndi2',
		})
		expect(device.received).toHaveLength(1)
	})

	test('exposes the configured transition effect', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		expect(connection.state.transition).toEqual({
			running: false,
			progress: 1,
			effect: { name: 'wipe_up_right', duration: 0.1 },
		})
	})

	test('holds a command back until its precondition is met', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()

		await connection.sendCommand(createSetInputCommand('preview', 'ndi2'), {
			isComplete: (state) => state.preview === 'ndi2',
		})
		await connection.sendCommand(createTransitionCommand(true), {
			isComplete: (state) => state.program === 'ndi2' || state.transition?.running === true,
			isRedundant: (state) => state.program === 'ndi2',
		})
		expect(connection.state.transition?.running).toBe(true)
		expect(connection.state.program).toBe('vtr1')

		// Restoring preview must wait for the effect to finish, otherwise the effect would land on the new preview
		await connection.sendCommand(createSetInputCommand('preview', 'vtr1'), {
			isComplete: (state) => state.preview === 'vtr1',
			waitFor: (state) => state.transition?.running !== true,
		})
		expect(connection.state.program).toBe('ndi2')
		expect(connection.state.preview).toBe('vtr1')
		expect(device.received.map((command) => command.command)).toEqual([
			'set_input_property',
			'transition',
			'set_input_property',
		])
	})

	test.each<{
		name: string
		mixer: NonNullable<M2LXState['mixer']>
		expectedProgram: string
	}>([
		{
			name: 'a plain preview/lookahead update',
			mixer: { program: 'replay1', preview: 'ndi2', timelineObjId: 'next' },
			expectedProgram: 'replay1',
		},
		{
			name: 'a new cut',
			mixer: { program: 'ndi2', transition: 'cut', timelineObjId: 'next' },
			expectedProgram: 'ndi2',
		},
		{
			name: 'a cut back to the currently observed program',
			mixer: { program: 'vtr1', transition: 'cut', timelineObjId: 'next' },
			expectedProgram: 'vtr1',
		},
		{
			name: 'preparation for a second effect',
			mixer: { program: 'ndi2', preview: 'vtr1', transition: 'effect', timelineObjId: 'next' },
			expectedProgram: 'ndi2',
		},
		{
			name: 'a preview-only object with an effect setting',
			mixer: { preview: 'ndi2', transition: 'effect', timelineObjId: 'next' },
			expectedProgram: 'replay1',
		},
	])('protects the running effect from $name', async ({ mixer, expectedProgram }) => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		const before: M2LXState = { mixer: { program: 'vtr1', timelineObjId: 'before' }, keyers: {} }
		const effect: M2LXState = {
			mixer: { program: 'replay1', transition: 'effect', timelineObjId: 'effect' },
			keyers: {},
		}
		for (const command of diffM2LXStates(before, effect)) {
			await connection.sendCommand(command.command, command)
		}
		expect(connection.state.transition?.running).toBe(true)

		for (const command of diffM2LXStates(effect, { mixer, keyers: {} })) {
			await connection.sendCommand(command.command, command)
		}

		expect(device.changesDuringTransition).toEqual([])
		expect(device.completedPrograms[0]).toBe('replay1')
		expect(connection.state).toMatchObject({
			program: expectedProgram,
			...(mixer.preview === undefined ? {} : { preview: mixer.preview }),
		})
	})
	test('holds preview-key changes until the effect finishes', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()
		await connection.sendCommand(createTransitionCommand(true), {
			isComplete: (state) => state.transition?.running === true,
		})
		const [command] = diffM2LXStates(
			{ keyers: {} },
			{ keyers: { 'preview/0': { index: 0, visible: true, keyerType: 'pip', bus: 'preview', timelineObjId: 'key' } } }
		)
		await connection.sendCommand(command.command, command)
		expect(device.changesDuringTransition).toEqual([])
		expect(connection.state.keyers.preview[0]?.visible).toBe(true)
	})

	test('aborts a held-back source change on disconnect without sending it', async () => {
		device.stuckTransition = true
		connection = new M2LXConnection({
			baseUrl,
			password: 'secret',
			reconnectBackoff: { minDelay: 60000 },
		})
		await connection.connect()
		await connection.sendCommand(createTransitionCommand(true), {
			isComplete: (state) => state.transition?.running === true,
		})
		const [command] = diffM2LXStates(
			{ mixer: { program: 'vtr1', timelineObjId: 'before' }, keyers: {} },
			{ mixer: { program: 'ndi2', timelineObjId: 'cut' }, keyers: {} }
		)
		const pending = connection.sendCommand(command.command, command)
		for (const socket of device.controllers) socket.terminate()
		await expect(pending).rejects.toThrow('M2L-X connection closed before the command completed')
		expect(device.received.map((received) => received.command)).toEqual(['transition'])
	})

	test('fails without sending when the precondition is not met in time', async () => {
		device.effectDuration = 200
		device.stuckTransition = true
		connection = new M2LXConnection({ baseUrl, password: 'secret', commandTimeout: 100 })
		await connection.connect()

		await connection.sendCommand(createTransitionCommand(true), {
			isComplete: (state) => state.transition?.running === true,
		})
		const started = Date.now()
		await expect(
			connection.sendCommand(createSetInputCommand('preview', 'ndi2'), {
				isComplete: (state) => state.preview === 'ndi2',
				waitFor: (state) => state.transition?.running !== true,
			})
		).rejects.toThrow('M2L-X set_input_property was not sent: the device was not ready within 300 ms')
		// The wait is the command timeout extended by the configured effect duration (0.2 s)
		expect(Date.now() - started).toBeGreaterThanOrEqual(290)
		expect(device.received.map((command) => command.command)).toEqual(['transition'])
	})

	test('skips a held-back command that became redundant while waiting', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret' })
		await connection.connect()

		await connection.sendCommand(createSetInputCommand('preview', 'ndi2'), {
			isComplete: (state) => state.preview === 'ndi2',
		})
		await connection.sendCommand(createTransitionCommand(true), {
			isComplete: (state) => state.transition?.running === true,
		})
		// Program becomes ndi2 by itself when the effect ends
		await connection.sendCommand(createSetInputCommand('program', 'ndi2'), {
			isComplete: (state) => state.program === 'ndi2',
			waitFor: (state) => state.transition?.running !== true,
		})
		expect(device.received.map((command) => command.command)).toEqual(['set_input_property', 'transition'])
	})

	test('rejects immediately when the device answers with an error code', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret', commandTimeout: 5000 })
		await connection.connect()

		const started = Date.now()
		await expect(
			connection.sendCommand(createSetInputCommand('preview', 'cam99'), {
				isComplete: (state) => state.preview === 'cam99',
			})
		).rejects.toThrow('M2L-X rejected set_input_property: 400 invalid source name cam99')
		expect(Date.now() - started).toBeLessThan(1000)
	})

	test('matches replies to commands in send order', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret', commandTimeout: 5000 })
		await connection.connect()

		const ok = connection.sendCommand(createSetInputCommand('preview', 'ndi2'), {
			isComplete: (state) => state.preview === 'ndi2',
		})
		const bad = connection.sendCommand(createSetInputCommand('program', 'cam99'), {
			isComplete: (state) => state.program === 'cam99',
		})
		const [okResult, badResult] = await Promise.allSettled([ok, bad])

		expect(okResult).toEqual({ status: 'fulfilled', value: undefined })
		expect(badResult.status).toBe('rejected')
		expect((badResult as PromiseRejectedResult).reason.message).toContain('invalid source name cam99')
		expect(connection.state.preview).toBe('ndi2')
		expect(connection.state.program).toBe('vtr1')
	})

	test('times out when the device accepts a command but never changes state', async () => {
		connection = new M2LXConnection({ baseUrl, password: 'secret', commandTimeout: 200 })
		await connection.connect()

		await expect(
			connection.sendCommand(createSetKeyerCommand(1, 'pip', true, 'preview'), {
				isComplete: (state) => state.keyers.preview[1]?.visible === true,
			})
		).rejects.toThrow('M2L-X command timed out after 200 ms')
		expect(connection.connected).toBe(true)
		expect(device.signIns).toBe(1)
	})

	test('rejects pending commands and reports disconnect when the device drops the sockets', async () => {
		connection = new M2LXConnection({
			baseUrl,
			password: 'secret',
			commandTimeout: 5000,
			reconnectBackoff: { minDelay: 60000 },
		})
		await connection.connect()
		const disconnected = new Promise<string>((resolve) => connection.once('disconnected', resolve))

		// Never confirmed by the fake device, so it stays pending until the socket drops
		const pending = connection.sendCommand(createSetKeyerCommand(1, 'pip', true, 'preview'), {
			isComplete: () => false,
		})
		await new Promise((resolve) => setTimeout(resolve, 20))
		for (const socket of device.controllers) socket.terminate()

		await expect(pending).rejects.toThrow('M2L-X connection closed before the command completed')
		await expect(disconnected).resolves.toBe('M2L-X WebSocket closed')
		expect(connection.connected).toBe(false)
		await expect(connection.sendCommand(createTransitionCommand(true), { isComplete: () => false })).rejects.toThrow(
			'M2L-X controller is not connected'
		)
	})
})
