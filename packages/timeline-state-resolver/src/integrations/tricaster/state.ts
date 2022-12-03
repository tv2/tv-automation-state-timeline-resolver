import { TriCasterLayer, TriCasterKeyer, TriCasterTransition } from 'timeline-state-resolver-types'
import { CommandAny, CommandName, TriCasterCommandWithContext } from './commands'
import { ExternalStateConverter } from './externalStateConverter'
import { TimelineStateConverter } from './timelineStateConverter'

const BLACK_INPUT = 69 // @todo: get the right number, this probably varies by models
// const OUTPUT_COUNT = 8 // @todo: use a variable based on model/session

export interface State {
	mixEffects: MixEffect[]
	audioChannels: AudioChannel[]
	inputs: Input[]
	isRecording: boolean
	isStreaming: boolean
	outputs: string[]
}

type Layer = Required<TriCasterLayer>
type Keyer = Required<TriCasterKeyer>

type ComandGeneratorFun<T, K> = (args: {
	value: NonNullable<T>
	oldValue: T
	state: K
	oldState: K
	target: string
}) => CommandAny[]
type WithTarget<T> = T & { $target?: string }
type CommandGenerator<C> = {
	[P in keyof C]: C[P] extends object
		? CommandGenerator<C[P]> | WithTarget<CommandGenerator<C[P]>> | ComandGeneratorFun<C[P], C>
		: ComandGeneratorFun<C[P], C> | undefined
}

// @todo: use this for making an object tracking timelineObjectIds, by adding a side effect to deepApply
// type ValueSource<C> = {
// 	[P in keyof C]: C[P] extends object ? ValueSource<C[P]> : string
// }

export interface MixEffect {
	programInput: number | string
	previewInput: number | string
	transition: TriCasterTransition
	layers: Layer[]
	keyers: Keyer[]
}

export interface AudioChannel {
	volume: number
	isMuted: boolean
}
export interface Input {
	videoSource: string | undefined
	videoActAsAlpha: boolean
}
export class StateDiffer {
	private readonly commandGenerator: CommandGenerator<State>
	private readonly meNames: string[]
	private readonly dskNames: string[]
	private readonly layerNames: string[] = ['a', 'b', 'c', 'd']
	private readonly audioChannelNames: string[]
	public readonly timelineStateConverter: TimelineStateConverter
	public readonly externalStateConverter: ExternalStateConverter
	private readonly audioChannelNameToIndexMap: Map<string, number>

	constructor(
		private readonly inputCount: number,
		meCount: number,
		dskCount: number,
		ddrCount: number,
		private readonly outputCount: number
	) {
		this.meNames = ['main', ...makeArray(meCount, (i) => `v${i + 1}`)]
		this.dskNames = makeArray(dskCount, (i) => `dsk${i + 1}`)

		const extraAudioChannelNames = [...makeArray(ddrCount, (i) => `ddr${i + 1}`), 'sound', 'master']
		this.audioChannelNames = [...extraAudioChannelNames, ...makeArray(inputCount, (i) => `input${i + 1}`)]
		this.audioChannelNameToIndexMap = new Map(this.audioChannelNames.map((name, index) => [name, index]))

		this.commandGenerator = this.getGenerator()

		this.timelineStateConverter = new TimelineStateConverter(
			() => this.getDefaultState(),
			this.inputCount,
			this.outputCount,
			this.audioChannelNameToIndexMap
		)
		this.externalStateConverter = new ExternalStateConverter(
			() => this.getDefaultState(),
			this.inputCount,
			this.audioChannelNameToIndexMap
		)
	}

	getDefaultState(): State {
		return {
			mixEffects: this.meNames.map((_meName) => ({
				programInput: BLACK_INPUT,
				previewInput: BLACK_INPUT,
				transition: { effect: 'cut', duration: 0 },
				layers: this.layerNames.map(() => this.getDefaultLayerState()),
				keyers: this.dskNames.map(() => this.getDefaultKeyerState()),
			})),
			inputs: makeArray(this.inputCount, { videoSource: undefined, videoActAsAlpha: false }),
			audioChannels: this.audioChannelNames.map(() => ({ volume: 0, isMuted: true })),
			isRecording: false,
			isStreaming: false,
			outputs: makeArray(this.outputCount, () => 'Program'),
		}
	}

