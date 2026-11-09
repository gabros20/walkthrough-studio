---
name: review-film
description: The review loop for a walkthrough film draft or final (captioned or voiceover twin) - the build audit first (holds, pointer jumps at cuts, caption lint and truth), then cheap Haiku frame-describers read one frame every 2 s in parallel ranges, an Opus film-critic verifies their flags and reviews against the storyboard, LOOK.md and the honesty rules, the lead rules on the list, the editor fixes; plus contact sheets, strips around cuts, the frozen-holds audit and a final 1 fps read. Use after every draft render that matters, before picture lock, after owner notes, and before delivery.
---

# Review a film

Spend little on looking and a lot on judging: Haiku agents describe, one Opus critic judges, you rule.

## Inputs

- The render (`film/renders/<name>.mp4` or the delivered file), its `edl.json`, `cues.json`,
  captions `.srt`, the storyboard, the plan's story and honesty rules.
- A scratchpad folder for frames and reports (never inside the repo).
- The list of known issues already being handled, so nobody spends tokens on them.

## Steps

- [ ] **Build audit (required, first).** The editor runs `node film/build.mjs <storyboard.json> ... --audit`
  and sends you the findings: frozen holds, pointer jumps at cuts, caption lint, caption truth against the
  `mark` text. Each hold is deliberate (the moment is the point; spotlit) or a trim; each jump gets a
  treatment; each caption finding is fixed or the caption is cut. Do not spend describer or critic tokens on
  what the audit already found. `python3 scripts/holds.py 1.0` (from `film/`) details the holds.
- [ ] **Contact sheets.** `python3 -I delivery/contact_sheet.py <render> <dir> --every 1 --width 480` for the
  whole film (or per scene with `--from/--to`); strips around cuts and camera moves with
  `--at t1,t2,... --cols 2 --width 960`. ffmpeg's `drawtext` may be missing; this uses Pillow.
- [ ] **Describers.** Spawn three `frame-describer` agents (Haiku) in one message, on disjoint ranges of
  about a third of the film each, one frame every 2 s, each writing `frames-<a|b|c>.md` in the scratchpad.
  Give each the one-paragraph film description and the problem list from the agent file.
- [ ] **Critic.** Spawn `film-critic` (Opus) with the render, sheets, the describers' reports, the storyboard
  and plan, the known-issues list, and a report file path. It rules on every describer flag (real / by design
  / misread) and returns must fix / should fix / nice to have with times and concrete fixes, plus the three
  strongest moments to protect.
- [ ] **Rule.** Read the critic's summary (open the full file only where needed). Send the editor one
  numbered list of rulings, saying which earlier messages it supersedes. App problems go to `app-fixer`
  (then studio re-sync and retake), not into the edit.
- [ ] **Re-check** the fixed draft on the items that were wrong (strips at those times), not the whole film,
  unless the cut changed broadly.
- [ ] **Final read** before handing over: a 1 fps contact sheet of the delivered file, read by you or by one
  describer plus your spot-check.

For a voiceover twin, the critic also checks each spoken line against its frames (`voiceover.srt` times):
the claim is visible while it is said, and no line talks over a reveal it should leave silent.

## Checklist the critic must cover (add to its brief if missing)

- Clicked control fully in frame at every click; the changed thing in frame too.
- Captions true to the frame, timed with the action, readable (0.5 s + 0.3 s per word), not over tags or app.
- No skeleton or placeholder held outside a wait; images loaded; no half-loaded images.
- Logos: present, readable on their background, not over lettering in the artwork.
- Pointer: not covering its target; no jumps across cuts; clicks land on controls.
- Time-lapses labelled with the loader shown first; slow-downs untagged and justified.
- No flashes, odd frames at cuts, sync-flash remnants, heartbeat pixel in zoomed top-left shots.
- Title and end card legible; pacing within the target length.

## Outputs

`frames-a.md` … in the scratchpad, the critic's `REPORT.md`, your rulings message, and the editor's next
draft. Nothing in the repo.

## Pitfalls

- Small models over-report and misread; never act on an unverified describer flag (`docs/LESSONS.md` E6).
- Long agent reports get cut off in transit; always ask for a file plus a short message (E7).
- Do not review the storyboard instead of the frames: the settings-scene framing bug (E1) was invisible in
  the data and obvious in one frame.
