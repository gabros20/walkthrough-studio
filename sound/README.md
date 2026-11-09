# sound: music bed, effects, voiceover mix, delivery

`build-sound.mjs` makes the film's whole soundtrack from three inputs and muxes it onto the
rendered picture:

- one music take (any WAV or MP3) and the measured facts about it (`music.json`),
- the film's `cues.json` and `edl.json` (from `film/build.mjs`: clicks, transitions, scene starts),
- optionally a film-length voice track and its `placement.json` (from `voiceover/place.py`).

It needs node, ffmpeg and ffprobe, and finishes in about 15 s for a 3-minute film. Run it again
after every picture change.

```
node sound/build-sound.mjs --help
node sound/build-sound.mjs --video film/renders/draft.mp4                    # -> film/renders/draft-sound.mp4
node sound/build-sound.mjs --video film/renders/final.mp4 --deliver out/my-film.mp4
node sound/build-sound.mjs --video film/renders/final-vo.mp4 --voiceover film/voiceover/vo-track.wav \
                           --deliver out/my-film-voiceover.mp4
node sound/build-sound.mjs --duration 190 --bed-only                         # a bed of any length, no video
```

Paths are relative to the current directory. By default the film project is `../film` next to this
folder (`--film`), `music.json` is `<film>/music.json` (`--music`), and the outputs go to
`<film>/sound-build/` (`--work`). The cues and edl are read from `<render>.cues.json` /
`<render>.edl.json` beside the video when they exist (also for `<render>.picture-only.mp4`), else
from the film's live files; `--cues` / `--edl` override. It stops when the video is more than a
frame away from `cues.json`'s duration, because the cues would then belong to another build
(`--force` mixes anyway).

It writes, in the work folder:

- `bed.wav`: the music only, film length + 2 s, 0.4 s fade-in, at mix gain
- `mix.wav` (`mix-vo.wav`): the full programme at film length, -16 LUFS
- `beat-grid.json` (`beat-grid-vo.json`): film-time bars and beats, the splices, the final chord, and
  each transition's nearest bar with `moveBy`
- `last-build.json` (`last-build-vo.json`): every measured number (joins, effect levels, loudness, sync)

and the muxed video (draft: `<name>-sound.mp4` / `<name>-voiceover.mp4` next to the render, or
`--out`; final: `--deliver`). The last line is always one of `delivered: <path>`,
`NOT DELIVERED (checks failed): <path>`, or `no video given: nothing delivered`. Exit code 0 when
every check passes, 2 when one fails (the reason is printed), 1 on bad input.

## The music take

The example film's music was generated with ElevenLabs music through the connector, as a full
track (intro, groove, outro, a held final chord) at a fixed tempo, 135.7 s for a 182 s film; the
fit below makes up the difference. Any WAV or MP3 works, generated or licensed, as long as it has a steady tempo, a repeating
groove and a real ending. Put the file beside `music.json` (its `"file"` is relative to it) or pass
`--music-file <path>`.

Do not trust a tempo detector for the grid. `npx hyperframes audio --only bpm` reported 128 BPM for
the example take; it is 96.000. Measure it.

### Measuring a new track (`analysis/`)

Python 3 with numpy, scipy and soundfile. Decode first:
`ffmpeg -i music.mp3 -ar 48000 -c:a pcm_f32le take.wav`.

| Script | What it tells you |
|---|---|
| `analyze.py take.wav <from> <to>` | Onset autocorrelation over the groove span: the beat and bar periods. Saves the onset envelope. |
| `grid.py take.wav [bpm]` | Refines the beat period (folded onset contrast within ±0.25% of 60/bpm), the beat phase, and 16th-note onset profiles of kick, snare and hats (where the downbeat is). |
| `struct.py take.wav [bpm]` | Beat-synchronous chroma novelty by beat-in-bar (the downbeat), chroma similarity at lags of 1-16 bars (the loop length), and a per-bar table of level and bands (the sections). |
| `chroma.py take.wav` | Chord profile per loop bar and of the intro / outro / final chord (edit its spans first), plus a key estimate. |
| `splice.py take.wav [music.json]` | Every bar-aligned loop splice candidate in the splice window, by spectral distance, waveform correlation and level jump. |
| `fine.py take.wav <from> <to> <step>` / `bandsovertime.py take.wav <step> <end>` | RMS and band levels over time, to find where sections and the release really start. |

### music.json

`music.example.json` is the template; `examples/kleber-content-ai/music.json` is a measured one with
its evidence.

