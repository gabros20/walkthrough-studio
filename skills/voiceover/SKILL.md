---
name: voiceover
description: Make the voiceover version of a walkthrough or tour film (decided at planning, since it changes hold lengths) as a twin of the captioned picture from the same lock - a captionless picture with identical timing, a narration script fitted to EDL windows, one ElevenLabs TTS take, word timings via hyperframes transcribe, lines cut and placed on the film clock (vo-track.wav, placement.json, voiceover.srt), fit checks when the picture is re-timed, and a ducked mix. Use when the owner wants a narrated version alongside or instead of the captioned film.
---

# Voiceover twin

The voiceover producer (`agents/voiceover-producer.md`, Opus) writes and places; the film editor renders the
captionless twin; the sound designer mixes; you make the one TTS call. Read `voiceover/` (`make_script.py`,
`place.py`, `fitcheck.py`, `remap.py`, `compare-twins.py`; `voiceover/README.md`) and `docs/LESSONS.md` (E9, S3, S6). Example:
`examples/kleber-content-ai/voiceover/{script.json,script.txt,placement.json,voiceover.srt}`.

## Inputs

- The captioned film, its `.srt`, `edl.json`, `cues.json`, storyboard, `takes/INDEX.md`, the plan's story.
- Voice direction from the owner (e.g. "female, warm, British English").

## Steps

- [ ] Editor renders the twin: same storyboard, `--no-captions`, `renders/final-vo.mp4` with its sidecars.
  Timing identical to the frame.
- [ ] Producer phase 1: looks at frames around each scene start and caption, writes `lines.json`, runs
  `python3 -I voiceover/make_script.py lines.json --out film/voiceover --edl <edl.json> --cues <cues.json>`
  until every line fits (2.4 words/s + 0.35 s, ≤ 85% of the window, ≥ 0.5 s between windows), and sends you
  `script.txt`, the line table, total words and speaking share (aim 55-65%).
- [ ] You approve the script, pick the voice (`creative_list_voices`, say which you picked), and generate
  **one** take of the whole `script.txt` with the TTS model (`eleven_v4` worked). If "busy", retry on a later
  turn, never in the same turn.
- [ ] Producer phase 2: `npx --yes hyperframes@0.9.16 transcribe vo-take1.mp3 --json > words.json`, then
  `python3 -I voiceover/place.py vo-take1.mp3 words.json --vo-dir film/voiceover --edl film/renders/final-vo.edl.json --cues film/renders/final-vo.cues.json`
  (`--dry` first). Overruns are shifted within the scene or reported, never sped up. It checks that the
  transcript matches the script word for word and flags names to listen to.
- [ ] Sound designer mixes and delivers with `--voiceover film/voiceover/vo-track.wav`.
- [ ] If the picture is re-timed later: editor `--dry --dry-out <dir>`; producer
  `python3 -I voiceover/fitcheck.py --vo-dir film/voiceover --old-edl ... --old-cues ... --new-edl ... --new-cues ...`
  `--out windows.json` until no line is SHORT; editor renders once; producer re-places with
  `place.py ... --windows windows.json` (`voiceover/remap.py old.edl.json new.edl.json --vo-dir ...` maps
  placed lines through a re-cut).
- [ ] Twin check before delivery: `python3 -I voiceover/compare-twins.py <captioned.mp4> <captionless.mp4>`
  (the two pictures must match apart from the captions).

## Verification

Every line inside its window with ≥ 0.3 s slack; `vo-track.wav` is 48 kHz and exactly film length;
`voiceover.srt` matches placement; the delivered file prints `delivered:`; listening checks handed over.

## Outputs

`film/voiceover/{lines.json,script.json,script.txt,<take>.mp3,words.json,vo-track.wav,placement.json,voiceover.srt}`
and the delivered voiceover film with its `.srt`.

## Pitfalls

- Saying anything the film does not show, or numbers that differ from the film.
- Narrating clicks or reading on-screen text back; filling every silence.
- Double-calling TTS on "busy" (credits); generating more than one take "to compare".
- Re-timing the picture without a fit check (one wasted render).
- The licence of generated voice is an open check for the owner.
