import {
	M2LXAudio,
	M2LXBorder,
	M2LXCrop,
	M2LXEffect,
	M2LXKeyVisibility,
	M2LXVector,
} from 'timeline-state-resolver-types'

export type M2LXBus = 'program' | 'preview'

export interface M2LXObservedKey extends Omit<M2LXKeyVisibility, 'source'> {
	visible: boolean
	/** Fill source of the key. An empty string means the key is unconfigured and the device ignores visibility changes. */
	source?: string
	sourceType?: 'video' | 'image'
	opacity?: number
}

export interface M2LXObservedTransition {
	running: boolean
	/** T-bar position; effect transitions alternate direction (0→1, then 1→0), so only `running` is meaningful for completion. */
	progress: number
	/** The effect the device runs on `transition {effect_enabled: true}`. */
	effect?: {
		name: string
		/** Seconds. */
		duration: number
		args?: M2LXEffect['args']
		autoPlayEnabled?: boolean
	}
}

export interface M2LXObservedState {
	program?: string
	preview?: string
	keys: Record<M2LXBus, Record<number, M2LXObservedKey>>
	transition?: M2LXObservedTransition
	downstreamKeys?: Record<M2LXBus, Record<number, M2LXObservedKey>>
	audio?: Record<string, Record<string, M2LXAudio>>
	players?: Record<string, M2LXObservedPlayer>
	routers?: Record<string, Record<string, string>>
	/** Raw relevant-node state retained to merge leaf deltas and replace arrays correctly. */
	nodes?: Record<string, unknown>
}

export interface M2LXObservedPlayer {
	loaded: boolean
	/** Unloaded players may retain a stale native ID; normalized to undefined here. */
	assetId?: string
	duration?: number
	frameRate?: number
	playing?: boolean
	time?: number
	loop?: boolean
	error?: { code: string; message: string; severity: string }
}

export interface M2LXCapabilities {
	players: Set<string>
	audio: Record<string, { inputs: Set<string>; maximumVolume: number }>
	routers: Record<string, { inputs: Set<string>; outputs: Set<string> }>
}

export function createEmptyObservedState(): M2LXObservedState {
	return { keys: { program: {}, preview: {} } }
}

export interface M2LXSetInputCommand {
	command: 'set_input_property'
	node: 'mixer'
	args: {
		input_type: M2LXBus
		property: {
			name: 'video'
			value: string
		}
		options?: { apply_auto_play_transition_settings: false }
	}
}

export interface M2LXTransitionCommand {
	command: 'transition'
	node: 'mixer'
	args: {
		/** false = instant cut from preview; true = run the effect configured on the device. */
		effect_enabled: boolean
	}
}

export type M2LXKeyProperty =
	| { name: 'visible'; value: boolean }
	| { name: 'video' | 'image'; value: string }
	| { name: 'translation' | 'scale'; value: M2LXVector }
	| { name: 'rotation' | 'opacity'; value: number }
	| { name: 'crop'; value: M2LXCrop }
	| { name: 'border'; value: M2LXBorder }

export interface M2LXSetKeyCommand {
	command: 'set_key_property'
	node: 'mixer'
	args: {
		key_index: number
		key_type: 'upstream' | 'downstream'
		target: M2LXBus
		property: M2LXKeyProperty
	}
}

export type M2LXMediaCommand =
	| { command: 'load'; node: string; args: { id: string } }
	| { command: 'unload' | 'play' | 'pause'; node: string; args?: undefined }
	| { command: 'seek'; node: string; args: { time: number } }
	| { command: 'set_loop_enabled'; node: string; args: boolean }

export type M2LXAudioCommand =
	| { command: 'set_input_volume'; node: string; args: Array<{ name: string; volume: number }> }
	| { command: 'set_input_muted'; node: string; args: Array<{ name: string; muted: boolean }> }

export interface M2LXConfigureEffectCommand {
	command: 'configure_effect'
	node: 'mixer'
	args: { name?: string; duration?: string; args?: M2LXEffect['args'] }
}

