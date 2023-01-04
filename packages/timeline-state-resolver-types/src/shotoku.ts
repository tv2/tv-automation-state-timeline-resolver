import { Mapping } from './mapping'
import { DeviceType } from '.'

export interface ShotokuOptions {
	host: string
	port: number
}

export interface MappingShotoku extends Mapping {
	device: DeviceType.SHOTOKU
}

export enum TimelineContentTypeShotoku {
	SHOT = 'shot',
	SEQUENCE = 'sequence',
}

export enum ShotokuTransitionType {
	Cut = 'cut',
	Fade = 'fade',
}
export interface ShotokuCommandContent {
	shot: number
	show?: number /** Defaults to 1 */
	transitionType?: ShotokuTransitionType
	changeOperatorScreen?: boolean
}

export interface TimelineContentShotokuShot extends ShotokuCommandContent {
	deviceType: DeviceType.SHOTOKU
	type: TimelineContentTypeShotoku.SHOT
}
export interface TimelineContentShotokuSequence {
	deviceType: DeviceType.SHOTOKU
	type: TimelineContentTypeShotoku.SEQUENCE

	sequenceId: string
	shots: Array<
		{
			offset: number
		} & ShotokuCommandContent
	>
}

export type TimelineContentShotoku = TimelineContentShotokuShot | TimelineContentShotokuSequence
