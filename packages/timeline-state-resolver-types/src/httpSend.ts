import { Mapping } from './mapping'
import { DeviceType } from '.'

export interface MappingHTTPSend extends Mapping {
	device: DeviceType.HTTPSEND
}

export interface HTTPSendCommandContent {
	type: TimelineContentTypeHTTP
	url: string
	params: { [key: string]: number | string | any }
	/** How the params are sent. Ignored for GET since params are sent in querystring. Default is JSON. */
	paramsType?: TimelineContentTypeHTTPParamType
	temporalPriority?: number // default: 0
	/** Commands in the same queue will be sent in order (will wait for the previous to finish before sending next */
	queueId?: string
}
export interface HTTPSendOptions {
	makeReadyCommands?: HTTPSendCommandContent[]
	/** Whether a makeReady should be treated as a reset of the device. It should be assumed clean, with the queue discarded, and state reapplied from empty */
	makeReadyDoesReset?: boolean

	/** Minimum time in ms before a command is resent, set to <= 0 or undefined to disable */
	resendTime?: number
}

export enum TimelineContentTypeHTTP {
	GET = 'get',
	POST = 'post',
	PUT = 'put',
	DELETE = 'delete',
}
export enum TimelineContentTypeHTTPParamType {
	JSON = 'json',
	FORM = 'form',
}

export type TimelineContentHTTPSendAny = TimelineContentHTTPRequest
export interface TimelineContentHTTPSendBase {
	deviceType: DeviceType.HTTPSEND
	// type: TimelineContentTypeCasparCg
}
export type TimelineContentHTTPRequest = TimelineContentHTTPSendBase & HTTPSendCommandContent
