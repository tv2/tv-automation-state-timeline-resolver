import { xml2json } from 'xml-js'
import { State } from './state'

export class ExternalStateConverter {
	constructor(
		private readonly getDefaultState: () => State,
		private readonly _inputCount: number,
		private readonly _audioChannelNameToIndexMap: Map<string, number>
	) {}

	getStateFromShortcutState(shortcutStateXml: string): State {
		const resultState = this.getDefaultState()
		const jsonString = xml2json(shortcutStateXml, { compact: true })
		const jsonObj = JSON.parse(jsonString)
		console.log(this._inputCount, this._audioChannelNameToIndexMap)
		console.log(jsonObj.shortcut_states.shortcut_state.length)
		//resultState.isRecording = jsonObj
		return resultState
	}
}