export interface M2LXRouterCommand {
	command: 'connect'
	node: string
	args: { input: string; output: string }
}

export type M2LXCommand =
	| M2LXSetInputCommand
	| M2LXTransitionCommand
	| M2LXSetKeyCommand
	| M2LXMediaCommand
	| M2LXAudioCommand
	| M2LXConfigureEffectCommand
	| M2LXRouterCommand

export function createSetInputCommand(bus: M2LXBus, source: string, disableAutoPlay = false): M2LXSetInputCommand {
	return {
		command: 'set_input_property',
		node: 'mixer',
		args: {
			input_type: bus,
			property: {
				name: 'video',
				value: source,
			},
			...(disableAutoPlay ? { options: { apply_auto_play_transition_settings: false as const } } : {}),
		},
	}
}

export function createTransitionCommand(effectEnabled: boolean): M2LXTransitionCommand {
	return {
		command: 'transition',
		node: 'mixer',
		args: {
			effect_enabled: effectEnabled,
		},
	}
}

export function createSetKeyCommand(
	index: number,
	keyType: 'pip' | 'still' | 'dsk',
	visible: boolean,
	bus: M2LXBus = 'program'
): M2LXSetKeyCommand {
	return createSetKeyPropertyCommand(index, keyType, bus, { name: 'visible', value: visible })
}

export function createSetKeyPropertyCommand(
	index: number,
	keyType: 'pip' | 'still' | 'dsk',
	bus: M2LXBus,
	property: M2LXKeyProperty
): M2LXSetKeyCommand {
	if (!Number.isInteger(index) || index < 0 || index > (keyType === 'dsk' ? 1 : 7)) {
		throw new Error(`M2L-X key index is invalid for ${keyType}: ${index}`)
	}
	if ((keyType === 'pip' && index > 3) || (keyType === 'still' && index < 4)) {
		throw new Error(`M2L-X key index ${index} is not valid for key type ${keyType}`)
	}
	validateKeyProperty(property)
	return {
		command: 'set_key_property',
		node: 'mixer',
		args: {
			key_index: index,
			key_type: keyType === 'dsk' ? 'downstream' : 'upstream',
			target: bus,
			property,
		},
	}
}

