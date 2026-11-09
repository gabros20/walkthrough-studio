---
name: voiceover
description: Make the voiceover version of a walkthrough or tour film (decided at planning, since it changes hold lengths) as a twin of the captioned picture from the same lock - a captionless picture with identical timing, a narration script fitted to EDL windows, ElevenLabs speech either per line with a cache (walkthrough vo tts / assemble) or as one take cut by hyperframes transcribe, lines placed on the film clock (vo-track.wav, placement.json, voiceover.srt), a pronunciation lexicon, language twins from translation briefs, voice-first scripts that the film fits with --fit-audio, fit checks when the picture is re-timed, a ducked mix and a listening proxy (measured, not heard). Use when the owner wants a narrated version alongside or instead of the captioned film.
---

# Voiceover twin

The voiceover producer (`agents/voiceover-producer.md`, Opus) writes and places; the film editor renders the
captionless twin; the sound designer mixes; you make the paid TTS calls (or the producer runs `tts.mjs` with
the key). (Or, without sub-agents, do those roles' checklists yourself: see `agents/voiceover-producer.md`,
`film-editor.md` and `sound-designer.md` in the kit.) Read `docs/VOICE.md` (per-line TTS, lexicon,
languages, listening proxy), `docs/ELEVENLABS.md` (voice choice, both generation routes, costs),
`voiceover/README.md` (`make_script.py`, `place.py`, `fitcheck.py`, `remap.py`, `compare-twins.py`) and
`docs/LESSONS.md` (E9, S3, S6). `walkthrough vo <step>` runs each tool in the project and prints the command
(`docs/CLI.md`). Example:
`examples/brightpost/voiceover/{script.json,script.txt,placement.json,voiceover.srt}`.

