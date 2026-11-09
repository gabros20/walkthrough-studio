# Design: batch 2 — one CLI, doctor, golden test, pointer bridging, and the roadmap's open items

*Mode: explanation (design decisions for the work tracked in [ROADMAP.md](ROADMAP.md)). Written 2026-11-09 before implementation; each section says what is built, what it touches, and how it is verified.*

## 1. The project model (everything else hangs off it)

Today the recorder has `walkthrough.config.mjs`, the film has a project folder with `storyboard.json`, and the sound/voiceover tools take paths. Batch 2 makes **one project folder** the unit of work:

```
my-tour/
  walkthrough.config.mjs   recorder: baseUrl, viewport, scenes, studio (optional), buffer
  scenes.json              declarative steps (or scenes.mjs)
  brand.json               look
  storyboard.json          the cut (drafted, then refined)
  tour-map.json            output of `explore` (optional)
  takes/<name>/            masters + events.json
  renders/ out/ review/    outputs
  voiceover/ sound-build/  twins
  state.json               project state (below); written only by the CLI
```

`state.json` (schema `walkthrough-state/1`): `{ mode, takes: { <name>: { recordedAt, ok, accepted, checkpoint } }, checkpoints: [...], pictureLock: { hash, at } | null, builds: [{ at, storyboardHash, captions, audit: { errors, warnings } }], renders: [{ file, at, fps, duration }], sound: [...], voiceover: [...], costs: [ { at, kind, units, amount, note } ] }`. The CLI owns it; tools never write it. `walkthrough state` prints it; `walkthrough cost add --kind tts --units 1377 --note "27 lines"` appends a ledger row; `walkthrough review` copies the ledger into `REVIEW.md`.

## 2. One CLI: `walkthrough`

`bin/walkthrough.mjs` (root `package.json` `bin`), zero dependencies, Node 22+. **Command registry by directory**: `cli/commands/<name>.mjs` exports `{ name, describe, usage, run(argv, ctx) }`; the loader lists the directory, so later work adds a file instead of editing the core. `ctx = { kit: { root }, project: { dir, config, state, save() }, log, exec(cmd, args, opts) }`. Project resolution: `--project <dir>`, `WALKTHROUGH_PROJECT`, else the nearest ancestor of cwd holding `walkthrough.config.mjs` or `state.json`.

| Command | Does |
|---|---|
| `init <dir> [--mode site\|studio] [--url]` | scaffolds the project folder above (recorder config, `scenes.json` template from `recorder/site-test`, film project via `film/scripts/init-project.mjs`, `brand.json`, empty `state.json`) |
| `doctor [--capture]` | §3 |
| `studio up\|down\|checkpoint\|restore\|status` | wraps `studio/bin/*.sh` with the project's studio config |
| `explore <url> [--depth 2] [--max-pages 20] [--storage]` | §5 tour map |
| `capture-test`, `take <scene…> [--auto] [--parallel N]` | wraps the recorder; `take` records accepted takes and gap stats into `state.json` |
| `draft`, `captions brief\|apply`, `build [--dry] [--audit] [--no-captions]`, `audit`, `render [--name]` | wrap the film tools; `render` applies the disk policy (§4) and records the render |
| `review` | §7 review bundle |
| `sound …`, `vo …` | wrap `sound/` and `voiceover/` tools; the TTS and music scripts append cost rows |
| `deliver [--preset …]` | §8 |
| `state`, `cost add\|show` | the state file and ledger |

Every command prints what it ran (the underlying node/bash invocation), so the CLI is a convenience and never the only way.

## 3. `doctor`

Checks and prints a table (ok / warn / fail), exit 1 on any fail: Node ≥ 22; `ffmpeg`/`ffprobe` present, ffmpeg has `drawtext` (warn if not: contact sheets lose labels) and `libx264`; Python 3 with `numpy`, `PIL`; `npx hyperframes@0.9.16 --version` resolves (cache or network); Playwright Chromium installed for `recorder/` (`recorder/node_modules/playwright-core` + the browser path); the `/hyperframes` skill set present in `~/.claude/skills` or a plugin (warn, with the install line the user runs); disk: free space on the project volume and on `config.buffer` if set (warn < 10 GB, fail < 5 GB for `render`); `ELEVENLABS_API_KEY` set (name only, never the value) — "connector route" otherwise; macOS `caffeinate` present. `--capture` runs the 8 s capture test and reports fps and the drift. Output also saved to `<project>/doctor.json`.

## 4. Disk policy (automated)

