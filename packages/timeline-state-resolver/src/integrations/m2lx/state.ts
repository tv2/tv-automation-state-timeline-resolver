import type { M2LXSendOptions } from './connection'
import { M2LXAudio, M2LXEffect, M2LXKeyVisibility, M2LXMediaPlayer } from 'timeline-state-resolver-types'
import {
	assertFinite,
	createSetInputCommand,
	createSetKeyCommand,
	createSetKeyPropertyCommand,
	createTransitionCommand,
	matchesM2LXValue,
	M2LXCommand,
	M2LXKeyProperty,
	M2LXObservedKey,
	M2LXObservedState,
} from './protocol'

export interface M2LXKeyState extends M2LXKeyVisibility {
	index: number
	visible: boolean
	keyType: 'pip' | 'still' | 'dsk'
	bus: 'program' | 'preview'
	timelineObjId: string
}

export interface M2LXState {
	mixer?: {
		program?: string
		preview?: string
		transition?: 'cut' | 'effect'
		effect?: M2LXEffect
		timelineObjId: string
	}
	/** Keyed by `${bus}/${index}`, see {@link keyStateId}. */
	keys: Record<string, M2LXKeyState>
	audio?: Record<string, M2LXAudio & { node: string; input: string; timelineObjId: string }>
	players?: Record<string, M2LXMediaPlayer & { timelineObjId: string; instanceStart?: number }>
	routers?: Record<string, { node: string; output: string; input: string; timelineObjId: string }>
}

export function keyStateId(bus: 'program' | 'preview', index: number, downstream = false): string {
	return `${bus}/${downstream ? 'dsk/' : ''}${index}`
}

export function resourceStateId(node: string, input: string): string {
	return JSON.stringify([node, input])
}

export function observedKey(state: M2LXObservedState, key: M2LXKeyState): M2LXObservedKey | undefined {
	return key.keyType === 'dsk' ? state.downstreamKeys?.[key.bus][key.index] : state.keys[key.bus][key.index]
}

export interface M2LXCommandWithContext extends M2LXSendOptions {
	command: M2LXCommand
	context: string
	timelineObjId: string
}

const noTransitionRunning = (state: M2LXObservedState): boolean => state.transition?.running !== true

export function assertNativeTransitionAutoPlayDisabled(state: M2LXObservedState): void {
	if (state.transition?.effect?.autoPlayEnabled !== false) {
		throw new Error(
			'Disable native M2L-X transition auto-play before using effects with timeline-controlled media players'
		)
	}
}

