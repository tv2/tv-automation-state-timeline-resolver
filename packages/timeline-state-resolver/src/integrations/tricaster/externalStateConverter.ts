import { xml2json } from 'xml-js'
import { TriCasterState } from './state'

export class ExternalStateConverter {
	constructor(
		private readonly getDefaultState: () => TriCasterState,
		private readonly _inputCount: number,
		private readonly _audioChannelNameToIndexMap: Map<string, number>
	) {}

	getStateFromShortcutState(shortcutStateXml: string): TriCasterState {
		const resultState = this.getDefaultState()
		const jsonString = xml2json(shortcutStateXml, { compact: true })
		const jsonObj = JSON.parse(jsonString)
		console.log(this._inputCount, this._audioChannelNameToIndexMap)
		console.log(jsonObj.shortcut_states.shortcut_state.length)
		//resultState.isRecording = jsonObj
		return resultState
	}
}
