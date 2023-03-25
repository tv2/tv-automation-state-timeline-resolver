import { TimelineObject, ResolvedTimelineObjectInstance } from 'superfly-timeline'
import { TriCasterResourceNames } from '../triCasterInfoParser'
import {
	WithContext,
	CompleteTriCasterState,
	wrapStateInContext,
	CompleteTriCasterMixEffectState,
	RequiredDeep,
	TriCasterKeyerState,
	TriCasterLayerState,
	TriCasterState,
} from '../triCasterStateDiffer'

export const MOCK_RESOURCES: TriCasterResourceNames = {
	mixEffects: ['main', 'v1', 'v2'],
	inputs: ['input1', 'input2'],
	audioChannels: ['input1', 'input2', 'sound', 'master'],
	layers: ['a', 'b'],
	keyers: ['dsk1', 'dsk2', 'dsk3', 'dsk4'],
	mixOutputs: ['mix1', 'mix2'],
	matrixOutputs: ['out1', 'out2'],
}

export const wrapIntoResolvedInstance = <T extends TimelineObject>(
	timelineObject: T
): ResolvedTimelineObjectInstance => ({
	...timelineObject,
	resolved: {
		resolved: true,
		resolving: false,
		instances: [{ start: 0, end: Infinity, id: timelineObject.id, references: [] }],
		directReferences: [],
	},
	instance: { start: 0, end: Infinity, id: timelineObject.id, references: [] },
})

export const mockGetDefaultState = (): WithContext<CompleteTriCasterState> =>
	wrapStateInContext<CompleteTriCasterState>({
		mixEffects: { main: mockGetDefaultMe(), v1: mockGetDefaultMe() }, // pretend we only have mappings for those two
		inputs: {
			input1: {
				videoActAsAlpha: false,
				videoSource: undefined,
			},
			input2: {
				videoActAsAlpha: false,
				videoSource: undefined,
			},
		},
		// @ts-ignore for now
		audioChannels: {
			input1: { isMuted: true, volume: 0 },
			input2: { isMuted: true, volume: 0 },
		},
		isRecording: false,
		isStreaming: false,
		mixOutputs: {
			mix1: { source: 'program', meClean: false },
			mix2: { source: 'program', meClean: false },
		},
		matrixOutputs: {
			out1: { source: 'mix1' },
			out2: { source: 'mix1' },
		},
	})

export const mockGetDefaultMainMe = (): CompleteTriCasterMixEffectState => ({
	programInput: 'black',
	previewInput: undefined,
	transitionEffect: 'cut',
	transitionDuration: 1,
	layers: {},
	keyers: {
		dsk1: mockGetDefaultKeyer(),
		dsk2: mockGetDefaultKeyer(),
	},
	delegates: ['background'],
	isInEffectMode: false,
})

export const mockGetDefaultMe = (): CompleteTriCasterMixEffectState => ({
	...mockGetDefaultMainMe(),
	layers: { a: mockGetDefaultLayer(), b: mockGetDefaultLayer() },
})

export const mockGetDefaultKeyer = (): RequiredDeep<TriCasterKeyerState> => ({
	input: 'black',
	positioningAndCropEnabled: false,
	position: { x: 0, y: 0 },
	scale: { x: 1, y: 1 },
	rotation: { x: 0, y: 0, z: 0 },
	crop: { left: 0, right: 0, up: 0, down: 0 },
	onAir: false,
	transitionEffect: 'cut',
	transitionDuration: 1,
	feather: 0,
})

export const mockGetDefaultLayer = (): TriCasterLayerState => ({
	input: 'black',
	positioningAndCropEnabled: false,
	position: { x: 0, y: 0 },
	scale: { x: 1, y: 1 },
	rotation: { x: 0, y: 0, z: 0 },
	crop: { left: 0, right: 0, up: 0, down: 0 },
	feather: 0,
})

export const mockGetBlankState = (): WithContext<TriCasterState> =>
	wrapStateInContext<TriCasterState>({
		mixEffects: {},
		inputs: {},
		audioChannels: {},
		isRecording: false,
		isStreaming: false,
		mixOutputs: {},
		matrixOutputs: {},
	})
