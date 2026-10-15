import { DeviceType, TimelineDatastoreReferencesContent, TSRTimelineObjBase } from '.'
import { Mapping } from './mapping'

/**
 * A configured M2L-X video source name, for example `cam1`, `ndi1`, `vtr1`, or `replay1`.
 * Source names are discovered from the switcher configuration and must not be treated as numeric crosspoints.
 */
export type M2LXSourceName = string

export interface M2LXReconnectBackoff {
	/** Minimum reconnect delay in milliseconds. */
	minDelay?: number
	/** Maximum reconnect delay in milliseconds. */
	maxDelay?: number
}

export interface M2LXOptions {
	/** HTTPS base URL of the M2L-X API. */
	baseUrl: string
	/** Installation-specific credential for the fixed administrator account. */
	password: string
	/** Whether HTTPS and WebSocket certificates must pass verification. Defaults to true. */
	rejectUnauthorized?: boolean
	/** REST authentication timeout in milliseconds. */
	authenticationTimeout?: number
	/** WebSocket connection timeout in milliseconds. */
	webSocketConnectTimeout?: number
	/** Command completion timeout in milliseconds. */
	commandTimeout?: number
	reconnectBackoff?: M2LXReconnectBackoff
}

export enum M2LXMixerBus {
	PROGRAM = 'program',
	PREVIEW = 'preview',
}

export enum M2LXKeyType {
	PIP = 'pip',
	STILL = 'still',
	DSK = 'dsk',
}

export type M2LXPiPKeyIndex = 0 | 1 | 2 | 3
export type M2LXStillKeyIndex = 4 | 5 | 6 | 7

export type M2LXKey =
	| {
			index: M2LXPiPKeyIndex
			type: M2LXKeyType.PIP
	  }
	| {
			index: M2LXStillKeyIndex
			type: M2LXKeyType.STILL
	  }
	| {
			index: 0 | 1
			type: M2LXKeyType.DSK
	  }

interface MappingM2LXBase extends Mapping {
	device: DeviceType.M2LX
	mappingType: MappingM2LXType
}

export interface MappingM2LXMixer extends MappingM2LXBase {
	mappingType: MappingM2LXType.MIXER
}

export interface MappingM2LXKey extends MappingM2LXBase {
	mappingType: MappingM2LXType.KEY
	bus: M2LXMixerBus
	key: M2LXKey
}

export interface MappingM2LXAudio extends MappingM2LXBase {
	mappingType: MappingM2LXType.AUDIO
	/** Configured basic audio-mixer node. Defaults to audio_mixer. */
	node?: string
	/** Full input name, including its stream suffix, for example vtr3.1. */
	input: string
}

export interface MappingM2LXMediaPlayer extends MappingM2LXBase {
	mappingType: MappingM2LXType.MEDIA_PLAYER
	/** Configured media-player node, for example vtr3. Players are shared across all their uses. */
	player: string
}

export interface MappingM2LXRouter extends MappingM2LXBase {
	mappingType: MappingM2LXType.ROUTER
	/** Defaults to router. */
	node?: string
	output: string
}

export enum MappingM2LXType {
	MIXER = 'mixer',
	KEY = 'key',
	AUDIO = 'audio',
	MEDIA_PLAYER = 'media_player',
	ROUTER = 'router',
}

export type MappingM2LX =
	| MappingM2LXMixer
	| MappingM2LXKey
	| MappingM2LXAudio
	| MappingM2LXMediaPlayer
	| MappingM2LXRouter

export enum TimelineContentTypeM2LX {
	MIXER = 'mixer',
	KEY = 'key',
	AUDIO = 'audio',
	MEDIA_PLAYER = 'media_player',
	ROUTER = 'router',
}

export enum M2LXTransitionType {
	/** Switch program directly. Preview is left untouched. */
	CUT = 'cut',
	/**
	 * Run the transition effect currently configured on the device. The new program source is prepared on preview first.
	 * Optional effect configuration is applied before preparing Preview and starting the transition.
	 */
	EFFECT = 'effect',
}

export interface M2LXTransition {
	type: M2LXTransitionType
	effect?: M2LXEffect
}

export interface M2LXEffect {
	name?: string
	/** Seconds, greater than zero. */
	duration?: number
	args?: {
		fade?: number
	}
}

export interface M2LXMixer {
	program?: M2LXSourceName
	preview?: M2LXSourceName
	/**
	 * How a change of `program` is performed. Defaults to a cut.
	 * Source changes (including cuts and preview/lookahead updates) wait for an active effect to finish.
	 * Manual transition progress is intentionally not part of the timeline contract.
	 */
	transition?: M2LXTransition
}

