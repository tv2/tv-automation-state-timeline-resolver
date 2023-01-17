import { TimelineState } from 'superfly-timeline'
import {
	Mappings,
	MappingTriCaster,
	MappingTriCasterType,
	TSRTimelineObjBase,
	isTimelineObjTriCasterAudioChannel,
	isTimelineObjTriCasterDSK,
	isTimelineObjTriCasterME,
	isTimelineObjTriCasterMixOutput,
	MappingTriCasterMixEffect,
	MappingTriCasterDownStreamKeyer,
	MappingTriCasterAudioChannel,
	MappingTriCasterMixOutput,
	TriCasterAudioChannelName,
	TriCasterMixEffectName,
	TriCasterMixOutputName,
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'
import { TriCasterState } from './state'

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] }

export class TimelineStateConverter {
	constructor(
		private readonly getDefaultState: () => TriCasterState,
		private readonly meNames: TriCasterMixEffectName[],
		private readonly audioChannelNames: TriCasterAudioChannelName[],
		private readonly mixOutputNames: TriCasterMixOutputName[]
	) {}

	getStateFromTimelineState(timelineState: TimelineState, newMappings: Mappings, deviceId: string): TriCasterState {
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
				case MappingTriCasterType.MixOutput:
					this.applyMixOutputState(resultState, tlObject, mapping)
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

	private applyMixEffectState(
		resultState: TriCasterState,
		tlObject: TSRTimelineObjBase,
		mapping: MappingTriCasterMixEffect
	) {
		const mixEffects = resultState.mixEffects
		if (!isTimelineObjTriCasterME(tlObject) || !this.meNames.includes(mapping.name)) return
		this.deepApply(mixEffects[mapping.name], tlObject.content.me)
	}

	private applyDskState(
		resultState: TriCasterState,
		tlObject: TSRTimelineObjBase,
		mapping: MappingTriCasterDownStreamKeyer
	) {
		const mainKeyers = resultState.mixEffects['main']
		if (!isTimelineObjTriCasterDSK(tlObject) || !mainKeyers) {
			return
		}
		this.deepApply(mainKeyers[mapping.name], tlObject.content.keyer)
	}

	private applyAudioChannelState(
		resultState: TriCasterState,
		tlObject: TSRTimelineObjBase,
		mapping: MappingTriCasterAudioChannel
	) {
		const audioChannels = resultState.audioChannels
		if (!isTimelineObjTriCasterAudioChannel(tlObject) || !this.audioChannelNames.includes(mapping.name)) return
		this.deepApply(audioChannels[mapping.name], tlObject.content)
	}

	private applyMixOutputState(
		resultState: TriCasterState,
		tlObject: TSRTimelineObjBase,
		mapping: MappingTriCasterMixOutput
	) {
		if (!isTimelineObjTriCasterMixOutput(tlObject) || !this.mixOutputNames.includes(mapping.name)) return
		resultState.outputs[mapping.name] = { source: tlObject.content.source }
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
