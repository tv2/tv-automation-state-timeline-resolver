import { TimelineState } from 'superfly-timeline'
import {
	Mappings,
	MappingTriCaster,
	MappingTriCasterType,
	TriCasterKeyer,
	TriCasterTransition,
	TriCasterTransitionEffect,
	TSRTimelineObjBase,
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'
import { CommandAny, CommandName, TriCasterCommandWithContext } from './commands'
import {
	isTimelineObjTriCasterAudioChannel,
	isTimelineObjTriCasterDSK,
	isTimelineObjTriCasterME,
} from 'timeline-state-resolver-types'

const BLACK_INPUT = 69 // @todo: get the right number, this probably varies by models
const INPUT_COUNT = 44 // @todo: use a variable based on model

const MIX_EFFECT_NAMES = ['main', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']
const DSK_NAMES = ['dsk1', 'dsk2', 'dsk3', 'dsk4']
const EXTRA_AUDIO_CHANNEL_NAMES = ['ddr1', 'ddr2', 'ddr3', 'ddr4', 'sound', 'master']
const AUDIO_CHANNEL_NAMES = [
	...EXTRA_AUDIO_CHANNEL_NAMES,
	...Array.from({ length: INPUT_COUNT }, (_, i) => `input${i + 1}`),
]
const AUDIO_CHANNEL_NAMES_LOOKUP = new Map(AUDIO_CHANNEL_NAMES.map((name, index) => [name, index]))

export interface State {
	mixEffects: MixEffect[]
	audioChannels: AudioChannel[]
	isRecording: boolean
	isStreaming: boolean
}

type Keyer = Required<TriCasterKeyer>

type ComandGeneratorFun<T, K> = (newValue: T, newObj: K, oldObj: K) => CommandAny[]
type CommandGenerator<C> = {
	[P in keyof C]: C[P] extends object
		? CommandGenerator<C[P]> | ComandGeneratorFun<C[P], C>
		: ComandGeneratorFun<C[P], C> | undefined
}

// @todo: use this for making an object tracking timelineObjectIds, by adding a side effect to deepApply
// type ValueSource<C> = {
// 	[P in keyof C]: C[P] extends object ? ValueSource<C[P]> : string
// }

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] }

export interface MixEffect {
	programInput: number
	previewInput: number
	transition: TriCasterTransition
	keyers: Keyer[]
}

export interface AudioChannel {
	volume: number
	isMuted: boolean
}

export function getDefaultState(): State {
	return {
		mixEffects: MIX_EFFECT_NAMES.map((_meName) => ({
			programInput: BLACK_INPUT,
			previewInput: BLACK_INPUT,
			transition: { effect: 'cut', duration: 0 },
			keyers: DSK_NAMES.map(() => getDefaultKeyerState()),
		})),
		audioChannels: AUDIO_CHANNEL_NAMES.map(() => ({ volume: 0, isMuted: true })),
		isRecording: false,
		isStreaming: false,
	}
}

function getDefaultKeyerState(): Keyer {
	return {
		onAir: false,
		input: BLACK_INPUT,
		transition: { effect: 'cut', duration: 0 },
		positioningEnabled: false,
		position: { x: 0, y: 0 },
		scale: { x: 100, y: 100 },
		rotation: { x: 0, y: 0, z: 0 },
		cropEnabled: false,
		crop: { left: 0, right: 0, up: 0, down: 0 },
	}
}

export function diffStates(newState: State, oldState: State) {
	const commands: TriCasterCommandWithContext[] = []
	generateCommands(commands, STATE_COMMAND_GENERATOR, newState, oldState)
	return commands
}

function generateCommands<Y>(
	commands: TriCasterCommandWithContext[],
	generator: CommandGenerator<Y>,
	newState: Y,
	oldState: Y
) {
	let key: keyof Y
	for (key in generator) {
		const gen = generator[key]
		const newValue = newState[key]
		const oldValue = oldState[key]
		if (typeof gen === 'function' && newValue !== oldValue) {
			const generatedCommands = gen(newValue, newState, oldState)
			commands.push(...generatedCommands.map((command) => ({ command, context: null, timelineObjId: '' }))) // @todo track timelineObjIds
		} else if (gen !== undefined) {
			generateCommands(commands, gen as CommandGenerator<typeof newValue>, newValue, oldValue)
		}
	}
}

const STATE_COMMAND_GENERATOR: CommandGenerator<State> = {
	mixEffects: MIX_EFFECT_NAMES.map((meName) => ({
		previewInput: undefined,
		keyers: DSK_NAMES.map((name) => getKeyerCommandGenerator(`${meName}_${name}`)),
		transition: {
			effect: getEffectGenerator(meName),
			duration: (value) => [{ name: CommandName.SPEED, target: meName, value }],
		},
		programInput: getProgramInputGenerator(meName),
	})),
	audioChannels: AUDIO_CHANNEL_NAMES.map((target) => ({
		volume: (value) => [{ name: CommandName.VOLUME, value, target }],
		isMuted: (value) => [{ name: CommandName.MUTE, value, target }],
	})),
	isRecording: (value) => [{ name: CommandName.RECORD_TOGGLE, value: value ? 1 : 0 }],
	isStreaming: (value) => [{ name: CommandName.STREAMING_TOGGLE, value: value ? 1 : 0 }],
}

