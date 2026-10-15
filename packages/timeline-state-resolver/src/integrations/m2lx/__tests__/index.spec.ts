import { EventEmitter } from 'eventemitter3'
import {
	DeviceType,
	MappingM2LX,
	MappingM2LXType,
	M2LXKeyType,
	M2LXMixerBus,
	M2LXTransitionType,
	TimelineObjM2LXAny,
	TimelineContentTypeM2LX,
} from 'timeline-state-resolver-types'
import { MockTime } from '../../../__tests__/mockTime'
import { StatusCode } from '../../../devices/device'
import { IM2LXConnection, M2LXConnectionEvents, M2LXSendOptions } from '../connection'
import { createEmptyObservedState, M2LXCommand, M2LXObservedState, M2LXObservedKey } from '../protocol'
import { M2LXDevice } from '..'

class MockConnection extends EventEmitter<M2LXConnectionEvents> implements IM2LXConnection {
	connected = true
	tokenExpiresAt: number | undefined = Date.now() + 86400000
	ensureFreshAuthentication = jest.fn(async (_allowRenewal: boolean): Promise<void> => undefined)
	sources = new Set(['cam1', 'cam2', 'cam3'])
	capabilities = {
		players: new Set(['vtr3']),
		audio: { audio_mixer: { inputs: new Set(['vtr3.1']), maximumVolume: 1 } },
		routers: { router: { inputs: new Set(['cam1', 'cam2']), outputs: new Set(['ch1']) } },
	}
	state: M2LXObservedState = {
		...createEmptyObservedState(),
		program: 'cam1',
		preview: 'cam2',
		keys: {
			program: { 0: { visible: false, source: 'cam1' }, 4: { visible: false, source: '' } },
			preview: { 0: { visible: false, source: 'cam1' } },
		},
	}
	commands: M2LXCommand[] = []

	async connect(): Promise<void> {
		this.emit('connected', this.sources, this.state)
	}
	async disconnect(): Promise<void> {
		this.connected = false
	}
	async sendCommand(command: M2LXCommand, options: M2LXSendOptions): Promise<void> {
		options.checkState?.(this.state, this.state)
		if ((options.isRedundant ?? options.isComplete)(this.state)) return
		this.commands.push(command)
		if (command.command === 'set_input_property') {
			this.state = { ...this.state, [command.args.input_type]: command.args.property.value }
		} else if (command.command === 'transition') {
			this.state = { ...this.state, program: this.state.preview }
		} else if (command.command === 'set_key_property') {
			const bus = command.args.target
			const field = command.args.key_type === 'downstream' ? 'downstreamKeys' : 'keys'
			const collection = this.state[field] ?? { program: {}, preview: {} }
			const key: M2LXObservedKey = { ...collection[bus][command.args.key_index] }
			const property = command.args.property
			if (property.name === 'visible') {
				key.visible = property.value
				if (command.args.key_type === 'downstream' && !property.value) key.opacity = 0
			} else if (property.name === 'video' || property.name === 'image') {
				key.source = property.value
				key.sourceType = property.name
			} else if (property.name === 'translation' || property.name === 'scale') key[property.name] = property.value
			else if (property.name === 'rotation' || property.name === 'opacity') key[property.name] = property.value
			else if (property.name === 'crop') key.crop = property.value
			else if (property.name === 'border') key.border = property.value
			this.state = {
				...this.state,
				[field]: {
					...collection,
					[bus]: {
						...collection[bus],
						[command.args.key_index]: key,
					},
				},
			}
		} else if (command.command === 'set_input_volume' || command.command === 'set_input_muted') {
			for (const input of command.args) {
				this.state = {
					...this.state,
					audio: {
						...this.state.audio,
						[command.node]: {
							...this.state.audio?.[command.node],
							[input.name]: {
								...this.state.audio?.[command.node]?.[input.name],
								...('volume' in input ? { volume: input.volume } : { muted: input.muted }),
							},
						},
					},
				}
			}
		} else if (command.command === 'connect') {
			this.state = {
				...this.state,
				routers: {
					...this.state.routers,
					[command.node]: {
						...this.state.routers?.[command.node],
						[command.args.output]: command.args.input,
					},
				},
			}
		} else if (['pause', 'play', 'load', 'unload', 'seek', 'set_loop_enabled'].includes(command.command)) {
			const player = {
				...this.state.players?.[command.node],
				loaded: this.state.players?.[command.node]?.loaded ?? false,
			}
			if (command.command === 'load')
				Object.assign(player, {
					loaded: true,
					assetId: command.args.id,
					duration: 15.482133333333334,
					frameRate: 29.97,
					time: 0,
					playing: false,
					loop: true,
				})
			else if (command.command === 'unload') Object.assign(player, { loaded: false, assetId: undefined })
			else if (command.command === 'play' || command.command === 'pause') player.playing = command.command === 'play'
			else if (command.command === 'seek') player.time = command.args.time
			else if (command.command === 'set_loop_enabled') player.loop = command.args
			this.state = { ...this.state, players: { ...this.state.players, [command.node]: player } }
		}
	}
}

