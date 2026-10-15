
# Timeline State Resolver

## Abstract
This library orchestrates and controls different devices.
Its input is a [timeline](https://github.com/SuperFlyTV/supertimeline) data structure and a layer-to-device-map.
Using the input, it resolves the expected state, diffs the state against current state and sends commands to devices where necessary.

## Supported devices
* **[CasparCG](http://casparcg.com/)** - using the [casparcg-connection](https://github.com/SuperFlyTV/casparcg-connection) library
* **Blackmagic Design ATEM** vision mixers - using the [atem-connection](https://github.com/nrkno/tv-automation-atem-connection) library
* **Sony M2L-X** switchers - program/preview, configurable effects, upstream/downstream keys and geometry, basic input audio, native media players, and input routing
* **Blackmagic Design Hyperdeck** record/playback devices - using the [hyperdeck-connection](https://github.com/nrkno/tv-automation-hyperdeck-connection) library
* **Lawo** audio mixers - using the [emberplus](https://github.com/nrkno/tv-automation-emberplus-connection) library
* **Panasoniz PTZ** cameras
* **Pharos** light control devices
* **[Sisyfos](https://github.com/olzzon/sisyfos-audio-controller)** audio controller
* **Quantel** video server
* **[vMix](https://www.vmix.com/)** software vision mixer
* **VizRT MediaSequencer** graphics system - using the [v-connection](https://github.com/olzzon/v-connection) library
* Arbitrary [OSC](https://en.wikipedia.org/wiki/Open_Sound_Control) compatible devices
* Arbitrary HTTP (REST) compatible devices
* Arbitrary TCP-socket compatible devices


## Development

### Sony M2L-X transition safety

EFFECT transitions use the effect configured on the device by default. Optional
`mixer.transition.effect` settings (name, duration in seconds, and `args.fade`) are
applied before preparing Preview and starting the effect. While an effect is running,
source changes on both buses (including cuts, lookahead updates and preparation for the
next effect) and preview-key visibility changes wait for it to finish. A new Take does
not interrupt the active effect. Preview restoration additionally waits for program to
reach the requested source. If the wait exceeds the configured effect duration plus
the command timeout, the command fails without being sent.

### Sony M2L-X timeline controls

All content uses `deviceType: DeviceType.M2LX`. Each mapping also needs
`device: DeviceType.M2LX` and the device's `deviceId`.

| Mapping/content type | Mapping target | Content |
|---|---|---|
| `MIXER` | The single `mixer` node | `mixer: { program?, preview?, transition?: { type, effect?: { name?, duration?, args?: { fade? } } } }` |
| `KEY` | `bus` and `key: { type, index }` | `key: { visible, source?, translation?, scale?, rotation?, crop?, border? }` |
| `AUDIO` | `node` (default `audio_mixer`) and full `input`, e.g. `vtr3.1` | `audio: { volume?, muted? }` |
| `MEDIA_PLAYER` | Configured `player` node, e.g. `vtr3` | `mediaPlayer: { assetId?, playing?, loop?, seek? }` |
| `ROUTER` | `node` (default `router`) and configured `output` | `input: 'ndi2'` |

Mapping types come from `MappingM2LXType`; content types from `TimelineContentTypeM2LX`.
Key mappings use `M2LXMixerBus.PROGRAM`/`PREVIEW` and `M2LXKeyType.PIP` (indices 0..3),
`STILL` (4..7), or `DSK` (0..1). They are independent per bus and key family.
Only explicitly mapped keys are managed; mapped keys default to hidden when their
timeline content ends. Other controls leave the current hardware setting unchanged
when their content ends. Stop/unload players explicitly where required.
Lookahead prepares mixer Preview only; it does not preload players or change audio/routes.

Key sources use `{ type: 'video', name: 'ndi1' }` for PiP and
`{ type: 'image', name: 'still/demo.png' }` for still keys. DSKs accept either.
Omit `source` to leave it unchanged; use an empty name with `visible:false` to clear
it. Keys are hidden before replacing/clearing their source and configured before
showing. DSK source changes clear the opposite source family, and DSK visibility
resets native opacity to 1 as the GUI does, so a completed fade-out cannot leave a
newly shown key transparent. Existing device fade bindings are used, not rewritten;
timeline configuration of fade animations is not provided.

Translation uses native pixel offsets; scale is `{ x, y }`, crop is a normalized
`{ x, y, width, height }` rectangle, and rotation is the native Z-plane value.
Border is the complete native `M2LXBorder` object, not a partial border patch.
These controls do not establish separate fill/key, video alpha, chroma/luma keying,
format-independent coordinate limits or multi-M/E support.

For media, `assetId` selects an **existing** catalog ID; `null` unloads, while
omitting it leaves the asset unchanged. Explicit asset selection defaults to paused
and loop off. Loading can enable native looping, so the requested loop state is
always reapplied after a load. Pausing an unloaded player is already satisfied;
no native pause command is sent. Completion checks `clip.loaded` as well as identity:
unloaded players may retain a stale asset ID. Loaded duration/frame rate, not rounded
catalog values or the mixer format, determine seek bounds and completion tolerance.
`seek` is a one-shot time in seconds on a changed value/new timeline instance, not
continuous clock synchronization or a frame-index API; it may be reasserted after
reactivation/reconnection. Seeking pauses then restores explicitly requested playback;
otherwise it preserves the observed playback state when the seek executes, including
across gaps in timeline control. A player is shared across every bus/key/output using
it: loading or seeking an on-air player intentionally affects all those uses.
Lookahead never loads it.

Source selection disables native selection auto-play for timeline-controlled players.
EFFECT takes into such a player require native transition auto-play to be disabled
on the device first; TSR checks this when scheduling and again before the Take.
Otherwise TSR rejects the operation rather than silently allowing
native playback rules to override the timeline. Core source-only timelines retain
their existing native auto-play behavior.

Basic audio volume is the native **0..1 value, not dB**; full input names include
stream suffixes. No master controls, audio-follow, advanced gain/pan, output-bus
reassignment or media-library upload/delete commands are exposed here. Router
inputs/outputs and audio/player targets are validated against configuration.
Only basic audio-mixer nodes are supported, not similarly named advanced factories.
Signal attenuation and audible PGM output require separate installation verification.

Commands are serialized and require both a code-200 controller reply and matching
observed state. Native player errors are reported even after a successful reply.
Static targets are checked before a batch starts; a failure invalidates its remaining
commands and already-derived future batches so a failed load cannot take the wrong
clip on air. Unacknowledged timeouts reconnect to restore reply alignment; an accepted
command that never reaches its requested state fails without recycling a healthy
production session.

### Sony M2L-X authentication lifecycle

TSR reads `expires_in` from sign-in and renews authentication on every inactive-to-active
`makeReady` (Sofie activation), regardless of the existing token's remaining lifetime.
It signs in again, reopens both WebSockets and reloads configuration so production
starts with the full token lifetime rather than the remainder of a standby session.
Readiness requires fresh full snapshots of the mixer and configured media-player,
basic-audio and router nodes, not cached state or status deltas.
If the server omits the lifetime, TSR reports unknown expiry and signs in again at
the next inactive activation instead of assuming a 24-hour lifetime.

Production is protected after `makeReady` or the first sent command, and remains
protected until `standDown`, even when the timeline or command queue is empty.
`standDown` clears scheduled commands; it does not change mixer outputs or renew
authentication. Subsequent activation can renew only when no command or transition
is in flight. Commands queued during activation wait for its readiness check.

There is no periodic connection renewal during production. Status notifications
warn before expiry and report expired authentication as an error; commands using a
known expired token fail without being sent. This does not guarantee uninterrupted
operation for productions extending past token expiry: stand down and activate
again at a safe boundary. Recovery from an actual socket loss remains automatic,
using new authentication and a fresh snapshot, and rejects outstanding commands.
Sofie must supply the lifecycle signals; a quiet mixer is not evidence that it is
off air.

TSR is primarily developed to be used in the [Playout Gateway](https://github.com/nrkno/tv-automation-playout-gateway) of the [Sofie project](https://github.com/nrkno/Sofie-TV-automation).

When developing support for new devices, a helpful tool for quickly trying out new functionality is the [Quick-TSR repo](https://github.com/nytamin/quickTSR).

## Installation instructions (for developers)

### Prerequisites

* Install yarn
	https://yarnpkg.com

* Install dependencies
	`yarn`

### Build and test

* Build:
	`yarn build`

* Run test & view coverage
	`yarn cov`

# Examples of timeline objects

Here follows some examples of valid mappings and timeline-objects to control devices with TSR.

## CasparCG

### Playing a video
Play the video clip "AMB" for 5 seconds

```typescript
// Mapping:
{
	myLayerCaspar: {
		device: DeviceType.CASPARCG,
		deviceId: 'myCCG',
		channel: 1,
		layer: 10
	}
}
// Timeline:
{
	id: 'video0',
	enable: {
		start: 'now',
		duration: 5000
	},
	layer: 'myLayerCaspar',
	content: {
		deviceType: DeviceType.CASPARCG,
		type: TimelineContentTypeCasparCg.MEDIA,

		file: 'AMB'
	}
}
```
## Blackmagic Design ATEM

### Cut to source
Cut to source 2 on ME1
```typescript
// Mapping:
{
	myLayerME1: {
		device: DeviceType.ATEM,
		deviceId: 'myAtem',
		mappingType: MappingAtemType.MixEffect,
		index: 0
	}
}
// Timeline:
{
	id: 'source2',
	enable: {
		start: 'now'
	},
	layer: 'myLayerME1',
	content: {
		deviceType: DeviceType.ATEM,
		type: TimelineContentTypeAtem.ME,
		me: {
			input: 2,
			transition: AtemTransitionStyle.CUT
		}
	}
}

```

## Blackmagic Design Hyperdeck

### Record a clip
Start recording of a clip, and record it for 10 secods
```typescript
// Mapping:
{
	myLayerRecord: {
		device: DeviceType.ATEM,
		deviceId: 'myHyperdeck',
		mappingType: MappingAtemType.MixEffect,
		index: 0
	}
}
// Timeline:
{
	id: 'record0',
	enable: {
		start: 'now',
		duration: 10000
	},
	layer: 'myLayerRecord',
	content: {
		deviceType: DeviceType.HYPERDECK,
		type: TimelineContentTypeHyperdeck.TRANSPORT,

		status: TransportStatus.RECORD,
		recordFilename: 'sofie_recording1'
	}
}
```
## Lawo audio mixer

### Pull up a fader
Pull up a fader, and leave it there
```typescript
// Mapping:
{
	myLayerFader0: {
		device: DeviceType.LAWO,
		deviceId: 'myLawo',
		mappingType: MappingLawoType.SOURCE,
		identifier: 'BASE'
	}
}
// Timeline:
{
	id: 'lawofader0',
	enable: {
		start: 'now'
	},
	layer: 'myLayerFader0',
	content: {
		deviceType: DeviceType.LAWO,
		type: TimelineContentTypeLawo.SOURCE,

		faderValue: 0
	}
}

```

## Panasoniz PTZ

### Recall a preset
```typescript
// Mapping:
{
	myLayerCamera1: {
		device: DeviceType.PANASONIC_PTZ,
		deviceId: 'myPtz',
		mappingType: MappingPanasonicPtzType.PRESET
	}
}
// Timeline:
{
	id: 'ptzPreset1',
	enable: {
		start: 'now'
	},
	layer: 'myLayerCamera1',
	content: {
		deviceType: DeviceType.PANASONIC_PTZ,
		type: TimelineContentTypePanasonicPtz.PRESET,
		preset: 1
	}
}
```

## Pharos Light control

### Recall a scene

```typescript
// Mapping:
{
	myLayerLights: {
		device: DeviceType.PANASONIC_PTZ,
		deviceId: 'myPtz',
		mappingType: MappingPanasonicPtzType.PRESET
	}
}
// Timeline:
{
	id: 'scene1',
	enable: {
		start: 'now'
	},
	layer: 'myLayerLights',
	content: {
		deviceType: DeviceType.PHAROS,
		type: TimelineContentTypePharos.SCENE,

		scene: 1
	}
}
```

## Sisyfos audio controller

### Activate channel 3
Activate channel 3 on sisyfos pgm output
```typescript
// Mapping:
{
	myLayerSisyfosScene1: {
		device: DeviceType.SISYFOS,
		deviceId: 'mySisyfos',
		channel: 3
	}
}
// Timeline:
//ON:
{
	id: 'channel3',
	enable: {
		start: 'now'
	},
	layer: 'myLayerSisyfosScene1',
	content: {
		deviceType: DeviceType.SISYFOS,
		type: TimelineContentTypeSisyfos.SISYFOS,

		isPgm: 1 // 0 = OFF, 1 = Pgm level, 2 = VoiceOver level
	}
}
//FADERLEVEL:
{
	id: 'channel3',
	enable: {
		start: 'now'
	},
	layer: 'myLayerSisyfosScene1',
	content: {
		deviceType: DeviceType.SISYFOS,
		type: TimelineContentTypeSisyfos.SISYFOS,

		faderLevel: 0.75
	}
}
//LABEL:
{
	id: 'channel3',
	enable: {
		start: 'now'
	},
	layer: 'myLayerSisyfosScene1',
	content: {
		deviceType: DeviceType.SISYFOS,
		type: TimelineContentTypeSisyfos.SISYFOS,
		label: 'SERVER B'
	}
}
//VISIBLE: (shows or hide a fader)
{
	id: 'channel3',
	enable: {
		start: 'now'
	},
	layer: 'myLayerSisyfosScene1',
	content: {
		deviceType: DeviceType.SISYFOS,
		type: TimelineContentTypeSisyfos.SISYFOS,
		visible: false // false: hide - true: show
	}
}
```

## Quantel video server

### Play a video
Play a video for 10 seconds

```typescript
// Mapping:
{
	myLayerVideoA: {
		device: DeviceType.QUANTEL,
		deviceId: 'myQuantel',

		portId: 'sofie1',
		channelId: 2
	}
}
// Timeline:
{
	id: 'video0',
	enable: {
		start: 'now',
		duration: 10000
	},
	layer: 'myLayerVideoA',
	content: {
		deviceType: DeviceType.QUANTEL,

		title: 'myClipInQuantel'
		// guid: 'abcdef872832832a2b932c97d9b2eb9' // GUID works as well
	}
}
```

## Arbitrary HTTP-interface

### Send a POST request
Send a POST Request to a URL

```typescript
// Mapping:
{
	myLayerHTTP: {
		device: DeviceType.HTTPSEND,
		deviceId: 'myHTTP'
	}
}
// Timeline:
{
	id: 'video0',
	enable: {
		start: 'now'
	},
	layer: 'myLayerHTTP',
	content: {
		deviceType: DeviceType.HTTPSEND,
		type: TimelineContentTypeHttp.POST,

		url: 'http://superfly.tv/api/report',
		params: {
			someRandomParameter: 42,
			anotherFineParameter: 43
		}
	}
}
```
