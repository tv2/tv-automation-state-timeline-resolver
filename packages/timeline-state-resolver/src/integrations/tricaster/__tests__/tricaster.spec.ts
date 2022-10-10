import { literal } from '../../../devices/device'
import { ResolvedTimelineObjectInstance } from 'superfly-timeline'
import {
	DeviceType,
	MappingTriCaster,
	MappingTriCasterType,
	TimelineContentTypeTriCaster,
	TimelineObjTriCasterME,
} from 'timeline-state-resolver-types'
import { convertStateToTriCaster, diffStates, getDefaultState } from '../state'

describe('TriCaster', () => {
	test('diffStates generates commands', () => {
		const oldState = getDefaultState()
		const newState = getDefaultState()
		newState.mixEffects[0].transition.duration = 200
		const commands = diffStates(oldState, newState)
		expect(commands.length).toEqual(1)
	})

	test('convertStateToTriCaster updates deep properties', () => {
		const defaultState = getDefaultState()
		const convertedState = convertStateToTriCaster(
			{
				time: Date.now(),
				layers: {
					tc_me0_0: literal<TimelineObjTriCasterME>({
						layer: 'tc_me0_0',
						enable: { while: '1' },
						id: 't0',
						content: { deviceType: DeviceType.TRICASTER, type: TimelineContentTypeTriCaster.ME, programInput: 2 },
					}) as any as ResolvedTimelineObjectInstance, // @todo: get rid of this
					tc_me0_1: literal<TimelineObjTriCasterME>({
						layer: 'tc_me0_1',
						enable: { while: '1' },
						id: 't0',
						content: {
							deviceType: DeviceType.TRICASTER,
							type: TimelineContentTypeTriCaster.ME,
							keyers: [undefined, { onAir: true, input: 3 }],
						},
					}) as any as ResolvedTimelineObjectInstance, // @todo: get rid of this
				},
				nextEvents: [],
			},
			{
				tc_me0_0: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.MixEffect,
					index: 0,
					deviceId: 'tc0',
				}),
				tc_me0_1: literal<MappingTriCaster>({
					device: DeviceType.TRICASTER,
					mappingType: MappingTriCasterType.MixEffect,
					index: 0,
					deviceId: 'tc0',
				}),
			},
			'tc0'
		)
		defaultState.mixEffects[0].programInput = 2
		defaultState.mixEffects[0].keyers[1].onAir = true
		defaultState.mixEffects[0].keyers[1].input = 3
		expect(convertedState).toMatchObject(defaultState)
	})
})
