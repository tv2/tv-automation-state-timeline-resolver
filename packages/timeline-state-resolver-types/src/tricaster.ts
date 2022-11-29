import { Mapping } from './mapping'
import { DeviceType, TimelineDatastoreReferencesContent, TSRTimelineObjBase } from '.'
// export type MappingTriCasterAny =

type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never }
type XOR<T, U> = T | U extends object ? (Without<T, U> & U) | (Without<U, T> & T) : T | U
export interface MappingTriCaster extends Mapping {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType
	index?: number | string
}

export interface MappingTriCasterMixEffect extends MappingTriCaster {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType.MixEffect
	index: number
}

export interface MappingTriCasterDownStreamKeyer extends MappingTriCaster {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType.DownStreamKeyer
	index: number
}

export interface MappingTriCasterAudioChannel extends MappingTriCaster {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType.AudioChannel
	index: number | string
}

export enum MappingTriCasterType {
	MixEffect = 0,
	DownStreamKeyer = 1,
	AudioChannel = 2,
	Recording = 3,
	Streaming = 4,
}

export interface TriCasterOptions {
	host: string
	port: number
}

export enum TimelineContentTypeTriCaster {
	ME = 'ME',
	DSK = 'DSK',
	AUDIO_CHANNEL = 'AUDIO_CHANNEL',
}

export type TimelineObjTriCasterAny = TimelineObjTriCasterME

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

		programInput?: number
		keyers?: (TriCasterKeyer | undefined)[]
	} & XOR<{ previewInput?: number }, { transition?: TriCasterTransition }> &
		TimelineDatastoreReferencesContent
}

export function isTimelineObjTriCasterME(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjTriCasterME {
	return (timelineObject as TimelineObjTriCasterBase).content?.type === TimelineContentTypeTriCaster.ME
}

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

export type TriCasterTransitionEffect = 'cut' | 'fade' | number

export interface TriCasterTransition {
	effect: TriCasterTransitionEffect
	/** Duration in milliseconds, applicable to effects other than 'cut' */
	duration: number
}

export interface TriCasterLayer {
	input?: number
	positioningEnabled?: boolean
	position?: { x: number; y: number }
	scale?: { x: number; y: number }
	rotation?: { x: number; y: number; z: number }
	cropEnabled?: boolean
	crop?: { left: number; right: number; up: number; down: number }
}

export interface TriCasterKeyer extends TriCasterLayer {
	onAir: boolean
	transition?: TriCasterTransition
}
