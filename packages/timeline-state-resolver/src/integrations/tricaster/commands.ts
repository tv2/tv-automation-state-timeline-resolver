/**
 * Values in this enum correspond to actual shortcut names or their suffixes
 */
export enum CommandName {
	// preview / program
	A_ROW = '_a_row',
	B_ROW = '_b_row',
	// transitions
	TAKE = '_take',
	AUTO = '_auto',
	SELECT_FADE = '_select_fade',
	SELECT_INDEX = '_select_index',
	SPEED = '_speed',
	// overlay
	SELECT = '_select',
	// positioning
	POSITION_X = '_position_x',
	POSITION_Y = '_position_y',
	SCALE_X = '_scale_x',
	SCALE_Y = '_scale_y',
	ROTATION_X = '_rotation_x',
	ROTATION_Y = '_rotation_y',
	ROTATION_Z = '_rotation_z',
	CROP_LEFT_VALUE = '_crop_left_value',
	CROP_RIGHT_VALUE = '_crop_right_value',
	CROP_UP_VALUE = '_crop_up_value',
	CROP_DOWN_VALUE = '_crop_down_value',
	POSITIONING_ENABLE = '_positioning_enable',
	CROP_ENABLE = '_crop_enable',
	// audio
	VOLUME = '_volume',
	MUTE = '_mute',
	// recording
	RECORD_TOGGLE = 'record_toggle',
	// streaming
	STREAMING_TOGGLE = 'streaming_toggle',
}

export type ValueTypes = boolean | number | string

export interface Command<NameType extends CommandName> {
	name: NameType
}

export type CommandWithValue<NameType extends CommandName, ValueType extends ValueTypes> = {
	name: NameType
	value: ValueType
}

export type CommandWithTarget<NameType extends CommandName> = {
	name: NameType
	target: string
}

export type CommandWithValueAndTarget<NameType extends CommandName, ValueType extends ValueTypes> = {
	name: NameType
	value: ValueType
	target: string
}

export type ARowCommand = CommandWithValueAndTarget<CommandName.A_ROW, number>
export type BRowCommand = CommandWithValueAndTarget<CommandName.B_ROW, number>

export type TakeCommand = CommandWithTarget<CommandName.TAKE>
export type AutoCommand = CommandWithTarget<CommandName.AUTO>
export type SelectFadeCommand = CommandWithTarget<CommandName.SELECT_FADE>
export type SelectIndexCommand = CommandWithValueAndTarget<CommandName.SELECT_INDEX, number>
export type SpeedCommand = CommandWithValueAndTarget<CommandName.SPEED, number>

export type SelectCommand = CommandWithValueAndTarget<CommandName.SELECT, number>

export type PositionXCommand = CommandWithValueAndTarget<CommandName.POSITION_X, number>
export type PositionYCommand = CommandWithValueAndTarget<CommandName.POSITION_Y, number>
export type ScaleXCommand = CommandWithValueAndTarget<CommandName.SCALE_X, number>
export type ScaleYCommand = CommandWithValueAndTarget<CommandName.SCALE_Y, number>
export type RotationXCommand = CommandWithValueAndTarget<CommandName.ROTATION_X, number>
export type RotationYCommand = CommandWithValueAndTarget<CommandName.ROTATION_Y, number>
export type RotationZCommand = CommandWithValueAndTarget<CommandName.ROTATION_Z, number>
export type CropLeftCommand = CommandWithValueAndTarget<CommandName.CROP_LEFT_VALUE, number>
export type CropRightCommand = CommandWithValueAndTarget<CommandName.CROP_RIGHT_VALUE, number>
export type CropUpCommand = CommandWithValueAndTarget<CommandName.CROP_UP_VALUE, number>
export type CropDownCommand = CommandWithValueAndTarget<CommandName.CROP_DOWN_VALUE, number>
export type PositioningEnableCommand = CommandWithValueAndTarget<CommandName.POSITIONING_ENABLE, boolean>
export type CropEnableCommand = CommandWithValueAndTarget<CommandName.CROP_ENABLE, boolean>

export type VolumeCommand = CommandWithValueAndTarget<CommandName.VOLUME, number>
export type MuteCommand = CommandWithValueAndTarget<CommandName.MUTE, boolean>

export type RecordToggle = CommandWithValue<CommandName.RECORD_TOGGLE, number>
export type StreamingToggle = CommandWithValue<CommandName.STREAMING_TOGGLE, number>

export type CommandAny =
	| ARowCommand
	| BRowCommand
	| TakeCommand
	| AutoCommand
	| SelectFadeCommand
	| SelectIndexCommand
	| SpeedCommand
	| SelectCommand
	| PositionXCommand
	| PositionYCommand
	| ScaleXCommand
	| ScaleYCommand
	| RotationXCommand
	| RotationYCommand
	| RotationZCommand
	| CropLeftCommand
	| CropRightCommand
	| CropUpCommand
	| CropDownCommand
	| PositioningEnableCommand
	| CropEnableCommand
	| VolumeCommand
	| MuteCommand
	| RecordToggle
	| StreamingToggle

export type TriCasterCommandContext = any
export interface TriCasterCommandWithContext {
	command: CommandAny
	context: TriCasterCommandContext
	timelineObjId: string
}

export function commandToWsMessage(command: CommandAny): string {
	const name = `name=${'target' in command ? command.target : ''}${command.name}`
	const value = 'value' in command ? `&value=${command.value}` : ''
	return name + value
}
