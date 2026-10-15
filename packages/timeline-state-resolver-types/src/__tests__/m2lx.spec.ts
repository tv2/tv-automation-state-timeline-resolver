import {
	DeviceOptionsM2LX,
	DeviceType,
	M2LXKeyType,
	M2LXMixerBus,
	M2LXOptions,
	M2LXTransitionType,
	MappingM2LX,
	MappingM2LXType,
	TimelineContentTypeM2LX,
	TimelineObjM2LXAny,
	isTimelineObjM2LX,
	isTimelineObjM2LXKey,
	isTimelineObjM2LXMixer,
	isTimelineObjM2LXAudio,
	isTimelineObjM2LXMediaPlayer,
	isTimelineObjM2LXRouter,
} from '../'

describe('M2L-X types', () => {
	test('models verified audio/media/router and DSK contracts', () => {
		const mappings: MappingM2LX[] = [
			{ device: DeviceType.M2LX, deviceId: 'sony', mappingType: MappingM2LXType.AUDIO, input: 'vtr3.1' },
			{ device: DeviceType.M2LX, deviceId: 'sony', mappingType: MappingM2LXType.MEDIA_PLAYER, player: 'vtr3' },
			{ device: DeviceType.M2LX, deviceId: 'sony', mappingType: MappingM2LXType.ROUTER, output: 'ch1' },
			{
				device: DeviceType.M2LX,
				deviceId: 'sony',
				mappingType: MappingM2LXType.KEY,
				bus: M2LXMixerBus.PREVIEW,
				key: { type: M2LXKeyType.DSK, index: 0 },
			},
		]
		const objects: TimelineObjM2LXAny[] = [
			{
				id: 'audio',
				layer: 'audio',
				enable: { start: 0 },
				content: {
					deviceType: DeviceType.M2LX,
					type: TimelineContentTypeM2LX.AUDIO,
					audio: { volume: 0.5, muted: false },
				},
			},
			{
				id: 'media',
				layer: 'media',
				enable: { start: 0 },
				content: {
					deviceType: DeviceType.M2LX,
					type: TimelineContentTypeM2LX.MEDIA_PLAYER,
					mediaPlayer: { assetId: 'existing.mp4', playing: true, loop: false, seek: 10 },
				},
			},
			{
				id: 'router',
				layer: 'router',
				enable: { start: 0 },
				content: {
					deviceType: DeviceType.M2LX,
					type: TimelineContentTypeM2LX.ROUTER,
					input: 'ndi2',
				},
			},
			{
				id: 'dsk',
				layer: 'dsk',
				enable: { start: 0 },
				content: {
					deviceType: DeviceType.M2LX,
					type: TimelineContentTypeM2LX.KEY,
					key: { visible: true, source: { type: 'image', name: 'still/demo.png' }, translation: { x: -800, y: -400 } },
				},
			},
		]
		expect(mappings.map((m) => m.mappingType)).toEqual(['audio', 'media_player', 'router', 'key'])
		expect(isTimelineObjM2LXAudio(objects[0])).toBe(true)
		expect(isTimelineObjM2LXMediaPlayer(objects[1])).toBe(true)
		expect(isTimelineObjM2LXRouter(objects[2])).toBe(true)
		expect(isTimelineObjM2LXKey(objects[3])).toBe(true)
		expect(isTimelineObjM2LXMediaPlayer(objects[0])).toBe(false)
	})
	test('models the public first-phase contract', () => {
		const options: M2LXOptions = {
			baseUrl: 'https://m2lx.example.test',
			password: 'credential',
			rejectUnauthorized: true,
			authenticationTimeout: 5000,
			webSocketConnectTimeout: 5000,
			commandTimeout: 2000,
			reconnectBackoff: {
				minDelay: 500,
				maxDelay: 10000,
			},
		}
		const deviceOptions: DeviceOptionsM2LX = {
			type: DeviceType.M2LX,
			options,
		}
		const mappings: MappingM2LX[] = [
			{
				device: DeviceType.M2LX,
				deviceId: 'm2lx0',
				mappingType: MappingM2LXType.MIXER,
			},
			{
				device: DeviceType.M2LX,
				deviceId: 'm2lx0',
				mappingType: MappingM2LXType.KEY,
				bus: M2LXMixerBus.PROGRAM,
				key: {
					index: 0,
					type: M2LXKeyType.PIP,
				},
			},
			{
				device: DeviceType.M2LX,
				deviceId: 'm2lx0',
				mappingType: MappingM2LXType.KEY,
				bus: M2LXMixerBus.PREVIEW,
				key: {
					index: 4,
					type: M2LXKeyType.STILL,
				},
			},
		]
		const timelineObjects: TimelineObjM2LXAny[] = [
			{
				id: 'mixer',
				enable: { start: 0 },
				layer: 'mixer',
				content: {
					deviceType: DeviceType.M2LX,
					type: TimelineContentTypeM2LX.MIXER,
					mixer: {
						program: 'cam1',
						preview: 'vtr1',
						transition: { type: M2LXTransitionType.EFFECT },
					},
				},
			},
			{
				id: 'key',
				enable: { start: 0 },
				layer: 'key',
				content: {
					deviceType: DeviceType.M2LX,
					type: TimelineContentTypeM2LX.KEY,
					key: {
						visible: true,
					},
				},
			},
		]

		expect({
			deviceOptions,
			mappings,
			timelineObjects,
		}).toMatchSnapshot()
		expect(isTimelineObjM2LX(timelineObjects[0])).toBe(true)
		expect(isTimelineObjM2LXMixer(timelineObjects[0])).toBe(true)
		expect(isTimelineObjM2LXKey(timelineObjects[1])).toBe(true)
	})
})
