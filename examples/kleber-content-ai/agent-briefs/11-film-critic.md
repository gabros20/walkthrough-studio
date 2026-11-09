# 11 film-critic: Independent critique of draft film

- Spawned: 2026-11-06 14:54 UTC
- Agent name: `critic`; model: `opus`; type: `teammate`
- Follow-up messages from the lead: 2

## Brief

You are the independent reviewer of a draft product walkthrough film that will be shown to a client's stakeholders. You did not make it. Your job is to find what would embarrass us or confuse a viewer, verify a junior reviewer's findings, and return a short, prioritised fix list. Do not edit any project files.

## The film
- Draft: `~/Documents/Work/Projects/kleber-content-ai/videos/walkthrough-v2/film/renders/draft5.mp4` (1920x1080, 30 fps, 3:14, silent; sound is being made separately, ignore its absence).
- It shows "Kleber Content AI": a tyre dealer signs in, types one sentence, gets three on-brand campaign options, picks and edits one, re-prompts a new design, adds platforms and tours the formats, switches UI language, has the post translated to German, tells the assistant a lasting rule (saved as a memory note), sets a brand kit in settings, makes a second campaign that follows the note and the kit, and exports. Real app footage sits in a rounded window on a dark ground; a drawn pointer, camera punch-ins, spotlights, captions and "Time-lapse N×" tags are added in post. Title card at the start, end card at the end.
- Intended story, captions and look: `~/.claude/plans/okay-first-i-want-serialized-falcon.md` (sections "The story", "Look and motion", "The pointer", "The camera", "Captions"). What was actually cut and why: `film/storyboard.json`, `film/edl.json`, `film/captions.srt` in `~/Documents/Work/Projects/kleber-content-ai/videos/walkthrough-v2/film/`. Per-scene contact sheets at 1 frame per second: `film/review/d5/*.jpg`.
- Known and already being handled, do not spend time on these: the pointer appears in a new place across nine hard cuts; no motion blur; one 155 ms footage freeze in the export scene.

## Junior read-back to verify
Three small-model agents described one frame every 2 s of the previous draft (identical except for a slow-down around the "Noting that for next time…" line): `/private/tmp/claude-501/-Users-tamas-Documents-Work-Projects-kleber-content-ai/666b89bc-a37a-4c94-b8c9-75757dae11fa/scratchpad/review/frames-a.md`, `frames-b.md`, `frames-c.md`, with their extracted frames in the sibling folders `a/`, `b/`, `c/`. They flagged, among others: the language selector cut off at the right edge in zoomed frames around 20-24 s and a heading showing through a dropdown at 20 s; the pointer covering text at 30, 52, 56 and 156 s; a grey skeleton placeholder instead of the Display ads creative at 92 s; captions or the time-lapse plate covering the bottom of the zoomed app at 74-90, 104 and 124 s; the language dropdown clipped at 96 s; a blank white app panel at 132 s; an unlabelled red outlined rectangle at 174 s; the export sheet blurred and cut off at 176 s. Small models over-report and misread. For each flag decide: real problem, by design, or misread, by looking at the frame yourself (extract more frames around it from the draft with ffmpeg if needed, into a new folder under that scratchpad `review/critic/`).

## Your own review
Watch the film through frames: extract what you need (for example every 0.5 s around cuts, camera moves and captions) and judge it as a demanding client would. In particular:
1. Can a first-time viewer follow what is happening in every scene without sound? Where do they get lost, and where is something on screen too briefly or too small to read (give times)?
2. Captions: is each one true to what is visibly on screen at that moment, well timed (arrives with the action, stays long enough to read), free of overlap with the time-lapse tag and with app content? Any wording that is weak or unclear for a stakeholder?
3. Camera: any punch-in that crops the thing being acted on, hides the result of an action, or leaves the important change off screen; any place that needs a punch-in and stays wide; any restless back-and-forth.
4. Pointer and spotlights: pointer covering what it points at, clicks that do not visibly land on their control, spotlights that outline the wrong area or read weakly.
5. Time-lapses: are loaders shown clearly before each one, is each labelled, does any sped-up stretch look glitchy or go by too fast to understand what was done (the platform adds, the format tour, the language switches)?
6. Title and end card: composition, legibility, timing.
7. Anything that looks broken: flashes, single odd frames at cuts, blank frames, visible sync-flash remnants, a flickering pixel in the top-left of zoomed shots, half-loaded images held on screen.
8. Pacing: which scenes drag and which are rushed, with a suggested number of seconds to cut or add. The total must stay between 3:00 and 3:15.

## Report back
Plain text, no more than about 60 lines:
- the verdict on each junior flag (one line each: real / by design / misread, with the time);
- your own findings as a prioritised list (must fix / should fix / nice to have), each with a time, what is wrong and a concrete fix;
- the three strongest moments, so they are protected in the next pass.
Be specific and blunt. If you could not check something, say so.

## Follow-up messages from the lead

### 2026-11-06 15:00 UTC

Your report was cut off in transit after the second "should fix" item. Write the complete report, unchanged, to `/private/tmp/claude-501/-Users-tamas-Documents-Work-Projects-kleber-content-ai/666b89bc-a37a-4c94-b8c9-75757dae11fa/scratchpad/review/critic/REPORT.md` and reply with just "saved".

### 2026-11-06 15:01 UTC

Thanks. Send part 2 to me as planned, and also send the complete report (both parts, unchanged) directly to the agent named `editor`, headed "Independent review of draft5: apply per the team lead's rulings". No other action needed.
