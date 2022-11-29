import { TimelineState } from 'superfly-timeline'
import {
	Mappings,
	MappingTriCaster,
	MappingTriCasterType,
	TSRTimelineObjBase,
	isTimelineObjTriCasterAudioChannel,
	isTimelineObjTriCasterDSK,
	isTimelineObjTriCasterME,
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'
import { State } from './state'

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] }

export class TimelineStateConverter {
	constructor(
		private readonly getDefaultState: () => State,
		private readonly inputCount: number,
		private readonly audioChannelNameToIndexMap: Map<string, number>
	) {}

	getStateFromTimelineState(timelineState: TimelineState, newMappings: Mappings, deviceId: string): State {
		const resultState = this.getDefaultState()
		const sortedLayers = this.sortLayers(timelineState)

		_.each(sortedLayers, ({ tlObject, layerName }) => {
			const mapping = newMappings[layerName] as MappingTriCaster | undefined
			if (!mapping || mapping.deviceId !== deviceId) {
				return
			}
			switch (mapping.mappingType) {
				case MappingTriCasterType.MixEffect:
					this.applyMixEffectState(resultState, tlObject, mapping)
					break
				case MappingTriCasterType.DownStreamKeyer:
					this.applyDskState(resultState, tlObject, mapping)
					break
				case MappingTriCasterType.AudioChannel:
					this.applyAudioChannelState(resultState, tlObject, mapping)
					break
			}
		})

		return resultState
	}

	private sortLayers(state: TimelineState) {
		return _.map(state.layers, (tlObject, layerName) => ({
			layerName,
			tlObject: tlObject as unknown as TSRTimelineObjBase,
		})).sort((a, b) => a.layerName.localeCompare(b.layerName))
	}

	private applyMixEffectState(resultState: State, tlObject: TSRTimelineObjBase, mapping: MappingTriCaster) {
		const mixEffects = resultState.mixEffects
		if (!isTimelineObjTriCasterME(tlObject) || !this.validateInt(mapping.index, 0, mixEffects.length)) {
			return
		}
		this.deepApply(mixEffects[mapping.index], tlObject.content)
	}

	private applyDskState(resultState: State, tlObject: TSRTimelineObjBase, mapping: MappingTriCaster) {
		const mainKeyers = resultState.mixEffects[0].keyers
		if (!isTimelineObjTriCasterDSK(tlObject) || !this.validateInt(mapping.index, 0, mainKeyers.length)) {
			return
		}
		this.deepApply(mainKeyers[mapping.index], tlObject.content.keyer)
	}

	private applyAudioChannelState(resultState: State, tlObject: TSRTimelineObjBase, mapping: MappingTriCaster) {
		const audioChannels = resultState.audioChannels
		if (!isTimelineObjTriCasterAudioChannel(tlObject)) {
			return
		}
		let index: number | undefined
		if (this.validateInt(mapping.index, 0, this.inputCount)) {
			index = this.audioChannelNameToIndexMap.get(`input${mapping.index + 1}`)
		} else if (typeof mapping.index === 'string') {
			index = this.audioChannelNameToIndexMap.get(mapping.index)
		}
		if (index !== undefined) {
			this.deepApply(audioChannels[index], tlObject.content)
		}
	}

	private validateInt(value: any, min: number, max: number): value is number {
		return typeof value === 'number' && Number.isInteger(value) && value >= min && value < max
	}

	/**
	 * Deeply applies primitive properties from `source` to existing properties of `target` (in place)
	 */
	private deepApply<T>(target: T, source: DeepPartial<T>): void {
		let key: keyof T
		for (key in target) {
			if (source[key] === undefined) {
				continue
			}
			const t = target[key]
			if (typeof t === 'object') {
				this.deepApply(t, source[key] as DeepPartial<typeof t>)
			} else {
				target[key] = source[key] as typeof t
			}
		}
	}
}
