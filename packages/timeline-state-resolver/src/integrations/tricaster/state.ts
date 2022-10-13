import { TimelineState } from 'superfly-timeline'
import * as deepMerge from 'deepmerge'
import {
	Mappings,
	MappingTriCaster,
	MappingTriCasterType,
	TriCasterKeyer,
	TriCasterTransition,
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

type ComandGeneratorFun<T, K> = (value: T, oldObj: K, newObj: K) => CommandAny[]
type CommandGenerator<C> = {
	[P in keyof C]: C[P] extends object ? CommandGenerator<C[P]> : ComandGeneratorFun<C[P], C> | undefined
}

// @todo: use this for making an object tracking timelineObjectIds, by adding a side effect to deepMerge
// type ValueSource<C> = {
// 	[P in keyof C]: C[P] extends object ? ValueSource<C[P]> : string
// }

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T

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

export function diffStates(oldState: State, newState: State) {
	const commands: TriCasterCommandWithContext[] = []
	generateCommands<State>(commands, STATE_COMMAND_GENERATOR, oldState, newState)
	return commands
}

function generateCommands<Y>(
	commands: TriCasterCommandWithContext[],
	generator: CommandGenerator<Y>,
	oldState: Y,
	newState: Y
) {
	let key: keyof Y
	for (key in oldState) {
		const gen = generator[key]
		const newValue = newState[key]
		const oldValue = oldState[key]
		if (typeof gen === 'function' && newValue !== oldValue) {
			const generatedCommands = gen(newValue, oldState, newState)
			commands.push(...generatedCommands.map((command) => ({ command, context: null, timelineObjId: '' }))) // @todo track timelineObjIds
		} else if (gen !== undefined) {
			generateCommands(commands, gen as CommandGenerator<typeof newValue>, oldValue, newValue)
		}
	}
}

const STATE_COMMAND_GENERATOR: CommandGenerator<State> = {
	mixEffects: MIX_EFFECT_NAMES.map((meName) => ({
		previewInput: undefined,
		transition: {
			effect: (value) => getEffectCommand(meName, value),
			duration: (value) => [{ name: CommandName.SPEED, target: meName, value }],
		},
		programInput: getProgramInputCommand(meName),
		keyers: DSK_NAMES.map((name) => getKeyerCommandGenerator(`${meName}_${name}`)),
	})),
	audioChannels: AUDIO_CHANNEL_NAMES.map((target) => ({
		volume: (value) => [{ name: CommandName.VOLUME, value, target }],
		isMuted: (value) => [{ name: CommandName.MUTE, value, target }],
	})),
	isRecording: (value) => [{ name: CommandName.RECORD_TOGGLE, value: value ? 1 : 0 }],
	isStreaming: (value) => [{ name: CommandName.STREAMING_TOGGLE, value: value ? 1 : 0 }],
}

function getProgramInputCommand(target: string): (value: number, mixEffect: MixEffect) => CommandAny[] {
	return (value: number, mixEffect: MixEffect) => {
		const commands: CommandAny[] = [{ name: CommandName.A_ROW, value, target }]
		if (mixEffect.transition.effect === 'cut') {
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
			effect: (value) => getEffectCommand(target, value),
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
		onAir: (_value, _oldKeyer, newKeyer: Keyer): CommandAny[] => {
			if (newKeyer.transition.effect === 'cut') {
				return [{ name: CommandName.TAKE, target }]
			}
			return [{ name: CommandName.AUTO, target }]
		},
	}
}

function getEffectCommand(target: string, newValue: TriCasterTransition['effect']): CommandAny[] {
	if (typeof newValue === 'number') {
		return [{ name: CommandName.SELECT_INDEX, target, value: newValue }]
	}
	if (newValue === 'fade') {
		return [{ name: CommandName.SELECT_FADE, target }]
	}
	return []
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
				mixEffects[mapping.index] = deepMergeWithCombine(mixEffects[mapping.index], tlObject.content)
				break
			}
			case MappingTriCasterType.DownStreamKeyer: {
				const mainKeyers = resultState.mixEffects[0].keyers
				if (!isTimelineObjTriCasterDSK(tlObject) || !validateInt(mapping.index, 0, mainKeyers.length)) {
					break
				}
				mainKeyers[mapping.index] = deepMergeWithCombine(mainKeyers[mapping.index], tlObject.content.keyer)
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
					audioChannels[index] = deepMergeWithCombine(audioChannels[index], tlObject.content)
				}
			}
		}
	})
	// @todo
	return resultState
}

function validateInt(value: any, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value < max
}

function deepMergeWithCombine<T>(target: T, source: DeepPartial<T>) {
	// @todo: this merges unnecessary properties. Assuming all properties in target are required, it should just discard extra properies from source
	return deepMerge<T>(target, source as Partial<T>, { arrayMerge: combineMerge })
}

function combineMerge(target: any[], source: any[], options: any): any[] {
	const destination = target.slice()

	source.forEach((item, index) => {
		if (destination[index] == undefined) {
			destination[index] = options.cloneUnlessOtherwiseSpecified(item, options)
		} else if (options.isMergeableObject(item)) {
			destination[index] = deepMerge(target[index], item, options)
		} else if (target.indexOf(item) === -1 && item !== undefined) {
			destination.push(item)
		}
	})
	return destination
}
