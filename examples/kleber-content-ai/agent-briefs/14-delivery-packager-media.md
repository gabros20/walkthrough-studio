# 14 delivery-packager-media: Package videos, clips and stills

- Spawned: 2026-11-06 19:32 UTC
- Agent name: `packager`; model: `sonnet`; type: `teammate`
- Follow-up messages from the lead: 1

## Brief

You are assembling the video part of a delivery package. The owner will send the package to their project manager, who talks to the client (Kleber, the tyre brand) and may either forward the films as they are, or reuse pieces in a website, a PowerPoint deck or a live presentation. So everything must be clearly named, ready to drop into a slide or a web page, and easy to understand without us in the room.

## Sources (do not modify or move any of these)
- The two finished films, both 3:02.0, 1920x1080, 60 fps, H.264 + AAC, identical picture except that one has on-screen captions and the other a voiceover:
  - `~/Documents/Work/Projects/kleber-content-ai/videos/kleber-content-ai-walkthrough-v2.mp4` (captioned, music) and `…-v2.srt` (the captions)
  - `~/Documents/Work/Projects/kleber-content-ai/videos/kleber-content-ai-walkthrough-v2-voiceover.mp4` (female voiceover, music ducked, no captions) and `…-v2-voiceover.srt` (the spoken lines)
- Scene timing for both: `~/Documents/Work/Projects/kleber-content-ai/videos/walkthrough-v2/film/renders/final.edl.json` (scene starts and lengths) and `final.cues.json`. Scenes in order: title, s1 set up (one-time link, logo), s2 ask (one sentence, three options), s3a/s3b choose and edit (options, formats, edit text on the image), s4 refine (new layout by prompt), s5 expand (add platforms, tour of 18 formats), s6a/s6b languages and German translation, s7 teach (a rule saved as a note), s8 settings (brand kit, memory notes), s9a/s9b second campaign and proof, s10 export, end card.
- The app is "Kleber Content AI"; the dealer shown, "Summit Tyre Centre", is fictional.

## Where to write
Only inside `~/Documents/Work/Projects/kleber-content-ai/videos/delivery/Kleber-Content-AI_Demo-Package/`, and only in these three folders (another agent is filling `04_Creative-Showcase/`, `05_Copy/` and the top-level README at the same time; do not touch those):
- `01_Films/`
- `02_Feature-Clips/`
- `03_Screenshots/`
Use a scratch folder under `/private/tmp/claude-501/-Users-tamas-Documents-Work-Projects-kleber-content-ai/666b89bc-a37a-4c94-b8c9-75757dae11fa/scratchpad/package/` for intermediates. ffmpeg 8 is installed (this build has no `drawtext` filter). No commits.

## What to make
1. `01_Films/`: both films under clear names, for example `Kleber-Content-AI_Walkthrough_Captions_1080p60.mp4` and `Kleber-Content-AI_Walkthrough_Voiceover_1080p60.mp4` (exact copies of the masters, not re-encoded), each with its subtitles as `.srt` and also `.vtt` (for web players), named to match. Plus, in a `web/` subfolder, a lighter version of each for email and embedding: 1920x1080 at 30 fps, H.264 high profile, yuv420p, around CRF 23, AAC 160 kb/s, `+faststart`, aiming under about 30 MB each; and a 1280x720 version of each. Plus a poster image for each film (a strong frame, for example the title card with the lockup and both title lines visible, 1920x1080 JPG) for use as a video thumbnail.
2. `02_Feature-Clips/`: one short clip per feature, cut from the films on scene boundaries so each stands alone in a slide: suggested set `01_Set-up-once`, `02_One-sentence-three-options`, `03_Choose-and-edit-on-the-image`, `04_New-layout-by-request`, `05_Six-platforms-eighteen-formats`, `06_Languages-and-translation`, `07_Teach-it-a-rule`, `08_Brand-kit-and-memory`, `09_Second-campaign-follows-the-rules`, `10_Export-the-kit`, plus `00_Title` and `11_End-card`. Cut each from both films into `captions/` and `voiceover/` subfolders (1920x1080, 30 fps, H.264 yuv420p, AAC, faststart), frame-accurate (re-encode; do not stream-copy across non-keyframes), with a 0.3 s audio fade in and out so no clip starts or ends on a click. Check that no voiceover clip cuts a spoken line in half: use the voiceover `.srt` times, and move a cut point by up to a second or merge two neighbouring scenes into one clip if a line straddles the boundary; note any such adjustment.
3. `03_Screenshots/`: clean 1920x1080 PNG stills for slides, taken from the voiceover film (it has no caption plates), one or two per feature at the moment that shows it best (three options on screen; the on-image headline edit; the redesigned layout; a few different formats from the tour; the German version; the "Noting that for next time…" line; each brand-kit click with the preview; the saved notes; the second campaign's proof; the export sheet), plus the title card and the end card. Look at every still you keep: no motion blur from a camera move, no half-finished transition, no loading placeholder, pointer not covering the subject. Name them in story order with what they show.
4. A file listing for my use: `…/scratchpad/package/files-part1.md` with every file you produced, its duration or dimensions, and its size.

## Check before reporting
ffprobe every video you made (duration, resolution, frame rate, audio present); confirm the two master copies are byte-identical to the sources (checksum); open a sample of the stills and at least the first and last frame of each clip to confirm they start and end cleanly; confirm each `.vtt` is valid (header, timestamps with dots).

## Report back (short, plain text)
What is in each of the three folders with total sizes, any clip whose cut points you had to adjust and why, anything you could not do, and anything that looks wrong in the films themselves at the moments you looked at (give the time). State failures plainly.

## Follow-up messages from the lead

### 2026-11-06 19:45 UTC

Good work. Two things.

1. Your report was cut off in transit partway through "Things that look wrong in the films" (it stops at "at about 157 to 160 s the road-scene poster shows its headl…"). Send me just that section again, complete, as a short message.

2. Screenshots: the dark band along the bottom is the films' caption area, by design in the films, but it is dead space on a slide. Make the main set of stills band-free: crop each to the app window area (drop the empty band; keep the full width; if a still is a wide shot with the window floating on the dark ground, crop to the window with a small even margin instead) and save those as the stills in `03_Screenshots/`, moving the current full 1920x1080 frames into `03_Screenshots/full-frame-16x9/`. Leave the title card and end card as full frames in both places. Check a few of the cropped ones by eye, update `files-part1.md`, and tell me when done.