	getDefaultLayerState(): Layer {
		return {
			input: BLACK_INPUT,
			positioningEnabled: false,
			position: { x: 0, y: 0 },
			scale: { x: 100, y: 100 },
			rotation: { x: 0, y: 0, z: 0 },
			cropEnabled: false,
			crop: { left: 0, right: 0, up: 0, down: 0 },
		}
	}

	getDefaultKeyerState(): Keyer {
		return {
			onAir: false,
			transition: { effect: 'cut', duration: 0 },
			...this.getDefaultLayerState(),
		}
	}

	getCommandsToAchieveState(newState: State, oldState: State): TriCasterCommandWithContext[] {
		const commands: TriCasterCommandWithContext[] = []
		this.recursivelyGenerateCommands(commands, this.commandGenerator, newState, oldState, '')
		return commands
	}

	private getGenerator(): CommandGenerator<State> {
		return {
			mixEffects: this.meNames.map((meName) => this.getMixEffectGenerator(meName)),
			inputs: makeArray(this.inputCount, (i) => ({ $target: `input${i + 1}`, ...this.inputCommandGenerator })),
			audioChannels: this.audioChannelNames.map((audioChannelName) => ({
				$target: audioChannelName,
				...this.audioCommandGenerator,
			})),
			isRecording: ({ value }) => [{ name: CommandName.RECORD_TOGGLE, value: value ? 1 : 0 }],
			isStreaming: ({ value }) => [{ name: CommandName.STREAMING_TOGGLE, value: value ? 1 : 0 }],
			outputs: makeArray(this.outputCount, (i) => ({ value }) => [
				{ name: CommandName.SET_OUTPUT_CONFIG_VIDEO_SOURCE, output_index: i, source_id: value },
			]),
		}
	}

	private inputCommandGenerator: CommandGenerator<Input> = {
		videoSource: ({ value, target }) => [{ name: CommandName.VIDEO_SOURCE, target, value }],
		videoActAsAlpha: ({ value, target }) => [{ name: CommandName.VIDEO_ACT_AS_ALPHA, target, value }],
	}

	private audioCommandGenerator: CommandGenerator<AudioChannel> = {
		volume: ({ value, target }) => [{ name: CommandName.VOLUME, value, target }],
		isMuted: ({ value, target }) => [{ name: CommandName.MUTE, value, target }],
	}

	private transitionCommandGenerator: CommandGenerator<TriCasterTransition> = {
		effect: ({ value, target, state }) => {
			const commands: CommandAny[] = []
			if (value === 'cut') {
				return commands
			}
			if (typeof value === 'number') {
				commands.push({ name: CommandName.SELECT_INDEX, target, value })
			} else if (value === 'fade') {
				commands.push({ name: CommandName.SELECT_FADE, target })
			}
			commands.push({ name: CommandName.SPEED, target, value: state.duration })
			return commands
		},
		duration: ({ value, target, state, oldState }) => {
			if (state.effect !== oldState.effect) {
				return []
			}
			return [{ name: CommandName.SPEED, target, value }]
		},
	}

