import { Mapping } from './mapping'
import { DeviceType, TimelineDatastoreReferencesContent, TSRTimelineObjBase } from '.'

export type TriCasterMixEffectName = 'main' | `v${number}`
export type TriCasterKeyerName = `dsk${number}`
export type TriCasterInputName = `input${number}`
export type TriCasterSourceName = TriCasterInputName | `ddr${number}` | `bfr${number}` | 'black'
export type TriCasterAudioChannelName = TriCasterSourceName | 'sound' | 'master'
export type TriCasterLayerName = 'a' | 'b' | 'c' | 'd'
export type TriCasterDelegateName = 'background' | TriCasterKeyerName
export type TriCasterMixOutputName = `mix${number}`

interface MappingTriCasterBase extends Mapping {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType
}

export interface MappingTriCasterMixEffect extends MappingTriCasterBase {
	mappingType: MappingTriCasterType.MixEffect
	name: TriCasterMixEffectName
}

export interface MappingTriCasterDownStreamKeyer extends MappingTriCasterBase {
	mappingType: MappingTriCasterType.DownStreamKeyer
	name: TriCasterKeyerName
}

export interface MappingTriCasterInput extends MappingTriCasterBase {
	mappingType: MappingTriCasterType.AudioChannel
	name: string
}

export interface MappingTriCasterAudioChannel extends MappingTriCasterBase {
	mappingType: MappingTriCasterType.AudioChannel
	name: TriCasterAudioChannelName
}

export interface MappingTriCasterMixOutput extends MappingTriCasterBase {
	mappingType: MappingTriCasterType.MixOutput
	name: TriCasterMixOutputName
}

export enum MappingTriCasterType {
	MixEffect = 0,
	DownStreamKeyer = 1,
	AudioChannel = 2,
	Recording = 3,
	Streaming = 4,
	MixOutput = 5,
}

export type MappingTriCaster =
	| MappingTriCasterMixEffect
	| MappingTriCasterDownStreamKeyer
	| MappingTriCasterAudioChannel
	| MappingTriCasterMixOutput

export interface TriCasterOptions {
	host: string
	port: number
}

export enum TimelineContentTypeTriCaster {
	ME = 'ME',
	DSK = 'DSK',
	AUDIO_CHANNEL = 'AUDIO_CHANNEL',
	MIX_OUTPUT = 'MIX_OUTPUT',
}

export type TimelineObjTriCasterAny =
	| TimelineObjTriCasterME
	| TimelineObjTriCasterDSK
	| TimelineObjTriCasterAudioChannel
	| TimelineObjTriCasterMixOutput

export interface TimelineObjTriCasterBase extends TSRTimelineObjBase {
	content: {
		deviceType: DeviceType.TRICASTER
		type: TimelineContentTypeTriCaster
	} & TimelineDatastoreReferencesContent
}

export type TriCasterMixEffect = {
	/** Discarded when layers are defined (M/E in effect mode) */
	programInput?: string

	/** Discarded when transition other than 'cut' is used */
	previewInput?: string

	transition?: TriCasterTransition

	keyers?: Record<TriCasterKeyerName, TriCasterKeyer>

	/** Use only in conjunction with effects that use M/E rows as layers (e.g. LiveSets)*/
	layers?: Record<TriCasterLayerName, TriCasterLayer> // Partial<Record<, TriCasterLayer>>

	/** Default: 'background' */
	delegate?: TriCasterDelegateName[]
}

export interface TimelineObjTriCasterME extends TimelineObjTriCasterBase {
	content: {
		deviceType: DeviceType.TRICASTER
		type: TimelineContentTypeTriCaster.ME

		me: TriCasterMixEffect
	} & TimelineDatastoreReferencesContent
}