function validateKeyProperty(property: M2LXKeyProperty): void {
	const value = property.value
	if (property.name === 'border') {
		if (!/^#[\da-f]{6}([\da-f]{2})?$/i.test(property.value.color)) throw new Error('Invalid M2L-X border color')
	}
	if (typeof value === 'number') assertFinite(value, property.name)
	if (property.name === 'opacity' && (property.value < 0 || property.value > 1)) {
		throw new Error('M2L-X opacity must be between 0 and 1')
	}
	if (typeof value === 'object') {
		for (const [name, field] of Object.entries(value)) {
			if (typeof field === 'number') assertFinite(field, `${property.name}.${name}`)
		}
	}
	if (property.name === 'scale' && (property.value.x <= 0 || property.value.y <= 0)) {
		throw new Error('M2L-X scale must be greater than zero')
	}
	if (property.name === 'crop') {
		const crop = property.value
		if (
			crop.x < 0 ||
			crop.y < 0 ||
			crop.width <= 0 ||
			crop.height <= 0 ||
			crop.x + crop.width > 1 + 1e-6 ||
			crop.y + crop.height > 1 + 1e-6
		) {
			throw new Error('M2L-X crop must lie within the normalized source rectangle')
		}
	}
}

export function assertFinite(value: number, name: string): void {
	if (!Number.isFinite(value)) throw new Error(`M2L-X ${name} must be finite`)
}

/** Compare native float32/color normalization without accepting materially different settings. */
export function matchesM2LXValue(actual: unknown, expected: unknown): boolean {
	if (typeof expected === 'number') {
		return (
			typeof actual === 'number' &&
			Number.isFinite(actual) &&
			Math.abs(actual - expected) <= Math.max(Number.EPSILON, 1e-6 * Math.abs(expected))
		)
	}
	if (typeof expected === 'string' && /^#[\da-f]{6}([\da-f]{2})?$/i.test(expected)) {
		const normalize = (color: string) => (color.length === 7 ? `${color}ff` : color).toLowerCase()
		return typeof actual === 'string' && normalize(actual) === normalize(expected)
	}
	if (isRecord(expected)) {
		const fields = Object.entries(expected).filter(([, value]) => value !== undefined)
		return !fields.length || (isRecord(actual) && fields.every(([key, value]) => matchesM2LXValue(actual[key], value)))
	}
	return actual === expected
}

export function extractCapabilities(configuration: unknown): M2LXCapabilities {
	const capabilities: M2LXCapabilities = {
		players: new Set(),
		audio: Object.create(null),
		routers: Object.create(null),
	}
	if (!isRecord(configuration) || !Array.isArray(configuration.nodes)) return capabilities
	for (const node of configuration.nodes) {
		if (!isRecord(node) || typeof node.name !== 'string') continue
		assertSafeKey(node.name)
		if (node.type === 'media_player') capabilities.players.add(node.name)
		if (!isRecord(node.config)) continue
		const names = (value: unknown): Set<string> =>
			new Set(Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [])
		if (node.type === 'audio_mixer' && typeof node.config.maximum_volume === 'number') {
			capabilities.audio[node.name] = {
				inputs: names(node.config.inputs),
				maximumVolume: node.config.maximum_volume,
			}
		} else if (node.type === 'video_router') {
			capabilities.routers[node.name] = { inputs: names(node.config.inputs), outputs: names(node.config.outputs) }
		}
	}
	return capabilities
}

export function extractAccessToken(response: unknown): string {
	if (!isRecord(response)) throw new Error('M2L-X sign-in returned an invalid response')

	const token = response.access_token
	if (typeof token !== 'string' || token.length === 0) {
		throw new Error('M2L-X sign-in response did not contain a non-empty access_token')
	}
	return token
}

export function extractTokenLifetime(response: unknown): number | undefined {
	if (!isRecord(response)) throw new Error('M2L-X sign-in returned an invalid response')
	const lifetime = response.expires_in
	if (lifetime === undefined) return undefined
	if (typeof lifetime !== 'number' || !Number.isFinite(lifetime) || lifetime <= 0) {
		throw new Error('M2L-X sign-in response contained an invalid expires_in')
	}
	return lifetime
}

/**
 * Returns the video source names accepted by the mixer.
 * The authoritative list is `nodes[type=video_mixer].config.sources`; a heuristic scan is used as fallback.
 */
export function extractConfiguredVideoSources(configuration: unknown): Set<string> {
	const mixerSources = extractMixerConfigSources(configuration)
	if (mixerSources.size > 0) return mixerSources

	const sources = new Set<string>()
	visitConfiguration(configuration, false, sources)
	if (sources.size === 0) {
		throw new Error('M2L-X switcher configuration did not contain any recognizable video sources')
	}
	return sources
}

function extractMixerConfigSources(configuration: unknown): Set<string> {
	const sources = new Set<string>()
	if (!isRecord(configuration) || !Array.isArray(configuration.nodes)) return sources
	for (const node of configuration.nodes) {
		if (!isRecord(node) || node.type !== 'video_mixer' || !isRecord(node.config)) continue
		if (!Array.isArray(node.config.sources)) continue
		for (const source of node.config.sources) {
			if (typeof source === 'string' && source.length > 0) sources.add(source)
		}
	}
	return sources
}

function visitConfiguration(value: unknown, inVideoCollection: boolean, sources: Set<string>): void {
	if (typeof value === 'string') {
		if (inVideoCollection && isM2LXVideoSourceName(value)) sources.add(value)
		return
	}
	if (Array.isArray(value)) {
		for (const item of value) visitConfiguration(item, inVideoCollection, sources)
		return
	}
	if (!isRecord(value)) return

	if (inVideoCollection) {
		for (const candidate of [value.name, value.id, value.alias, value.source_name, value.sourceName]) {
			if (typeof candidate === 'string' && isM2LXVideoSourceName(candidate)) sources.add(candidate)
		}
	}

	for (const [key, child] of Object.entries(value)) {
		const childIsVideoCollection =
			inVideoCollection ||
			key === 'sources' ||
			key === 'inputs' ||
			key === 'video_sources' ||
			key === 'videoSources' ||
			key === 'video_inputs' ||
			key === 'videoInputs'
		if (typeof child === 'string' && childIsVideoCollection && isM2LXVideoSourceName(child)) sources.add(child)
		visitConfiguration(child, childIsVideoCollection, sources)
	}
}

function isM2LXVideoSourceName(value: string): boolean {
	return /^(cam(?:[1-9]|1\d|2[0-4])|ndi(?:[1-9]|1\d|2[0-4])|vtr[1-4]|replay1)$/.test(value)
}

/**
 * Applies a switcher_status message to the observed state.
 * Envelope: `{ status: [{ node, path, state }], timestamp }`, where `path` scopes `state` to a subtree
 * of the node state (`/` for the initial snapshot, e.g. `/preview/background` for deltas).
 */
export function parseStatusMessage(
	message: unknown,
	previous: M2LXObservedState,
	capabilities?: M2LXCapabilities
): M2LXObservedState {
	const next: M2LXObservedState = {
		...previous,
		keys: {
			program: { ...previous.keys.program },
			preview: { ...previous.keys.preview },
		},
	}
	if (!isRecord(message) || !Array.isArray(message.status)) return next
	const nodes = { ...previous.nodes }
	const updated = new Set<string>()
	for (const entry of message.status) {
		if (!isRecord(entry) || typeof entry.node !== 'string' || typeof entry.path !== 'string') continue
		const node = entry.node === 'video_mixer' ? 'mixer' : entry.node
		const relevant =
			node === 'mixer' ||
			capabilities?.players.has(node) ||
			capabilities?.audio[node] ||
			capabilities?.routers[node] ||
			(!capabilities && /^(vtr[1-4]|replay1|audio_mixer(?:_out)?|router)$/.test(node))
		if (!relevant) continue
		assertSafeKey(node)
		const segments = entry.path
			.split('/')
			.filter(Boolean)
			.map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
		segments.forEach(assertSafeKey)
		nodes[node] = updateAtPath(nodes[node], segments, entry.state)
		updated.add(node)
	}
	if (updated.size) next.nodes = nodes
	for (const node of updated) {
		const raw = nodes[node]
		if (!isRecord(raw)) continue
		if (node === 'mixer') visitMixerState(raw, next)
		else if (capabilities?.players.has(node) || (!capabilities && /^(vtr[1-4]|replay1)$/.test(node))) {
			const player = parsePlayer(raw)
			if (player) next.players = { ...next.players, [node]: player }
		} else if (capabilities?.audio[node] || (!capabilities && node.startsWith('audio_mixer'))) {
			const inputs: Record<string, M2LXAudio> = {}
			if (isRecord(raw.inputs)) {
				for (const [name, input] of Object.entries(raw.inputs)) {
					assertSafeKey(name)
					if (!isRecord(input)) continue
					inputs[name] = {
						...(typeof input.volume === 'number' ? { volume: input.volume } : {}),
						...(typeof input.muted === 'boolean' ? { muted: input.muted } : {}),
					}
				}
			}
			next.audio = { ...next.audio, [node]: inputs }
		} else {
			const routes: Record<string, string> = {}
			for (const route of entries(raw.connections)) {
				if (isRecord(route) && typeof route.output === 'string' && typeof route.input === 'string') {
					assertSafeKey(route.output)
					routes[route.output] = route.input
				}
			}
			next.routers = { ...next.routers, [node]: routes }
		}
	}
	return next
}

export function hasMixerSnapshot(message: unknown): boolean {
	if (!isRecord(message) || !Array.isArray(message.status)) return false
	return message.status.some(
		(entry: unknown) =>
			isRecord(entry) &&
			(entry.node === 'mixer' || entry.node === 'video_mixer') &&
			entry.path === '/' &&
			isRecord(entry.state) &&
			isRecord(entry.state.program) &&
			isRecord(entry.state.preview)
	)
}

export function hasConfiguredState(state: M2LXObservedState, capabilities: M2LXCapabilities): boolean {
	if (![...capabilities.players].every((node) => state.players?.[node] !== undefined)) return false
	for (const [node, audio] of Object.entries(capabilities.audio)) {
		const raw = state.nodes?.[node]
		if (!isRecord(raw) || !isRecord(raw.inputs)) return false
		for (const name of audio.inputs) {
			const input = state.audio?.[node]?.[name]
			if (input?.volume === undefined || !Number.isFinite(input.volume) || typeof input.muted !== 'boolean')
				return false
		}
	}
	return Object.keys(capabilities.routers).every((node) => {
		const raw = state.nodes?.[node]
		return isRecord(raw) && (Array.isArray(raw.connections) || isRecord(raw.connections))
	})
}

function assertSafeKey(key: string): void {
	if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
		throw new Error(`Unsafe M2L-X status/configuration key: ${key}`)
	}
}

