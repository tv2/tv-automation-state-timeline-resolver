import { Conductor } from '../../../conductor'
import { SingularLiveDevice } from '..'
import {
	MappingSingularLive,
	Mappings,
	DeviceType,
	TimelineContentTypeSingularLive,
} from 'timeline-state-resolver-types'
import { MockTime } from '../../../__tests__/mockTime'
import { ThreadedClass } from 'threadedclass'
import { getMockCall } from '../../../__tests__/lib'

// let nowActual = Date.now()
describe('Singular.Live', () => {
	const mockTime = new MockTime()
	beforeEach(() => {
		mockTime.init()
	})

	test('POST message', async () => {
		const commandReceiver0: any = jest.fn(async () => {
			return Promise.resolve()
		})
		const myLayerMapping0: MappingSingularLive = {
			device: DeviceType.SINGULAR_LIVE,
			deviceId: 'mySingular',
			compositionName: 'Lower Third',
		}
		const myLayerMapping: Mappings = {
			myLayer0: myLayerMapping0,
		}

		const myConductor = new Conductor({
			multiThreadedResolver: false,
			getCurrentTime: mockTime.getCurrentTime,
		})
		await myConductor.init()
		await myConductor.addDevice('mySingular', {
			type: DeviceType.SINGULAR_LIVE,
			options: {
				accessToken: 'DUMMY_TOKEN',
			},
			commandReceiver: commandReceiver0,
		})
		myConductor.setTimelineAndMappings([], myLayerMapping)
		await mockTime.advanceTimeToTicks(10100)

		const deviceContainer = myConductor.getDevice('mySingular')
		const device = deviceContainer!.device as ThreadedClass<SingularLiveDevice>

		// Check that no commands has been scheduled:
		expect(await device.queue).toHaveLength(0)

		myConductor.setTimelineAndMappings([
			{
				id: 'obj0',
				enable: {
					start: mockTime.now + 1000, // in 1 second
					duration: 2000,
				},
				layer: 'myLayer0',
				content: {
					deviceType: DeviceType.SINGULAR_LIVE,
					type: TimelineContentTypeSingularLive.COMPOSITION,
					controlNode: {
						payload: {
							Name: 'Thomas',
							Title: 'Foreperson',
						},
					},
				},
			},
		])
		await mockTime.advanceTimeToTicks(10990)
		expect(commandReceiver0).toHaveBeenCalledTimes(0)
		await mockTime.advanceTimeToTicks(11100)

		expect(commandReceiver0).toHaveBeenCalledTimes(2)
		expect(commandReceiver0).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				compositionName: 'Lower Third',
				controlNode: {
					payload: {
						Name: 'Thomas',
						Title: 'Foreperson',
					},
				},
			}),
			expect.anything(),
			expect.stringContaining('obj0')
		)
		expect(getMockCall(commandReceiver0, 0, 2)).toMatch(/added/) // context
		await mockTime.advanceTimeToTicks(16000)
		expect(commandReceiver0).toHaveBeenCalledTimes(3)
	})
})