export function diffM2LXStates(oldState: M2LXState, newState: M2LXState): M2LXCommandWithContext[] {
	const commands: M2LXCommandWithContext[] = []
	const unmute: M2LXCommandWithContext[] = []
	for (const [id, audio] of Object.entries(newState.audio ?? {})) {
		const old = oldState.audio?.[id]
		if (audio.volume !== undefined && audio.volume !== old?.volume) {
			assertFinite(audio.volume, 'input volume')
			if (audio.volume < 0 || audio.volume > 1) throw new Error('M2L-X basic input volume must be between 0 and 1')
			commands.push({
				command: { command: 'set_input_volume', node: audio.node, args: [{ name: audio.input, volume: audio.volume }] },
				context: `set ${audio.node}/${audio.input} volume to ${audio.volume}`,
				timelineObjId: audio.timelineObjId,
				isComplete: (state) => matchesM2LXValue(state.audio?.[audio.node]?.[audio.input]?.volume, audio.volume),
			})
		}
		if (audio.muted !== undefined && audio.muted !== old?.muted) {
			const command: M2LXCommandWithContext = {
				command: { command: 'set_input_muted', node: audio.node, args: [{ name: audio.input, muted: audio.muted }] },
				context: `set ${audio.node}/${audio.input} mute to ${audio.muted}`,
				timelineObjId: audio.timelineObjId,
				isComplete: (state) => state.audio?.[audio.node]?.[audio.input]?.muted === audio.muted,
			}
			if (audio.muted) commands.unshift(command)
			else unmute.push(command)
		}
	}
	for (const [node, player] of Object.entries(newState.players ?? {})) {
		diffPlayer(commands, node, oldState.players?.[node], player)
	}
	commands.push(...unmute)
	for (const [id, router] of Object.entries(newState.routers ?? {})) {
		if (router.input === oldState.routers?.[id]?.input) continue
		commands.push({
			command: { command: 'connect', node: router.node, args: { input: router.input, output: router.output } },
			context: `route ${router.input} to ${router.node}/${router.output}`,
			timelineObjId: router.timelineObjId,
			isComplete: (state) => state.routers?.[router.node]?.[router.output] === router.input,
		})
	}
	const oldMixer = oldState.mixer
	const newMixer = newState.mixer

	if (newMixer) {
		if (newMixer.effect && !matchesM2LXValue(oldMixer?.effect, newMixer.effect)) {
			const effect = newMixer.effect
			if (effect.duration !== undefined) {
				assertFinite(effect.duration, 'effect duration')
				if (effect.duration <= 0) throw new Error('M2L-X effect duration must be greater than zero')
			}
			if (effect.name !== undefined && !effect.name) throw new Error('M2L-X effect name must not be empty')
			if (effect.args?.fade !== undefined) {
				assertFinite(effect.args.fade, 'effect fade')
				if (effect.args.fade < 0 || effect.args.fade > 1) throw new Error('M2L-X effect fade must be between 0 and 1')
			}
			commands.push({
				command: {
					command: 'configure_effect',
					node: 'mixer',
					args: {
						...(effect.name === undefined ? {} : { name: effect.name }),
						...(effect.duration === undefined
							? {}
							: { duration: `${effect.duration}${Number.isInteger(effect.duration) ? '.0' : ''}s` }),
						...(effect.args === undefined ? {} : { args: effect.args }),
					},
				},
				context: 'configure transition effect',
				timelineObjId: newMixer.timelineObjId,
				waitFor: noTransitionRunning,
				isComplete: (state) => matchesM2LXValue(state.transition?.effect, effect),
			})
		}
		const target = newMixer.program
		const programChanged = target !== undefined && target !== oldMixer?.program
		const useEffect = programChanged && newMixer.transition === 'effect' && oldMixer?.program !== undefined
		if (target !== undefined && target !== oldMixer?.program) {
			if (useEffect) {
				commands.push(setInput('preview', target, newMixer.timelineObjId, !!newState.players?.[target]))
				commands.push({
					command: createTransitionCommand(true),
					context: `transition program to ${target} with the device effect`,
					timelineObjId: newMixer.timelineObjId,
					waitFor: noTransitionRunning,
					// The effect only updates program at its end; treat a started transition as accepted.
					isComplete: (state) => state.program === target || state.transition?.running === true,
					isRedundant: (state) => state.program === target,
					checkState: newState.players?.[target] ? assertNativeTransitionAutoPlayDisabled : undefined,
				})
			} else {
				commands.push(setInput('program', target, newMixer.timelineObjId, !!newState.players?.[target]))
			}
		}

		if (
			newMixer.preview !== undefined &&
			(newMixer.preview !== oldMixer?.preview || useEffect) &&
			!(useEffect && newMixer.preview === newMixer.program)
		) {
			const restore = setInput(
				'preview',
				newMixer.preview,
				newMixer.timelineObjId,
				!!newState.players?.[newMixer.preview]
			)
			// The effect takes whatever is on preview when it ends, so preview must not change until program has landed
			if (useEffect) restore.waitFor = (state) => noTransitionRunning(state) && state.program === target
			commands.push(restore)
		}
	}

	// On-air (program) keys first, then preview, each in index order
	const busOrder = { program: 0, preview: 1 }
	const sortedKeys = Object.values(newState.keys).sort(
		(a, b) =>
			busOrder[a.bus] - busOrder[b.bus] ||
			Number(a.keyType === 'dsk') - Number(b.keyType === 'dsk') ||
			a.index - b.index
	)
	for (const newKey of sortedKeys) {
		const oldKey = oldState.keys[keyStateId(newKey.bus, newKey.index, newKey.keyType === 'dsk')]
		const sourceChanged = newKey.source !== undefined && !matchesM2LXValue(oldKey?.source, newKey.source)
		if (
			newKey.source &&
			((newKey.keyType === 'pip' && newKey.source.type !== 'video') ||
				(newKey.keyType === 'still' && newKey.source.type !== 'image'))
		) {
			throw new Error('M2L-X PiP keys accept video sources; still keys accept image sources')
		}
		if (newKey.source?.name === '' && newKey.visible) throw new Error('A visible M2L-X key cannot have an empty source')
		const keyCommand = (property: M2LXKeyProperty): M2LXCommandWithContext => ({
			command: createSetKeyPropertyCommand(newKey.index, newKey.keyType, newKey.bus, property),
			context: `set ${newKey.keyType} key ${newKey.index} ${property.name} on ${newKey.bus}`,
			timelineObjId: newKey.timelineObjId,
			waitFor: noTransitionRunning,
			isComplete: (state) => {
				const key = observedKey(state, newKey)
				if (property.name === 'video' || property.name === 'image') {
					return key?.source === property.value && (property.value === '' || key.sourceType === property.name)
				}
				return matchesM2LXValue(key?.[property.name], property.value)
			},
		})
		const resetDskOpacity = () => {
			// GUI visibility toggles reset opacity: a completed fade-out can leave it at zero.
			if (newKey.keyType === 'dsk') commands.push(keyCommand({ name: 'opacity', value: 1 }))
		}
		if (sourceChanged) {
			resetDskOpacity()
			commands.push(keyCommand({ name: 'visible', value: false }))
		}
		if (sourceChanged && newKey.source) {
			if (newKey.keyType === 'dsk') {
				const opposite = newKey.source.type === 'image' ? 'video' : 'image'
				const clear = keyCommand({ name: opposite, value: '' })
				clear.isRedundant = () => false
				clear.isComplete = (state) => {
					const key = observedKey(state, newKey)
					return key?.source === '' || (key?.sourceType !== undefined && key.sourceType !== opposite)
				}
				commands.push(clear)
			}
			const source = keyCommand({ name: newKey.source.type, value: newKey.source.name })
			if (newKey.source.name === '') source.isRedundant = () => false
			commands.push(source)
		}
		for (const name of ['translation', 'scale', 'rotation', 'crop', 'border'] as const) {
			const value = newKey[name]
			if (value === undefined || matchesM2LXValue(oldKey?.[name], value)) continue
			// Explicit branches preserve the property/value discriminant.
			if (name === 'rotation' && newKey.rotation !== undefined)
				commands.push(keyCommand({ name, value: newKey.rotation }))
			else if (name === 'crop' && newKey.crop) commands.push(keyCommand({ name, value: newKey.crop }))
			else if (name === 'border' && newKey.border) commands.push(keyCommand({ name, value: newKey.border }))
			else if ((name === 'translation' || name === 'scale') && newKey[name]) {
				const vector = newKey[name]
				if (vector) commands.push(keyCommand({ name, value: vector }))
			}
		}
		if (sourceChanged || !oldKey || oldKey.visible !== newKey.visible || oldKey.keyType !== newKey.keyType) {
			const index = newKey.index
			resetDskOpacity()
			commands.push({
				command: createSetKeyCommand(index, newKey.keyType, newKey.visible, newKey.bus),
				context: `set ${newKey.keyType} key ${index} visibility to ${newKey.visible} on ${newKey.bus}`,
				timelineObjId: newKey.timelineObjId,
				waitFor: newKey.bus === 'preview' ? noTransitionRunning : undefined,
				isComplete: (state) => observedKey(state, newKey)?.visible === newKey.visible,
			})
		}
	}

	return commands
}

