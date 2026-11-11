import { createEmptyObservedState, M2LXObservedState } from '../protocol'
import { diffM2LXStates, keyerStateId, M2LXKeyerState, M2LXState } from '../state'
import { M2LXComposition } from 'timeline-state-resolver-types'

describe('M2L-X state differ', () => {
	describe('explicit composition Takes', () => {
		const pip: M2LXComposition['pip'][0] = {
			visible: true,
			source: { type: 'video', name: 'cam2' },
			translation: { x: 108, y: 308 },
			scale: { x: 0.43, y: 0.43 },
			crop: { x: 0, y: 0, width: 1, height: 1 },
		}
		const compositionState = (visible = true): M2LXState => ({
			mixer: {
				program: 'cam1',
				preview: 'cam3',
				composition: { pip: { 0: visible ? pip : { visible: false } } },
				timelineObjId: 'layout',
			},
			keyers: {},
		})
		const prepared = (): M2LXObservedState => {
			const key = {
				...pip,
				source: pip.source.name,
				sourceType: pip.source.type,
			}
			return observed({
				program: 'cam1',
				preview: 'cam1',
				keyers: { program: { 0: { visible: false } }, preview: { 0: key } },
				nodes: {
					mixer: {
						program: {
							upstream_keys: [{ key: { visible: false, opacity: 1 }, chroma_key: {} }],
							downstream_keys: [{ key: { visible: true, source: 'still/logo.png' } }],
						},
						preview: {
							upstream_keys: [
								{
									key: { ...pip, source: pip.source.name, source_type: 'video', opacity: 1 },
									chroma_key: {},
								},
							],
							downstream_keys: [{ key: { visible: true, source: 'still/logo.png' } }],
						},
					},
				},
			})
		}
		const dskState = (visible = true): M2LXState => {
			const next = compositionState(visible)
			if (next.mixer?.composition) next.mixer.composition.dsk = { 0: visible ? pip : { visible: false } }
			return next
		}
		const dskPrepared = (): M2LXObservedState => {
			const current = prepared()
			current.downstreamKeyers = {
				program: { 0: { visible: false, opacity: 0 }, 1: { visible: true, source: 'watermark.png' } },
				preview: {
					0: { ...current.keyers.preview[0], opacity: 1 },
					1: { visible: true, source: 'watermark.png' },
				},
			}
			const mixer = current.nodes?.mixer as { program: Record<string, unknown>; preview: Record<string, unknown> }
			mixer.program.downstream_keys = [
				{ key: { visible: false, opacity: 0, rotation: 0 }, chroma_key: {} },
				{ key: { visible: true, source: 'watermark.png' } },
			]
			mixer.preview.downstream_keys = [
				{ key: { ...pip, source: 'cam2', source_type: 'video', opacity: 1, rotation: 0 }, chroma_key: {} },
				{ key: { visible: true, source: 'watermark.png' } },
			]
			Object.assign(mixer, { animations: { keys: {} } })
			return current
		}

		test.each(['cut', 'effect'] as const)('updates DSKs independently after the video %s succeeds', (transition) => {
			const next = dskState()
			if (!next.mixer) throw new Error('Missing fixture mixer')
			next.mixer.transition = transition
			next.mixer.previewComposition = { pip: { 0: { visible: false } }, dsk: { 0: { visible: false } } }
			const commands = diffM2LXStates(state('cam1'), next)
			const takeIndex = commands.findIndex((entry) => entry.command.command === 'transition')
			const take = commands[takeIndex]
			const current = dskPrepared()
			expect(() => take.checkState?.(current, current)).not.toThrow()
			expect(commands.slice(0, takeIndex).every((entry) => entry.isRedundant?.(current))).toBe(true)
			const noDskTransfer = { ...current, keyers: { ...current.keyers, program: current.keyers.preview } }
			expect(take.isComplete(noDskTransfer)).toBe(true)
			expect(take.isComplete({ ...noDskTransfer, transition: { running: true, progress: 0.9 } })).toBe(false)
			const dskCommands = commands.filter(
				(entry) => entry.command.command === 'set_key_property' && entry.command.args.key_type === 'downstream'
			)
			expect(dskCommands.length).toBeGreaterThan(0)
			const programDsk = dskCommands.filter(
				(entry) => entry.command.command === 'set_key_property' && entry.command.args.target === 'program'
			)
			expect(programDsk.length).toBeGreaterThan(0)
			expect(programDsk.every((entry) => commands.indexOf(entry) > takeIndex)).toBe(true)
			expect(dskCommands.indexOf(programDsk[programDsk.length - 1])).toBeLessThan(
				dskCommands.findIndex(
					(entry) => entry.command.command === 'set_key_property' && entry.command.args.target === 'preview'
				)
			)
			current.downstreamKeyers!.preview[0].opacity = 0
			expect(() => take.checkState?.(current, current)).not.toThrow()
		})

		test('DSK-only changes send no main transition or video/box commands', () => {
			const first = dskState()
			first.mixer!.composition!.pip = {}
			expect(
				diffM2LXStates(state('cam1', 'cam3'), first).every(
					(entry) =>
						entry.command.command === 'set_key_property' &&
						entry.command.args.key_type === 'downstream' &&
						entry.command.args.target === 'program'
				)
			).toBe(true)
			const old = dskState(false)
			const next = dskState(false)
			next.mixer!.composition!.dsk = { 0: pip }
			const commands = diffM2LXStates(old, next)
			expect(commands.length).toBeGreaterThan(0)
			expect(
				commands.every(
					(entry) =>
						entry.command.command === 'set_key_property' &&
						entry.command.args.key_type === 'downstream' &&
						entry.command.args.target === 'program' &&
						entry.command.args.key_index === 0
				)
			).toBe(true)
			const cleanup = diffM2LXStates(next, old)
			expect(
				cleanup.every(
					(entry) =>
						entry.command.command === 'set_key_property' &&
						entry.command.args.key_type === 'downstream' &&
						entry.command.args.target === 'program' &&
						entry.command.args.key_index === 0
				)
			).toBe(true)
			expect(
				cleanup.some(
					(entry) =>
						entry.command.command === 'set_key_property' &&
						entry.command.args.property.name === 'visible' &&
						entry.command.args.property.value === false
				)
			).toBe(true)
			const moved = dskState(false)
			moved.mixer!.composition!.dsk = { 0: { ...pip, translation: { x: 200, y: 308 } } }
			expect(diffM2LXStates(next, moved).map((entry) => entry.command)).toEqual([
				{
					command: 'set_key_property',
					node: 'mixer',
					args: {
						key_index: 0,
						key_type: 'downstream',
						target: 'program',
						property: { name: 'translation', value: { x: 200, y: 308 } },
					},
				},
			])
		})

		test('cleans source-only Next and full-screen Program with both owned keyer sets', () => {
			const old = dskState()
			if (!old.mixer?.composition) throw new Error('Missing fixture composition')
			old.mixer.previewComposition = old.mixer.composition
			const next = dskState()
			const commands = diffM2LXStates(old, next)
			expect(commands.some((entry) => entry.command.command === 'transition')).toBe(false)
			expect(
				commands.filter((entry) => entry.command.command === 'set_key_property').map((entry) => entry.command.args)
			).toEqual([
				{ key_index: 0, key_type: 'upstream', target: 'preview', property: { name: 'visible', value: false } },
				{ key_index: 0, key_type: 'downstream', target: 'preview', property: { name: 'opacity', value: 1 } },
				{ key_index: 0, key_type: 'downstream', target: 'preview', property: { name: 'visible', value: false } },
			])
			const cleanup = diffM2LXStates(old, dskState(false))
			const take = cleanup.find((entry) => entry.command.command === 'transition')!
			const current = dskPrepared()
			current.keyers.program[0].visible = false
			expect(take.isComplete(current)).toBe(true)
			current.downstreamKeyers!.program = {}
			expect(take.isComplete(current)).toBe(true)
		})

		test.each(['program', 'preview'] as const)('rejects independent owned DSK intents on %s', (bus) => {
			const next = dskState()
			next.keyers[keyerStateId(bus, 0, true)] = {
				index: 0,
				keyerType: 'dsk',
				bus,
				visible: false,
				timelineObjId: 'independent',
			}
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow('DSK 0 cannot also')
		})

		test.each([
			{ dsk: { 2: pip }, error: 'Invalid M2L-X composition DSK' },
			{ dsk: { '01': pip }, error: 'Invalid M2L-X composition DSK' },
			{ dsk: [], error: 'DSK index table' },
			{ dsk: { 0: { visible: true } }, error: 'require a video source' },
			{ dsk: { 0: { ...pip, source: { type: 'image', name: 'logo' } } }, error: 'require a video source' },
			{ dsk: { 0: { ...pip, opacity: 0.5 } }, error: 'Unsupported M2L-X composition DSK' },
			{ dsk: { 0: { ...pip, rotation: 2 } }, error: 'Unsupported M2L-X composition DSK' },
			{ dsk: { 0: { ...pip, scale: { x: 1, y: 1, opacity: 0 } } }, error: 'Unsupported M2L-X composition DSK' },
			{ dsk: { 0: { ...pip, crop: { x: 0, y: 0, width: 2, height: 1 } } }, error: 'crop' },
			{ dsk: { 0: { visible: false, source: pip.source } }, error: 'Unsupported M2L-X composition DSK' },
		])('rejects malformed DSK composition: $error', ({ dsk, error }) => {
			const next = compositionState()
			Object.assign(next.mixer!.composition!, { dsk })
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow(error)
		})

		test('rejects changed ownership, mismatched Next ownership and unsupported composition fields', () => {
			expect(() => diffM2LXStates(dskState(), compositionState())).toThrow('Keep all owned')
			expect(() => diffM2LXStates(compositionState(), dskState())).toThrow('Keep all owned')
			const next = dskState()
			next.mixer!.previewComposition = { pip: { 0: pip }, dsk: { 1: pip } }
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow('same explicitly owned')
			delete next.mixer!.previewComposition
			Object.assign(next.mixer!.composition!, { watermark: {} })
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow('composition fields')
		})

		test.each(['rotation', 'border', 'shape', 'chroma_key', 'watermark'])(
			'does not copy or rewrite independent DSK %s during a native video Take',
			(property) => {
				const take = diffM2LXStates(state('cam1'), dskState()).find((entry) => entry.command.command === 'transition')!
				const current = dskPrepared()
				const mixer = current.nodes!.mixer as { preview: { downstream_keys: { key: Record<string, unknown> }[] } }
				mixer.preview.downstream_keys[0].key[property] = { changed: true }
				expect(() => take.checkState?.(current, current)).not.toThrow()
				delete mixer.preview.downstream_keys[0].key[property]
				mixer.preview.downstream_keys[0].key.rotation = 0
				mixer.preview.downstream_keys[1].key.visible = false
				expect(() => take.checkState?.(current, current)).not.toThrow()
			}
		)

		test.each(['program', 'preview'] as const)(
			'requires parsed DSK and animation status before commanding %s',
			(bus) => {
				const next = dskState(false)
				next.mixer!.previewComposition = next.mixer!.composition
				const command = diffM2LXStates(state('cam1'), next).find(
					(entry) =>
						entry.command.command === 'set_key_property' &&
						entry.command.args.key_type === 'downstream' &&
						entry.command.args.target === bus
				)!
				const current = dskPrepared()
				current.keyers.preview[0].visible = false
				current.downstreamKeyers![bus][0].visible = false
				delete current.downstreamKeyers![bus][0]
				expect(() => command.waitFor?.(current)).toThrow('native DSK')
				current.downstreamKeyers![bus][0] = { visible: false }
				current.nodes = undefined
				expect(() => command.waitFor?.(current)).toThrow('key-animation status')
			}
		)

		test('checks native auto-play for controlled DSK video players', () => {
			const next = dskState()
			next.mixer!.composition!.pip[0] = { visible: false }
			next.players = { cam2: { timelineObjId: 'graphics-player' } }
			const commands = diffM2LXStates(state('cam1'), next)
			const current = dskPrepared()
			expect(() => commands[0].checkState?.(current, current)).toThrow('Disable native')
			current.keyers.preview[0].visible = false
			const take = commands.find((entry) => entry.command.command === 'transition')!
			expect(() => take.checkState?.(current, current)).toThrow('Disable native')
		})

		test.each(['cut', 'effect'] as const)('stages all PiP properties before same-background %s Take', (transition) => {
			const next = compositionState()
			if (next.mixer) next.mixer.transition = transition
			const commands = diffM2LXStates(state('cam1', 'cam3'), next)
			const takeIndex = commands.findIndex((entry) => entry.command.command === 'transition')
			expect(takeIndex).toBe(7)
			expect(commands.slice(0, takeIndex).map((entry) => entry.command.args)).toEqual([
				{ key_index: 0, key_type: 'upstream', target: 'preview', property: { name: 'visible', value: false } },
				{ key_index: 0, key_type: 'upstream', target: 'preview', property: { name: 'video', value: 'cam2' } },
				{
					key_index: 0,
					key_type: 'upstream',
					target: 'preview',
					property: { name: 'translation', value: pip.translation },
				},
				{ key_index: 0, key_type: 'upstream', target: 'preview', property: { name: 'scale', value: pip.scale } },
				{ key_index: 0, key_type: 'upstream', target: 'preview', property: { name: 'crop', value: pip.crop } },
				{ key_index: 0, key_type: 'upstream', target: 'preview', property: { name: 'visible', value: true } },
				{ input_type: 'preview', property: { name: 'video', value: 'cam1' } },
			])
			expect(commands[takeIndex].command.args).toEqual({ effect_enabled: transition === 'effect' })
			const initial = prepared()
			const take = commands[takeIndex]
			expect(() => take.checkState?.(initial, initial)).not.toThrow()
			expect(take.isRedundant?.(initial)).toBe(false)
			expect(take.isComplete(initial)).toBe(false)
			const running = { ...initial, transition: { running: true, progress: 0.5 } }
			expect(take.isComplete(running)).toBe(false)
			const done = { ...initial, keyers: { ...initial.keyers, program: initial.keyers.preview } }
			expect(take.isComplete(done)).toBe(true)
			expect(take.isRedundant?.(done)).toBe(true)
			expect(commands[takeIndex + 1].command.args).toEqual({
				input_type: 'preview',
				property: { name: 'video', value: 'cam3' },
			})
		})

		test('takes changed layout and hidden cleanup, but does not replay unchanged layout', () => {
			const old = compositionState()
			expect(diffM2LXStates(old, compositionState())).toEqual([])
			const changed = compositionState()
			if (changed.mixer?.composition) {
				changed.mixer.composition.pip[0] = { ...pip, scale: { x: 0.35, y: 0.35 } }
			}
			expect(diffM2LXStates(old, changed).some((entry) => entry.command.command === 'transition')).toBe(true)
			const cleanup = diffM2LXStates(old, compositionState(false))
			expect(cleanup.map((entry) => entry.command.command)).toEqual([
				'set_key_property',
				'set_input_property',
				'transition',
				'set_input_property',
			])
			const cleared = observed({ program: 'cam1', keyers: { program: { 0: { visible: false } }, preview: {} } })
			expect(cleanup[2].isComplete(cleared)).toBe(true)
			expect(() => diffM2LXStates(old, state('cam2'))).toThrow('Keep all owned')
			expect(diffM2LXStates(old, { keyers: {} })).toEqual([])
		})

		test('prepares only Preview when Next changes and rejects unowned Preview boxes', () => {
			const old = compositionState(false)
			const next = compositionState(false)
			if (!next.mixer) throw new Error('Missing fixture mixer')
			next.mixer.previewComposition = { pip: { 0: pip } }
			const commands = diffM2LXStates(old, next)
			expect(commands.length).toBeGreaterThan(0)
			expect(
				commands.every((entry) => {
					const command = entry.command
					return command.command === 'set_key_property'
						? command.args.target === 'preview'
						: command.command === 'set_input_property' && command.args.input_type === 'preview'
				})
			).toBe(true)
			next.mixer.previewComposition = { pip: { 1: pip } }
			expect(() => diffM2LXStates(old, next)).toThrow('same explicitly owned Program PiPs')
			next.mixer.previewComposition = { pip: { 0: pip } }
			next.mixer.composition = undefined
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow('same explicitly owned Program PiPs')
		})

		test.each(['cut', 'effect'] as const)('does not prepare a new Next during a running %s Take', (transition) => {
			const next = compositionState()
			if (!next.mixer) throw new Error('Missing fixture mixer')
			next.mixer.transition = transition
			next.mixer.previewComposition = { pip: { 0: { visible: false } } }
			const commands = diffM2LXStates(state('cam1'), next)
			const takeIndex = commands.findIndex((entry) => entry.command.command === 'transition')
			const running = { ...prepared(), transition: { running: true, progress: 0.5 } }
			expect(commands[takeIndex].isComplete(running)).toBe(false)
			const nextPreparation = commands.slice(takeIndex + 1)
			expect(nextPreparation.length).toBeGreaterThan(0)
			expect(nextPreparation.every((entry) => entry.waitFor?.(running) === false)).toBe(true)
		})

		test('refuses competing keyer control and missing Program', () => {
			const next = compositionState()
			next.keyers['preview/0'] = { index: 0, keyerType: 'pip', bus: 'preview', visible: false, timelineObjId: '' }
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow('KEYER mapping')
			next.keyers = {}
			if (next.mixer) next.mixer.program = undefined
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow('explicit Program')
		})

		test.each([
			{ values: { 4: pip }, error: 'Invalid M2L-X composition PiP' },
			{ values: { 0: { visible: true } }, error: 'require a video source' },
			{ values: { 0: { ...pip, translation: { x: 1 } } }, error: 'translation.y must be finite' },
			{ values: { 0: { ...pip, scale: { x: 0, y: 1 } } }, error: 'scale must be greater than zero' },
			{ values: { 0: { ...pip, rotation: 1 } }, error: 'Unsupported M2L-X composition PiP' },
		])('rejects invalid native composition input: $error', ({ values, error }) => {
			const next = compositionState()
			if (next.mixer?.composition) Object.assign(next.mixer.composition.pip, values)
			expect(() => diffM2LXStates(state('cam1'), next)).toThrow(error)
		})

		test('refuses incomplete preparation and unspecified PiP changes without coupling independent DSKs', () => {
			const take = diffM2LXStates(state('cam1'), compositionState()).find(
				(entry) => entry.command.command === 'transition'
			)
			const check = (current: M2LXObservedState) => take?.checkState?.(current, current)
			const incomplete = prepared()
			incomplete.keyers.preview[0].scale = { x: 1, y: 1 }
			expect(() => check(incomplete)).toThrow('Preview composition is not ready')
			const missing = prepared()
			missing.nodes = undefined
			expect(() => check(missing)).toThrow('complete native mixer/keyer status')
			const stateWithRaw = (programKey: Record<string, unknown>, previewKey: Record<string, unknown>) => ({
				...prepared(),
				nodes: {
					mixer: {
						program: { upstream_keys: [{ key: programKey }], downstream_keys: [] },
						preview: { upstream_keys: [{ key: previewKey }], downstream_keys: [] },
					},
				},
			})
			expect(() => check(stateWithRaw({ opacity: 1 }, { opacity: 0 }))).toThrow('unowned keyers')
			expect(() => check(stateWithRaw({ rotation: 0 }, { rotation: 1 }))).toThrow('unowned keyers')
			const deltaRepresentation = {
				...prepared(),
				nodes: {
					mixer: {
						program: { upstream_keys: [{ key: { opacity: 1 } }], downstream_keys: [{ key: { visible: false } }] },
						preview: {
							upstream_keys: { 0: { key: { opacity: 1 } } },
							downstream_keys: { 0: { key: { visible: false } } },
						},
					},
				},
			}
			expect(() => check(deltaRepresentation)).not.toThrow()
			const unowned = prepared()
			const mixer = unowned.nodes?.mixer as { preview: { downstream_keys: unknown[] } }
			mixer.preview.downstream_keys = []
			expect(() => check(unowned)).not.toThrow()
		})

		test.each(['cut', 'effect'] as const)('checks native auto-play for controlled PiP players on %s', (transition) => {
			const next = compositionState()
			if (next.mixer) next.mixer.transition = transition
			next.players = { cam2: { timelineObjId: 'controlled-player' } }
			const take = diffM2LXStates(state('cam1'), next).find((entry) => entry.command.command === 'transition')
			const current = prepared()
			expect(() => take?.checkState?.(current, current)).toThrow('Disable native')
			current.transition = {
				running: false,
				progress: 1,
				effect: { name: 'crossfade', duration: 1, autoPlayEnabled: false },
			}
			expect(() => take?.checkState?.(current, current)).not.toThrow()
		})
	})

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
		const commands = diffM2LXStates({ keyers: {} }, state('cam3', undefined, 'effect'))
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
			{ keyers: {} },
			{
				keyers: keyers(
					{ index: 4, visible: true, keyerType: 'still', bus: 'program', timelineObjId: 'still' },
					{ index: 1, visible: false, keyerType: 'pip', bus: 'preview', timelineObjId: 'pip' },
					{ index: 1, visible: true, keyerType: 'pip', bus: 'program', timelineObjId: 'pip-pgm' }
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
			{ keyers: {} },
			{ keyers: keyers({ index: 0, visible: true, keyerType: 'pip', bus: 'preview', timelineObjId: 'pip' }) }
		)

		expect(command.isComplete(observed({ keyers: { program: { 0: { visible: true } }, preview: {} } }))).toBe(false)
		expect(command.isComplete(observed({ keyers: { program: {}, preview: { 0: { visible: true } } } }))).toBe(true)
		expect(command.waitFor?.(observed({ transition: { running: true, progress: 0.5 } }))).toBe(false)
		expect(command.waitFor?.(observed({ transition: { running: false, progress: 1 } }))).toBe(true)
	})

	test('does not resend unchanged keyers', () => {
		const key: M2LXKeyerState = { index: 2, visible: true, keyerType: 'pip', bus: 'program', timelineObjId: 'a' }
		expect(diffM2LXStates({ keyers: keyers(key) }, { keyers: keyers({ ...key, timelineObjId: 'b' }) })).toEqual([])
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
			{ keyers: {} },
			{
				keyers: {},
				players: { vtr3: { assetId: 'new.mp4', timelineObjId: 'clip' } },
			}
		)
		expect(selected.map((c) => c.command.command)).toEqual(['pause', 'load', 'set_loop_enabled', 'pause'])
		expect(selected[2].command.args).toBe(false)
		const unloaded = diffM2LXStates(
			{
				keyers: {},
				players: { vtr3: { assetId: 'old.mp4', timelineObjId: 'old' } },
			},
			{ keyers: {}, players: { vtr3: { assetId: null, timelineObjId: 'empty' } } }
		)
		expect(unloaded.map((c) => c.command)).toEqual([
			{ command: 'pause', node: 'vtr3' },
			{ command: 'unload', node: 'vtr3' },
		])
		expect(unloaded[1].isComplete(observed({ players: { vtr3: { loaded: false } } }))).toBe(true)
		expect(() =>
			diffM2LXStates(
				{ keyers: {} },
				{ keyers: {}, players: { vtr3: { assetId: null, playing: true, timelineObjId: 'invalid' } } }
			)
		).toThrow(/unloaded/)
	})

	test('an explicit pause is already complete for unloaded players, regardless of stale playback flags', () => {
		const commands = diffM2LXStates(
			{ keyers: {} },
			{ keyers: {}, players: { vtr3: { playing: false, timelineObjId: 'stop' } } }
		)
		expect(commands).toHaveLength(1)
		for (const playing of [true, false, undefined]) {
			expect(commands[0].isComplete(observed({ players: { vtr3: { loaded: false, playing } } }))).toBe(true)
		}
		expect(commands[0].isComplete(observed({ players: { vtr3: { loaded: true, playing: true } } }))).toBe(false)
		expect(commands[0].isComplete(observed({ players: { vtr3: { loaded: true, playing: false } } }))).toBe(true)
		expect(commands[0].isComplete(observed({}))).toBe(false)
	})

	test('resends an explicit seek on a new instance but does not chase playback time', () => {
		const player = { seek: 10, playing: true, timelineObjId: 'clip', instanceStart: 1000 }
		const old: M2LXState = { keyers: {}, players: { vtr3: player } }
		expect(diffM2LXStates(old, old)).toEqual([])
		const next = { keyers: {}, players: { vtr3: { ...player, instanceStart: 2000 } } }
		expect(diffM2LXStates(old, next).map((c) => c.command.command)).toEqual(['pause', 'seek', 'play'])
	})

	test('surfaces native load errors after a 200 reply without blocking replacement of an old failed asset', () => {
		const commands = diffM2LXStates(
			{ keyers: {} },
			{ keyers: {}, players: { vtr3: { assetId: 'new.mp4', timelineObjId: 'clip' } } }
		)
		const load = commands.find((c) => c.command.command === 'load')!
		const clean = observed({ players: { vtr3: { loaded: false } } })
		const failed = observed({
			players: { vtr3: { loaded: false, error: { code: 'missing', message: 'Asset missing', severity: 'error' } } },
		})
		expect(() => load.checkState?.(failed, clean)).toThrow(/Asset missing/)
		expect(() => load.checkState?.(failed, failed)).not.toThrow()
	})

	test('waits for the bound DSK animation, not another key or the main video transition', () => {
		const key: M2LXKeyerState = { index: 0, keyerType: 'dsk', bus: 'preview', visible: true, timelineObjId: 'dsk' }
		const commands = diffM2LXStates({ keyers: {} }, { keyers: { 'preview/dsk/0': key } })
		const progress = { running: false, value: 1 }
		const animation = (index: number, target: string, running: boolean) => ({
			key_type: 'downstream',
			key_index: index,
			target,
			animations: { fade: { progress: { running, value: 0.5 } } },
		})
		const bound = animation(0, 'preview', false)
		bound.animations.fade.progress = progress
		const current = observed({
			downstreamKeyers: { program: {}, preview: { 0: { visible: true, opacity: 1 } } },
			transition: { running: true, progress: 0.5 },
			nodes: {
				mixer: {
					animations: {
						keys: {
							19: bound,
							0: animation(1, 'preview', true),
							7: animation(0, 'program', true),
						},
					},
				},
			},
		})
		for (const command of commands) {
			expect(command.waitFor?.(current)).toBe(true)
			expect(command.isComplete(current)).toBe(true)
			progress.running = true
			expect(command.waitFor?.(current)).toBe(false)
			expect(command.isComplete(current)).toBe(false)
			progress.running = false
		}
		current.nodes = undefined
		expect(() => commands[0].waitFor?.(current)).toThrow('key-animation status')
		current.nodes = {
			mixer: {
				animations: {
					keys: {
						19: {
							...bound,
							animations: { fade: { progress: { value: 1 } } },
						},
					},
				},
			},
		}
		expect(() => commands[0].waitFor?.(current)).toThrow('key-animation running status')
	})

	test('hides before replacing/clearing sources, configures geometry before showing and distinguishes DSKs', () => {
		const next: M2LXState = {
			keyers: {
				'preview/dsk/0': {
					index: 0,
					keyerType: 'dsk',
					bus: 'preview',
					visible: true,
					source: { type: 'image', name: 'still/demo.png' },
					translation: { x: -800, y: -400 },
					timelineObjId: 'graphic',
				},
			},
		}
		const commands = diffM2LXStates({ keyers: {} }, next)
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
			keyers: {
				'preview/dsk/0': { ...next.keyers['preview/dsk/0'], visible: false, source: { type: 'image', name: '' } },
			},
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
			keyers: { 'preview/dsk/0': { ...next.keyers['preview/dsk/0'], source: { type: 'image' as const, name: '' } } },
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

	test.each(['cut', 'crossfade', 'wipe_down', 'wipe_up', 'wipe_right', 'wipe_left', 'wipe_up_right', 'wipe_down_left'])(
		'configures the supported native effect %s',
		(name) => {
			const next: M2LXState = { keyers: {}, mixer: { timelineObjId: 'effect', effect: { name } } }
			const commands = diffM2LXStates({ keyers: {} }, next)
			expect(commands.map((command) => command.command)).toEqual([
				{ command: 'configure_effect', node: 'mixer', args: { name } },
			])
		}
	)

	test.each(['mix', 'unknown_effect', ''])('rejects the unsupported requested effect name %p', (name) => {
		const next: M2LXState = { keyers: {}, mixer: { timelineObjId: 'effect', effect: { name } } }
		expect(() => diffM2LXStates({ keyers: {} }, next)).toThrow('Unsupported M2L-X effect name')
		expect(() => diffM2LXStates(next, next)).toThrow('Unsupported M2L-X effect name')
	})

	test('omitting the name preserves an unknown observed effect while changing its duration', () => {
		const old: M2LXState = {
			keyers: {},
			mixer: { timelineObjId: 'effect', effect: { name: 'future_effect', duration: 1 } },
		}
		const next: M2LXState = { keyers: {}, mixer: { timelineObjId: 'effect', effect: { duration: 2 } } }
		const commands = diffM2LXStates(old, next)
		expect(commands.map((command) => command.command)).toEqual([
			{ command: 'configure_effect', node: 'mixer', args: { duration: '2.0s' } },
		])
		expect(
			commands[0].isComplete(
				observed({
					transition: { running: false, progress: 1, effect: { name: 'future_effect', duration: 2 } },
				})
			)
		).toBe(true)
	})

	test('mutes before preparing media, unmutes after and never changes master or unmapped routes', () => {
		const next: M2LXState = {
			keyers: {},
			audio: { input: { node: 'audio_mixer', input: 'vtr3.1', muted: false, volume: 0.5, timelineObjId: 'audio' } },
			players: { vtr3: { assetId: 'new.mp4', timelineObjId: 'clip' } },
			routers: { route: { node: 'router', input: 'ndi2', output: 'ch1', timelineObjId: 'router' } },
		}
		const commands = diffM2LXStates({ keyers: {} }, next)
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
		expect(diffM2LXStates({ keyers: {} }, muted)[0].command.command).toBe('set_input_muted')
		expect(diffM2LXStates(next, { keyers: {} })).toEqual([])
	})
})

function observed(partial: Partial<M2LXObservedState>): M2LXObservedState {
	return { ...createEmptyObservedState(), ...partial }
}

function keyers(...list: M2LXKeyerState[]): M2LXState['keyers'] {
	const result: M2LXState['keyers'] = {}
	for (const key of list) result[keyerStateId(key.bus, key.index)] = key
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
		keyers: {},
	}
}
