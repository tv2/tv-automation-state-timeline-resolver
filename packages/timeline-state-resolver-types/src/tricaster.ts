import { Mapping } from './mapping'
import { DeviceType, TimelineDatastoreReferencesContent, TSRTimelineObjBase } from '.'
// export type MappingTriCasterAny =

export interface MappingTriCaster extends Mapping {
	device: DeviceType.TRICASTER
	mappingType: MappingTriCasterType
	index?: number
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
		transition?: TriCasterTransition
		keyers?: (TriCasterKeyer | undefined)[]
	} & TimelineDatastoreReferencesContent
}

export interface TimelineObjTriCasterDSK extends TimelineObjTriCasterBase {
	content: {
		deviceType: DeviceType.TRICASTER
		type: TimelineContentTypeTriCaster.DSK

		keyer: TriCasterKeyer
	} & TimelineDatastoreReferencesContent
}

export interface TriCasterTransition {
	effect: 'cut' | 'fade' | number
	/** Duration in milliseconds */
	duration: number
}

export interface TriCasterKeyer {
	onAir: boolean
	input?: number
	transition?: TriCasterTransition
	positioningEnabled?: boolean
	position?: { x: number; y: number }
	scale?: { x: number; y: number }
	rotation?: { x: number; y: number; z: number }
	cropEnabled?: boolean
	crop?: { left: number; right: number; up: number; down: number }
}
