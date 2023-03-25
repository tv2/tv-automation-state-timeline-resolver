import { TimelineState } from 'superfly-timeline'
import {
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
	MappingTriCasterInput,
	isTimelineObjTriCasterInput,
	TriCasterInputName,
	isTimelineObjTriCasterMatrixOutput,
	TriCasterMatrixOutputName,
	MappingTriCasterMatrixOutput,
	TimelineObjTriCasterBase,
	TimelineObjTriCasterME,
	TimelineObjTriCasterInput,
	TimelineObjTriCasterAudioChannel,
	TimelineObjTriCasterMixOutput,
	TimelineObjTriCasterMatrixOutput,
	TimelineObjTriCasterDSK,
	TriCasterLayerName,
	TriCasterKeyerName,
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'
import { TriCasterResourceNames } from './triCasterInfoParser'
import {
	WithContext,
	isStateEntry,
	MappingsTriCaster,
	TriCasterAudioChannelState,
	TriCasterInputState,
	TriCasterMixEffectState,
	TriCasterState,
	CompleteTriCasterInputState,
	CompleteTriCasterMixEffectState,
	RequiredDeep,
	TriCasterMatrixOutputState,
	TriCasterMixOutputState,
	wrapStateInContext,
	BLACK_INPUT,
	TriCasterLayerState,
	TriCasterKeyerState,
	DEFAULT_TRANSITION_DURATION,
} from './triCasterStateDiffer'
import { fillRecord } from './util'

type DeepPartial<T> = { [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P] }

interface TriCasterControlledResourceNames {
	mixEffects: Set<TriCasterMixEffectName>
	inputs: Set<TriCasterInputName>
	audioChannels: Set<TriCasterAudioChannelName>
	mixOutputs: Set<TriCasterMixOutputName>
	matrixOutputs: Set<TriCasterMatrixOutputName>
}

export class TriCasterTimelineStateConverter {
	private meNames: Set<TriCasterMixEffectName>
	private inputNames: Set<TriCasterInputName>
	private audioChannelNames: Set<TriCasterAudioChannelName>
	private mixOutputNames: Set<TriCasterMixOutputName>
	private matrixOutputNames: Set<TriCasterMatrixOutputName>
	private layerNames: TriCasterLayerName[]
	private keyerNames: TriCasterKeyerName[]

	constructor(availableResources: TriCasterResourceNames) {
		this.meNames = new Set(availableResources.mixEffects)
		this.inputNames = new Set(availableResources.inputs)
		this.audioChannelNames = new Set(availableResources.audioChannels)
		this.mixOutputNames = new Set(availableResources.mixOutputs)
		this.matrixOutputNames = new Set(availableResources.matrixOutputs)
		this.layerNames = availableResources.layers
		this.keyerNames = availableResources.keyers
	}

	getTriCasterStateFromTimelineState(
		timelineState: TimelineState,
		newMappings: MappingsTriCaster
	): WithContext<TriCasterState> {
		const resultState = this.getDefaultBlankState()
		const controlledResources = this.getControlledResourcesNames(newMappings)
		const sortedLayers = this.sortLayers(timelineState)

		for (const { tlObject, layerName } of Object.values(sortedLayers)) {
			const mapping: MappingTriCaster | undefined = newMappings[layerName]
			if (!mapping) {
				continue
			}
			switch (mapping.mappingType) {
				case MappingTriCasterType.ME:
					if (controlledResources.mixEffects.has(mapping.name) && isTimelineObjTriCasterME(tlObject))
						this.applyMixEffectState(resultState, tlObject, mapping)
					break
				case MappingTriCasterType.DSK:
					if (controlledResources.mixEffects.has('main') && isTimelineObjTriCasterDSK(tlObject))
						this.applyDskState(resultState, tlObject, mapping)
					break
				case MappingTriCasterType.INPUT:
					if (controlledResources.inputs.has(mapping.name) && isTimelineObjTriCasterInput(tlObject))
						this.applyInputState(resultState, tlObject, mapping)
					break
				case MappingTriCasterType.AUDIO_CHANNEL:
					if (controlledResources.audioChannels.has(mapping.name) && isTimelineObjTriCasterAudioChannel(tlObject))
						this.applyAudioChannelState(resultState, tlObject, mapping)
					break
				case MappingTriCasterType.MIX_OUTPUT:
					if (controlledResources.mixOutputs.has(mapping.name) && isTimelineObjTriCasterMixOutput(tlObject))
						this.applyMixOutputState(resultState, tlObject, mapping)
					break
				case MappingTriCasterType.MATRIX_OUTPUT:
					if (controlledResources.matrixOutputs.has(mapping.name) && isTimelineObjTriCasterMatrixOutput(tlObject))
						this.applyMatrixOutputState(resultState, tlObject, mapping)
					break
			}
		}

		return resultState
	}

	getDefaultBlankState(): WithContext<TriCasterState> {
		return wrapStateInContext<TriCasterState>({
			mixEffects: {},
			inputs: {},
			audioChannels: {},
			isRecording: false,
			isStreaming: false,
			mixOutputs: {},
			matrixOutputs: {},
		})
	}

	private getControlledResourcesNames(mappings: MappingsTriCaster): TriCasterControlledResourceNames {
		const result: TriCasterControlledResourceNames = {
			mixEffects: new Set(),
			inputs: new Set(),
			audioChannels: new Set(),
			mixOutputs: new Set(),
			matrixOutputs: new Set(),
		}
		for (const mapping of Object.values(mappings)) {
			switch (mapping.mappingType) {
				case MappingTriCasterType.ME:
					if (this.meNames.has(mapping.name)) result.mixEffects.add(mapping.name)
					break
				case MappingTriCasterType.DSK:
					// these require full control of the Main switcher - not ideal, the granularity will probably be improved
					result.mixEffects.add('main')
					break
				case MappingTriCasterType.INPUT:
					if (this.inputNames.has(mapping.name)) result.inputs.add(mapping.name)
					break
				case MappingTriCasterType.AUDIO_CHANNEL:
					if (this.audioChannelNames.has(mapping.name)) result.audioChannels.add(mapping.name)
					break
				case MappingTriCasterType.MIX_OUTPUT:
					if (this.mixOutputNames.has(mapping.name)) result.mixOutputs.add(mapping.name)
					break
				case MappingTriCasterType.MATRIX_OUTPUT:
					if (this.matrixOutputNames.has(mapping.name)) result.matrixOutputs.add(mapping.name)
					break
			}
		}
		return result
	}

	private sortLayers(state: TimelineState) {
		return _.map(state.layers, (tlObject, layerName) => ({
			layerName,
			tlObject: tlObject as unknown as TSRTimelineObjBase,
		})).sort((a, b) => a.layerName.localeCompare(b.layerName))
	}

	private applyMixEffectState(
		resultState: WithContext<TriCasterState>,
		tlObject: TimelineObjTriCasterME,
		mapping: MappingTriCasterMixEffect
	) {
		const mixEffects = resultState.mixEffects
		const modifiedMixEffect = mixEffects[mapping.name] ?? this.getDefaultMixEffectState(mapping.name !== 'main')
		this.deepApplyToStateWithContext<TriCasterMixEffectState>(modifiedMixEffect, tlObject.content.me, tlObject)
		const mixEffect = tlObject.content.me
		if ('layers' in mixEffect && Object.keys(mixEffect.layers ?? []).length) {
			modifiedMixEffect.isInEffectMode = { value: true }
		}
		mixEffects[mapping.name] = modifiedMixEffect
	}

	private applyDskState(
		resultState: WithContext<TriCasterState>,
		tlObject: TimelineObjTriCasterDSK,
		mapping: MappingTriCasterDownStreamKeyer
	) {
		const mainKeyers = resultState.mixEffects['main']?.keyers
		if (!mainKeyers) return
		this.deepApplyToStateWithContext(mainKeyers[mapping.name], tlObject.content.keyer, tlObject)
	}

	private applyInputState(
		resultState: WithContext<TriCasterState>,
		tlObject: TimelineObjTriCasterInput,
		mapping: MappingTriCasterInput
	) {
		const inputs = resultState.inputs
		const modifiedInput = inputs[mapping.name] ?? this.getDefaultInputState()
		this.deepApplyToStateWithContext<TriCasterInputState>(modifiedInput, tlObject.content.input, tlObject)
		inputs[mapping.name] = modifiedInput
	}

	private applyAudioChannelState(
		resultState: WithContext<TriCasterState>,
		tlObject: TimelineObjTriCasterAudioChannel,
		mapping: MappingTriCasterAudioChannel
	) {
		const audioChannels = resultState.audioChannels
		const modifiedAudioChannel = audioChannels[mapping.name] ?? this.getDefaultAudioChannelState()
		this.deepApplyToStateWithContext<TriCasterAudioChannelState>(
			modifiedAudioChannel,
			tlObject.content.audioChannel,
			tlObject
		)
		audioChannels[mapping.name] = modifiedAudioChannel
	}

	private applyMixOutputState(
		resultState: WithContext<TriCasterState>,
		tlObject: TimelineObjTriCasterMixOutput,
		mapping: MappingTriCasterMixOutput
	) {
		resultState.mixOutputs[mapping.name] = {
			source: {
				value: tlObject.content.source,
				timelineObjId: tlObject.id,
				temporalPriority: tlObject.content.temporalPriority,
			},
			meClean:
				tlObject.content.meClean !== undefined
					? {
							value: tlObject.content.meClean,
							timelineObjId: tlObject.id,
							temporalPriority: tlObject.content.temporalPriority,
					  }
					: resultState.mixOutputs[mapping.name]?.meClean,
		}
	}

	private applyMatrixOutputState(
		resultState: WithContext<TriCasterState>,
		tlObject: TimelineObjTriCasterMatrixOutput,
		mapping: MappingTriCasterMatrixOutput
	) {
		resultState.matrixOutputs[mapping.name] = {
			source: {
				value: tlObject.content.source,
				timelineObjId: tlObject.id,
				temporalPriority: tlObject.content.temporalPriority,
			},
		}
	}

	getDefaultMixEffectState(withLayers: boolean): WithContext<CompleteTriCasterMixEffectState> {
		return wrapStateInContext<CompleteTriCasterMixEffectState>({
			programInput: BLACK_INPUT,
			previewInput: undefined,
			isInEffectMode: false,
			transitionEffect: 'cut',
			transitionDuration: DEFAULT_TRANSITION_DURATION,
			layers: withLayers ? fillRecord(this.layerNames, () => this.getDefaultLayerState()) : {},
			keyers: fillRecord(this.keyerNames, () => this.getDefaultKeyerState()),
			delegates: ['background'],
		})
	}

	private getDefaultLayerState(): RequiredDeep<TriCasterLayerState> {
		return {
			input: BLACK_INPUT,
			positioningAndCropEnabled: false,
			position: { x: 0, y: 0 },
			scale: { x: 1, y: 1 },
			rotation: { x: 0, y: 0, z: 0 },
			crop: { left: 0, right: 0, up: 0, down: 0 },
			feather: 0,
		}
	}

	private getDefaultKeyerState(): RequiredDeep<TriCasterKeyerState> {
		return {
			onAir: false,
			transitionEffect: 'cut',
			transitionDuration: DEFAULT_TRANSITION_DURATION,
			...this.getDefaultLayerState(),
		}
	}

	getDefaultInputState(): WithContext<CompleteTriCasterInputState> {
		return wrapStateInContext<CompleteTriCasterInputState>({ videoSource: undefined, videoActAsAlpha: false })
	}

	getDefaultAudioChannelState(): WithContext<RequiredDeep<TriCasterAudioChannelState>> {
		return wrapStateInContext<RequiredDeep<TriCasterAudioChannelState>>({ volume: 0, isMuted: true })
	}

	getDefaultMixOutputState(): WithContext<RequiredDeep<TriCasterMixOutputState>> {
		return wrapStateInContext<RequiredDeep<TriCasterMixOutputState>>({ source: 'program', meClean: false })
	}

	getDefaultMatrixOutputState(): WithContext<RequiredDeep<TriCasterMatrixOutputState>> {
		return wrapStateInContext<RequiredDeep<TriCasterMatrixOutputState>>({ source: 'mix1' })
	}

	/**
	 * Deeply applies primitive properties from `source` to existing properties of `target` (in place)
	 */
	private deepApplyToStateWithContext<T>(
		target: WithContext<T>,
		source: DeepPartial<T>,
		timelineObject: TimelineObjTriCasterBase
	): void {
		let key: keyof T
		for (key in source) {
			const sourceValue = source[key]
			if (typeof target !== 'object' || !(key in target) || sourceValue === undefined || sourceValue === null) continue

			const targetEntry = target[key as keyof WithContext<T>]
			if (isStateEntry(targetEntry)) {
				targetEntry.value = sourceValue
				targetEntry.timelineObjId = timelineObject.id
				targetEntry.temporalPriority = timelineObject.content.temporalPriority
			} else if (targetEntry && typeof targetEntry === 'object') {
				this.deepApplyToStateWithContext(
					targetEntry as WithContext<T[keyof T]>,
					sourceValue as T[keyof T],
					timelineObject
				)
			}
		}
	}
}