export interface M2LXKeyVisibility {
	visible: boolean
	/** PiP: video; still: image; DSK: either. Omitted leaves it unchanged; an empty name clears and requires visible:false. */
	source?: { type: 'video' | 'image'; name: string }
	/** Native pixel offsets; not format-independent normalized coordinates. */
	translation?: M2LXVector
	scale?: M2LXVector
	/** Native M2L-X Z-plane rotation value. */
	rotation?: number
	/** Normalized crop rectangle. */
	crop?: M2LXCrop
	/** Complete native border configuration; omitted leaves the existing border untouched. */
	border?: M2LXBorder
}

export interface M2LXVector {
	x: number
	y: number
}

export interface M2LXCrop extends M2LXVector {
	width: number
	height: number
}

export interface M2LXBorder {
	color: string
	enabled: boolean
	fill_enabled: boolean
	height: number
	width: number
	inner_edge_softness: number
	outer_edge_softness: number
	inner_radius: number
	outer_radius: number
	lock_aspect_ratio: boolean
	offset: number
}

export interface M2LXAudio {
	/** Native basic-mixer volume, 0..1; not dB. Omitted leaves the current value untouched. */
	volume?: number
	muted?: boolean
}

export interface M2LXMediaPlayer {
	/** Existing catalog ID; null unloads the player. Omitted leaves the loaded asset untouched. */
	assetId?: string | null
	/** Explicit asset selection defaults to paused. Otherwise omitted leaves playback unchanged. */
	playing?: boolean
	/** Explicit asset selection defaults to loop off and reapplies this after loading. */
	loop?: boolean
	/** One-shot seek in seconds when changed, on asset selection, or on a new timeline instance. */
	seek?: number
}

export interface TimelineObjM2LXBase extends TSRTimelineObjBase {
	content: {
		deviceType: DeviceType.M2LX
		type: TimelineContentTypeM2LX
	} & TimelineDatastoreReferencesContent
}

export interface TimelineObjM2LXMixer extends TimelineObjM2LXBase {
	content: {
		deviceType: DeviceType.M2LX
		type: TimelineContentTypeM2LX.MIXER
		mixer: M2LXMixer
	} & TimelineDatastoreReferencesContent
}

export interface TimelineObjM2LXKey extends TimelineObjM2LXBase {
	content: {
		deviceType: DeviceType.M2LX
		type: TimelineContentTypeM2LX.KEY
		key: M2LXKeyVisibility
	} & TimelineDatastoreReferencesContent
}

export interface TimelineObjM2LXAudio extends TimelineObjM2LXBase {
	content: {
		deviceType: DeviceType.M2LX
		type: TimelineContentTypeM2LX.AUDIO
		audio: M2LXAudio
	} & TimelineDatastoreReferencesContent
}

export interface TimelineObjM2LXMediaPlayer extends TimelineObjM2LXBase {
	content: {
		deviceType: DeviceType.M2LX
		type: TimelineContentTypeM2LX.MEDIA_PLAYER
		mediaPlayer: M2LXMediaPlayer
	} & TimelineDatastoreReferencesContent
}

export interface TimelineObjM2LXRouter extends TimelineObjM2LXBase {
	content: {
		deviceType: DeviceType.M2LX
		type: TimelineContentTypeM2LX.ROUTER
		input: M2LXSourceName
	} & TimelineDatastoreReferencesContent
}

export type TimelineObjM2LXAny =
	| TimelineObjM2LXMixer
	| TimelineObjM2LXKey
	| TimelineObjM2LXAudio
	| TimelineObjM2LXMediaPlayer
	| TimelineObjM2LXRouter

export function isTimelineObjM2LX(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXBase {
	return timelineObject.content.deviceType === DeviceType.M2LX
}

export function isTimelineObjM2LXMixer(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXMixer {
	return isTimelineObjM2LX(timelineObject) && timelineObject.content.type === TimelineContentTypeM2LX.MIXER
}

export function isTimelineObjM2LXKey(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXKey {
	return isTimelineObjM2LX(timelineObject) && timelineObject.content.type === TimelineContentTypeM2LX.KEY
}

export function isTimelineObjM2LXAudio(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXAudio {
	return isTimelineObjM2LX(timelineObject) && timelineObject.content.type === TimelineContentTypeM2LX.AUDIO
}

export function isTimelineObjM2LXMediaPlayer(
	timelineObject: TSRTimelineObjBase
): timelineObject is TimelineObjM2LXMediaPlayer {
	return isTimelineObjM2LX(timelineObject) && timelineObject.content.type === TimelineContentTypeM2LX.MEDIA_PLAYER
}

export function isTimelineObjM2LXRouter(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXRouter {
	return isTimelineObjM2LX(timelineObject) && timelineObject.content.type === TimelineContentTypeM2LX.ROUTER
}
