---
name: voiceover
description: Make the voiceover version of a walkthrough or tour film (decided at planning, since it changes hold lengths) as a twin of the captioned picture from the same lock - a captionless picture with identical timing, a narration script fitted to EDL windows, one ElevenLabs TTS take, word timings via hyperframes transcribe, lines cut and placed on the film clock (vo-track.wav, placement.json, voiceover.srt), fit checks when the picture is re-timed, and a ducked mix. Use when the owner wants a narrated version alongside or instead of the captioned film.
---

# Voiceover twin

The voiceover producer (`agents/voiceover-producer.md`, Opus) writes and places; the film editor renders the
captionless twin; the sound designer mixes; you make the one TTS call. (Or, without sub-agents, do those roles'
checklists yourself: see `agents/voiceover-producer.md`, `film-editor.md` and `sound-designer.md` in the kit.) Read `docs/ELEVENLABS.md` (voice choice, the one speech call, download, costs) and `voiceover/` (`make_script.py`,
`place.py`, `fitcheck.py`, `remap.py`, `compare-twins.py`; `voiceover/README.md`) and `docs/LESSONS.md` (E9, S3, S6). Example:
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
- [ ] You approve the script, pick the voice (`creative_list_voices`, say which you picked), and generate
  **one** take of the whole `script.txt` with the TTS model (`eleven_v4` worked), downloaded at once to
  `$P/voiceover/vo-take1.mp3` (steps in `docs/ELEVENLABS.md`). If "busy", retry on a later
  turn, never in the same turn.
- [ ] Producer phase 2: `npx --yes hyperframes@0.9.16 transcribe voiceover/vo-take1.mp3 --json > voiceover/words.json`, then
  `python3 -I $KIT/voiceover/place.py voiceover/vo-take1.mp3 voiceover/words.json --vo-dir voiceover --edl renders/final-vo.edl.json --cues renders/final-vo.cues.json`
  (`--dry` first). Overruns are shifted within the scene or reported, never sped up. It checks that the
  transcript matches the script word for word and flags names to listen to.
- [ ] Sound designer mixes and delivers: `node $KIT/sound/build-sound.mjs --video renders/final-vo.mp4 --voiceover voiceover/vo-track.wav --deliver out/<film>-voiceover.mp4`.
- [ ] If the picture is re-timed later: editor `--dry --dry-out <dir>`; producer
  `python3 -I $KIT/voiceover/fitcheck.py --vo-dir voiceover --old-edl ... --old-cues ... --new-edl ... --new-cues ...`
  `--out windows.json` until no line is SHORT; editor renders once; producer re-places with
  `place.py ... --windows windows.json` (`$KIT/voiceover/remap.py old.edl.json new.edl.json --vo-dir voiceover` maps
  placed lines through a re-cut).
- [ ] Twin check before delivery: `python3 -I $KIT/voiceover/compare-twins.py <captioned.mp4> <captionless.mp4>`
  (the two pictures must match apart from the captions).

## Verification

Every line inside its window with ≥ 0.3 s slack; `vo-track.wav` is 48 kHz and exactly film length;
`voiceover.srt` matches placement; the delivered file prints `delivered:`; listening checks handed over.

## Outputs

`$P/voiceover/{lines.json,script.json,script.txt,<take>.mp3,words.json,vo-track.wav,placement.json,voiceover.srt}`
and the delivered voiceover film with its `.srt`.

## Pitfalls

- Saying anything the film does not show, or numbers that differ from the film.
- Narrating clicks or reading on-screen text back; filling every silence.
- Double-calling TTS on "busy" (credits); generating more than one take "to compare".
- Re-timing the picture without a fit check (one wasted render).
- The licence of generated voice is an open check for the owner.