function updateAtPath(previous: unknown, segments: string[], value: unknown): unknown {
	if (!segments.length) {
		if (Array.isArray(value)) return value.map((item) => updateAtPath(undefined, [], item))
		if (!isRecord(value)) return value
		const result = isRecord(previous) ? { ...previous } : {}
		for (const [key, child] of Object.entries(value)) {
			assertSafeKey(key)
			result[key] = updateAtPath(result[key], [], child)
		}
		return result
	}
	const result: Record<string, unknown> = isRecord(previous)
		? { ...previous }
		: Array.isArray(previous)
		? { ...previous }
		: {}
	const [key, ...rest] = segments
	result[key] = updateAtPath(result[key], rest, value)
	return result
}

function entries(value: unknown): unknown[] {
	return Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : []
}

function parsePlayer(raw: Record<string, unknown>): M2LXObservedPlayer | undefined {
	const clip = raw.clip
	if (!isRecord(clip) || typeof clip.loaded !== 'boolean') return undefined
	const playback = isRecord(raw.playback) ? raw.playback : {}
	const error = isRecord(raw.error) ? raw.error : undefined
	const frameRate =
		typeof clip.frame_rate === 'string' || typeof clip.frame_rate === 'number' ? Number(clip.frame_rate) : NaN
	return {
		loaded: clip.loaded,
		...(clip.loaded && typeof clip.asset_id === 'string' ? { assetId: clip.asset_id } : {}),
		...(clip.loaded && typeof clip.duration === 'number' ? { duration: clip.duration } : {}),
		...(clip.loaded && Number.isFinite(frameRate) && frameRate > 0 ? { frameRate } : {}),
		...(typeof playback.paused === 'boolean' ? { playing: !playback.paused } : {}),
		...(typeof playback.time === 'number' ? { time: playback.time } : {}),
		...(typeof raw.loop_enabled === 'boolean' ? { loop: raw.loop_enabled } : {}),
		...(error &&
		typeof error.code === 'string' &&
		typeof error.message === 'string' &&
		typeof error.severity === 'string'
			? { error: { code: error.code, message: error.message, severity: error.severity } }
			: {}),
	}
}