export function isTimelineObjTriCasterME(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjTriCasterME {
	return (timelineObject as TimelineObjTriCasterBase).content?.type === TimelineContentTypeTriCaster.ME
}

/**
 * Convenience object for the keyers in the Main M/E
 */
export interface TimelineObjTriCasterDSK extends TimelineObjTriCasterBase {
	content: {
		deviceType: DeviceType.TRICASTER
		type: TimelineContentTypeTriCaster.DSK

		keyer: TriCasterKeyer
	} & TimelineDatastoreReferencesContent
}

export function isTimelineObjTriCasterDSK(
	timelineObject: TSRTimelineObjBase
): timelineObject is TimelineObjTriCasterDSK {
	return (timelineObject as TimelineObjTriCasterBase).content?.type === TimelineContentTypeTriCaster.DSK
}

export interface TimelineObjTriCasterAudioChannel extends TimelineObjTriCasterBase {
	content: {
		deviceType: DeviceType.TRICASTER
		type: TimelineContentTypeTriCaster.AUDIO_CHANNEL

		volume?: number
		isMuted?: boolean
	} & TimelineDatastoreReferencesContent
}

export function isTimelineObjTriCasterAudioChannel(
	timelineObject: TSRTimelineObjBase
): timelineObject is TimelineObjTriCasterAudioChannel {
	return (timelineObject as TimelineObjTriCasterBase).content?.type === TimelineContentTypeTriCaster.AUDIO_CHANNEL
}

export interface TimelineObjTriCasterMixOutput extends TimelineObjTriCasterBase {
	content: {
		deviceType: DeviceType.TRICASTER
		type: TimelineContentTypeTriCaster.MIX_OUTPUT

		/**
		 * Any of the named Inputs, Media Players and Buffers ('INPUTn', 'DDRn', 'BFRn') e.g. 'INPUT12' or
		 * any of the MEs ('Vn') e.g. 'V1' or
		 * or 'Program', 'Preview', 'program_clean', 'me_program', 'me_preview'
		 */
		source:
			| TriCasterSourceName
			| TriCasterMixEffectName
			| 'Program'
			| 'Preview'
			| 'program_clean'
			| 'me_program'
			| 'me_preview'
	} & TimelineDatastoreReferencesContent
}

export function isTimelineObjTriCasterMixOutput(
	timelineObject: TSRTimelineObjBase
): timelineObject is TimelineObjTriCasterMixOutput {
	return (timelineObject as TimelineObjTriCasterBase).content?.type === TimelineContentTypeTriCaster.MIX_OUTPUT
}

export type TriCasterTransitionEffect = 'cut' | 'fade' | number

export interface TriCasterTransition {
	effect: TriCasterTransitionEffect
	/** Duration in seconds, applicable to effects other than 'cut' */
	duration: number
}

/**
 * Properties of a layer in effect mode (as opposed to transition mode)
 * Value ranges in this type adhere to the API and may differ from the GUI
 */
export interface TriCasterLayer {
	input?: string
	positioningAndCropEnabled?: boolean
	position?: {
		/**
		 * Horizontal translation
		 * Default: 0.0 (center)
		 * Frame width: 3.555... (-3.555 is fully off-screen to the left at scale=1.0)
		 */
		x: number
		/**
		 * Vertical translation
		 * Default: 0.0 (center)
		 * Frame height: 2.0 (-2.0 is fully off-screen to the top at scale=1.0)
		 */
		y: number
	}
	scale?: {
		/**
		 * Horizontal scale factor
		 * Default: 1.0; Range: 0.0 to 5.0
		 */
		x: number
		/**
		 * Vertical scale factor
		 * Default: 1.0; Range: 0.0 to 5.0
		 */
		y: number
	}
	crop?: {
		/**
		 * Crop left (percentage)
		 * Default: 0.0 (center); Range: 0.0 to 100.0
		 */
		left: number
		/**
		 * Crop right (percentage)
		 * Default: 0.0 (center); Range: 0.0 to 100.0
		 */
		right: number
		/**
		 * Crop up (from the top, hence called "Bottom" in the UI) (percentage)
		 * Default: 0.0 (center); Range: 0.0 to 100.0
		 */
		up: number
		/**
		 * Crop down (from the top, hence called "Top" in the UI) (percentage)
		 * Default: 0.0 (center); Range: 0.0 to 100.0
		 */
		down: number
	}
	rotation?: {
		/**
		 * X-axis rotation (degrees)
		 * Default: 0.0; Range: -1440.0 to 1440.0
		 */
		x: number
		/**
		 * Y-axis rotation (degrees)
		 * Default: 0.0; Range: -1440.0 to 1440.0
		 */
		y: number
		/**
		 * Z-axis rotation (perpendicular to screen plane) (degrees)
		 * Default: 0.0; Range: -1440.0 to 1440.0
		 */
		z: number
	}
	/**
	 * Border feather (percentage)
	 * Default: 0.0; Range: 0.0 to 100.0
	 */
	feather?: number
}

/**
 * Properties of a keyer
 * Value ranges in this type adhere to the API and may differ from the GUI
 */
export interface TriCasterKeyer extends TriCasterLayer {
	onAir?: boolean
	transition?: TriCasterTransition
}
