import { TimelineState } from 'superfly-timeline'
import * as deepMerge from 'deepmerge'
import {
	Mappings,
	MappingTriCaster,
	MappingTriCasterType,
	TimelineContentTypeTriCaster,
	TriCasterKeyer,
	TriCasterTransition,
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'
import { CommandAny, CommandName, TriCasterCommandWithContext } from './commands'

const BLACK_INPUT = 69 // @todo: get the right number, this probably varies by models
type MixEffectName = 'main' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' // @todo: this varies by model

const MIX_EFFECT_NAMES = ['main', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8']
const DSK_NAMES = ['dsk1', 'dsk2', 'dsk3', 'dsk4']

export interface State {
	mixEffects: MixEffect[]
	isRecording: boolean
	isStreaming: boolean
}

export interface Keyer extends Required<TriCasterKeyer> {
	name: string
}

type CommandGenerator<T, K> = T extends object
	? { [K in keyof T]: CommandGenerator<T[K], T> }
	: ((value: T, obj: K) => CommandAny | CommandAny[] | undefined) | undefined

export interface MixEffect {
	programInput: number
	previewInput: number
	transition: TriCasterTransition
	keyers: Keyer[]
}

export function getDefaultState(): State {
	return {
		mixEffects: MIX_EFFECT_NAMES.map((meName: MixEffectName) => ({
			name: meName,
			programInput: BLACK_INPUT,
			previewInput: BLACK_INPUT,
			transition: { effect: 'cut', duration: 0 },
			keyers: DSK_NAMES.map((name) => getDefaultKeyer(name)),
		})),
		isRecording: false,
		isStreaming: false,
	}
}

function getDefaultKeyer(name: string): Keyer {
	return {
		name,
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
	generateCommands(commands, TRANSFORMER, oldState, newState)
	return commands
}

function generateCommands(commands: TriCasterCommandWithContext[], generator: any, oldPartialState, newPartialState) {
	for (const key in generator) {
		const gen = generator[key]
		if (typeof gen === 'function' && newPartialState[key] !== oldPartialState[key]) {
			const generatedCommands = gen(newPartialState[key], newPartialState)
			if (Array.isArray(generatedCommands)) {
				commands.push(...generatedCommands.map((command) => ({ command, context: null, timelineObjId: '' }))) // @todo track timelineObjIds
			} else if (generatedCommands) {
				commands.push({ command: generatedCommands, context: null, timelineObjId: '' }) // @todo track timelineObjIds
			}
		} else if (gen) {
			generateCommands(commands, gen, oldPartialState[key], newPartialState[key])
		}
	}
}

const TRANSFORMER: CommandGenerator<State, State> = {
	mixEffects: MIX_EFFECT_NAMES.map((meName: MixEffectName) => ({
		name: undefined,
		previewInput: undefined,
		transition: {
			effect: (value) => getEffectCommand(meName, value),
			duration: (value: number): CommandAny => ({ name: CommandName.SPEED, target: meName, value }),
		},
		programInput: getProgramInputCommand(meName),
		keyers: DSK_NAMES.map((name) => getKeyerTransformer(meName + name)),
	})),
	isRecording: (value: boolean): CommandAny => ({ name: CommandName.RECORD_TOGGLE, value: value ? 1 : 0 }),
	isStreaming: (value: boolean): CommandAny => ({ name: CommandName.STREAMING_TOGGLE, value: value ? 1 : 0 }),
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

function getKeyerTransformer(target: string): CommandGenerator<Keyer, Keyer> {
	return {
		name: undefined,
		transition: {
			effect: (value) => getEffectCommand(target, value),
			duration: (value: number): CommandAny => ({ name: CommandName.SPEED, target, value }),
		},
		position: {
			x: (value) => ({ name: CommandName.POSITION_X, value, target }),
			y: (value) => ({ name: CommandName.POSITION_Y, value, target }),
		},
		scale: {
			x: (value) => ({ name: CommandName.SCALE_X, value, target }),
			y: (value) => ({ name: CommandName.SCALE_Y, value, target }),
		},
		rotation: {
			x: (value) => ({ name: CommandName.ROTATION_X, value, target }),
			y: (value) => ({ name: CommandName.ROTATION_Y, value, target }),
			z: (value) => ({ name: CommandName.ROTATION_Z, value, target }),
		},
		positioningEnabled: (value: boolean): CommandAny => ({ name: CommandName.POSITIONING_ENABLE, value, target }),
		crop: {
			left: (value) => ({ name: CommandName.CROP_LEFT_VALUE, value, target }),
			right: (value) => ({ name: CommandName.CROP_RIGHT_VALUE, value, target }),
			up: (value) => ({ name: CommandName.CROP_UP_VALUE, value, target }),
			down: (value) => ({ name: CommandName.CROP_DOWN_VALUE, value, target }),
		},
		cropEnabled: (value: boolean): CommandAny => ({ name: CommandName.CROP_ENABLE, value, target }),
		input: (value): CommandAny => ({ name: CommandName.SELECT, value, target }),
		onAir: (_value: boolean, keyer: Keyer): CommandAny => {
			if (keyer.transition.effect === 'cut') {
				return { name: CommandName.TAKE, target }
			}
			return { name: CommandName.AUTO, target }
		},
	}
}

function getEffectCommand(target, value: TriCasterTransition['effect']): CommandAny | undefined {
	if (typeof value === 'number') {
		return { name: CommandName.SELECT_INDEX, target, value }
	}
	if (value === 'fade') {
		return { name: CommandName.SELECT_FADE, target }
	}
	return undefined
}

export function convertStateToTriCaster(state: TimelineState, newMappings: Mappings, deviceId: string): State {
	const resultState = getDefaultState()
	const sortedLayers = _.map(state.layers, (tlObject, layerName) => ({ layerName, tlObject })).sort((a, b) =>
		a.layerName.localeCompare(b.layerName)
	)
	_.each(sortedLayers, ({ tlObject, layerName }) => {
		const mapping = newMappings[layerName] as MappingTriCaster | undefined
		if (!mapping || mapping.deviceId !== deviceId) {
			return
		}
		switch (mapping.mappingType) {
			case MappingTriCasterType.MixEffect: {
				if (tlObject.content.type !== TimelineContentTypeTriCaster.ME || mapping.index === undefined) {
					break
				}
				const mixEffect = resultState.mixEffects[mapping.index]
				if (!mixEffect) {
					break
				}
				resultState.mixEffects[mapping.index] = deepMerge<MixEffect>(mixEffect, tlObject.content, {
					arrayMerge: combineMerge,
				})
				break
			}
			case MappingTriCasterType.DownStreamKeyer: {
				if (tlObject.content.type !== TimelineContentTypeTriCaster.DSK || mapping.index === undefined) {
					break
				}
				const keyer = resultState.mixEffects[0].keyers[mapping.index]
				if (!keyer) {
					break
				}
				resultState.mixEffects[0].keyers[mapping.index] = deepMerge<Keyer>(keyer, tlObject.content, {
					arrayMerge: combineMerge,
				})
				break
			}
		}
	})
	// @todo
	return resultState
}

const combineMerge = (target, source, options) => {
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