	private layerCommandGenerator: CommandGenerator<Layer> = {
		position: {
			x: ({ value, target }) => [{ name: CommandName.POSITION_X, value, target }],
			y: ({ value, target }) => [{ name: CommandName.POSITION_Y, value, target }],
		},
		scale: {
			x: ({ value, target }) => [{ name: CommandName.SCALE_X, value, target }],
			y: ({ value, target }) => [{ name: CommandName.SCALE_Y, value, target }],
		},
		rotation: {
			x: ({ value, target }) => [{ name: CommandName.ROTATION_X, value, target }],
			y: ({ value, target }) => [{ name: CommandName.ROTATION_Y, value, target }],
			z: ({ value, target }) => [{ name: CommandName.ROTATION_Z, value, target }],
		},
		positioningEnabled: ({ value, target }) => [{ name: CommandName.POSITIONING_ENABLE, value, target }],
		crop: {
			left: ({ value, target }) => [{ name: CommandName.CROP_LEFT_VALUE, value, target }],
			right: ({ value, target }) => [{ name: CommandName.CROP_RIGHT_VALUE, value, target }],
			up: ({ value, target }) => [{ name: CommandName.CROP_UP_VALUE, value, target }],
			down: ({ value, target }) => [{ name: CommandName.CROP_DOWN_VALUE, value, target }],
		},
		cropEnabled: ({ value, target }) => [{ name: CommandName.CROP_ENABLE, value, target }],
		input: ({ value, target }) => [
			typeof value === 'string'
				? { name: CommandName.ROW_NAMED_INPUT, value, target }
				: { name: CommandName.ROW, value, target },
		],
	}

	private keyerCommandGenerator: CommandGenerator<Keyer> = {
		transition: this.transitionCommandGenerator,
		...this.layerCommandGenerator,
		input: ({ value, target }) => [
			typeof value === 'string'
				? { name: CommandName.SELECT_NAMED_INPUT, value, target }
				: { name: CommandName.SELECT, value, target },
		],
		onAir: ({ state, target }): CommandAny[] => {
			if (state.transition.effect === 'cut') {
				return [{ name: CommandName.TAKE, target }]
			}
			return [{ name: CommandName.AUTO, target }]
		},
	}

	private getMixEffectGenerator(meName: string): WithTarget<CommandGenerator<MixEffect>> {
		return {
			$target: meName,
			previewInput: undefined,
			keyers: this.dskNames.map((name) => ({ $target: name, ...this.keyerCommandGenerator })),
			layers: this.layerNames.map((name) => ({ $target: name, ...this.layerCommandGenerator })),
			transition: this.transitionCommandGenerator,
			programInput: this.programInputCommandGenerator,
		}
	}

	private programInputCommandGenerator: ComandGeneratorFun<number | string, MixEffect> = ({ value, state, target }) => {
		const commands: CommandAny[] = [
			typeof value === 'string'
				? { name: CommandName.ROW_NAMED_INPUT, value, target: target + '_b' }
				: { name: CommandName.ROW, value, target: target + '_b' },
		]
		if (state.transition.effect === 'cut') {
			commands.push({ name: CommandName.TAKE, target })
		} else {
			commands.push({ name: CommandName.AUTO, target })
		}
		return commands
	}

	private recursivelyGenerateCommands<Y>(
		commandsOut: TriCasterCommandWithContext[],
		generator: WithTarget<CommandGenerator<Y>>,
		state: Y,
		oldState: Y,
		target: string
	) {
		let key: keyof WithTarget<Y>
		if (generator.$target) {
			target += `${target ? '_' : ''}${generator.$target}`
		}
		for (key in generator) {
			if (key === '$target') {
				continue
			}
			const gen = (generator as CommandGenerator<Y>)[key]
			const value = state[key]
			const oldValue = oldState[key]
			if (gen instanceof Function) {
				if ((typeof value !== 'object' && value === oldValue) || typeof value === 'undefined') {
					continue
				}
				const generatedCommands = gen({
					value: value as NonNullable<typeof value>,
					oldValue,
					state,
					oldState,
					target,
				})
				commandsOut.push(...generatedCommands.map((command) => ({ command, context: null, timelineObjId: '' }))) // @todo track timelineObjIds
			} else if (gen !== undefined) {
				this.recursivelyGenerateCommands(commandsOut, gen as CommandGenerator<typeof value>, value, oldValue, target)
			}
		}
	}
}

function makeArray<T>(length: number, mapFn: (index: number) => T): T[]
function makeArray<T>(length: number, value: T): T[]
function makeArray<T>(length: number, valueOrMapFn: T | ((index: number) => T)): T[] {
	return valueOrMapFn instanceof Function
		? Array.from({ length }, (_, i) => valueOrMapFn(i))
		: new Array(length).fill(valueOrMapFn)
}
