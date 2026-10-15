import { createEmptyObservedState, M2LXObservedState } from '../protocol'
import { diffM2LXStates, keyStateId, M2LXKeyState, M2LXState } from '../state'

describe('M2L-X state differ', () => {
	test('cuts directly to a new program source', () => {
		const commands = diffM2LXStates(state('cam1', 'cam2'), state('cam3', 'cam2', 'cut'))

		expect(commands.map((command) => command.command)).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'program', property: { name: 'video', value: 'cam3' } },
			},
		])
	})

	test('an explicit cut also switches program directly and leaves preview alone', () => {
		const commands = diffM2LXStates(state('cam1', 'cam2'), state('cam3', 'cam2', 'cut'))
		expect(commands.map((command) => command.command.args)).toEqual([
			{ input_type: 'program', property: { name: 'video', value: 'cam3' } },
		])
	})

	test('prepares preview before an effect transition', () => {
		const commands = diffM2LXStates(state('cam1', 'cam2'), state('cam3', undefined, 'effect'))

		expect(commands.map((command) => command.command)).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'preview', property: { name: 'video', value: 'cam3' } },
			},
			{
				command: 'transition',
				node: 'mixer',
				args: { effect_enabled: true },
			},
		])
		expect(commands[0].isComplete(observed({ preview: 'cam3' }))).toBe(true)
		expect(commands[0].isComplete(observed({ preview: 'cam2' }))).toBe(false)
		expect(commands[0].waitFor?.(observed({ transition: { running: true, progress: 0.5 } }))).toBe(false)
		expect(commands[0].waitFor?.(observed({ transition: { running: false, progress: 1 } }))).toBe(true)
		expect(commands[1].isComplete(observed({ program: 'cam3' }))).toBe(true)
		// A new transition is not started on top of a running one
		expect(commands[1].waitFor?.(observed({ transition: { running: true, progress: 0.5 } }))).toBe(false)
		expect(commands[1].waitFor?.(observed({ transition: { running: false, progress: 1 } }))).toBe(true)
		expect(commands[1].waitFor?.(observed({}))).toBe(true)
	})

	test('rechecks native auto-play at execution for an effect into a controlled media player', () => {
		const next = state('vtr3', undefined, 'effect')
		next.players = { vtr3: { timelineObjId: 'clip' } }
		const transition = diffM2LXStates(state('cam1', 'cam2'), next).find(
			(command) => command.command.command === 'transition'
		)
		const initial = observed({
			transition: { running: false, progress: 1, effect: { name: 'crossfade', duration: 1, autoPlayEnabled: false } },
		})
		expect(() => transition?.checkState?.(initial, initial)).not.toThrow()
		for (const autoPlayEnabled of [true, undefined]) {
			const current = observed({
				transition: { running: false, progress: 1, effect: { name: 'crossfade', duration: 1, autoPlayEnabled } },
			})
			expect(() => transition?.checkState?.(current, initial)).toThrow('Disable native M2L-X transition auto-play')
		}
		const core = diffM2LXStates(state('cam1', 'cam2'), state('vtr3', undefined, 'effect')).find(
			(command) => command.command.command === 'transition'
		)
		expect(core?.checkState).toBeUndefined()
	})

	test('treats a started effect transition as complete but not as redundant', () => {
		const commands = diffM2LXStates(state('cam1', 'cam2'), state('cam3', undefined, 'effect'))
		const transition = commands[1]
		const idle = observed({ program: 'cam1', transition: { running: false, progress: 1 } })
		const running = observed({ program: 'cam1', transition: { running: true, progress: 0.2 } })
		const done = observed({ program: 'cam3', transition: { running: false, progress: 1 } })

		expect(transition.isComplete(idle)).toBe(false)
		expect(transition.isComplete(running)).toBe(true)
		expect(transition.isComplete(done)).toBe(true)
		// A transition that is still running from before must not make this one look unnecessary
		expect(transition.isRedundant?.(running)).toBe(false)
		expect(transition.isRedundant?.(done)).toBe(true)
	})

	test('falls back to a cut for an effect transition when the current program is unknown', () => {
		const commands = diffM2LXStates({ keys: {} }, state('cam3', undefined, 'effect'))
		expect(commands.map((command) => command.command.args)).toEqual([
			{ input_type: 'program', property: { name: 'video', value: 'cam3' } },
		])
	})

	test('restores an explicitly requested preview after an effect transition', () => {
		const commands = diffM2LXStates(state('cam1', 'cam2'), state('cam3', 'cam2', 'effect'))

		expect(commands.map((command) => command.command)).toEqual([
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'preview', property: { name: 'video', value: 'cam3' } },
			},
			{
				command: 'transition',
				node: 'mixer',
				args: { effect_enabled: true },
			},
			{
				command: 'set_input_property',
				node: 'mixer',
				args: { input_type: 'preview', property: { name: 'video', value: 'cam2' } },
			},
		])
		// The effect lands on whatever is on preview when it ends, so the restore must wait for it
		const restore = commands[2]
		expect(restore.waitFor?.(observed({ program: 'cam1', transition: { running: true, progress: 0.5 } }))).toBe(false)
		expect(restore.waitFor?.(observed({ program: 'cam1', transition: { running: false, progress: 1 } }))).toBe(false)
		expect(restore.waitFor?.(observed({ program: 'cam3', transition: { running: false, progress: 1 } }))).toBe(true)
	})

	test('gates a plain preview change on the transition state', () => {
		const commands = diffM2LXStates(state('cam1', 'cam2'), state('cam1', 'cam3'))
		expect(commands).toHaveLength(1)
		expect(commands[0].waitFor?.(observed({ transition: { running: true, progress: 0.5 } }))).toBe(false)
		expect(commands[0].waitFor?.(observed({ transition: { running: false, progress: 1 } }))).toBe(true)
	})

	test('does not restore unchanged preview when no effect is requested', () => {
		expect(diffM2LXStates(state('cam1', 'cam2'), state('cam1', 'cam2', 'effect'))).toEqual([])
	})

	test('a preview-only effect setting does not require an undefined program target', () => {
		const [command] = diffM2LXStates(state('cam1', 'cam2'), state(undefined, 'cam3', 'effect'))
		expect(command.waitFor?.(observed({ program: 'cam1', transition: { running: false, progress: 1 } }))).toBe(true)
	})

	test('holds a cut until the active effect finishes', () => {
		const [command] = diffM2LXStates(state('cam1'), state('cam2', undefined, 'cut'))
		expect(command.waitFor?.(observed({ transition: { running: true, progress: 0.5 } }))).toBe(false)
		expect(command.waitFor?.(observed({ transition: { running: false, progress: 1 } }))).toBe(true)
	})

	test('does not re-set preview after an effect transition when it equals the new program', () => {
		const commands = diffM2LXStates(state('cam1', 'cam2'), state('cam3', 'cam3', 'effect'))
		expect(commands.map((command) => command.command.command)).toEqual(['set_input_property', 'transition'])
	})

	test('diffs key visibility per bus in index order', () => {
		const commands = diffM2LXStates(
			{ keys: {} },
			{
				keys: keys(
					{ index: 4, visible: true, keyType: 'still', bus: 'program', timelineObjId: 'still' },
					{ index: 1, visible: false, keyType: 'pip', bus: 'preview', timelineObjId: 'pip' },
					{ index: 1, visible: true, keyType: 'pip', bus: 'program', timelineObjId: 'pip-pgm' }
				),
			}
		)

		expect(
			commands.map((command) => {
				if (command.command.command !== 'set_key_property') throw new Error('Expected key command')
				return [command.command.args.target, command.command.args.key_index]
			})
		).toEqual([
			['program', 1],
			['program', 4],
			['preview', 1],
		])
	})

	test('completes key commands from the visibility on the targeted bus', () => {
		const [command] = diffM2LXStates(
			{ keys: {} },
			{ keys: keys({ index: 0, visible: true, keyType: 'pip', bus: 'preview', timelineObjId: 'pip' }) }
		)

		expect(command.isComplete(observed({ keys: { program: { 0: { visible: true } }, preview: {} } }))).toBe(false)
		expect(command.isComplete(observed({ keys: { program: {}, preview: { 0: { visible: true } } } }))).toBe(true)
		expect(command.waitFor?.(observed({ transition: { running: true, progress: 0.5 } }))).toBe(false)
		expect(command.waitFor?.(observed({ transition: { running: false, progress: 1 } }))).toBe(true)
	})

	test('does not resend unchanged keys', () => {
		const key: M2LXKeyState = { index: 2, visible: true, keyType: 'pip', bus: 'program', timelineObjId: 'a' }
		expect(diffM2LXStates({ keys: keys(key) }, { keys: keys({ ...key, timelineObjId: 'b' }) })).toEqual([])
	})

	test('orders pause/load/loop/seek/play before selecting a controlled player without native auto-play', () => {
		const old: M2LXState = {
			...state('cam1'),
			players: { vtr3: { assetId: 'old.mp4', playing: true, loop: false, timelineObjId: 'old' } },
		}
		const next: M2LXState = {
			...state('vtr3'),
			players: { vtr3: { assetId: 'new.mp4', playing: true, loop: false, seek: 10, timelineObjId: 'new' } },
		}
		const commands = diffM2LXStates(old, next)
		expect(commands.map((c) => c.command)).toEqual([
			{ command: 'pause', node: 'vtr3' },
			{ command: 'load', node: 'vtr3', args: { id: 'new.mp4' } },
			{ command: 'set_loop_enabled', node: 'vtr3', args: false },
			{ command: 'seek', node: 'vtr3', args: { time: 10 } },
			{ command: 'play', node: 'vtr3' },
			{
				command: 'set_input_property',
				node: 'mixer',
				args: {
					input_type: 'program',
					property: { name: 'video', value: 'vtr3' },
					options: { apply_auto_play_transition_settings: false },
				},
			},
		])
		const stale = observed({ players: { vtr3: { loaded: false } } })
		expect(commands[1].isComplete(stale)).toBe(false)
		expect(
			commands[1].isComplete(
				observed({ players: { vtr3: { loaded: true, assetId: 'new.mp4', duration: 15.48, frameRate: 29.97 } } })
			)
		).toBe(true)
		const nativeLoopReset = observed({ players: { vtr3: { loaded: true, assetId: 'new.mp4', loop: true } } })
		expect(commands[2].isComplete(nativeLoopReset)).toBe(false)
		expect(commands[3].isComplete(observed({ players: { vtr3: { loaded: true, time: 10.02, frameRate: 50 } } }))).toBe(
			true
		)
		expect(commands[3].isComplete(observed({ players: { vtr3: { loaded: true, time: 10.1, frameRate: 50 } } }))).toBe(
			false
		)
	})

	test('defaults a newly selected asset to paused/loop off and unloads by loaded flag', () => {
		const selected = diffM2LXStates(
			{ keys: {} },
			{
				keys: {},
				players: { vtr3: { assetId: 'new.mp4', timelineObjId: 'clip' } },
			}
		)
		expect(selected.map((c) => c.command.command)).toEqual(['pause', 'load', 'set_loop_enabled', 'pause'])
		expect(selected[2].command.args).toBe(false)
		const unloaded = diffM2LXStates(
			{
				keys: {},
				players: { vtr3: { assetId: 'old.mp4', timelineObjId: 'old' } },
			},
			{ keys: {}, players: { vtr3: { assetId: null, timelineObjId: 'empty' } } }
		)
		expect(unloaded.map((c) => c.command)).toEqual([
			{ command: 'pause', node: 'vtr3' },
			{ command: 'unload', node: 'vtr3' },
		])
		expect(unloaded[1].isComplete(observed({ players: { vtr3: { loaded: false } } }))).toBe(true)
		expect(() =>
			diffM2LXStates(
				{ keys: {} },
				{ keys: {}, players: { vtr3: { assetId: null, playing: true, timelineObjId: 'invalid' } } }
			)
		).toThrow(/unloaded/)
	})

	test('resends an explicit seek on a new instance but does not chase playback time', () => {
		const player = { seek: 10, playing: true, timelineObjId: 'clip', instanceStart: 1000 }
		const old: M2LXState = { keys: {}, players: { vtr3: player } }
		expect(diffM2LXStates(old, old)).toEqual([])
		const next = { keys: {}, players: { vtr3: { ...player, instanceStart: 2000 } } }
		expect(diffM2LXStates(old, next).map((c) => c.command.command)).toEqual(['pause', 'seek', 'play'])
	})

	test('surfaces native load errors after a 200 reply without blocking replacement of an old failed asset', () => {
		const commands = diffM2LXStates(
			{ keys: {} },
			{ keys: {}, players: { vtr3: { assetId: 'new.mp4', timelineObjId: 'clip' } } }
		)
		const load = commands.find((c) => c.command.command === 'load')!
		const clean = observed({ players: { vtr3: { loaded: false } } })
		const failed = observed({
			players: { vtr3: { loaded: false, error: { code: 'missing', message: 'Asset missing', severity: 'error' } } },
		})
		expect(() => load.checkState?.(failed, clean)).toThrow(/Asset missing/)
		expect(() => load.checkState?.(failed, failed)).not.toThrow()
	})

	test('hides before replacing/clearing sources, configures geometry before showing and distinguishes DSKs', () => {
		const next: M2LXState = {
			keys: {
				'preview/dsk/0': {
					index: 0,
					keyType: 'dsk',
					bus: 'preview',
					visible: true,
					source: { type: 'image', name: 'still/demo.png' },
					translation: { x: -800, y: -400 },
					timelineObjId: 'graphic',
				},
			},
		}
		const commands = diffM2LXStates({ keys: {} }, next)
		expect(
			commands.map((c) => (c.command.command === 'set_key_property' ? c.command.args.property : undefined))
		).toEqual([
			{ name: 'opacity', value: 1 },
			{ name: 'visible', value: false },
			{ name: 'video', value: '' },
			{ name: 'image', value: 'still/demo.png' },
			{ name: 'translation', value: { x: -800, y: -400 } },
			{ name: 'opacity', value: 1 },
			{ name: 'visible', value: true },
		])
		expect(
			commands.every((c) => c.command.command === 'set_key_property' && c.command.args.key_type === 'downstream')
		).toBe(true)
		const cleared: M2LXState = {
			keys: { 'preview/dsk/0': { ...next.keys['preview/dsk/0'], visible: false, source: { type: 'image', name: '' } } },
		}
		expect(
			diffM2LXStates(next, cleared)
				.slice(0, 4)
				.map((c) => (c.command.command === 'set_key_property' ? c.command.args.property : undefined))
		).toEqual([
			{ name: 'opacity', value: 1 },
			{ name: 'visible', value: false },
			{ name: 'video', value: '' },
			{ name: 'image', value: '' },
		])
		const invalid = {
			keys: { 'preview/dsk/0': { ...next.keys['preview/dsk/0'], source: { type: 'image' as const, name: '' } } },
		}
		expect(() => diffM2LXStates(next, invalid)).toThrow(/empty source/)
	})

	test('configures an effect before taking it and completes against normalized native values', () => {
		const next = state('cam3', undefined, 'effect')
		next.mixer!.effect = { name: 'wipe_up', duration: 2, args: { fade: 0.02 } }
		const commands = diffM2LXStates(state('cam1'), next)
		expect(commands.map((c) => c.command.command)).toEqual(['configure_effect', 'set_input_property', 'transition'])
		expect(commands[0].command.args).toEqual({ name: 'wipe_up', duration: '2.0s', args: { fade: 0.02 } })
		expect(
			commands[0].isComplete(
				observed({
					transition: {
						running: false,
						progress: 0,
						effect: { name: 'wipe_up', duration: 2, args: { fade: 0.019999999552965164 } },
					},
				})
			)
		).toBe(true)
	})

	test('mutes before preparing media, unmutes after and never changes master or unmapped routes', () => {
		const next: M2LXState = {
			keys: {},
			audio: { input: { node: 'audio_mixer', input: 'vtr3.1', muted: false, volume: 0.5, timelineObjId: 'audio' } },
			players: { vtr3: { assetId: 'new.mp4', timelineObjId: 'clip' } },
			routers: { route: { node: 'router', input: 'ndi2', output: 'ch1', timelineObjId: 'router' } },
		}
		const commands = diffM2LXStates({ keys: {} }, next)
		expect(commands.map((c) => c.command.command)).toEqual([
			'set_input_volume',
			'pause',
			'load',
			'set_loop_enabled',
			'pause',
			'set_input_muted',
			'connect',
		])
		expect(commands[0].command.args).toEqual([{ name: 'vtr3.1', volume: 0.5 }])
		expect(commands[commands.length - 1].isComplete(observed({ routers: { router: { ch1: 'ndi2' } } }))).toBe(true)
		const muted = { ...next, audio: { input: { ...next.audio!.input, muted: true } } }
		expect(diffM2LXStates({ keys: {} }, muted)[0].command.command).toBe('set_input_muted')
		expect(diffM2LXStates(next, { keys: {} })).toEqual([])
	})
})

function observed(partial: Partial<M2LXObservedState>): M2LXObservedState {
	return { ...createEmptyObservedState(), ...partial }
}

function keys(...list: M2LXKeyState[]): M2LXState['keys'] {
	const result: M2LXState['keys'] = {}
	for (const key of list) result[keyStateId(key.bus, key.index)] = key
	return result
}

function state(program?: string, preview?: string, transition?: 'cut' | 'effect'): M2LXState {
	return {
		mixer:
			program || preview
				? {
						program,
						preview,
						transition,
						timelineObjId: 'mixer',
				  }
				: undefined,
		keys: {},
	}
}
