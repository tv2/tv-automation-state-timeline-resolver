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
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'
import { TriCasterState } from './state'

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] }

export class TimelineStateConverter {
	constructor(
		private readonly getDefaultState: () => TriCasterState,
		private readonly inputCount: number,
		private readonly outputCount: number,
		private readonly audioChannelNameToIndexMap: Map<string, number>
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
		if (!isTimelineObjTriCasterME(tlObject) || !this.isValidInt(mapping.index, 0, mixEffects.length)) {
			return
		}
		this.deepApply(mixEffects[mapping.index], tlObject.content)
	}

	private applyDskState(
		resultState: TriCasterState,
		tlObject: TSRTimelineObjBase,
		mapping: MappingTriCasterDownStreamKeyer
	) {
		const mainKeyers = resultState.mixEffects[0].keyers
		if (!isTimelineObjTriCasterDSK(tlObject) || !this.isValidInt(mapping.index, 0, mainKeyers.length)) {
			return
		}
		this.deepApply(mainKeyers[mapping.index], tlObject.content.keyer)
	}

	private applyAudioChannelState(
		resultState: TriCasterState,
		tlObject: TSRTimelineObjBase,
		mapping: MappingTriCasterAudioChannel
	) {
		const audioChannels = resultState.audioChannels
		if (!isTimelineObjTriCasterAudioChannel(tlObject)) {
			return
		}
		let index: number | undefined
		if (this.isValidInt(mapping.index, 0, this.inputCount)) {
			index = this.audioChannelNameToIndexMap.get(`input${mapping.index + 1}`)
		} else if (typeof mapping.index === 'string') {
			index = this.audioChannelNameToIndexMap.get(mapping.index)
		}
		if (index !== undefined) {
			this.deepApply(audioChannels[index], tlObject.content)
		}
	}

	private applyMixOutputState(
		resultState: TriCasterState,
		tlObject: TSRTimelineObjBase,
		mapping: MappingTriCasterMixOutput
	) {
		if (!isTimelineObjTriCasterMixOutput(tlObject) || !this.isValidInt(mapping.index, 0, this.outputCount)) {
			return
		}
		resultState.outputs[mapping.index] = tlObject.content.source
	}

	private isValidInt(value: any, minIncl: number, maxExcl: number): value is number {
		return typeof value === 'number' && Number.isInteger(value) && value >= minIncl && value < maxExcl
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