**Where the kit is.** `KIT` is the walkthrough-studio checkout; kit paths (`recorder/`, `film/`, `docs/`,
`agents/`, ...) are relative to it. Use the first of these that holds `recorder/` and `film/`:
`${CLAUDE_PLUGIN_ROOT}` (Claude Code or Codex plugin install; skip it if it shows unexpanded),
`$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio`, this skill's own `../..`. If none does, the install copied
only this file (skills.sh): ask the user to run
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup`.
Without sub-agents (most platforms other than Claude Code), do each named agent's role yourself from
`$KIT/agents/<name>.md`.

## Inputs

- The captioned film, its `.srt`, `edl.json`, `cues.json`, storyboard, `takes/INDEX.md`, the plan's story.
- Voice direction from the owner (e.g. "female, warm, British English").

Everything happens in the film's project folder `$P` (skill `build-film`): the voiceover files live in
`$P/voiceover/`; run the kit's tools from `$P` (`KIT` = kit root).

## Steps

- [ ] Editor renders the twin: `node $KIT/film/build.mjs --takes $T --no-captions`, rendered to
  `renders/final-vo.mp4` with its `final-vo.*` sidecars.
  Timing identical to the frame.
- [ ] Producer phase 1: looks at frames around each scene start and caption, writes `lines.json`, runs
  `python3 -I $KIT/voiceover/make_script.py lines.json --out voiceover --edl renders/final-vo.edl.json --cues renders/final-vo.cues.json`
  until every line fits (2.4 words/s + 0.35 s, ≤ 85% of the window, ≥ 0.5 s between windows), and sends you
  `script.txt`, the line table, total words and speaking share (aim 55-65%).
- [ ] **Lexicon.** `walkthrough vo lexicon check` (`node $KIT/voiceover/lexicon.mjs check
  voiceover/script.json`) lists words TTS may get wrong (mixed case, all capitals, digits with letters,
  dotted names, names mid-sentence). Put spelling hints in `voiceover/lexicon.json` (`{ "version": 1,
  "entries": { "Brightpost": "Bright post" } }`; template `$KIT/voiceover/lexicon.example.json`). They change
  only the text sent to TTS, never captions, the script or the `.srt`; `lexicon show` prints each changed
  line before and after.
- [ ] You approve the script and pick the voice (`creative_list_voices` or `GET /v2/voices`; never guessed;
  say which you picked). Then generate by one of two routes:
  - **Per line with a cache** (default with `ELEVENLABS_API_KEY`, and for any iteration):
    `walkthrough vo tts --voice <id>` (`node $KIT/voiceover/tts.mjs render --script voiceover/script.json
    --voice <id>`; model `eleven_v4`): one request per line, cached in `voiceover/cache/` by voice, model,
    lexicon version and the text sent, so rewording a line regenerates that line only (each line prints
    `hit` or `miss`). Characters sent go to `voiceover/cost.jsonl` and into `state.json`. It then
    assembles: measures each line file, places it on the windows (`windows.json` when present, else the
    script's) with `place.py`'s rule, and writes `vo-track.wav`, `placement.json` and `voiceover.srt`.
    Without a key it writes `voiceover/lines/<nn>.txt` per missing line and prints the connector steps:
    generate those lines, save them under the printed names, then `walkthrough vo assemble`.
    `ELEVENLABS_MOCK=1` tests it without credits, in the project's `voiceover/` too: it prints a
    `MOCK … NOT REAL SPEECH` banner, caches apart in `voiceover/cache-mock/` (keyed by the mock mode, so
    a real run never reuses it) and marks its cost rows `mock: true`, which never reach `state.json`.
  - **One take** (the first full read through the connector): **one** take of the whole `script.txt`,
    downloaded at once to `$P/voiceover/vo-take1.mp3` (steps in `docs/ELEVENLABS.md`). If "busy", retry
    on a later turn, never in the same turn. Producer phase 2:
    `npx --yes hyperframes@0.9.16 transcribe voiceover/vo-take1.mp3 --json --dir voiceover` (writes
    `voiceover/transcript.json`; stdout is only a summary), then
    `python3 -I $KIT/voiceover/place.py voiceover/vo-take1.mp3 voiceover/transcript.json --vo-dir voiceover --edl renders/final-vo.edl.json --cues renders/final-vo.cues.json`
    (`--dry` first; or `walkthrough vo place …`). It checks that the transcript matches the script word for
    word and flags names to listen to.
  Either way, overruns are shifted within the scene or reported, never sped up.
- [ ] **Voice-first** (the narration leads; decided at planning): write `script.json` lines without
  windows, each with its `scene` and an `anchor` (the event it talks about: `"click:send"` or `{ "ref",
  "offset" }`); `vo tts` places them back to back (`--start 0.5`, `--gap 0.6`) and copies each anchor into
  `placement.json`. The editor then builds with `--fit-audio voiceover/placement.json` (skill `build-film`),
  which holds rest moments until every line fits, and you re-place on the new cut (`fitcheck.py`, then
  `vo assemble --windows windows.json`).
- [ ] Sound designer mixes and delivers: `walkthrough sound build --video renders/final-vo.mp4 --voiceover
  voiceover/vo-track.wav --deliver out/<film>-voiceover.mp4` (or `node $KIT/sound/build-sound.mjs …`).
- [ ] **Listening proxy (measured, not heard):** `walkthrough vo listen-check out/<film>-voiceover.mp4 --vo
  voiceover/vo-track.wav` (`node $KIT/voiceover/listen-check.mjs`) transcribes the mix, aligns it to the
  script and reports per line the word error rate, missing and extra words, voice over music (under 8 dB is
  flagged) and clipping runs; `listen-check.json` plus a table; exit 2 when it finds anything. It cannot hear
  a mispronounced name the transcriber still spelled right, sibilance, breaths or pumping: a human still
  listens, and you say "measured, not heard".
- [ ] **Language twins** (same picture lock, same captionless render): `walkthrough vo translate brief de
  --captions captions.srt` writes per-line and per-caption briefs (window, most words and characters that
  fit, claims to keep) and blank `*.de.answers.json`; a translator agent fills them; `vo translate apply de
  --captions captions.srt` checks the fit and claims (UI text in quotes stays English unless
  `--ui-translated`) and writes `voiceover/script.de.json` and `captions.de.srt`; `vo tts --lang de --script
  voiceover/script.de.json --voice <id>` renders into `voiceover/de/` (a voice that speaks German); the
  sound build mixes `voiceover/de/vo-track.wav`. A language uses `lexicon.<lang>.json` when it exists.
- [ ] If the picture is re-timed later: editor `--dry --dry-out <dir>`; producer
  `python3 -I $KIT/voiceover/fitcheck.py --vo-dir voiceover --old-edl ... --old-cues ... --new-edl ... --new-cues ...`
  `--out windows.json` (`walkthrough vo fitcheck …`) until no line is SHORT; editor renders once; producer
  re-places with `vo assemble --windows windows.json` (per-line) or `place.py ... --windows windows.json`
  (one take) (`$KIT/voiceover/remap.py old.edl.json new.edl.json --vo-dir voiceover` maps placed lines
  through a re-cut).
- [ ] Twin check before delivery: `python3 -I $KIT/voiceover/compare-twins.py <captioned.mp4> <captionless.mp4>`
  (the two pictures must match apart from the captions).

## Verification

Every line inside its window with ≥ 0.3 s slack; `vo-track.wav` is 48 kHz and exactly film length;
`voiceover.srt` matches placement; the delivered file prints `delivered:`; `listen-check` reports no missing
words and no clipping (or each finding is explained); TTS cost rows in `state.json`; listening checks handed
over.

## Outputs

`$P/voiceover/{lines.json,script.json,script.txt,lexicon.json,lines/,cache/,cost.jsonl,<take>.mp3,transcript.json,vo-track.wav,placement.json,voiceover.srt}`,
`voiceover/<lang>/` per language twin, `listen-check.json`, and the delivered voiceover film with its `.srt`.

## Pitfalls

- Saying anything the film does not show, or numbers that differ from the film.
- Narrating clicks or reading on-screen text back; filling every silence.
- Double-calling TTS on "busy" (credits); generating more than one take "to compare"; deleting
  `voiceover/cache/` (every line is paid for again).
- Putting pronunciation hints into the script or captions instead of the lexicon.
- Re-timing the picture without a fit check (one wasted render).
- The licence of generated voice is an open check for the owner.