const mixerMapping: MappingM2LX = {
	device: DeviceType.M2LX,
	deviceId: 'm2lx0',
	mappingType: MappingM2LXType.MIXER,
}
const audioMapping: MappingM2LX = {
	device: DeviceType.M2LX,
	deviceId: 'm2lx0',
	mappingType: MappingM2LXType.AUDIO,
	input: 'vtr3.1',
}
const playerMapping: MappingM2LX = {
	device: DeviceType.M2LX,
	deviceId: 'm2lx0',
	mappingType: MappingM2LXType.MEDIA_PLAYER,
	player: 'vtr3',
}
const routerMapping: MappingM2LX = {
	device: DeviceType.M2LX,
	deviceId: 'm2lx0',
	mappingType: MappingM2LXType.ROUTER,
	output: 'ch1',
}

function mixerObject(id: string, mixer: Record<string, unknown>, extra: Record<string, unknown> = {}) {
	return {
		id,
		layer: 'mixer',
		enable: { start: 0 },
		content: { deviceType: DeviceType.M2LX, type: TimelineContentTypeM2LX.MIXER, mixer },
		instance: { start: 0 },
		...extra,
	} as any
}

function controlObject(id: string, content: TimelineObjM2LXAny['content'], extra: Record<string, unknown> = {}) {
	return mixerObject(id, {}, { layer: id, content, ...extra })
}