| Key | Meaning |
|---|---|
| `file` | The audio, relative to music.json. |
| `bpm`, `beatsPerBar` | The grid. `beat` and `bar` are derived when left out (96 BPM, 4/4: 0.625 s and 2.5 s). |
| `gridOffset` | Seconds before the first downbeat. The build trims them, so bars fall on whole multiples of `bar` from film 0. |
| `loopBars` | The groove's repeat length in bars (the example: a 4-bar chord loop, 10 s). |
| `sections` | `[{ name, from, to }]`: intro, groove, outro, final, tail. Labels the beat grid. |
| `grooveEntry` | Where the groove starts. The fit prefers it near the end of the title card. |
| `finalChord` | Where the held last chord starts. The fit lands it on the end-card wipe's cut, where the lockup is revealed. |
| `spliceWindow` | `{ from, to }`: downbeats where a loop splice may land (one bar into the groove to one bar before it ends). |
| `shortOutro` | Optional `{ a, b }`: a jump inside the outro that still sounds like an ending, used only when the full outro cannot reach. |
| `duration` | The file's length. |

## How the bed is fitted to the picture

The bed keeps the real intro and the real ending and changes the length in the middle, by whole
loops, so the bar grid runs unbroken from film 0 to the end.

1. **Start offset**: 0, 1 or 2 whole bars into the intro, so the fine timing can move by a bar.
2. **Loops**: `k` loops of `loopBars` bars are added (k > 0) or removed (k < 0) with one long repeat
   or skip: a jump from a groove downbeat `a` to the downbeat `b = a - k * loop` (the same loop
   position, k loops earlier or later). Every candidate downbeat in the splice window is scored (the
   spectrum just after the join vs what would naturally follow, the next two beats, the level jump,
   the low-band waveform correlation across the crossfade) and the cleanest one is used. More than
   one window's worth of loops uses two splices.
3. **The join**: a 30 ms equal-power crossfade that ends 5 ms before the downbeat.
4. **The ending**: the fit picks `k`, the start offset and (only if needed) the short outro so the
   final chord lands on the end-card wipe's cut, within -0.6 / +0.7 s; it warns with the exact
   amount to move the end card by when it is more than 20 ms off.

The bar-aligned loop trick on the example take (135.7 s, 96 BPM, 10 s loops, splice window
12.5-107.5 s):

- **Longer** (the 3:02 film): +6 loops. At film 97.5 s the bed jumps from source 100.0 s back to
  40.0 s and plays the groove again; at film 177.5 s the short outro jumps from 120 to 125 straight
  into the final chord, which lands exactly on the end-card wipe's cut. Start offset 2.5 s (one bar
  of intro trimmed), groove enters at film 7.5 s, just after the 7 s title.
- **Shorter** (a 60 s bed from the same take): -7 loops, a forward skip at film 37.5 s from source
  37.5 s to 107.5 s, straight into the last bar of the groove and the outro.

Each join is then verified on the finished bed and reported in `last-build.json`: spectral and
level step across the join next to the natural step at the same place, beat-grid onset offsets
eight bars either side (the grid must not shift by more than 5 ms), a click ratio (second
difference in the crossfade vs the 5 s around it; must stay under 1), and the peak. A join that
measures rough fails the build. The quietest 50 ms before the release is reported too (a near-silent
spot warns).

`beat-grid.json` is for the editor: bars and beats in film time, and for every transition cue its
nearest bar and `moveBy` (seconds to move the cut to land it on that bar). The example film landed
its section changes and the end card on bars and every montage slice on a beat.

## Effects

The effects are the HyperFrames media-use skill's bundled library, `audio/assets/sfx/` inside the
installed skill (`~/.agents/skills/media-use/audio/assets/sfx` here; the build also looks in
`~/.claude/skills`, `~/.codex/skills` and Claude plugin installs, or take `--sfx <dir>` /
`HF_SFX_DIR`). It holds click, click-soft, key-press, pop, whoosh, whoosh-short, whoosh-cinematic,
riser, impact-bass, chime, ping, sparkle, notification, glitch, error and typing, with a
`manifest.json` and `CREDITS.md`.

They were indexed once with the HyperFrames audio analyser, which measures each file's kind, its
moments (onset, steepest rise, peak, tail end), loudness (integrated and short-term LUFS, sample and
true peak, clipping) and a dB envelope:

```
npx --yes hyperframes@0.9.16 audio ~/.agents/skills/media-use/audio/assets/sfx/*.mp3 --json > hf-sfx.json
```

That index is where the choices below came from (the click is a 20 ms transient peaking 73 ms in;
the whoosh has 99% of its energy at 150-1000 Hz; the riser builds from 0.5 to 4.1 s and the rest is
silence). Re-run it before swapping in other files.

| Effect | File and treatment (`SFX` in build-sound.mjs) | Where |
|---|---|---|
| click | `click.mp3`, low-passed at 5 kHz, trimmed to 0.26 s | Every real click outside time-lapses, on its cue (one frame after the press). |
| whoosh A / B | `whoosh.mp3` as is, and the same slowed to 0.84x (3 semitones lower), alternating | The title wipe, every push, every whip. |
| riser | `riser.mp3`, high-passed twice at 200 Hz (its sub rumble was 84% of its energy and clipped), trimmed to its build | Builds through the end card and crests on the final chord. |
| none | | Hard cuts. |

