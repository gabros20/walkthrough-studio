---
name: film-sound
description: Score a locked walkthrough film - generate the music bed once via ElevenLabs Music, analyse and extend it by bar-aligned loops when it comes back short, write beat-grid.json for bar-aligned cuts, add click/whoosh/riser effects from HyperFrames' bundled set, mix to -16 LUFS / <= -1 dBTP with voiceover ducking when present, mux onto the picture-only render and prove the delivered file has sound. Use after picture lock, after any re-timing, and for the voiceover version's mix.
---

# Film sound

The sound designer (`agents/sound-designer.md`, Opus) builds and mixes; you make the paid generation call.
(Or, without sub-agents, do that role's checklist yourself: see `agents/sound-designer.md` in the kit.)
Read `docs/ELEVENLABS.md` (the exact connector calls, the API-key route, costs, "busy" handling, licence),
`sound/` (`build-sound.mjs --help`), the `media-use` skill, and `docs/LESSONS.md` section "Sound and
voice". Example: `examples/brightpost/music.json` and `beat-grid.json`.

All paths are in the film's project folder `$P` (skill `build-film`); run from `$P` (or pass
`--project $P`; `--film` is kept as an alias). `KIT` is the kit root.

**Where the kit is.** `KIT` is the walkthrough-studio checkout; kit paths (`recorder/`, `film/`, `docs/`,
`agents/`, ...) are relative to it. Use the first of these that holds `recorder/` and `film/`:
`${CLAUDE_PLUGIN_ROOT}` (Claude Code or Codex plugin install; skip it if it shows unexpanded),
`$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio`, this skill's own `../..`. If none does, the install copied
only this file (skills.sh): ask the user to run
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup`.
Without sub-agents (most platforms other than Claude Code), do each named agent's role yourself from
`$KIT/agents/<name>.md`.

## Inputs

- The locked render (`renders/final.mp4`) with its `.cues.json` and `.edl.json` beside it.
- A music direction (genre, tempo, instruments, energy curve; no artist names, which the model may refuse).
- For the voiceover version: `voiceover/vo-track.wav` and `placement.json` beside it (skill `voiceover`).

## Steps

- [ ] **Generate once (you, via the ElevenLabs connector; steps in `docs/ELEVENLABS.md`).** Music model,
  instrumental, length = film + 2 s. One call; sub-agents cannot reach the connector. If the reply is "Free generations are busy", do not call again in this turn; retry on a later
  turn. Download the result; note its real length (it may be shorter than asked).
- [ ] **Brief the sound designer** with the paths, the direction, and: no generation calls; extend by loops if
  short; effects sparse; numbers to hit; prove delivery.
- [ ] **Bed and grid.** It analyses tempo, bars, sections and the ending, writes `$P/music.json` (template
  `$KIT/sound/music.example.json`; `file` is relative to it, WAV or MP3, plus the measured grid) and `beat-grid.json`; anchor bars to film time 0 so the editor can nudge scene changes onto bars with
  holds only.
- [ ] **Draft mix** on a draft picture: `node $KIT/sound/build-sound.mjs --video renders/<draft>.mp4`.
- [ ] **Delivery**: `node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/<film>.mp4`.
  The last line must be `delivered: <path>` (exit 0). `NOT DELIVERED (checks failed)` (exit 2) or
  `no video given` means nothing was delivered. Outputs of the build go to `$P/sound-build/`.
- [ ] **Voiceover version**: `node $KIT/sound/build-sound.mjs --video renders/final-vo.mp4 --voiceover
  voiceover/vo-track.wav --deliver out/<film>-voiceover.mp4` (music ducked ~10-12 dB under each line).
- [ ] **Verify independently**: `ffprobe` shows an audio stream as long as the video; loudness in range at the
  start, middle and end (`python3 -I $KIT/delivery/verify.py <config> --loudness` does this for a package);
  `npx hyperframes@0.9.16 audio <file> --json` for click positions.
- [ ] **Hand over listening checks** to a human: the first bars, each splice time, a few clicks, every
  whoosh, the end-card fade, and for the voice: product names and any line the transcription flagged.

## Verification

`delivered:` line; audio duration = video duration within one frame; −16 LUFS ±1 integrated; true peak ≤ −1
dBTP; no silent stretch; report says "measured, not heard".

## Outputs

`music.json`, `beat-grid.json`, `sound-build/{bed.wav,mix.wav,last-build.json}`, the delivered film(s) with
their `.srt` beside them.

## Pitfalls

- The silent "final" (S1): the picture-only render was mistaken for the film. Names and the `delivered:` line
  prevent it; never announce a film as done without them.
- Music shorter than asked (S2): extend, do not regenerate (credits).
- Busy free tier (S3): never double-call.
- Whooshes buried under the bed (S4): dip the music under them.
- Nobody listens (S6): say so, and hand over the listening list.
- Licence of generated music (S7) is an open check for the owner.
