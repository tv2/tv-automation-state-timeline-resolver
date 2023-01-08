import { ElementCompact, xml2js } from 'xml-js'
import { TriCasterState } from './state'

export class ExternalStateConverter {
	constructor(
		private readonly getDefaultState: () => TriCasterState,
		private readonly _inputCount: number,
		private readonly _audioChannelNameToIndexMap: Map<string, number>
	) {}

	getStateFromShortcutState(shortcutStateXml: string): TriCasterState {
		const resultState = this.getDefaultState()
		const parsedState = xml2js(shortcutStateXml, { compact: true }) as ElementCompact
		console.log(this._inputCount, this._audioChannelNameToIndexMap)
		console.log(parsedState.shortcut_states.shortcut_state.length)
		//resultState.isRecording = jsonObj
		return resultState
	}
}