function getProgramInputGenerator(target: string): ComandGeneratorFun<number, MixEffect> {
	return (value, newMixEffect) => {
		const commands: CommandAny[] = [{ name: CommandName.A_ROW, value, target }]
		if (newMixEffect.transition.effect === 'cut') {
			commands.push({ name: CommandName.TAKE, target })
		} else {
			commands.push({ name: CommandName.AUTO, target })
		}
		return commands
	}
}

function getKeyerCommandGenerator(target: string): CommandGenerator<Keyer> {
	return {
		transition: {
			effect: getEffectGenerator(target),
			duration: (value) => [{ name: CommandName.SPEED, target, value }],
		},
		position: {
			x: (value) => [{ name: CommandName.POSITION_X, value, target }],
			y: (value) => [{ name: CommandName.POSITION_Y, value, target }],
		},
		scale: {
			x: (value) => [{ name: CommandName.SCALE_X, value, target }],
			y: (value) => [{ name: CommandName.SCALE_Y, value, target }],
		},
		rotation: {
			x: (value) => [{ name: CommandName.ROTATION_X, value, target }],
			y: (value) => [{ name: CommandName.ROTATION_Y, value, target }],
			z: (value) => [{ name: CommandName.ROTATION_Z, value, target }],
		},
		positioningEnabled: (value) => [{ name: CommandName.POSITIONING_ENABLE, value, target }],
		crop: {
			left: (value) => [{ name: CommandName.CROP_LEFT_VALUE, value, target }],
			right: (value) => [{ name: CommandName.CROP_RIGHT_VALUE, value, target }],
			up: (value) => [{ name: CommandName.CROP_UP_VALUE, value, target }],
			down: (value) => [{ name: CommandName.CROP_DOWN_VALUE, value, target }],
		},
		cropEnabled: (value) => [{ name: CommandName.CROP_ENABLE, value, target }],
		input: (value) => [{ name: CommandName.SELECT, value, target }],
		onAir: (_value, newKeyer: Keyer): CommandAny[] => {
			if (newKeyer.transition.effect === 'cut') {
				return [{ name: CommandName.TAKE, target }]
			}
			return [{ name: CommandName.AUTO, target }]
		},
	}
}

function getEffectGenerator(target: string): ComandGeneratorFun<TriCasterTransitionEffect, TriCasterTransition> {
	return (value) => {
		if (typeof value === 'number') {
			return [{ name: CommandName.SELECT_INDEX, target, value }]
		}
		if (value === 'fade') {
			return [{ name: CommandName.SELECT_FADE, target }]
		}
		return []
	}
}

export function convertStateToTriCaster(state: TimelineState, newMappings: Mappings, deviceId: string): State {
	const resultState = getDefaultState()
	const sortedLayers = _.map(state.layers, (tlObject, layerName) => ({
		layerName,
		tlObject: tlObject as unknown as TSRTimelineObjBase,
	})).sort((a, b) => a.layerName.localeCompare(b.layerName))

	_.each(sortedLayers, ({ tlObject, layerName }) => {
		const mapping = newMappings[layerName] as MappingTriCaster | undefined
		if (!mapping || mapping.deviceId !== deviceId) {
			return
		}
		switch (mapping.mappingType) {
			case MappingTriCasterType.MixEffect: {
				const mixEffects = resultState.mixEffects
				if (!isTimelineObjTriCasterME(tlObject) || !validateInt(mapping.index, 0, mixEffects.length)) {
					break
				}
				deepApply(mixEffects[mapping.index], tlObject.content)
				break
			}
			case MappingTriCasterType.DownStreamKeyer: {
				const mainKeyers = resultState.mixEffects[0].keyers
				if (!isTimelineObjTriCasterDSK(tlObject) || !validateInt(mapping.index, 0, mainKeyers.length)) {
					break
				}
				deepApply(mainKeyers[mapping.index], tlObject.content.keyer)
				break
			}
			case MappingTriCasterType.AudioChannel: {
				const audioChannels = resultState.audioChannels
				if (!isTimelineObjTriCasterAudioChannel(tlObject)) {
					break
				}
				let index: number | undefined
				if (validateInt(mapping.index, 0, INPUT_COUNT)) {
					index = AUDIO_CHANNEL_NAMES_LOOKUP.get(`input${mapping.index + 1}`)
				} else if (typeof mapping.index === 'string') {
					index = AUDIO_CHANNEL_NAMES_LOOKUP.get(mapping.index)
				}
				if (index !== undefined) {
					deepApply(audioChannels[index], tlObject.content)
				}
			}
		}
	})
	return resultState
}

function validateInt(value: any, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value < max
}

/**
 * Deeply applies primitive properties from `source` to existing properties of `target` (in place)
 */
function deepApply<T>(target: T, source: DeepPartial<T>): void {
	let key: keyof T
	for (key in target) {
		if (source[key] === undefined) {
			continue
		}
		const t = target[key]
		if (typeof t === 'object') {
			deepApply(t, source[key] as DeepPartial<typeof t>)
		} else {
			target[key] = source[key] as typeof t
		}
	}
}
