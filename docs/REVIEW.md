# Review a render: the bundle and the review page

*Mode: how-to. You have a render (`renders/<name>.mp4` in a film project, with its sidecars) and want
everything the critic and a human reviewer look at in one folder, plus a page where a stakeholder can play
the film, jump to every finding and leave notes. The review loop itself (describers, critic, rulings) is in
[`skills/review-film`](../skills/review-film/SKILL.md); this page is the tool it starts with.*

## 1. Make the bundle

From the project (or with `--project <dir>` anywhere):

```
walkthrough review                      # the last render in state.json, else renders/final.mp4
walkthrough review --render final-vo    # another render (the voiceover twin)
```

or without the CLI (`KIT` = the kit, `P` = the project):

```
cd $P
node $KIT/film/scripts/review-bundle.mjs renders/final.mp4 [--takes ../takes]
```

It needs the render's sidecars beside it: `renders/<name>.cues.json`, `renders/<name>.edl.json` and
`renders/<name>.captions.srt`. `walkthrough render` copies them; after a hand-run render, copy them
yourself (`film/README.md`). Without them the bundle uses the project's live `cues.json` / `edl.json`
only when their length matches the render, and says so.

It writes `review/<name>/` in the project (`--out` for another folder; never inside the kit):

| File | What it is |
|---|---|
| `REVIEW.md` | Film facts (length, fps, size, captions on/off, audio track), what was measured with links, what was not and why, the critic checklist from `skills/review-film` as unchecked boxes, and an empty **Rulings** section. |
| `index.html` | The review page (below). |
| `sheets/<scene>.jpg` | One contact sheet per scene (title and end card too): a frame every second of film (`--fps-sheet`, frames per second; `0.5` = one every 2 s) inside the scene's span from `edl.json`, each stamped with its film time. Give these to the frame-describers. |
| `cuts/<nn>-<t>.jpg` | A strip of 3 frames before and 3 after every cut and transition in `cues.json`, and every cut inside a scene (ranges that do not follow on in the source). The first frame after the cut has an orange bar. Odd frames, flashes and pointer jumps show here. |
| `audit.json`, `audit.md` | `film/scripts/audit.mjs --json` on the render's sidecars: pointer jumps at cuts (with the bridges and fades the build applied), dead air after captions, caption lint, caption claims. |
| `holds.md` | `film/scripts/holds.py`: still stretches over 1 s (`--hold`). Runs only when the project's current build is this render's (the same `edl.json`, the cut clips and compositions present); otherwise `REVIEW.md` says why it was skipped. |
| `audio.md` | When there is a sound build (`sound-build/mix.wav`, `mix-vo.wav` for a captionless render) or the render has an audio track: integrated loudness, loudness range and true peak (ffmpeg `ebur128`), the sound build's warnings, and per-line voice over music. |
| `costs.md` | The cost ledger from `state.json` with totals per kind (when it has rows). |
| `bundle.json` | What was written, measured and skipped (the CLI records it in `state.json` `reviews[]`). |

A finding never fails the bundle: exit 0 means the folder is written. Rerunning replaces the folder's
sheets, strips and reports.

## 2. What "measured, not heard" means for the audio

`audio.md` reports numbers, not listening. Loudness and true peak come from `ffmpeg -af ebur128` on the
mix and on the render's own track. Per-line voice over music comes from, in order:

1. **The sound build's own report** (`last-build-vo.json` `voiceover.lines`): the sound build measured
   each line on its voice and its music before mixing them. This is the real ratio.
2. **A proxy** when there is no such report but there is a `voiceover/placement.json` (`--placement`): the
   mix inside each placed line's speech span against the mix outside every line. It tells you whether the
   lines stand out of the bed; it is not a voice/music ratio, and `audio.md` says so.

For word errors and the voice measured from its stem, run `voiceover/listen-check.mjs` (still measured,
not heard). Someone listens to the delivered file on speakers and on headphones before it ships; the
checklist in `REVIEW.md` has the box.

## 3. Use the review page

Open `review/<name>/index.html` in a browser (double-click it; no server, no network, nothing to
install). The page loads the render by a relative path (`../../renders/<name>.mp4`), so keep it in the
project, or send the reviewer the project's `renders/` and `review/` folders together.

- **Findings**: every audit row and hold, worst first, with a level filter. Click a time to seek the video
  there (paused). The row nearest the playhead is highlighted while you play.
- **Per finding**: a note and a ruling (must fix, should fix, nice to have, by design, misread, done).
- **Timed notes**: pause anywhere, press **Note at current time**, write the note; the time is kept.
- **Contact sheets and cut strips**: collapsible per scene and per cut; click any tile to seek to that
  frame. `← frame` / `frame →` step one frame.
- **Export notes** downloads `review-notes.json`: the reviewer's name, every finding with a note or a
  ruling, the timed notes and the free notes. Send that file to the editor. Notes are also kept in the
  browser (local storage for that page) until its site data is cleared; a browser that blocks storage on
  `file://` pages keeps them only until the tab closes, so export before closing.

`review-notes.json` (`walkthrough-review-notes/1`):

```json
{
  "schema": "walkthrough-review-notes/1",
  "render": "../../renders/final.mp4",
  "exportedAt": "2026-11-09T16:03:36.324Z",
  "reviewer": "reviewer name",
  "findings": [{ "id": "a1", "level": "warn", "check": "captions", "t": 5.77, "detail": "…", "verdict": "should fix", "note": "Hold it longer" }],
  "timed": [{ "t": 3.2, "note": "Pointer covers the send button" }],
  "notes": "Pacing is fine."
}
```

The editor turns these into the numbered rulings in `REVIEW.md` (the lead rules; app problems go to the
app fixer, not into the edit).

## 4. Labels on the sheets

Tiles are stamped with film time by ffmpeg `drawtext` when the ffmpeg build has it, else by Pillow
(`python3 -I film/scripts/review/tile.py`), else they are unlabelled and `REVIEW.md` says so (the page
still seeks from a clicked tile). `walkthrough doctor` reports whether `drawtext` is there; `pip install
pillow` is the easy fix. `--labels drawtext|pillow|none` forces one.

## Options

```
review-bundle.mjs <renders/name.mp4> [--out dir] [--project dir] [--storyboard f] [--takes dir]
  [--sound-build dir] [--state state.json] [--placement f] [--fps-sheet 1] [--width 320] [--hold 1.0]
  [--labels auto|drawtext|pillow|none] [--json]
```

`--takes` is where the take folders are (the audit reads their event logs; default as the build finds
them). `--width` is the tile width in pixels. `--json` prints `bundle.json` instead of the summary.