describe('M2LXDevice', () => {
	const mockTime = new MockTime()

	beforeEach(() => mockTime.init())

	test('cancels a dispatched command immediately when standing down during activation preparation', async () => {
		const connection = new MockConnection()
		let finish: () => void = () => undefined
		connection.ensureFreshAuthentication.mockImplementationOnce(
			async () =>
				new Promise<void>((resolve) => {
					finish = resolve
				})
		)
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		device.on('error', () => undefined)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		const preparing = device.makeReady()
		device.handleState(
			{ time: 11000, nextEvents: [], layers: { mixer: mixerObject('cancelled', { program: 'cam3' }) } },
			{ mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(11010)
		const down = device.standDown()
		finish()
		await Promise.all([preparing, down])
		await mockTime.advanceTimeToTicks(11020)
		expect(connection.commands).toEqual([])
		await device.makeReady()
		expect(connection.ensureFreshAuthentication.mock.calls).toEqual([[true], [true]])
		await device.terminate()
	})

	test('prepares a mapped Preview DSK without touching Program or the other DSK', async () => {
		const connection = new MockConnection()
		connection.state.downstreamKeys = {
			program: {
				0: { visible: false, source: '', opacity: 1 },
				1: { visible: true, source: 'watermark.png', opacity: 1 },
			},
			preview: {
				0: { visible: false, source: '', opacity: 0 },
				1: { visible: true, source: 'watermark.png', opacity: 1 },
			},
		}
		const before = JSON.parse(JSON.stringify(connection.state.downstreamKeys))
		const mapping: MappingM2LX = {
			device: DeviceType.M2LX,
			deviceId: 'm2lx0',
			mappingType: MappingM2LXType.KEY,
			bus: M2LXMixerBus.PREVIEW,
			key: { index: 0, type: M2LXKeyType.DSK },
		}
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		device.handleState(
			{
				time: 11000,
				nextEvents: [],
				layers: {
					dsk: controlObject('dsk', {
						deviceType: DeviceType.M2LX,
						type: TimelineContentTypeM2LX.KEY,
						key: {
							visible: true,
							source: { type: 'image', name: 'still/demo.png' },
							translation: { x: -800, y: -400 },
						},
					}),
				},
			},
			{ dsk: mapping }
		)
		await mockTime.advanceTimeToTicks(11100)
		expect(connection.state.downstreamKeys.preview[0]).toMatchObject({
			visible: true,
			source: 'still/demo.png',
			opacity: 1,
			translation: { x: -800, y: -400 },
		})
		expect(connection.state.downstreamKeys.program).toEqual(before.program)
		expect(connection.state.downstreamKeys.preview[1]).toEqual(before.preview[1])
		expect(connection.state.program).toBe('cam1')
		await device.terminate()
	})

	test('preserves playing state across repeated seek-only objects and uses loaded duration for seek bounds', async () => {
		const connection = new MockConnection()
		connection.state.players = {
			vtr3: {
				loaded: true,
				assetId: 'original.mp4',
				duration: 15.482133333333334,
				frameRate: 29.97,
				playing: true,
				time: 3,
				loop: false,
			},
		}
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		for (const time of [11000, 12000]) {
			if (time === 12000) connection.state.players.vtr3.time = 7
			device.handleState(
				{
					time,
					nextEvents: [],
					layers: {
						clip: controlObject(
							'clip',
							{ deviceType: DeviceType.M2LX, type: TimelineContentTypeM2LX.MEDIA_PLAYER, mediaPlayer: { seek: 15.2 } },
							{ instance: { start: time } }
						),
					},
				},
				{ clip: playerMapping }
			)
			await mockTime.advanceTimeToTicks(time + 100)
		}
		expect(connection.commands.map((c) => c.command)).toEqual(['pause', 'seek', 'play', 'pause', 'seek', 'play'])
		expect(connection.state.players.vtr3.playing).toBe(true)
		expect(connection.state.players.vtr3.time).toBe(15.2)
		await device.terminate()
	})

	test.each([true, false])(
		'preserves actual playback (%s) for a seek-only cue after a control gap',
		async (playing) => {
			const connection = new MockConnection()
			connection.state.players = {
				vtr3: {
					loaded: true,
					assetId: 'original.mp4',
					duration: 300,
					frameRate: 50,
					playing: !playing,
					time: 3,
					loop: false,
				},
			}
			const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
			await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
			device.handleState(
				{
					time: 11000,
					nextEvents: [],
					layers: {
						clip: controlObject('prior', {
							deviceType: DeviceType.M2LX,
							type: TimelineContentTypeM2LX.MEDIA_PLAYER,
							mediaPlayer: { playing: !playing },
						}),
					},
				},
				{ clip: playerMapping }
			)
			await mockTime.advanceTimeToTicks(11100)
			device.handleState({ time: 12000, nextEvents: [], layers: {} }, { clip: playerMapping })
			await mockTime.advanceTimeToTicks(12100)
			connection.state.players.vtr3.playing = playing
			device.handleState(
				{
					time: 13000,
					nextEvents: [],
					layers: {
						clip: controlObject('seek', {
							deviceType: DeviceType.M2LX,
							type: TimelineContentTypeM2LX.MEDIA_PLAYER,
							mediaPlayer: { seek: 10 },
						}),
					},
				},
				{ clip: playerMapping }
			)
			await mockTime.advanceTimeToTicks(13100)
			expect(connection.commands.map((command) => command.command)).toEqual(
				playing ? ['pause', 'seek', 'play'] : ['seek']
			)
			expect(connection.state.players.vtr3).toMatchObject({ playing, time: 10 })
			await device.terminate()
		}
	)

	test('validates the whole batch before a bad route can leave earlier audio changes applied', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		const errors: unknown[] = []
		device.on('error', (...args) => errors.push(...args))
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		device.handleState(
			{
				time: 11000,
				nextEvents: [],
				layers: {
					audio: controlObject('audio', {
						deviceType: DeviceType.M2LX,
						type: TimelineContentTypeM2LX.AUDIO,
						audio: { muted: true },
					}),
					route: controlObject('route', {
						deviceType: DeviceType.M2LX,
						type: TimelineContentTypeM2LX.ROUTER,
						input: 'unknown',
					}),
				},
			},
			{ audio: audioMapping, route: routerMapping }
		)
		await mockTime.advanceTimeToTicks(11100)
		expect(connection.commands).toEqual([])
		expect(errors.some((error) => error instanceof Error && error.message.includes('Unknown M2L-X route'))).toBe(true)
		await device.terminate()
	})

	test('reports native media errors through device status and notifies when they clear', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		const changes = jest.fn()
		device.on('connectionChanged', changes)
		connection.state.players = {
			vtr3: { loaded: false, error: { code: 'missing', message: 'Asset missing', severity: 'error' } },
		}
		connection.emit('stateChanged', connection.state)
		expect(device.getStatus().statusCode).toBe(StatusCode.WARNING_MAJOR)
		expect(device.getStatus().messages.join(' ')).toContain('Asset missing')
		connection.state.players = { vtr3: { loaded: false } }
		connection.emit('stateChanged', connection.state)
		expect(device.getStatus().statusCode).toBe(StatusCode.GOOD)
		expect(changes).toHaveBeenCalledTimes(2)
		await device.terminate()
	})

	test('converts and sends audio/media/router controls, preserving mute and restoring loop off after load', async () => {
		const connection = new MockConnection()
		connection.state.players = { vtr3: { loaded: false, playing: false, loop: false } }
		connection.state.audio = { audio_mixer: { 'vtr3.1': { volume: 1, muted: false } } }
		connection.state.routers = { router: { ch1: 'cam1' } }
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		device.handleState(
			{
				time: 11000,
				nextEvents: [],
				layers: {
					audio: controlObject('audio', {
						deviceType: DeviceType.M2LX,
						type: TimelineContentTypeM2LX.AUDIO,
						audio: { volume: 0.5, muted: true },
					}),
					clip: controlObject('clip', {
						deviceType: DeviceType.M2LX,
						type: TimelineContentTypeM2LX.MEDIA_PLAYER,
						mediaPlayer: { assetId: 'existing.mp4', seek: 10, playing: true },
					}),
					route: controlObject('route', {
						deviceType: DeviceType.M2LX,
						type: TimelineContentTypeM2LX.ROUTER,
						input: 'cam2',
					}),
				},
			},
			{
				audio: audioMapping,
				clip: playerMapping,
				route: routerMapping,
			}
		)
		await mockTime.advanceTimeToTicks(11100)
		expect(connection.commands.map((c) => c.command)).toEqual([
			'set_input_muted',
			'set_input_volume',
			'load',
			'set_loop_enabled',
			'seek',
			'play',
			'connect',
		])
		expect(connection.state.players?.vtr3).toMatchObject({
			assetId: 'existing.mp4',
			playing: true,
			loop: false,
			time: 10,
		})
		expect(connection.state.audio?.audio_mixer['vtr3.1']).toEqual({ volume: 0.5, muted: true })
		expect(connection.state.program).toBe('cam1')
		await device.terminate()
	})

	test('aborts dependent commands after load failure rather than playing or switching the wrong asset', async () => {
		const connection = new MockConnection()
		connection.sources.add('vtr3')
		const send = connection.sendCommand.bind(connection)
		connection.sendCommand = async (command, options) => {
			if (command.command === 'load') throw new Error('load failed')
			await send(command, options)
		}
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		device.on('error', () => undefined)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		device.handleState(
			{
				time: 11000,
				nextEvents: [],
				layers: {
					mixer: mixerObject('take', { program: 'vtr3' }),
					clip: controlObject('clip', {
						deviceType: DeviceType.M2LX,
						type: TimelineContentTypeM2LX.MEDIA_PLAYER,
						mediaPlayer: { assetId: 'missing.mp4', playing: true },
					}),
				},
			},
			{
				mixer: mixerMapping,
				clip: playerMapping,
			}
		)
		await mockTime.advanceTimeToTicks(11100)
		expect(connection.commands.map((c) => c.command)).toEqual(['pause'])
		expect(connection.state.program).toBe('cam1')
		await device.terminate()
	})

	test('invalidates future batches derived from a failed load and recovers from actual observed state', async () => {
		const connection = new MockConnection()
		connection.sources.add('vtr3')
		const original = connection.sendCommand.bind(connection)
		let failLoad: (error: Error) => void = () => {
			throw new Error('Load was not pending')
		}
		let failOnce = true
		connection.sendCommand = async (command, options) => {
			if (command.command === 'load' && failOnce) {
				failOnce = false
				await new Promise<void>((_resolve, reject) => {
					failLoad = reject
				})
			}
			await original(command, options)
		}
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		device.on('error', () => undefined)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		const clip = controlObject('clip', {
			deviceType: DeviceType.M2LX,
			type: TimelineContentTypeM2LX.MEDIA_PLAYER,
			mediaPlayer: { assetId: 'new.mp4', playing: true },
		})
		device.handleState({ time: 11000, nextEvents: [], layers: { clip } }, { clip: playerMapping })
		await mockTime.advanceTimeToTicks(11010)
		device.handleState(
			{ time: 12000, nextEvents: [], layers: { clip, mixer: mixerObject('take', { program: 'vtr3' }) } },
			{ clip: playerMapping, mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(12010)
		failLoad(new Error('Load failed'))
		await mockTime.advanceTimeToTicks(12020)
		expect(connection.commands.map((c) => c.command)).toEqual(['pause'])
		expect(connection.state.program).toBe('cam1')
		device.handleState(
			{ time: 13000, nextEvents: [], layers: { clip, mixer: mixerObject('take', { program: 'vtr3' }) } },
			{ clip: playerMapping, mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(13100)
		expect(connection.state.players?.vtr3).toMatchObject({
			assetId: 'new.mp4',
			loaded: true,
			playing: true,
			loop: false,
		})
		expect(connection.state.program).toBe('vtr3')
		await device.terminate()
	})

	test('rejects effects with native auto-play enabled for timeline-controlled media', async () => {
		const connection = new MockConnection()
		connection.state.transition = {
			running: false,
			progress: 1,
			effect: { name: 'mix', duration: 1, autoPlayEnabled: true },
		}
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		expect(() =>
			device.handleState(
				{
					time: 11000,
					nextEvents: [],
					layers: {
						mixer: mixerObject('take', { program: 'vtr3', transition: { type: M2LXTransitionType.EFFECT } }),
						clip: controlObject('clip', {
							deviceType: DeviceType.M2LX,
							type: TimelineContentTypeM2LX.MEDIA_PLAYER,
							mediaPlayer: { playing: false },
						}),
					},
				},
				{
					mixer: mixerMapping,
					clip: playerMapping,
				}
			)
		).toThrow(/native M2L-X transition auto-play/)
		expect(connection.commands).toEqual([])
		await device.terminate()
	})

	test('only allows renewal before activation and after stand-down', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		await device.makeReady()
		await device.makeReady()
		device.handleState({ time: 11000, layers: {}, nextEvents: [] }, {})
		await device.makeReady()
		await device.standDown()
		await device.makeReady()
		expect(connection.ensureFreshAuthentication.mock.calls).toEqual([[true], [false], [false], [true]])
		await device.terminate()
	})

	test('sending a command protects production even if makeReady was not called', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		device.handleState(
			{ time: 11000, layers: { mixer: mixerObject('cut', { program: 'cam3' }) }, nextEvents: [] },
			{ mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(11010)
		await device.makeReady()
		expect(connection.ensureFreshAuthentication).toHaveBeenCalledWith(false)
		await device.terminate()
	})

	test('does not reuse desired state from commands cancelled by stand-down', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		device.handleState(
			{ time: 11000, layers: { mixer: mixerObject('cancelled-cut', { program: 'cam3' }) }, nextEvents: [] },
			{ mixer: mixerMapping }
		)
		await device.standDown()
		expect(device.queue).toEqual([])
		await device.makeReady()
		device.handleState(
			{ time: 12000, layers: { mixer: mixerObject('new-cut', { program: 'cam3' }) }, nextEvents: [] },
			{ mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(12010)
		expect(connection.commands).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'program', property: { name: 'video', value: 'cam3' } },
			},
		])
		await device.terminate()
	})

	test('holds commands until activation readiness has completed', async () => {
		const connection = new MockConnection()
		let finishPreparation: () => void = () => undefined
		connection.ensureFreshAuthentication.mockImplementationOnce(
			async () => new Promise<void>((resolve) => (finishPreparation = resolve))
		)
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		const ready = device.makeReady()
		device.handleState(
			{ time: 11000, layers: { mixer: mixerObject('cut', { program: 'cam3' }) }, nextEvents: [] },
			{ mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(11010)
		expect(connection.commands).toEqual([])
		finishPreparation()
		await ready
		await mockTime.advanceTimeToTicks(11020)
		expect(connection.commands).toHaveLength(1)
		await device.terminate()
	})

	test('surfaces renewal failure and does not mark the failed activation as production', async () => {
		const connection = new MockConnection()
		connection.ensureFreshAuthentication.mockRejectedValueOnce(new Error('authentication failed'))
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		await expect(device.makeReady()).rejects.toThrow('authentication failed')
		await device.makeReady()
		expect(connection.ensureFreshAuthentication.mock.calls).toEqual([[true], [true]])
		await device.terminate()
	})

	test('reports near-expiry, expired and unknown authentication without renewing it', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })
		expect(device.getStatus().statusCode).toBe(StatusCode.GOOD)
		connection.tokenExpiresAt = Date.now() + 1000
		expect(device.getStatus().statusCode).toBe(StatusCode.WARNING_MAJOR)
		connection.tokenExpiresAt = Date.now() - 1000
		expect(device.getStatus().statusCode).toBe(StatusCode.BAD)
		connection.tokenExpiresAt = undefined
		expect(device.getStatus().messages).toContain(
			'M2L-X token expiry is unknown; authenticate before the next activation'
		)
		expect(connection.ensureFreshAuthentication).not.toHaveBeenCalled()
		await device.terminate()
	})

	test('converts timeline state and sends source, transition, and key commands in order', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })

		const mappings: Record<string, MappingM2LX> = {
			mixer: {
				device: DeviceType.M2LX,
				deviceId: 'm2lx0',
				mappingType: MappingM2LXType.MIXER,
			},
			key: {
				device: DeviceType.M2LX,
				deviceId: 'm2lx0',
				mappingType: MappingM2LXType.KEY,
				bus: M2LXMixerBus.PROGRAM,
				key: { index: 0, type: M2LXKeyType.PIP },
			},
		}

		device.handleState(
			{
				time: 11000,
				layers: {
					mixer: {
						id: 'mixer0',
						layer: 'mixer',
						enable: { start: 0 },
						content: {
							deviceType: DeviceType.M2LX,
							type: TimelineContentTypeM2LX.MIXER,
							mixer: { program: 'cam3', transition: { type: M2LXTransitionType.EFFECT } },
						},
						instance: { start: 0 },
					} as any,
					key: {
						id: 'key0',
						layer: 'key',
						enable: { start: 0 },
						content: {
							deviceType: DeviceType.M2LX,
							type: TimelineContentTypeM2LX.KEY,
							key: { visible: true },
						},
						instance: { start: 0 },
					} as any,
				},
				nextEvents: [],
			},
			mappings
		)
		await mockTime.advanceTimeToTicks(11010)

		expect(connection.commands).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'preview', property: { name: 'video', value: 'cam3' } },
			},
			{ command: 'transition', node: 'mixer', args: { effect_enabled: true } },
			{
				command: 'set_key_property',
				node: 'mixer',
				args: {
					key_index: 0,
					key_type: 'upstream',
					target: 'program',
					property: { name: 'visible', value: true },
				},
			},
		])
	})

	test('rejects unknown source names before sending them', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })

		const commandError = new Promise<Error>((resolve) => device.once('error', (_context, error) => resolve(error)))
		device.handleState(
			{
				time: 11000,
				layers: {
					mixer: {
						id: 'mixer0',
						layer: 'mixer',
						enable: { start: 0 },
						content: {
							deviceType: DeviceType.M2LX,
							type: TimelineContentTypeM2LX.MIXER,
							mixer: { program: 'unknown' },
						},
						instance: { start: 0 },
					} as any,
				},
				nextEvents: [],
			},
			{
				mixer: {
					device: DeviceType.M2LX,
					deviceId: 'm2lx0',
					mappingType: MappingM2LXType.MIXER,
				} as MappingM2LX,
			}
		)
		await mockTime.advanceTimeToTicks(11010)

		await expect(commandError).resolves.toThrow('Unknown M2L-X video source "unknown"')
		expect(connection.commands).toEqual([])
	})

	test('parks the program of a lookahead mixer object on preview', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })

		device.handleState(
			{
				time: 11000,
				layers: {
					mixer: mixerObject('mixer0', { program: 'cam1' }),
					mixer_lookahead: mixerObject(
						'mixer1',
						{ program: 'cam3' },
						{ layer: 'mixer_lookahead', isLookahead: true, lookaheadForLayer: 'mixer' }
					),
				},
				nextEvents: [],
			},
			{ mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(11010)

		expect(connection.commands).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'preview', property: { name: 'video', value: 'cam3' } },
			},
		])
	})

	test('lets an explicit preview win over lookahead', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })

		device.handleState(
			{
				time: 11000,
				layers: {
					mixer: mixerObject('mixer0', { program: 'cam1', preview: 'cam1' }),
					mixer_lookahead: mixerObject(
						'mixer1',
						{ program: 'cam3' },
						{ layer: 'mixer_lookahead', isLookahead: true, lookaheadForLayer: 'mixer' }
					),
				},
				nextEvents: [],
			},
			{ mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(11010)

		expect(connection.commands).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'preview', property: { name: 'video', value: 'cam1' } },
			},
		])
	})

	test('uses lookahead as preview when there is no main mixer object', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })

		device.handleState(
			{
				time: 11000,
				layers: {
					mixer_lookahead: mixerObject(
						'mixer1',
						{ program: 'cam3' },
						{ layer: 'mixer_lookahead', isLookahead: true, lookaheadForLayer: 'mixer' }
					),
				},
				nextEvents: [],
			},
			{ mixer: mixerMapping }
		)
		await mockTime.advanceTimeToTicks(11010)

		expect(connection.commands).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'preview', property: { name: 'video', value: 'cam3' } },
			},
		])
	})

	test('refuses to show a key that has no source configured', async () => {
		const connection = new MockConnection()
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })

		const commandError = new Promise<Error>((resolve) => device.once('error', (_context, error) => resolve(error)))
		device.handleState(
			{
				time: 11000,
				layers: {
					still: {
						id: 'still0',
						layer: 'still',
						enable: { start: 0 },
						content: { deviceType: DeviceType.M2LX, type: TimelineContentTypeM2LX.KEY, key: { visible: true } },
						instance: { start: 0 },
					} as any,
				},
				nextEvents: [],
			},
			{
				still: {
					device: DeviceType.M2LX,
					deviceId: 'm2lx0',
					mappingType: MappingM2LXType.KEY,
					bus: M2LXMixerBus.PROGRAM,
					key: { index: 4, type: M2LXKeyType.STILL },
				} as MappingM2LX,
			}
		)
		await mockTime.advanceTimeToTicks(11010)

		await expect(commandError).resolves.toThrow('key 4 on program has no source configured')
		expect(connection.commands).toEqual([])
	})

	test('seeds the initial state from the observed key visibility on the mapped bus', async () => {
		const connection = new MockConnection()
		connection.state.keys.preview[0] = { visible: true, source: 'cam1' }
		const device = new M2LXDevice('m2lx0', { type: DeviceType.M2LX, connection }, mockTime.getCurrentTime2)
		await device.init({ baseUrl: 'https://m2lx.test', password: 'password' })

		device.handleState(
			{
				time: 11000,
				layers: {
					pip: {
						id: 'pip0',
						layer: 'pip',
						enable: { start: 0 },
						content: { deviceType: DeviceType.M2LX, type: TimelineContentTypeM2LX.KEY, key: { visible: true } },
						instance: { start: 0 },
					} as any,
				},
				nextEvents: [],
			},
			{
				pip: {
					device: DeviceType.M2LX,
					deviceId: 'm2lx0',
					mappingType: MappingM2LXType.KEY,
					bus: M2LXMixerBus.PREVIEW,
					key: { index: 0, type: M2LXKeyType.PIP },
				} as MappingM2LX,
			}
		)
		await mockTime.advanceTimeToTicks(11010)

		expect(connection.commands).toEqual([])
	})
})
