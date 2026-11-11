import {
	DeviceOptionsM2LX,
	DeviceType,
	M2LXKeyerType,
	M2LXMixerBus,
	M2LXOptions,
	M2LXCrop,
	M2LXEffect,
	M2LXScale,
	M2LXTranslation,
	M2LXTransitionType,
	M2LXComposition,
	M2LX_COMPOSITION_DSK_SUPPORTED,
	MappingM2LX,
	MappingM2LXType,
	TimelineContentTypeM2LX,
	TimelineObjM2LXAny,
	isTimelineObjM2LX,
	isTimelineObjM2LXKeyer,
	isTimelineObjM2LXMixer,
	isTimelineObjM2LXAudio,
	isTimelineObjM2LXMediaPlayer,
	isTimelineObjM2LXRouter,
} from '../'

describe('M2L-X types', () => {
	test('models optional coordinated video DSKs with complete geometry and explicit cleanup', () => {
		const composition: M2LXComposition = {
			pip: { 0: { visible: false } },
			dsk: {
				0: { visible: false },
				1: {
					visible: true,
					source: { type: 'video', name: 'ndi2' },
					translation: { x: 0, y: 0 },
					scale: { x: 1, y: 1 },
					crop: { x: 0, y: 0, width: 1, height: 1 },
				},
			},
		}
		const supported: true = M2LX_COMPOSITION_DSK_SUPPORTED
		const object: TimelineObjM2LXAny = {
			id: 'graphics',
			layer: 'mixer',
			enable: { start: 0 },
			content: {
				deviceType: DeviceType.M2LX,
				type: TimelineContentTypeM2LX.MIXER,
				mixer: { program: 'cam1', ...(supported ? { composition } : {}) },
			},
		}
		expect(isTimelineObjM2LXMixer(object)).toBe(true)
		// @ts-expect-error DSK indices stop at 1.
		const invalidIndex: M2LXComposition = { pip: {}, dsk: { 2: { visible: false } } }
		// @ts-expect-error Visible DSKs require complete source/geometry.
		const incomplete: M2LXComposition = { pip: {}, dsk: { 0: { visible: true } } }
		// @ts-expect-error Hidden DSKs cannot set arbitrary keyer properties.
		const opacity: M2LXComposition = { pip: {}, dsk: { 0: { visible: false, opacity: 1 } } }
		expect([invalidIndex, incomplete, opacity]).toHaveLength(3)
	})

	test('models verified audio/media/router and DSK contracts', () => {
		const translation: M2LXTranslation = { x: -800, y: -400 }
		const scale: M2LXScale = { x: 0.44, y: 0.44 }
		const crop: M2LXCrop = { x: 0.01, y: 0, width: 0.99, height: 1 }
		const mappings: MappingM2LX[] = [
			{ device: DeviceType.M2LX, deviceId: 'sony', mappingType: MappingM2LXType.AUDIO, input: 'vtr3.1' },
			{ device: DeviceType.M2LX, deviceId: 'sony', mappingType: MappingM2LXType.MEDIA_PLAYER, player: 'vtr3' },
			{ device: DeviceType.M2LX, deviceId: 'sony', mappingType: MappingM2LXType.ROUTER, output: 'ch1' },
			{
				device: DeviceType.M2LX,
				deviceId: 'sony',
				mappingType: MappingM2LXType.KEYER,
				bus: M2LXMixerBus.PREVIEW,
				keyer: { type: M2LXKeyerType.DSK, index: 0 },
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
					type: TimelineContentTypeM2LX.KEYER,
					keyer: { visible: true, source: { type: 'image', name: 'still/demo.png' }, translation, scale, crop },
				},
			},
		]
		expect(mappings.map((m) => m.mappingType)).toEqual(['audio', 'media_player', 'router', 'keyer'])
		expect(isTimelineObjM2LXAudio(objects[0])).toBe(true)
		expect(isTimelineObjM2LXMediaPlayer(objects[1])).toBe(true)
		expect(isTimelineObjM2LXRouter(objects[2])).toBe(true)
		expect(isTimelineObjM2LXKeyer(objects[3])).toBe(true)
		expect(isTimelineObjM2LXMediaPlayer(objects[0])).toBe(false)
	})
	test('models the public first-phase contract', () => {
		const effect: M2LXEffect = { name: 'wipe_up', duration: 1.5 }
		const options: M2LXOptions = {
			baseUrl: 'https://m2lx.example.test',
			password: 'credential',
			eventId: 'configured-event-id',
			eventTimeout: 180000,
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
				mappingType: MappingM2LXType.KEYER,
				bus: M2LXMixerBus.PROGRAM,
				keyer: {
					index: 0,
					type: M2LXKeyerType.PIP,
				},
			},
			{
				device: DeviceType.M2LX,
				deviceId: 'm2lx0',
				mappingType: MappingM2LXType.KEYER,
				bus: M2LXMixerBus.PREVIEW,
				keyer: {
					index: 4,
					type: M2LXKeyerType.STILL,
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
						transition: { type: M2LXTransitionType.EFFECT, effect },
					},
				},
			},
			{
				id: 'keyer',
				enable: { start: 0 },
				layer: 'keyer',
				content: {
					deviceType: DeviceType.M2LX,
					type: TimelineContentTypeM2LX.KEYER,
					keyer: {
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
		expect(isTimelineObjM2LXKeyer(timelineObjects[1])).toBe(true)
	})
})
