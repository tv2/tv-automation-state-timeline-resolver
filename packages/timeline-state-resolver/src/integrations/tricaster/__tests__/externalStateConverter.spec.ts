import { ExternalStateConverter } from '../externalStateConverter'

function setUpExternalStateConverter() {
	return new ExternalStateConverter(
		['main', 'v1', 'v2'],
		['input1', 'input2'],
		['input1', 'input2', 'sound', 'master'],
		['a', 'b'],
		['dsk1', 'dsk2', 'dsk3', 'dsk4'],
		['mix1', 'mix2']
	)
}

describe('ExternalStateConverter.getStateFromShortcutState', () => {
	describe('Mix/Effect', () => {
		test('sets inputs', () => {
			const converter = setUpExternalStateConverter()

			const state = converter.getStateFromShortcutState(`<shortcut_states>
	<shortcut_state name="main_a_row_named_input" value="INPUT7" type="" sender="unknown"/>
	<shortcut_state name="main_b_row_named_input" value="DDR2" type="" sender="unknown"/>
</shortcut_states>`)

			expect(state.mixEffects['main'].programInput).toEqual('input7')
			expect(state.mixEffects['main'].previewInput).toEqual('ddr2')
		})

		// 		test('sets cut transition', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_select_fade" value="false" type="bool" sender="unknown"/>
		// 	<shortcut_state name="main_dsk1_select_index" value="0" type="int" sender="unknown" />
		// 	<shortcut_state name="main_dsk1_speed" value="0" type="double" sender="unknown" />
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers?.['dsk1'].transition).toEqual({
		// 				effect: 'cut',
		// 				duration: 0,
		// 			})
		// 		})

		// 		test('sets fade transition', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk1_select_fade" value="true" type="bool" sender="unknown"/>
		// 	<shortcut_state name="main_dsk1_select_index" value="0" type="int" sender="unknown" />
		// 	<shortcut_state name="main_dsk1_speed" value="2.6" type="double" sender="unknown" />
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers?.['dsk1'].transition).toEqual({
		// 				effect: 'fade',
		// 				duration: 2.6, // 2:15 in seconds:frames
		// 			})
		// 		})

		// 		test('sets numeric transition', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk1_select_fade" value="false" type="bool" sender="unknown"/>
		// 	<shortcut_state name="main_dsk1_select_index" value="5" type="int" sender="unknown" />
		// 	<shortcut_state name="main_dsk1_speed" value="1.3" type="double" sender="unknown" />
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk1'].transition).toEqual({
		// 				effect: 5,
		// 				duration: 1.3,
		// 			})
		// 		})
	})

	describe('DSK', () => {
		test('sets onAir', () => {
			const converter = setUpExternalStateConverter()

			const state = converter.getStateFromShortcutState(`<shortcut_states>
	<shortcut_state name="main_dsk1_value" value="0" type="double" sender="unknown" />
	<shortcut_state name="main_dsk2_value" value="1" type="double" sender="unknown" />
	<shortcut_state name="main_dsk3_value" value="0.5" type="double" sender="unknown" />
	<shortcut_state name="main_dsk4_value" value="0" type="double" sender="unknown" />
</shortcut_states>`)

			expect(state.mixEffects.main.keyers?.dsk1.onAir).toEqual(false)
			expect(state.mixEffects.main.keyers?.dsk2.onAir).toEqual(true)
			expect(state.mixEffects.main.keyers?.dsk3.onAir).toEqual(true)
			expect(state.mixEffects.main.keyers?.dsk4.onAir).toEqual(false)
		})

		// 		test('sets cut transition', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk1_select_fade" value="false" type="bool" sender="unknown"/>
		// 	<shortcut_state name="main_dsk1_select_index" value="0" type="int" sender="unknown" />
		// 	<shortcut_state name="main_dsk1_speed" value="0" type="double" sender="unknown" />
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk1'].transition).toEqual({
		// 				effect: 'cut',
		// 				duration: 0,
		// 			})
		// 		})

		// 		test('sets fade transition', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk1_select_fade" value="true" type="bool" sender="unknown"/>
		// 	<shortcut_state name="main_dsk1_select_index" value="0" type="int" sender="unknown" />
		// 	<shortcut_state name="main_dsk1_speed" value="2.6" type="double" sender="unknown" />
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk1'].transition).toEqual({
		// 				effect: 'fade',
		// 				duration: 2.6, // 2:15 in seconds:frames
		// 			})
		// 		})

		// 		test('sets numeric transition', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk1_select_fade" value="false" type="bool" sender="unknown"/>
		// 	<shortcut_state name="main_dsk1_select_index" value="5" type="int" sender="unknown" />
		// 	<shortcut_state name="main_dsk1_speed" value="1.3" type="double" sender="unknown" />
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk1'].transition).toEqual({
		// 				effect: 5,
		// 				duration: 1.3,
		// 			})
		// 		})

		test('sets input', () => {
			const converter = setUpExternalStateConverter()

			const state = converter.getStateFromShortcutState(`<shortcut_states>
	<shortcut_state name="main_dsk3_select_named_input" value="v6" type="" sender="unknown"/>
</shortcut_states>`)

			expect(state.mixEffects.main.keyers?.dsk3.input).toEqual('v6')
		})

		// 		test('sets position', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk3_position_x" value="1.25" type="double" sender="unknown"/>
		// 	<shortcut_state name="main_dsk3_position_y" value="-3.12" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk3'].position.x).toBeCloseTo(1.25)
		// 			expect(state.mixEffects['main'].keyers['dsk3'].position.x).toBeCloseTo(-3.12)
		// 		})

		// 		test('sets crop', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk2_crop_down_value" value="14.6666666666667" type="double" sender="unknown"/>
		// 	<shortcut_state name="main_dsk2_crop_left_value" value="29" type="double" sender="unknown"/>
		// 	<shortcut_state name="main_dsk2_crop_right_value" value="0.333333333333333" type="double" sender="unknown"/>
		// 	<shortcut_state name="main_dsk2_crop_up_value" value="3.33333333333333" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk2'].crop.down).toBeCloseTo(14.6666666666667)
		// 			expect(state.mixEffects['main'].keyers['dsk2'].crop.left).toBeCloseTo(29)
		// 			expect(state.mixEffects['main'].keyers['dsk2'].crop.right).toBeCloseTo(0.333333333333333)
		// 			expect(state.mixEffects['main'].keyers['dsk2'].crop.up).toBeCloseTo(3.33333333333333)
		// 		})

		// 		test('sets rotation', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk2_rotation_x" value="559.685555555" type="double" sender="unknown"/>
		// 	<shortcut_state name="main_dsk2_rotation_y" value="362.1" type="double" sender="unknown"/>
		// 	<shortcut_state name="main_dsk2_rotation_z" value="-200" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk2'].rotation.x).toBeCloseTo(559.685555555)
		// 			expect(state.mixEffects['main'].keyers['dsk2'].rotation.y).toBeCloseTo(362.1)
		// 			expect(state.mixEffects['main'].keyers['dsk2'].rotation.z).toBeCloseTo(-2000)
		// 		})

		// 		test('sets feather', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk2_feather_value" value="75" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk2'].feather).toBeCloseTo(75)
		// 		})
	})

	describe('Layer', () => {
		test('sets input', () => {
			const converter = setUpExternalStateConverter()

			const state = converter.getStateFromShortcutState(`<shortcut_states>
	<shortcut_state name="v2_a_row_named_input" value="v6" type="" sender="unknown"/>
</shortcut_states>`)

			expect(state.mixEffects.v2.layers?.a.input).toEqual('v6')
		})

		// 		test('sets position', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="v2_a_position_x" value="1.25" type="double" sender="unknown"/>
		// 	<shortcut_state name="v2_a_position_y" value="-3.12" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects.v2.layers?.a.position?.x).toBeCloseTo(1.25)
		// 			expect(state.mixEffects.v2.layers?.a.position?.x).toBeCloseTo(-3.12)
		// 		})

		// 		test('sets crop', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="v2_a_crop_down_value" value="14.6666666666667" type="double" sender="unknown"/>
		// 	<shortcut_state name="v2_a_crop_left_value" value="29" type="double" sender="unknown"/>
		// 	<shortcut_state name="v2_a_crop_right_value" value="0.333333333333333" type="double" sender="unknown"/>
		// 	<shortcut_state name="v2_a_crop_up_value" value="3.33333333333333" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects['v2'].layers['a'].crop.down).toBeCloseTo(14.6666666666667)
		// 			expect(state.mixEffects['v2'].layers['a'].crop.left).toBeCloseTo(29)
		// 			expect(state.mixEffects['v2'].layers['a'].crop.right).toBeCloseTo(0.333333333333333)
		// 			expect(state.mixEffects['v2'].layers['a'].crop.up).toBeCloseTo(3.33333333333333)
		// 		})

		// 		test('sets rotation', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="v2_a_rotation_x" value="559.685555555" type="double" sender="unknown"/>
		// 	<shortcut_state name="v2_a_rotation_y" value="362.1" type="double" sender="unknown"/>
		// 	<shortcut_state name="v2_a_rotation_z" value="-200" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects['v2'].layers['a'].rotation.x).toBeCloseTo(559.685555555)
		// 			expect(state.mixEffects['v2'].layers['a'].rotation.y).toBeCloseTo(362.1)
		// 			expect(state.mixEffects['v2'].layers['a'].rotation.z).toBeCloseTo(-2000)
		// 		})

		// 		test('sets feather', () => {
		// 			const converter = setUpExternalStateConverter()

		// 			const state = converter.getStateFromShortcutState(`<shortcut_states>
		// 	<shortcut_state name="main_dsk2_feather_value" value="75" type="double" sender="unknown"/>
		// </shortcut_states>`)

		// 			expect(state.mixEffects['main'].keyers['dsk2'].feather).toBeCloseTo(75)
		// 		})
	})
})

// const mockGetDefaultState = (): TriCasterState => ({
// 	mixEffects: { main: mockGetDefaultMe(), v1: mockGetDefaultMe() }, // pretend we only have mappings for those two
// 	inputs: {}, //new Array(4).map(() => ({ videoSource: undefined, videoActAsAlpha: false })),
// 	// @ts-ignore
// 	audioChannels: {}, // new Array(4).map(() => ({ volume: 0, isMuted: true })),
// 	isRecording: false,
// 	isStreaming: false,
// 	outputs: {}, //new Array(4).map(() => 'Program'),
// })

// const mockGetDefaultMe = (): TriCasterMixEffectState => ({
// 	programInput: 'black',
// 	previewInput: 'black',
// 	transition: { effect: 'cut', duration: 0 },
// 	layers: { a: mockGetDefaultLayer(), b: mockGetDefaultLayer(), c: mockGetDefaultLayer(), d: mockGetDefaultLayer() },
// 	keyers: {
// 		dsk1: mockGetDefaultKeyer(),
// 		dsk2: mockGetDefaultKeyer(),
// 		dsk3: mockGetDefaultKeyer(),
// 		dsk4: mockGetDefaultKeyer(),
// 	},
// 	delegate: ['background'],
// })

// const mockGetDefaultKeyer = (): TriCasterKeyerState => ({
// 	input: 'black',
// 	positioningAndCropEnabled: false,
// 	position: { x: 0, y: 0 },
// 	scale: { x: 100, y: 100 },
// 	rotation: { x: 0, y: 0, z: 0 },
// 	crop: { left: 0, right: 0, up: 0, down: 0 },
// 	onAir: false,
// 	transition: { effect: 'cut', duration: 1 },
// 	feather: 0,
// })

// const mockGetDefaultLayer = (): TriCasterLayerState => ({
// 	input: 'black',
// 	positioningAndCropEnabled: false,
// 	position: { x: 0, y: 0 },
// 	scale: { x: 100, y: 100 },
// 	rotation: { x: 0, y: 0, z: 0 },
// 	crop: { left: 0, right: 0, up: 0, down: 0 },
// 	feather: 0,
// })
