import {
	DeviceType,
	MappingTriCaster,
	MappingTriCasterType,
	TimelineContentTypeTriCaster,
	TimelineObjTriCasterInput,
	TimelineObjTriCasterMatrixOutput,
	TimelineObjTriCasterME,
	TimelineObjTriCasterMixOutput,
} from 'timeline-state-resolver-types'
import { TriCasterTimelineStateConverter } from '../triCasterTimelineStateConverter'
import { literal } from '../../../devices/device'
import { mockGetBlankState, mockGetDefaultMainMe, mockGetDefaultMe, wrapIntoResolvedInstance } from './helpers'
import { wrapStateInContext } from '../triCasterStateDiffer'

function setupTimelineStateConverter() {
	return new TriCasterTimelineStateConverter({
		mixEffects: ['main', 'v1', 'v2'],
		inputs: ['input1', 'input2'],
		audioChannels: ['input1', 'input2', 'sound', 'master'],
		mixOutputs: ['mix1', 'mix2'],
		matrixOutputs: ['out1', 'out2'],
		keyers: ['dsk1', 'dsk2'],
		layers: ['a', 'b'],
	})
}

describe('TimelineStateConverter.getTriCasterStateFromTimelineState', () => {
	test('mappings wth no timeline objects generate blank state', () => {
		const converter = setupTimelineStateConverter()

		const convertedState = converter.getTriCasterStateFromTimelineState(
			{
				time: Date.now(),
				layers: {},
				nextEvents: [],
			},
			{
				tc_me0_0: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.ME,
					name: 'main',
					deviceId: 'tc0',
				}),
				tc_me1_0: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.ME,
					name: 'v1',
					deviceId: 'tc0',
				}),
				tc_out2: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.MATRIX_OUTPUT,
					name: 'out2',
					deviceId: 'tc0',
				}),
				tc_mix2: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.MIX_OUTPUT,
					name: 'mix2',
					deviceId: 'tc0',
				}),
				tc_inp2: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.INPUT,
					name: 'input2',
					deviceId: 'tc0',
				}),
			}
		)

		const expectedState = mockGetBlankState()

		expect(convertedState).toEqual(expectedState)
	})

	test('sets MixEffect properties', () => {
		const converter = setupTimelineStateConverter()

		const convertedState = converter.getTriCasterStateFromTimelineState(
			{
				time: Date.now(),
				layers: {
					tc_me0_0: wrapIntoResolvedInstance<TimelineObjTriCasterME>({
						layer: 'tc_me0_0',
						enable: { while: '1' },
						id: 't0',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.ME,
							me: { programInput: 'input2', previewInput: 'input3', transitionEffect: 5, transitionDuration: 20 },
						},
					}),
					tc_me1_0: wrapIntoResolvedInstance<TimelineObjTriCasterME>({
						layer: 'tc_me1_0',
						enable: { while: '1' },
						id: 't1',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.ME,
							me: {
								keyers: { dsk2: { onAir: true, input: 'input5' } },
								layers: {
									b: {
										input: 'ddr3',
										position: { x: 2, y: -1.5 },
										crop: {
											left: 5,
											right: 10,
											up: 1.1111,
											down: 99.9,
										},
										scale: { x: 200, y: 90 },
										rotation: {
											x: 1,
											y: 2,
											z: 3,
										},
										feather: 67.67,
										positioningAndCropEnabled: true,
									},
								},
							},
						},
					}),
				},
				nextEvents: [],
			},
			{
				tc_me0_0: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.ME,
					name: 'main',
					deviceId: 'tc0',
				}),
				tc_me1_0: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.ME,
					name: 'v1',
					deviceId: 'tc0',
				}),
			}
		)

		const expectedState = mockGetBlankState()
		const expectedMainMeState = wrapStateInContext(mockGetDefaultMainMe())
		const expectedMe1State = wrapStateInContext(mockGetDefaultMe())

		expectedState.mixEffects.main = expectedMainMeState
		expectedState.mixEffects.v1 = expectedMe1State

		expectedMainMeState.programInput = { value: 'input2', timelineObjId: 't0' }
		expectedMainMeState.previewInput = { value: 'input3', timelineObjId: 't0' }
		expectedMainMeState.transitionEffect = { value: 5, timelineObjId: 't0' }
		expectedMainMeState.transitionDuration = { value: 20, timelineObjId: 't0' }
		expectedMe1State.keyers.dsk2.input = { value: 'input5', timelineObjId: 't1' }
		expectedMe1State.keyers.dsk2.onAir = { value: true, timelineObjId: 't1' }

		expectedMe1State.layers!.b = {
			input: { value: 'ddr3', timelineObjId: 't1' },
			position: {
				x: { value: 2, timelineObjId: 't1' },
				y: { value: -1.5, timelineObjId: 't1' },
			},
			crop: {
				left: { value: 5, timelineObjId: 't1' },
				right: { value: 10, timelineObjId: 't1' },
				up: { value: 1.1111, timelineObjId: 't1' },
				down: { value: 99.9, timelineObjId: 't1' },
			},
			scale: { x: { value: 200, timelineObjId: 't1' }, y: { value: 90, timelineObjId: 't1' } },
			rotation: {
				x: { value: 1, timelineObjId: 't1' },
				y: { value: 2, timelineObjId: 't1' },
				z: { value: 3, timelineObjId: 't1' },
			},
			feather: { value: 67.67, timelineObjId: 't1' },
			positioningAndCropEnabled: { value: true, timelineObjId: 't1' },
		}
		expectedMe1State.isInEffectMode.value = true

		expect(convertedState).toEqual(expectedState)
	})

	test('fills state only for resources with existing mappings', () => {
		const converter = setupTimelineStateConverter()

		const convertedState = converter.getTriCasterStateFromTimelineState(
			{
				time: Date.now(),
				layers: {
					tc_me0_0: wrapIntoResolvedInstance<TimelineObjTriCasterME>({
						layer: 'tc_me0_0',
						enable: { while: '1' },
						id: 't0',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.ME,
							me: { programInput: 'input2', previewInput: 'input3', transitionEffect: 5, transitionDuration: 20 },
						},
					}),
					tc_me1_0: wrapIntoResolvedInstance<TimelineObjTriCasterME>({
						layer: 'tc_me1_0',
						enable: { while: '1' },
						id: 't1',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.ME,
							me: {
								keyers: { dsk2: { onAir: true, input: 'input5' } },
							},
						},
					}),
				},
				nextEvents: [],
			},
			{
				tc_me1_0: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.ME,
					name: 'v1',
					deviceId: 'tc0',
				}),
			}
		)

		const expectedState = mockGetBlankState()
		const expectedMe1State = wrapStateInContext(mockGetDefaultMe())
		expectedState.mixEffects.v1 = expectedMe1State

		expectedMe1State.keyers.dsk2.input = { value: 'input5', timelineObjId: 't1' }
		expectedMe1State.keyers.dsk2.onAir = { value: true, timelineObjId: 't1' }

		expect(convertedState).toEqual(expectedState)
	})

	test('sets matrix outputs', () => {
		const converter = setupTimelineStateConverter()

		const convertedState = converter.getTriCasterStateFromTimelineState(
			{
				time: Date.now(),
				layers: {
					tc_out2: wrapIntoResolvedInstance<TimelineObjTriCasterMatrixOutput>({
						layer: 'tc_out2',
						enable: { while: '1' },
						id: 't0',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.MATRIX_OUTPUT,
							source: 'input5',
						},
					}),
				},
				nextEvents: [],
			},
			{
				tc_out2: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.MATRIX_OUTPUT,
					name: 'out2',
					deviceId: 'tc0',
				}),
			}
		)

		const expectedState = mockGetBlankState()
		expectedState.matrixOutputs.out2 = {
			source: { value: 'input5', timelineObjId: 't0' },
		}

		expect(convertedState).toEqual(expectedState)
	})

	test('sets mix outputs', () => {
		const converter = setupTimelineStateConverter()

		const convertedState = converter.getTriCasterStateFromTimelineState(
			{
				time: Date.now(),
				layers: {
					tc_out2: wrapIntoResolvedInstance<TimelineObjTriCasterMixOutput>({
						layer: 'tc_out2',
						enable: { while: '1' },
						id: 't0',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.MIX_OUTPUT,
							source: 'me_program',
							meClean: true,
						},
					}),
				},
				nextEvents: [],
			},
			{
				tc_out2: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.MIX_OUTPUT,
					name: 'mix2',
					deviceId: 'tc0',
				}),
			}
		)

		const expectedState = mockGetBlankState()
		expectedState.mixOutputs.mix2 = {
			source: { value: 'me_program', timelineObjId: 't0' },
			meClean: { value: true, timelineObjId: 't0' },
		}

		expect(convertedState).toEqual(expectedState)
	})

	test('sets input properties', () => {
		const converter = setupTimelineStateConverter()

		const convertedState = converter.getTriCasterStateFromTimelineState(
			{
				time: Date.now(),
				layers: {
					tc_inp2: wrapIntoResolvedInstance<TimelineObjTriCasterInput>({
						layer: 'tc_inp2',
						enable: { while: '1' },
						id: 't0',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.INPUT,
							input: {
								videoSource: 'Input 10',
								videoActAsAlpha: true,
							},
						},
					}),
				},
				nextEvents: [],
			},
			{
				tc_inp2: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.INPUT,
					name: 'input2',
					deviceId: 'tc0',
				}),
			}
		)

		const expectedState = mockGetBlankState()
		expectedState.inputs.input2 = {
			videoSource: { value: 'Input 10', timelineObjId: 't0' },
			videoActAsAlpha: { value: true, timelineObjId: 't0' },
		}

		expect(convertedState).toEqual(expectedState)
	})

	test('sets temporal priority', () => {
		const converter = setupTimelineStateConverter()

		const convertedState = converter.getTriCasterStateFromTimelineState(
			{
				time: Date.now(),
				layers: {
					tc_me0_0: wrapIntoResolvedInstance<TimelineObjTriCasterME>({
						layer: 'tc_me0_0',
						enable: { while: '1' },
						id: 't0',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.ME,
							me: { programInput: 'input2', previewInput: 'input3', transitionEffect: 5, transitionDuration: 20 },
						},
					}),
					tc_me0_1: wrapIntoResolvedInstance<TimelineObjTriCasterME>({
						layer: 'tc_me0_1',
						enable: { while: '1' },
						id: 't1',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.ME,
							me: {
								keyers: { dsk2: { onAir: true, input: 'input5' } },
							},
							temporalPriority: -1,
						},
					}),
				},
				nextEvents: [],
			},
			{
				tc_me0_0: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.ME,
					name: 'main',
					deviceId: 'tc0',
				}),
				tc_me0_1: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.ME,
					name: 'main',
					deviceId: 'tc0',
				}),
			}
		)

		const expectedState = mockGetBlankState()
		const expectedMainMeState = wrapStateInContext(mockGetDefaultMainMe())
		expectedState.mixEffects.main = expectedMainMeState

		expectedMainMeState.programInput = { value: 'input2', timelineObjId: 't0' }
		expectedMainMeState.previewInput = { value: 'input3', timelineObjId: 't0' }
		expectedMainMeState.transitionEffect = { value: 5, timelineObjId: 't0' }
		expectedMainMeState.transitionDuration = { value: 20, timelineObjId: 't0' }
		expectedMainMeState.keyers.dsk2.input = { value: 'input5', timelineObjId: 't1', temporalPriority: -1 }
		expectedMainMeState.keyers.dsk2.onAir = { value: true, timelineObjId: 't1', temporalPriority: -1 }

		expect(convertedState).toEqual(expectedState)
	})
})
