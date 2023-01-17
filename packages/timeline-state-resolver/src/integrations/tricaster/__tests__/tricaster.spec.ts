// import { literal } from '../../../devices/device'
// import { ResolvedTimelineObjectInstance } from 'superfly-timeline'
// import {
// 	DeviceType,
// 	MappingTriCaster,
// 	MappingTriCasterType,
// 	TimelineContentTypeTriCaster,
// 	TimelineObjTriCasterME,
// } from 'timeline-state-resolver-types'
import { TriCasterStateDiffer } from '../state'

describe('TriCasterStateDiffer', () => {
	test('TriCasterStateDiffer generates commands', () => {
		const differ = new TriCasterStateDiffer({
			inputCount: 8,
			meCount: 2,
			dskCount: 2,
			ddrCount: 2,
			productModel: 'TEST',
			sessionName: 'TEST',
			outputCount: 4,
		})

		const oldState = differ.getDefaultState()
		const newState = differ.getDefaultState()
		newState.mixEffects.main.transition.duration = 200
		const commands = differ.getCommandsToAchieveState(newState, oldState)
		console.log(commands)
		expect(commands.length).toEqual(1)
		expect(commands[0].command).toEqual({ target: 'main', name: '_speed', value: 200 })
	})

	test('convertStateToTriCaster updates deep properties', () => {
		// const defaultState = differ.getDefaultState()
		// const convertedState = convertStateToTriCaster(
		// 	{
		// 		time: Date.now(),
		// 		layers: {
		// 			tc_me0_0: literal<TimelineObjTriCasterME>({
		// 				layer: 'tc_me0_0',
		// 				enable: { while: '1' },
		// 				id: 't0',
		// 				content: { deviceType: DeviceType.TRICASTER, type: TimelineContentTypeTriCaster.ME, programInput: 2 },
		// 			}) as any as ResolvedTimelineObjectInstance, // @todo: get rid of this
		// 			tc_me0_1: literal<TimelineObjTriCasterME>({
		// 				layer: 'tc_me0_1',
		// 				enable: { while: '1' },
		// 				id: 't0',
		// 				content: {
		// 					deviceType: DeviceType.TRICASTER,
		// 					type: TimelineContentTypeTriCaster.ME,
		// 					keyers: [undefined, { onAir: true, input: 3 }],
		// 				},
		// 			}) as any as ResolvedTimelineObjectInstance, // @todo: get rid of this
		// 		},
		// 		nextEvents: [],
		// 	},
		// 	{
		// 		tc_me0_0: literal<MappingTriCaster>({
		// 			device: DeviceType.TRICASTER,
		// 			mappingType: MappingTriCasterType.MixEffect,
		// 			index: 0,
		// 			deviceId: 'tc0',
		// 		}),
		// 		tc_me0_1: literal<MappingTriCaster>({
		// 			device: DeviceType.TRICASTER,
		// 			mappingType: MappingTriCasterType.MixEffect,
		// 			index: 0,
		// 			deviceId: 'tc0',
		// 		}),
		// 	},
		// 	'tc0'
		// )
		// defaultState.mixEffects[0].programInput = 2
		// defaultState.mixEffects[0].keyers[1].onAir = true
		// defaultState.mixEffects[0].keyers[1].input = 3
		// expect(convertedState).toMatchObject(defaultState)
	})
})