`render`, `sound` and `deliver` call `cli/lib/disk.mjs`: if the project volume has < 5 GB free and `config.buffer` is set and mounted, the frame cache (`--frames-cache-dir`) and the render output go to `<buffer>/<project-name>/…` and the final file is copied back; if neither has room, stop before the step with the amount needed. On macOS, long steps run under `caffeinate -i`. Each spill is printed and recorded in `state.json`.

## 5. Recorder: tour map, tabs, downloads, dialogs, parallel takes

- **Tour map** (`recorder/tools/explore.mjs`, grown from the seed): breadth-first crawl of same-origin links from the start URL (depth and page caps), per page: url, title, landmarks, interactive controls from the accessibility tree (role, name, box, visible text, `href`), a 480-px-wide thumbnail; `dismiss`/`blockUrls`/`storageState` honoured. Writes `tour-map.json` and `tour-map.md` (one section per page, controls as a table) and `scenes.draft.json`: one scene per page with `mark` steps for the main heading and `click` steps for primary controls — the agent edits that into the real `scenes.json`.
- **Tabs**: config `popups: "same-tab" | "follow" | "block"` (default `same-tab`): an init script rewrites `target=_blank` and `window.open` to same-tab navigation so the screencast never loses the page; `follow` attaches the screencast to the new page and logs a `nav` event with `newTab: true` (the master keeps one clock; the switch is a hard cut the editor sees); `block` cancels and logs.
- **Downloads**: `page.on('download')` → saved to `takes/<take>/downloads/`, logged as `{ type: "download", label, filename, bytes, t }` so a caption can claim it.
- **Dialogs**: config `dialogs: "accept" | "dismiss"` (default `accept`), each logged as `{ type: "dialog", kind, message, action, t }`; the take never hangs on a dialog.
- **Parallel takes** (site mode only): `take --parallel N` runs independent scenes in separate browser contexts and ports; the runner refuses `--parallel` when a studio is configured (one database, one clock) and says why.
- CONTRACT.md gains the two event types and the `newTab` flag; schema stays `walkthrough-take/1` (additive).

## 6. Film: pointer bridging, aspect presets, phone bezel, caption drafting, script-first timing

- **Pointer bridging** (`film/lib/pointer.mjs` + `build.mjs`): at every cut where the pointer position changes by more than `jump.bridge` (default 120 stage px) and the storyboard gives no treatment, the build applies one: 120–400 px → **bridge** (a 0.35 s arc move starting at the cut, same ease as a recorded move); > 400 px → **fade** (hide 0.15 s before the cut, show at the new point 0.2 s after). Storyboard: top-level `"pointerAtCuts": "auto" | "bridge" | "fade" | "none"` (default `auto`), per-scene `"exit": { …, "pointer": "bridge" | "fade" | "none" }` overrides. The audit reports auto-treated cuts as `ok (auto bridge/fade)` and still errors on untreated jumps only when `pointerAtCuts` is `none`.
- **Aspect presets** (`brand.json` → `look.aspect: "16:9" | "9:16" | "1:1"`): `lib/config.mjs` derives canvas, window box, caption band, tag position, wipe width and title/end layouts from the aspect (the constants listed in LOOK.md "Roadmap: 9:16 and 1:1"); portrait requires a portrait take (phone preset) and the build errors with a clear message otherwise; title and end cards get a stacked layout for portrait and square. Verified with `hyperframes check` and snapshots at each aspect.
- **Phone bezel**: when the take's viewport is a phone preset, `lib/stage.mjs` draws a neutral device frame (rounded bezel, no brand marks) around the footage, sized from `events.json` viewport/scale; `look.bezel: false` turns it off.
- **Caption drafting as a tool + agent pass**: `film/scripts/draft-captions.mjs brief` writes `captions.brief.md`: for every `TODO:` placeholder — scene intent (from the storyboard `intent` field or the scene id), the click label, the marked text near it, the window length, the max words for that window (from the hold rule), and the claim candidate; the agent (Sonnet) fills a `captions.answers.json`; `draft-captions.mjs apply` writes the texts into the storyboard, sets `"claims"` where the answer quotes marked text, and runs the caption lint. No model call inside the tool.
- **Script-first timing** (`build.mjs --fit-audio voiceover/placement.json`): for a scene whose caption/VO line is longer than its window, the build adds a `stretch` on the quietest rest moment in that scene (pointer at rest, no logged events) so the window ≥ line duration + 0.3 s; it reports each stretch in the durations table and refuses when a scene has no rest moment (the editor then re-cuts). Picture-first stays the default.

