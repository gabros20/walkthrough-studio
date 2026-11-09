# voiceover: script, voice, placement

A voiceover version of the film is the captioned film with its captions taken out and a narrator
carrying everything the captions said. The picture stays identical to the frame
(`node $KIT/film/build.mjs --no-captions`); the voice is written against the picture's clock, generated
in one take, cut into lines and placed on that clock, and the sound build ducks the music under it.

There are two ways to make the voice: **one take** of the whole script, cut into lines by `place.py`
(below, and how the example film was made), or **one request per line** with a cache
(`tts.mjs`: rewording a line regenerates only that line). The per-line route, the pronunciation
lexicon, language twins and the listening proxy are in [`docs/VOICE.md`](../docs/VOICE.md); both
routes write the same `vo-track.wav`, `placement.json` and `voiceover.srt`.

```
# from the film project folder ($KIT = the kit's root); everything lands in ./voiceover
python3 -I $KIT/voiceover/make_script.py lines.json --out voiceover --edl edl.json --cues cues.json
#   -> script.json, script.txt; exit 1 if a line does not fit its window
#   TTS: script.txt -> one take (ElevenLabs connector), saved as voiceover/vo-take1.mp3
npx --yes hyperframes@0.9.16 transcribe voiceover/vo-take1.mp3 --json --dir voiceover   # -> voiceover/transcript.json
python3 -I $KIT/voiceover/place.py voiceover/vo-take1.mp3 voiceover/transcript.json --vo-dir voiceover \
        --edl renders/final-vo.edl.json --cues renders/final-vo.cues.json --dry     # look first
python3 -I $KIT/voiceover/place.py …same… --name my-film    # -> vo-track.wav, placement.json, voiceover.srt
node $KIT/sound/build-sound.mjs --video renders/final-vo.mp4 --voiceover voiceover/vo-track.wav \
        --deliver out/my-film-voiceover.mp4
python3 -I $KIT/voiceover/compare-twins.py renders/final.picture-only.mp4 renders/final-vo.picture-only.mp4
node $KIT/voiceover/listen-check.mjs out/my-film-voiceover.mp4 --vo voiceover/vo-track.wav   # measured, not heard

# or per line (docs/VOICE.md): render, then assemble on the windows; no transcription or cutting
node $KIT/voiceover/lexicon.mjs check voiceover/script.json
node $KIT/voiceover/tts.mjs render --script voiceover/script.json --voice <voice_id>
ELEVENLABS_MOCK=1 node $KIT/voiceover/tts.mjs render …   # rehearsal: tones, no credits, MOCK banner
```

A mock run (`ELEVENLABS_MOCK=1` or `=say`) is safe in the project's `voiceover/`: it caches in
`voiceover/cache-mock/` under a key that includes the mock mode, so a real run never reuses mock audio;
`lines/manifest.json` says `"mock"`, so a real run treats those line files as stale; and its cost rows
carry `"mock": true` and are not folded into `state.json` (docs/VOICE.md).

The tools need Python 3 with numpy (`place.py`, `compare-twins.py`), ffmpeg and ffprobe; the `.mjs`
tools (`tts.mjs`, `lexicon.mjs`, `translate-brief.mjs`, `listen-check.mjs`) need only Node 22.

## 1. Write the script against the picture

Look at the picture before writing: contact sheets per scene (`python3 $KIT/film/scripts/scene-sheets.py
<render> <edl.json> <outdir> 2`) and frames around each scene start and each caption. Every line
must match what is on screen while it is spoken.