function vector(value: unknown): M2LXVector | undefined {
	return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number'
		? { x: value.x, y: value.y }
		: undefined
}

function keyProperties(key: Record<string, unknown>): Partial<M2LXObservedKey> {
	const result: Partial<M2LXObservedKey> = {}
	for (const name of ['translation', 'scale'] as const) {
		const value = vector(key[name])
		if (value) result[name] = value
	}
	if (typeof key.rotation === 'number') result.rotation = key.rotation
	if (typeof key.opacity === 'number') result.opacity = key.opacity
	const crop = key.crop
	const position = vector(crop)
	if (position && isRecord(crop) && typeof crop.width === 'number' && typeof crop.height === 'number') {
		result.crop = { ...position, width: crop.width, height: crop.height }
	}
	const border = key.border
	if (
		isRecord(border) &&
		typeof border.color === 'string' &&
		typeof border.enabled === 'boolean' &&
		typeof border.fill_enabled === 'boolean' &&
		typeof border.lock_aspect_ratio === 'boolean' &&
		typeof border.height === 'number' &&
		typeof border.width === 'number' &&
		typeof border.inner_edge_softness === 'number' &&
		typeof border.outer_edge_softness === 'number' &&
		typeof border.inner_radius === 'number' &&
		typeof border.outer_radius === 'number' &&
		typeof border.offset === 'number'
	) {
		result.border = {
			color: border.color,
			enabled: border.enabled,
			fill_enabled: border.fill_enabled,
			lock_aspect_ratio: border.lock_aspect_ratio,
			height: border.height,
			width: border.width,
			inner_edge_softness: border.inner_edge_softness,
			outer_edge_softness: border.outer_edge_softness,
			inner_radius: border.inner_radius,
			outer_radius: border.outer_radius,
			offset: border.offset,
		}
	}
	return result
}