## 7. Review bundle and human review page

`film/scripts/review-bundle.mjs` (→ `walkthrough review`): one `review/` folder per render: contact sheet per scene (ffmpeg tile; labels via Pillow when `drawtext` is missing), cut strips (3 frames before/after every cut), `audit.json` + table, holds report, caption lint, pointer-jump report, audio report when a mix exists (loudness, true peak, per-line VO/music ratio from the stems), the cost ledger, and `REVIEW.md` from a template with "measured, not heard" wording. `review/index.html` is a static page (no server) listing every finding with a timestamp link into the render (`<video>` with `#t=`), and a notes box that exports `review-notes.json` for the editor.

## 8. Voice, sound, delivery

- **Per-line TTS with a cache** (`voiceover/tts.mjs`): one request per line via the ElevenLabs REST API (`ELEVENLABS_API_KEY`; model `eleven_v4` default; voice id required), keyed by `sha256(voice|model|lexicon|text)` → `voiceover/cache/<hash>.mp3`; concatenates to `vo-take.mp3` with the line gaps from the placement windows, writes `placement.json` directly (line boundaries are known, so no transcription split), appends a cost row. Without a key it writes `voiceover/lines/<nn>.txt` and the exact connector steps so the agent can generate per line and drop the files in; `tts.mjs assemble` then does the rest.
- **Pronunciation lexicon** (`voiceover/lexicon.json`: `{ "Brightpost": "Bright post" }`) applied to the text sent to TTS, never to captions.
- **Multi-language twins** (`voiceover/translate-brief.mjs <lang>`): writes `script.<lang>.brief.md` and `captions.<lang>.brief.md` from the English script/captions with the per-line window and max words; the agent translates into `*.answers.json`; `apply` writes `script.<lang>.json` and `captions.<lang>.srt`; `tts.mjs --lang de` renders the twin.
- **Listening proxy** (`voiceover/listen-check.mjs <mix.mp4>`): `hyperframes transcribe` the delivered mix → per-line word error rate against the script, missing/extra words; per-line VO-over-music ratio from the stems; clipping scan; writes `listen-check.json` + a short table. Reported as *measured, not heard*.
- **Music by API key** (`sound/generate-music.mjs --prompt-file music.prompt.txt --seconds N`): `POST /v1/music` with the key, saves `music-take1.mp3`, appends a cost row; the connector route stays documented for sessions without a key.
- **Delivery presets** (`delivery/presets.json`, `--preset sales | web | social | docs`): `sales` = today's full package; `web` = 1080p30 + 720p + poster + VTT + a chaptered YouTube description built from the captions; `social` = the 9:16 film (requires an aspect-9:16 render) cut per scene group into clips ≤ 60 s with burned captions; `docs` = per-feature clips (scene groups) 10–30 s with their SRT and a GIF each (ffmpeg palettegen, ≤ 8 MB), named by feature, for READMEs and help centres.

## 9. Golden test

`npm test` (and a CI job `test`): deterministic, no browser, no render. Fixture in `test/fixtures/brightpost-mini/`: a 6 s `events.json` + `take.json` taken from the real sample take, a storyboard, `brand.json`; the master is **generated** at test time with ffmpeg (colour bars, 2880×1620, 60 fps, 6 s) so no video is committed. The test runs `build.mjs --dry --dry-out` and `--emit-only` (new flag: writes compositions without cutting footage) and compares `edl.json`, `cues.json`, `captions.srt` and the SHA-256 of every composition HTML against `test/golden/`. `npm run test:update` rewrites the goldens with a diff shown. `npm run test:render` (local only) renders the fixture at 15 fps and compares eight frames by perceptual hash with a tolerance, for the day a lib change should move pixels on purpose.

## 10. Order and delegation

Wave A (parallel, disjoint folders): CLI core + doctor + disk policy + state/cost (`bin/`, `cli/`); film pointer bridging + golden test (`film/lib`, `film/build.mjs`, `test/`, CI); recorder tour map + tabs/downloads/dialogs + parallel (`recorder/`); voice and sound tools (`voiceover/`, `sound/`); delivery presets (`delivery/`). Each adds its `cli/commands/<name>.mjs` file and its docs/ROADMAP status lines.
Wave B (sequential on the film): aspect presets + bezel; then caption drafting + script-first timing; then the review bundle.
Wave C: README/docs/site updates, version 0.2.0, release.

All work lands on `feat/batch-2`, merged by PR with CI green.
