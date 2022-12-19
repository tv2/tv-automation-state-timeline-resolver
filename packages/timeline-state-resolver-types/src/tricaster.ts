import { Mapping } from './mapping'
import { DeviceType, TimelineDatastoreReferencesContent, TSRTimelineObjBase } from '.'
// export type MappingTriCasterAny =

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U
export interface MappingTriCasterBase extends Mapping {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType
	index?: number | string
}

export interface MappingTriCasterMixEffect extends MappingTriCasterBase {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType.MixEffect
	index: number // @todo: describe it better, prhaps a different name or at least a comment (see if Core can )
}

export interface MappingTriCasterDownStreamKeyer extends MappingTriCasterBase {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType.DownStreamKeyer
	index: number // @todo as above
}

export interface MappingTriCasterAudioChannel extends MappingTriCasterBase {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType.AudioChannel
	index: string
}

export interface MappingTriCasterMixOutput extends MappingTriCasterBase {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType.MixOutput
	index: number
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

export interface TimelineObjTriCasterME extends TimelineObjTriCasterBase {
	content: {
		deviceType: DeviceType.TRICASTER
		type: TimelineContentTypeTriCaster.ME

		programInput?: string
		keyers?: (TriCasterKeyer | undefined)[] // @todo: array should only contain what we want, perhaps add an `id` property; or could this be a Record?
		layers?: (TriCasterLayer | undefined)[]
	} & XOR<{ previewInput?: string }, { transition?: TriCasterTransition }> &
		TimelineDatastoreReferencesContent
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
		 * Any of the named Inputs, Media Players and Buffers ('INPUT<n>', 'DDR<n>', 'BFR<n>') e.g. 'INPUT12' or
		 * any of the MEs ('V<n>') e.g. 'V1' or
		 * or 'Program', 'Preview', 'program_clean', 'me_program', 'me_preview'
		 */
		source: string // @todo: consider template literal types? `DDR${number}`
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

// @note: leave those in the API value ranges, not the UI ranges as seen in the Tricaster UI
export interface TriCasterLayer {
	input?: number | string
	positioningEnabled?: boolean
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
		 * Default: 1.0; Range: 0.0 - 5.0
		 */
		x: number
		/**
		 * Vertical scale factor
		 * Default: 1.0; Range: 0.0 - 5.0
		 */
		y: number
	}
	rotation?: { x: number; y: number; z: number }
	cropEnabled?: boolean
	crop?: { left: number; right: number; up: number; down: number }
}

export interface TriCasterKeyer extends TriCasterLayer {
	onAir: boolean
	transition?: TriCasterTransition
}