function visitMixerState(mixer: unknown, state: M2LXObservedState): void {
	if (!isRecord(mixer)) return
	for (const bus of ['program', 'preview'] as M2LXBus[]) {
		const busState = mixer[bus]
		if (!isRecord(busState)) continue

		const source = isRecord(busState.background) ? busState.background.source : undefined
		if (typeof source === 'string') state[bus] = source

		for (const keyType of ['upstream', 'downstream'] as const) {
			const collection = busState[`${keyType}_keys`]
			if (!Array.isArray(collection) && !isRecord(collection)) continue
			const keys: Record<number, M2LXObservedKey> = {}
			for (const [indexKey, keyEntry] of Object.entries(collection)) {
				const index = Number(indexKey)
				if (!Number.isInteger(index) || index < 0 || index > (keyType === 'downstream' ? 1 : 7) || !isRecord(keyEntry))
					continue
				const key = isRecord(keyEntry.key) ? keyEntry.key : keyEntry
				const previous = keyType === 'upstream' ? state.keys[bus][index] : state.downstreamKeys?.[bus][index]
				const visible = typeof key.visible === 'boolean' ? key.visible : previous?.visible
				if (visible === undefined) continue
				const keySource = typeof key.source === 'string' ? key.source : previous?.source
				keys[index] = {
					visible,
					...(keySource === undefined ? {} : { source: keySource }),
					...(key.source_type === 'video' || key.source_type === 'image' ? { sourceType: key.source_type } : {}),
					...keyProperties(key),
				}
			}
			if (keyType === 'upstream') state.keys[bus] = keys
			else {
				state.downstreamKeys = state.downstreamKeys ?? { program: {}, preview: {} }
				state.downstreamKeys = { ...state.downstreamKeys, [bus]: keys }
			}
		}
	}

	const transition = isRecord(mixer.transition) ? mixer.transition : undefined
	if (!transition) return
	const progress = transition.progress
	const effect = transition.effect
	if (isRecord(progress) || isRecord(effect)) {
		const previous = state.transition
		state.transition = {
			running:
				isRecord(progress) && typeof progress.running === 'boolean' ? progress.running : previous?.running ?? false,
			progress: isRecord(progress) && typeof progress.value === 'number' ? progress.value : previous?.progress ?? 0,
		}
		const observedEffect =
			isRecord(effect) && typeof effect.name === 'string' && typeof effect.duration === 'number'
				? {
						name: effect.name,
						duration: effect.duration,
						...(isRecord(effect.args) && typeof effect.args.fade === 'number'
							? { args: { fade: effect.args.fade } }
							: {}),
						...(isRecord(effect.auto_play) && typeof effect.auto_play.enabled === 'boolean'
							? { autoPlayEnabled: effect.auto_play.enabled }
							: {}),
				  }
				: previous?.effect
		if (observedEffect) state.transition.effect = observedEffect
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