Levels are set against the music right where each effect plays. Clicks are set by peak (their peak
4 dB over the bed's peak within ±0.3 s: set by loudness a 20 ms click would read sharp), whooshes by
loudness (their loudest 100 ms 4.5 dB over the bed's same 100 ms, K-weighted), the riser by its
loudest 400 ms (4 dB over). The mix is then normalised to **-16 LUFS integrated** with true peak
**at most -1 dBTP**: effects that would push a sample peak past the ceiling (minus a 1.2 dB margin
for inter-sample overs) are pulled down, a few passes until nothing is capped.

**Whoosh music dip**: a whoosh that the peak ceiling pulled down by 1 dB or more gets the music
dipped 3 dB for 0.3 s (raised-cosine edges, 0.08 s) around its loudest 100 ms instead, and the mix
settles again. Every whoosh's level over the music, K-weighted and in its own 150-1000 Hz band, is
printed; one ending more than 1 dB under the music warns that it may not be heard.

After muxing, the build decodes the delivered file, subtracts the music (and voice) it put in, and
finds every effect's first transient: each must land within a frame of its cue. A separate
band-pass check (1.5-5 kHz, where the click lives and the bed is 16 dB quieter) finds every click
in the muxed audio independently of the mix.

## Voiceover mix

`--voiceover <wav>` takes a film-length 48 kHz WAV that is silent between lines (from
`voiceover/place.py`), `placement.json` beside it (`{"lines": [{"id", "text", "start", "end"}]}`,
film seconds; `--placement` overrides) and exactly one `.srt` beside it (`--srt` overrides). It
belongs on the captionless twin of the picture (`node film/build.mjs --no-captions`): `cues.json`
records `"captions": false` for it, and putting the voice on a captioned picture stops the build.

- The voice sits 3 dB over the music's normal (unducked groove) level; lines are levelled toward
  their median when they spread more than 1.5 LU (at most ±4 dB).
- It is high-passed at 80 Hz only when more than 1% of the speech energy sits below that, and its
  peaks are limited only when they would pass the ceiling.
- **Ducking**: under each line the music goes to 11 dB below that line: down over 0.35 s ending
  0.05 s before the first word, back up over 0.8 s from 0.2 s after the last. Lines less than 2.5 s
  apart share one duck (no pumping between them); inside a shared duck the depth glides from line to
  line.
- Clicks within 0.2 s of a line are dropped; the others play 4 dB quieter. Whooshes and the riser
  stay at least 1 dB under the voice's loudest 100 ms.
- Checks: line spread, music under the voice by at least 8 dB in every line, no effect louder than
  the voice, the voice track within a frame of the film length. AAC can push speech sibilance over
  the true-peak ceiling: when that is the only failure, the build runs again with more peak margin
  (`SOUND_VO_MARGIN`), up to 4 dB.

The voiceover build writes `mix-vo.wav`, `beat-grid-vo.json` and `last-build-vo.json`, so the
captioned outputs are never touched.

## Delivery, and why the silent-file guard exists

`--deliver <file>` is the final step. The HyperFrames render of the picture has no audio stream
(the film is silent until this build). Once, a silent render named like the final film was
delivered: it looked finished in a file list and nobody heard it before it went out. So:

1. A render without an audio stream is first **renamed `<name>.picture-only.mp4`** (its sidecars
   `<name>.cues.json`, `.edl.json`, `.captions.srt` are still found), so no silent file keeps a
   final-looking name.
2. The mix is muxed onto it at `--deliver`, and the captions (`--srt`, else the `<name>.captions.srt`
   sidecar, else the film's live `captions.srt` when its cues match; for the voiceover, the `.srt`
   beside the voice track) are copied beside it as `<deliver>.srt`. No captions fails the delivery.
3. The delivered file is checked: it must have an audio stream as long as the film (within a
   frame), audio and video lengths within a frame, -16 ±0.5 LUFS and ≤ -1 dBTP measured on the file
   itself, and every 10 s window between -22 and -12 LUFS (the release and fade only above -45).
4. Only then does the last line say `delivered: <path>`. Anything else says `NOT DELIVERED (checks
   failed): <path>` and exits 2: the file at that path exists but must not be sent.

## What a human must still do

Nobody can hear the result inside an agent session. The numbers above are necessary, not
sufficient. Before sending, someone listens on headphones and on laptop speakers to:

- every join (film times in `beat-grid.json` `splices`): no double beat, no chord jump, no click;
- the first 10 s (the fade-in and the title whoosh) and the last 10 s (riser, final chord, release);
- every push and whip: the whoosh is heard and is not harsh;
- a stretch of clicks: they sound like clicks on the right frames, not ticks on the beat;
- the voiceover version end to end: every word clear over the music, no pumping between close
  lines, the music coming back up between sections, no clipped sibilants.
