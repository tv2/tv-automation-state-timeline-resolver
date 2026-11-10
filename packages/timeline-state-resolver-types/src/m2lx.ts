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
	/** Stable event ID, not its display name. Inactive activation may stop another event and start this one. */
	eventId?: string
	/** Maximum time for event stop/start completion in milliseconds. Defaults to 180000. */
	eventTimeout?: number
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

export enum M2LXKeyerType {
	PIP = 'pip',
	STILL = 'still',
	DSK = 'dsk',
}

export type M2LXPipKeyerIndex = 0 | 1 | 2 | 3
export type M2LXStillKeyerIndex = 4 | 5 | 6 | 7

export type M2LXKeyer =
	| {
			index: M2LXPipKeyerIndex
			type: M2LXKeyerType.PIP
	  }
	| {
			index: M2LXStillKeyerIndex
			type: M2LXKeyerType.STILL
	  }
	| {
			index: 0 | 1
			type: M2LXKeyerType.DSK
	  }

interface MappingM2LXBase extends Mapping {
	device: DeviceType.M2LX
	mappingType: MappingM2LXType
}

export interface MappingM2LXMixer extends MappingM2LXBase {
	mappingType: MappingM2LXType.MIXER
}

export interface MappingM2LXKeyer extends MappingM2LXBase {
	mappingType: MappingM2LXType.KEYER
	bus: M2LXMixerBus
	keyer: M2LXKeyer
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
	KEYER = 'keyer',
	AUDIO = 'audio',
	MEDIA_PLAYER = 'media_player',
	ROUTER = 'router',
}

export type MappingM2LX =
	| MappingM2LXMixer
	| MappingM2LXKeyer
	| MappingM2LXAudio
	| MappingM2LXMediaPlayer
	| MappingM2LXRouter

export enum TimelineContentTypeM2LX {
	MIXER = 'mixer',
	KEYER = 'keyer',
	AUDIO = 'audio',
	MEDIA_PLAYER = 'media_player',
	ROUTER = 'router',
}

export enum M2LXTransitionType {
	/** Switch Program directly, or perform a native instant Take when mixer.composition is supplied. */
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

const M2LX_EFFECT_NAMES = [
	'cut',
	'crossfade',
	'wipe_down',
	'wipe_up',
	'wipe_right',
	'wipe_left',
	'wipe_up_right',
	'wipe_down_left',
] as const

/** Native effect identifiers exposed by the M2L-X GUI; its MIX option uses crossfade. */
export type M2LXEffectName = typeof M2LX_EFFECT_NAMES[number]

export function isM2LXEffectName(value: unknown): value is M2LXEffectName {
	return M2LX_EFFECT_NAMES.some((name) => name === value)
}

export interface M2LXEffect {
	/** Omitted leaves the configured native effect name unchanged. */
	name?: M2LXEffectName
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
	 * Explicit Program PiP composition, staged on Preview before a native CUT/EFFECT Take.
	 * Requires program. Include every owned index on every shot (visible:false to clear);
	 * do not also map these PiPs with KEYER mappings on either bus.
	 * Unowned keyers and unspecified native properties must match between buses before Take.
	 */
	composition?: M2LXComposition
	/**
	 * How a change of `program` or its explicit `composition` is performed. Defaults to a cut.
	 * Source changes (including cuts and preview/lookahead updates) wait for an active effect to finish.
	 * Manual transition progress is intentionally not part of the timeline contract.
	 */
	transition?: M2LXTransition
}

export interface M2LXComposition {
	/** Native PiPs owned on both buses. Keep the same indices until standDown/reconnection. */
	pip: Partial<Record<M2LXPipKeyerIndex, M2LXCompositionPip>>
}

/** Visible PiPs require complete tested geometry; hidden PiPs do not control their source/geometry. */
export type M2LXCompositionPip =
	| { visible: false }
	| {
			visible: true
			source: { type: 'video'; name: M2LXSourceName }
			translation: M2LXTranslation
			scale: M2LXScale
			crop: M2LXCrop
	  }

export interface M2LXKeyerVisibility {
	visible: boolean
	/** PiP: video; still: image; DSK: either. Omitted leaves it unchanged; an empty name clears and requires visible:false. */
	source?: { type: 'video' | 'image'; name: string }
	translation?: M2LXTranslation
	scale?: M2LXScale
	/** Native M2L-X Z-plane rotation value. */
	rotation?: number
	crop?: M2LXCrop
	/** Complete native border configuration; omitted leaves the existing border untouched. */
	border?: M2LXBorder
}

/** Native pixel offsets; not format-independent normalized coordinates. */
export interface M2LXTranslation {
	x: number
	y: number
}

/** Positive unitless scale multipliers; 1 represents 100% on the corresponding axis. */
export interface M2LXScale {
	x: number
	y: number
}

/** Source-relative crop rectangle. All values are normalized fractions, not pixels or percentage numbers. */
export interface M2LXCrop {
	/** Left edge as a fraction of the source width, 0..1. */
	x: number
	/** Top edge as a fraction of the source height, 0..1. */
	y: number
	/** Retained fraction of the source width, greater than zero; x + width must not exceed 1. */
	width: number
	/** Retained fraction of the source height, greater than zero; y + height must not exceed 1. */
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

export interface TimelineObjM2LXKeyer extends TimelineObjM2LXBase {
	content: {
		deviceType: DeviceType.M2LX
		type: TimelineContentTypeM2LX.KEYER
		keyer: M2LXKeyerVisibility
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
	| TimelineObjM2LXKeyer
	| TimelineObjM2LXAudio
	| TimelineObjM2LXMediaPlayer
	| TimelineObjM2LXRouter

export function isTimelineObjM2LX(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXBase {
	return timelineObject.content.deviceType === DeviceType.M2LX
}

export function isTimelineObjM2LXMixer(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXMixer {
	return isTimelineObjM2LX(timelineObject) && timelineObject.content.type === TimelineContentTypeM2LX.MIXER
}

export function isTimelineObjM2LXKeyer(timelineObject: TSRTimelineObjBase): timelineObject is TimelineObjM2LXKeyer {
	return isTimelineObjM2LX(timelineObject) && timelineObject.content.type === TimelineContentTypeM2LX.KEYER
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
