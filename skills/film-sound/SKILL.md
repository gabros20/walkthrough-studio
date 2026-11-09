---
name: film-sound
description: Score a locked walkthrough film - generate the music bed once via ElevenLabs Music (walkthrough sound music with an API key, or the connector), measure its tempo and beat phase into music.json (walkthrough sound beat-grid), extend it by bar-aligned loops when it comes back short, write beat-grid.json for bar-aligned cuts, add click/whoosh/riser effects from HyperFrames' bundled set, mix to -16 LUFS / <= -1 dBTP with voiceover ducking when present, mux onto the picture-only render (walkthrough sound build) and prove the delivered file has sound; every paid call lands in the cost ledger. Use after picture lock, after any re-timing, and for the voiceover version's mix.
---

# Film sound

The sound designer (`agents/sound-designer.md`, Opus) builds and mixes; you make the paid generation call.
(Or, without sub-agents, do that role's checklist yourself: see `agents/sound-designer.md` in the kit.)
Read `docs/ELEVENLABS.md` (the exact connector calls, the API-key route, costs, "busy" handling, licence),
`sound/` (`build-sound.mjs --help`), the `media-use` skill, and `docs/LESSONS.md` section "Sound and
voice". Example: `examples/brightpost/music.json` and `beat-grid.json`.

All paths are in the film's project folder `$P` (skill `build-film`); run from `$P` (or pass
`--project $P`; `--film` is kept as an alias). `KIT` is the kit root. The CLI wraps every step and prints
the command it runs:

```bash
walkthrough sound music --prompt-file music.prompt.txt [--seconds N]   # node $KIT/sound/generate-music.mjs
walkthrough sound beat-grid music-take1.mp3                           # node $KIT/sound/beat-grid.mjs
walkthrough sound build [--voiceover voiceover/vo-track.wav] --deliver out/<film>.mp4   # build-sound.mjs
walkthrough cost show                                                 # the ledger, totals per kind
```

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

- [ ] **Generate once (you).** Write the direction to `$P/music.prompt.txt`. With `ELEVENLABS_API_KEY` set:
  `walkthrough sound music --prompt-file music.prompt.txt` (or `node $KIT/sound/generate-music.mjs
  --prompt-file music.prompt.txt --seconds <film + 2>`): `POST /v1/music`, model `music_v2_5`, `--seconds`
  defaults to the last render's length + 2 s, saves `music-take1.mp3`, never overwrites a take (write
  `--out music-take2.mp3` for another), prints the real length and appends a `music` cost row (seconds
  asked) to `sound-build/cost.jsonl`, which the CLI folds into `state.json`. Without a key it prints the
  connector steps and exits 2: then use the ElevenLabs connector (`docs/ELEVENLABS.md`; sub-agents cannot
  reach it) and add the row yourself (`walkthrough cost add --kind music --units <seconds> --note "take 1"`).
  One call either way. If the reply is "Free generations are busy", do not call again in this turn; retry on
  a later turn. A take shorter than asked is extended by loops, not regenerated. `ELEVENLABS_MOCK=1` tests
  the route without credits; run it with `--out` in a scratch folder (it writes a silent take and a cost row).
- [ ] **Brief the sound designer** with the paths, the direction, and: no generation calls; extend by loops if
  short; effects sparse; numbers to hit; prove delivery.
- [ ] **Bed and grid.** `walkthrough sound beat-grid music-take1.mp3 [--bpm 96] [--groove 10,110]`
  (`node $KIT/sound/beat-grid.mjs`; Python with numpy, scipy, soundfile) measures tempo and beat phase and
  writes `bpm`, `beat`, `bar`, `gridOffset` and the evidence into `$P/music.json` (created beside the take
  when missing; template `$KIT/sound/music.example.json`). The beat is measured, the downbeat is not:
  confirm which beat is "1" (`sound/analysis/struct.py`, the kick profile, listening) and move `gridOffset`
  by whole beats if needed; never trust a tempo detector alone. The designer adds sections and the ending
  and writes `beat-grid.json`; anchor bars to film time 0 so the editor can nudge scene changes onto bars
  with holds only.
- [ ] **Draft mix** on a draft picture: `walkthrough sound build --video renders/<draft>.mp4` (or
  `node $KIT/sound/build-sound.mjs --video renders/<draft>.mp4`).
- [ ] **Delivery**: `walkthrough sound build --deliver out/<film>.mp4` (`--video` defaults to the last
  render in `state.json`; disk policy first, `caffeinate -i` on macOS; a `delivered:` line is recorded in
  `state.deliveries`), or `node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/<film>.mp4`.
  The last line must be `delivered: <path>` (exit 0). `NOT DELIVERED (checks failed)` (exit 2) or
  `no video given` means nothing was delivered. Outputs of the build go to `$P/sound-build/`.
- [ ] **Voiceover version**: `walkthrough sound build --video renders/final-vo.mp4 --voiceover
  voiceover/vo-track.wav --deliver out/<film>-voiceover.mp4` (music ducked ~10-12 dB under each line);
  then `walkthrough vo listen-check out/<film>-voiceover.mp4` (skill `voiceover`).
- [ ] **Verify independently**: `ffprobe` shows an audio stream as long as the video; loudness in range at the
  start, middle and end (`python3 -I $KIT/delivery/verify.py <config> --loudness` does this for a package);
  `npx hyperframes@0.9.16 audio <file> --json` for click positions.
- [ ] **Hand over listening checks** to a human: the first bars, each splice time, a few clicks, every
  whoosh, the end-card fade, and for the voice: product names and any line the transcription flagged.

## Verification

`delivered:` line; audio duration = video duration within one frame; −16 LUFS ±1 integrated; true peak ≤ −1
dBTP; no silent stretch; report says "measured, not heard".

## Outputs

`music.prompt.txt`, `music-take1.mp3`, `music.json`, `beat-grid.json`,
`sound-build/{bed.wav,mix.wav,last-build.json,cost.jsonl}`, the delivered film(s) with their `.srt` beside
them, the music cost row in `state.json`.

## Pitfalls

- The silent "final" (S1): the picture-only render was mistaken for the film. Names and the `delivered:` line
  prevent it; never announce a film as done without them.
- Music shorter than asked (S2): extend, do not regenerate (credits).
- Busy free tier (S3): never double-call.
- Whooshes buried under the bed (S4): dip the music under them.
- Nobody listens (S6): say so, and hand over the listening list.
- Licence of generated music (S7) is an open check for the owner.