- **Voice of the writing**: write for the ear. Short sentences, plain words, no jargon, no hype, no
  feature lists read out. Say what the viewer gets and why it matters. Do not narrate clicks ("now
  she clicks…"). Do not read the on-screen text back.
- **Truth**: say nothing the film does not show or the app does not do. Numbers match the film.
- **Shape**: an opening line over the title, one or two lines per scene, a closing line over the end
  card (rephrase the card lines rather than repeat them). Leave air: the example speaks for about
  half the film, with silence at the reveals. Silence over a strong picture is good.
- **Windows**: each line gets a window on the film clock, starting at or just after the scene change
  or action it belongs to and ending at least 0.5 s before the next line's window and before the
  picture moves on. The picture's timing is fixed; fit the words to it.

Write `lines.json` (format in `make_script.py`'s docstring: id, scene, `window` in film seconds or
`sceneWindow` relative to the scene's start, text, what is on screen) and run `make_script.py`. It
estimates each line at **words / 2.4 + 0.35 s**, requires every line to fill **at most 85% of its
window** and windows to be **at least 0.5 s apart**, lists every line that does not fit, and writes:

- `script.json`: ordered lines with window, word count, estimated duration, fill, the scene spans and
  totals (words, estimated speech, speaking share);
- `script.txt`: the narration as sent to text-to-speech, one line per paragraph, nothing but the
  words to be spoken, punctuation that gives natural phrasing.

## 2. Generate the voice (ElevenLabs connector)

- Pick a voice with `creative_list_voices` (the example: "Emily E.", a warm British female narrator).
  Never invent a voice id.
- Generate **one take of the whole of `script.txt`** with `creative_generate_speech`, model
  **`eleven_v4`**. One take keeps the voice, level and pace even across lines, and every call is
  charged: generate once and cut it, never line by line.
- The call returns at once; poll `creative_get_flow_run_status` with the returned ids until it is
  complete, then download the take (the connector leaves two variations by default; pick one).
- **"Free generations are busy"** means the free pool is full: wait and try again later. Do not call
  again blindly in a loop: each successful call charges, and a call you thought failed may have
  started a generation anyway (check the flow before calling again).
- The example take: 100.9 s for 27 lines estimated at 107 s, mono 44.1 kHz MP3. Lines ran a little
  shorter than the estimate, so place each at its window start plus a small lead-in rather than
  centring it.

## 3. Transcribe and place

`npx --yes hyperframes@0.9.16 transcribe <take> --json --dir voiceover` writes word-level timestamps to
`voiceover/transcript.json` (Parakeet when installed, else whisper; `--engine`, `--model` to choose).
With `--json`, stdout carries only a one-line summary (`{"ok": true, …, "transcriptPath": …}`), not the
words: redirecting it into `words.json` gives `place.py` nothing to align. Check how brand names were
transcribed: it is a hint to how they were pronounced.

`place.py` then:

1. **Aligns** the transcript's words to the script's words (sequence match; mismatches are printed),
   which gives each line a rough span in the take.
2. **Cuts on silence**: the take's 10 ms RMS envelope, threshold 12 dB over the 10th-percentile noise
   floor (at least -55 dB), gives speech chunks, bridged across gaps under 0.18 s; each chunk belongs
   to the line it overlaps most. A line's clip runs from 40 ms before its first chunk to 80 ms after
   its last, never past halfway into the silence to its neighbour, with a 10 ms fade in and a 40 ms
   fade out. The waveform decides the cut points, so no word is clipped by a transcript that ends a
   word early.
3. **Places** each line: speech onset at window start + 0.15 s. If that leaves under 0.3 s before
   the window end, up to 0.15 s of lead-in is given back; if the line still overruns, it moves
   earlier inside its scene (never closer than 0.3 s to the previous line). What still overruns is
   printed: fix the picture or the line, never speed the voice up.

It writes `vo-track.wav` (film length to the sample, 48 kHz, 24-bit, silent between lines),
`placement.json` and `voiceover.srt` (one cue per line from its first word; at least 1 s, ending
0.2 s after the last word or 50 ms before the next line). Run with `--dry` first and read the table.

### placement.json

`placement.example.json` shows the format. Per line: `id`, `key` (the script id), `scene`, `text`,
`start` / `end` (film seconds of the placed clip, fades included), `speechStart` / `speechEnd` (first
and last word), `sourceStart` / `sourceEnd` (the clip in the take), `windowStart` / `windowEnd`,
`slack` (window end minus clip end), `estDuration`, `measuredDuration`, `note`. The sound build reads
`id`, `text`, `start`, `end`; the duck follows `start` / `end`.

## 4. When the picture changes after placing

Re-cutting the picture (trimming holds, re-recording a scene) moves the windows. Do not regenerate
the voice:

- `remap.py <old.edl.json> <new.edl.json> --vo-dir <dir>`: every window and placed clip, old ->
  new, through source time (a moment the new cut dropped snaps to the next kept frame and says so).
- `fitcheck.py --vo-dir <dir> --old-edl … --old-cues … --new-edl … --new-cues … --out windows.json`:
  maps the windows through anchors shared by both cuts (scene starts and ends, labelled cues),
  places each line exactly as `place.py` would and lists every line short of 0.3 s slack, with how
  much time it needs. Exit 1 when any line is short. Override a window by hand with
  `L21=141.0,150.2`. Iterate with the editor on dry runs (`node $KIT/film/build.mjs --dry --dry-out`)
  until all lines fit, then render once.
- `place.py … --windows windows.json`: place for real on the new clock.

## 5. The twin picture and the mix

- Build the twin with `node $KIT/film/build.mjs --no-captions` (same storyboard, same cues; `cues.json`
  says `"captions": false`) and render it as `<name>-vo.mp4`. Keep its `.cues.json` / `.edl.json`.
- `compare-twins.py <captioned> <captionless>`: the two renders may differ only in the caption band;
  more than 200 changed pixels above y 940 in a sampled frame means they are not twins (two encodes
  of one picture differ by a few dozen pixels).
- Mix and deliver with `sound/build-sound.mjs --voiceover` (see `sound/README.md`, Voiceover mix:
  voice 3 dB over the music's normal level, music ducked to 11 dB under each line, clicks near
  speech dropped). The voiceover's `.srt` is delivered beside the film.

## 6. Listening checks (a human, before it ships)

`listen-check.mjs` measures first (transcript against the script per line, voice over music per line,
clipping; docs/VOICE.md, Listening proxy). It narrows where to listen; it does not replace listening.

Nobody can hear audio inside an agent session; every number above is a measurement, not a listen.
A person listens to the whole voiceover film, on headphones and on laptop speakers, for:

- every word spoken as scripted and every brand name pronounced right;
- no clipped first or last syllables at the cut points; no breath or mouth click left at an edge;
- each line over the picture it describes (watch, do not just listen);
- even voice level from line to line; the voice clear over the music everywhere;
- the music ducking smoothly, not pumping between close lines, and coming back up in the pauses;
- no harsh sibilants (AAC makes them worse; the sound build adds peak margin, but listen).
