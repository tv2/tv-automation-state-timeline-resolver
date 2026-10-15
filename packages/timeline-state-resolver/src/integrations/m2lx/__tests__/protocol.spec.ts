import {
	createEmptyObservedState,
	createSetInputCommand,
	createSetKeyCommand,
	createSetKeyPropertyCommand,
	createTransitionCommand,
	extractAccessToken,
	extractConfiguredVideoSources,
	extractTokenLifetime,
	extractCapabilities,
	matchesM2LXValue,
	parseStatusMessage,
} from '../protocol'

describe('M2L-X protocol', () => {
	test('creates confirmed command payloads', () => {
		expect(createSetInputCommand('preview', 'cam2')).toEqual({
			command: 'set_input_property',
			node: 'mixer',
			args: {
				input_type: 'preview',
				property: { name: 'video', value: 'cam2' },
			},
		})
		expect(createTransitionCommand(false)).toEqual({
			command: 'transition',
			node: 'mixer',
			args: { effect_enabled: false },
		})
		expect(createTransitionCommand(true).args).toEqual({ effect_enabled: true })
		expect(createSetKeyCommand(4, 'still', true, 'preview')).toEqual({
			command: 'set_key_property',
			node: 'mixer',
			args: {
				key_index: 4,
				key_type: 'upstream',
				target: 'preview',
				property: { name: 'visible', value: true },
			},
		})
	})

	test('rejects invalid key kind/index combinations', () => {
		expect(() => createSetKeyCommand(4, 'pip', true)).toThrow(/not valid/)
		expect(() => createSetKeyCommand(3, 'still', true)).toThrow(/not valid/)
	})

	test('validates authentication and configuration responses', () => {
		expect(extractAccessToken({ access_token: 'secret' })).toBe('secret')
		expect(() => extractAccessToken({ access_token: '' })).toThrow(/access_token/)
		expect(extractTokenLifetime({ expires_in: 86399 })).toBe(86399)
		expect(extractTokenLifetime({ access_token: 'secret' })).toBeUndefined()
		for (const expires_in of [0, -1, NaN, Infinity, '86399', null]) {
			expect(() => extractTokenLifetime({ expires_in })).toThrow(/expires_in/)
		}

		expect(
			extractConfiguredVideoSources({
				video_sources: [{ name: 'cam1' }, { source_name: 'ndi24' }, { name: 'audio1' }],
				inputs: { primary: { alias: 'vtr2' } },
			})
		).toEqual(new Set(['cam1', 'ndi24', 'vtr2']))
	})

	test('prefers the video_mixer node source list from switcher_configuration', () => {
		expect(
			extractConfiguredVideoSources({
				format: { width: 1920 },
				nodes: [
					{ name: 'router', type: 'video_router', config: { sources: ['ch1', 'ch2'] } },
					{
						name: 'mixer',
						type: 'video_mixer',
						config: { sources: ['ndi1', 'vtr1', 'replay1', 'cam10', 'custom_name'], upstream_key_count: 8 },
					},
				],
			})
		).toEqual(new Set(['ndi1', 'vtr1', 'replay1', 'cam10', 'custom_name']))
	})

	test('ignores messages that are not switcher_status envelopes', () => {
		const previous = createEmptyObservedState()
		previous.program = 'cam1'
		expect(parseStatusMessage({ code: 200, message: 'OK' }, previous)).toEqual(previous)
		expect(parseStatusMessage('garbage', previous)).toEqual(previous)
	})

	test('parses switcher_status snapshots and path-scoped deltas', () => {
		const snapshot = parseStatusMessage(
			{
				status: [
					{ node: 'tally', path: '/', state: { program_sources: ['cam10'] } },
					{
						node: 'mixer',
						path: '/',
						state: {
							program: {
								background: { source: 'vtr1', source_type: 'video' },
								upstream_keys: [
									{ key: { visible: false, source: 'ndi1' } },
									{ key: { visible: true, source: 'ndi2' } },
								],
							},
							preview: {
								background: { source: 'replay1', source_type: 'video' },
								upstream_keys: [{ key: { visible: true, source: 'ndi1' } }, { key: { visible: true, source: '' } }],
							},
							transition: {
								effect: { name: 'wipe_up_right', duration: 1.5 },
								progress: { automatic: false, inverted: false, running: false, value: 1 },
							},
						},
					},
				],
				timestamp: 1,
			},
			createEmptyObservedState()
		)
		expect(snapshot).toMatchObject({
			program: 'vtr1',
			preview: 'replay1',
			keys: {
				program: { 0: { visible: false, source: 'ndi1' }, 1: { visible: true, source: 'ndi2' } },
				preview: { 0: { visible: true, source: 'ndi1' }, 1: { visible: true, source: '' } },
			},
			transition: { running: false, progress: 1, effect: { name: 'wipe_up_right', duration: 1.5 } },
		})

		const delta = parseStatusMessage(
			{
				status: [
					{ node: 'mixer', path: '/program/background', state: { source: 'cam10', source_type: 'video' } },
					{
						node: 'mixer',
						path: '/program/upstream_keys/0',
						state: { chroma_key: {}, key: { visible: true, source: 'ndi1' } },
					},
					{
						node: 'mixer',
						path: '/transition/progress',
						state: { automatic: false, inverted: true, running: true, value: 0.4 },
					},
					{ node: 'tally', path: '/program_sources', state: ['cam10'] },
				],
				timestamp: 2,
			},
			snapshot
		)
		expect(delta).toMatchObject({
			program: 'cam10',
			preview: 'replay1',
			keys: {
				program: { 0: { visible: true, source: 'ndi1' }, 1: { visible: true, source: 'ndi2' } },
				preview: { 0: { visible: true, source: 'ndi1' }, 1: { visible: true, source: '' } },
			},
			transition: { running: true, progress: 0.4, effect: { name: 'wipe_up_right', duration: 1.5 } },
		})
		// The previous state must not be mutated
		expect(snapshot.program).toBe('vtr1')
		expect(snapshot.keys.program[0]).toEqual({ visible: false, source: 'ndi1' })

		// A scene recall changes the effect without touching the progress
		const effectDelta = parseStatusMessage(
			{
				status: [
					{ node: 'mixer', path: '/transition/effect', state: { name: 'mix', duration: 0.5, easing: 'linear' } },
				],
				timestamp: 3,
			},
			delta
		)
		expect(effectDelta.transition).toEqual({ running: true, progress: 0.4, effect: { name: 'mix', duration: 0.5 } })
	})

	test('merges geometry leaves, normalizes native colors/floats and keeps upstream/DSK indices independent', () => {
		const initial = parseStatusMessage(
			{
				status: [
					{
						node: 'mixer',
						path: '/',
						state: {
							preview: {
								upstream_keys: [
									{ key: { visible: false, source: 'ndi1', source_type: 'video', translation: { x: 0, y: 10 } } },
								],
								downstream_keys: [{ key: { visible: true, source: 'still/demo.png', source_type: 'image' } }],
							},
						},
					},
				],
			},
			createEmptyObservedState()
		)
		const next = parseStatusMessage(
			{
				status: [{ node: 'mixer', path: '/preview/upstream_keys/0/key/translation/x', state: -800 }],
			},
			initial
		)
		expect(next.keys.preview[0].translation).toEqual({ x: -800, y: 10 })
		expect(initial.keys.preview[0].translation).toEqual({ x: 0, y: 10 })
		expect(next.downstreamKeys?.preview[0]).toMatchObject({ visible: true, source: 'still/demo.png' })
		expect(createSetKeyCommand(0, 'dsk', false, 'preview').args.key_type).toBe('downstream')
		expect(() => createSetKeyCommand(2, 'dsk', false)).toThrow(/invalid/)
		expect(matchesM2LXValue('#ffffffff', '#ffffff')).toBe(true)
		expect(matchesM2LXValue(0.019999999552965164, 0.02)).toBe(true)
		expect(matchesM2LXValue(0.03, 0.02)).toBe(false)
		expect(matchesM2LXValue(0, 5e-8)).toBe(false)
		expect(matchesM2LXValue({ duration: 2 }, { duration: 2, name: undefined })).toBe(true)
		expect(matchesM2LXValue(undefined, {})).toBe(true)
	})

	test('parses audio/media/router snapshots, decoded leaf paths and array replacements', () => {
		const initial = parseStatusMessage(
			{
				status: [
					{
						node: 'audio_mixer',
						path: '/',
						state: { inputs: { 'vtr3.1': { volume: 1, muted: false }, 'input/a': { volume: 0.8, muted: true } } },
					},
					{
						node: 'vtr3',
						path: '/',
						state: {
							clip: { loaded: true, asset_id: 'original.mp4', duration: 15.482133333333334, frame_rate: '29.97' },
							playback: { paused: true, time: 0 },
							loop_enabled: false,
							error: { code: '', message: '', severity: 'none' },
						},
					},
					{
						node: 'router',
						path: '/',
						state: {
							connections: [
								{ output: 'ch1', input: 'ndi1' },
								{ output: 'ch2', input: 'ndi2' },
							],
						},
					},
				],
			},
			createEmptyObservedState()
		)
		const next = parseStatusMessage(
			{
				status: [
					{ node: 'audio_mixer', path: '/inputs/vtr3.1/volume', state: 0.5 },
					{ node: 'audio_mixer', path: '/inputs/input~1a/muted', state: false },
					{ node: 'vtr3', path: '/clip/loaded', state: false },
					{ node: 'router', path: '/connections/0/input', state: 'ndi2' },
				],
			},
			initial
		)
		expect(next.audio?.audio_mixer).toEqual({
			'vtr3.1': { volume: 0.5, muted: false },
			'input/a': { volume: 0.8, muted: false },
		})
		expect(next.players?.vtr3).toMatchObject({ loaded: false, playing: false, loop: false })
		expect(next.players?.vtr3.assetId).toBeUndefined()
		expect(next.players?.vtr3.duration).toBeUndefined()
		expect(next.routers?.router).toEqual({ ch1: 'ndi2', ch2: 'ndi2' })
		expect(initial.players?.vtr3).toMatchObject({ loaded: true, assetId: 'original.mp4', frameRate: 29.97 })
		expect(initial.routers?.router.ch1).toBe('ndi1')
		expect(
			parseStatusMessage({ status: [{ node: 'router', path: '/connections', state: [] }] }, next).routers?.router
		).toEqual({})
	})

	test('discovers only configured basic-audio/media/router capabilities and parses custom node names', () => {
		const capabilities = extractCapabilities({
			nodes: [
				{ name: 'player_custom', type: 'media_player' },
				{ name: 'audio_custom', type: 'audio_mixer', config: { inputs: ['input.1'], maximum_volume: 1 } },
				{ name: 'advanced', type: 'advanced_audio_mixer', config: { inputs: ['input.1'] } },
				{ name: 'router_custom', type: 'video_router', config: { inputs: ['ndi1'], outputs: ['ch1'] } },
			],
		})
		expect(capabilities.players).toEqual(new Set(['player_custom']))
		expect(capabilities.audio.advanced).toBeUndefined()
		expect(capabilities.audio.audio_custom.inputs).toEqual(new Set(['input.1']))
		const state = parseStatusMessage(
			{ status: [{ node: 'player_custom', path: '/', state: { clip: { loaded: false, asset_id: 'stale' } } }] },
			createEmptyObservedState(),
			capabilities
		)
		expect(state.players?.player_custom).toEqual({ loaded: false })
	})

	test('rejects unsafe paths and invalid numeric geometry', () => {
		for (const key of ['__proto__', 'constructor', 'prototype']) {
			expect(() =>
				parseStatusMessage(
					{ status: [{ node: 'mixer', path: `/preview/${key}/polluted`, state: true }] },
					createEmptyObservedState()
				)
			).toThrow(/Unsafe/)
		}
		expect(() =>
			createSetKeyPropertyCommand(0, 'pip', 'preview', { name: 'translation', value: { x: NaN, y: 0 } })
		).toThrow(/finite/)
		expect(() =>
			createSetKeyPropertyCommand(0, 'pip', 'preview', { name: 'crop', value: { x: 0.5, y: 0, width: 0.8, height: 1 } })
		).toThrow(/rectangle/)
	})
})