function setInput(
	bus: 'program' | 'preview',
	source: string,
	timelineObjId: string,
	disableAutoPlay = false
): M2LXCommandWithContext {
	return {
		command: createSetInputCommand(bus, source, disableAutoPlay),
		context: `set ${bus} source to ${source}`,
		timelineObjId,
		waitFor: noTransitionRunning,
		isComplete: (state) => state[bus] === source,
	}
}

function diffPlayer(
	commands: M2LXCommandWithContext[],
	node: string,
	old: NonNullable<M2LXState['players']>[string] | undefined,
	player: NonNullable<M2LXState['players']>[string]
): void {
	if (player.assetId === '') throw new Error('M2L-X media asset ID must not be empty; use null to unload')
	if (player.seek !== undefined) {
		assertFinite(player.seek, 'seek time')
		if (player.seek < 0) throw new Error('M2L-X seek time must not be negative')
	}
	if (player.assetId === null && (player.playing || player.seek !== undefined || player.loop !== undefined)) {
		throw new Error('An unloaded M2L-X player cannot play, seek or configure looping')
	}
	const assetChanged = player.assetId !== undefined && player.assetId !== old?.assetId
	const seekChanged =
		player.seek !== undefined &&
		(assetChanged ||
			player.seek !== old?.seek ||
			player.timelineObjId !== old?.timelineObjId ||
			player.instanceStart !== old?.instanceStart)
	const preservePlaying = seekChanged && !assetChanged && player.playing === undefined
	let priorPlaying: boolean | undefined
	const add = (command: M2LXCommand, isComplete: M2LXSendOptions['isComplete']) => {
		commands.push({
			command,
			isComplete,
			context: `${command.command} media player ${node}`,
			timelineObjId: player.timelineObjId,
			waitFor: noTransitionRunning,
			checkState: (state, initial) => {
				const actual = state.players?.[node]
				const error = actual?.error
				if (!error || (!error.code && (!error.severity || error.severity === 'none'))) return
				if (command.command === 'unload') return
				if (command.command === 'pause' && actual?.loaded === false) return
				if (
					command.command === 'load' &&
					actual.assetId !== player.assetId &&
					matchesM2LXValue(error, initial.players?.[node]?.error)
				)
					return
				throw new Error(`M2L-X player ${node}: ${error.code} ${error.message} (${error.severity})`)
			},
		})
	}
	const pause = () => {
		add(
			{ command: 'pause', node },
			(state) => state.players?.[node]?.playing === false || state.players?.[node]?.loaded === false
		)
		if (preservePlaying) {
			const command = commands[commands.length - 1]
			command.isRedundant = (state) => {
				priorPlaying = state.players?.[node]?.playing
				if (priorPlaying === undefined) throw new Error(`Cannot determine M2L-X playback state for ${node}`)
				return command.isComplete(state)
			}
		}
	}
	if (assetChanged || seekChanged) pause()
	if (assetChanged) {
		if (player.assetId === null) {
			add({ command: 'unload', node }, (state) => state.players?.[node]?.loaded === false)
			return
		}
		if (typeof player.assetId === 'string') {
			add(
				{ command: 'load', node, args: { id: player.assetId } },
				(state) =>
					state.players?.[node]?.loaded === true &&
					state.players[node].assetId === player.assetId &&
					(state.players[node].duration ?? 0) > 0 &&
					(state.players[node].frameRate ?? 0) > 0
			)
		}
	}
	const loop = player.loop ?? (assetChanged ? false : undefined)
	if (loop !== undefined && (assetChanged || loop !== old?.loop)) {
		add({ command: 'set_loop_enabled', node, args: loop }, (state) => state.players?.[node]?.loop === loop)
	}
	if (seekChanged && player.seek !== undefined) {
		const time = player.seek
		add({ command: 'seek', node, args: { time } }, (state) => {
			const actual = state.players?.[node]
			return (
				actual?.time !== undefined &&
				Math.abs(actual.time - time) <= (actual.frameRate ? 1 / actual.frameRate : 0) + 1e-6
			)
		})
	}
	const playing = player.playing ?? (assetChanged ? false : undefined)
	if (preservePlaying) {
		add({ command: 'play', node }, (state) => state.players?.[node]?.playing === true)
		commands[commands.length - 1].isRedundant = (state) => {
			if (priorPlaying === undefined) throw new Error(`M2L-X seek playback state was not captured for ${node}`)
			return !priorPlaying || state.players?.[node]?.playing === true
		}
	} else if (playing !== undefined && (assetChanged || seekChanged || playing !== old?.playing)) {
		if (playing) add({ command: 'play', node }, (state) => state.players?.[node]?.playing === true)
		else pause()
	}
}
