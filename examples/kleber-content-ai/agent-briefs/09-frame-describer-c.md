# 09 frame-describer-c: Describe draft frames 132-194s

- Spawned: 2026-11-06 14:48 UTC
- Agent name: `frames-c`; model: `haiku`; type: `teammate`
- Follow-up messages from the lead: 0

## Brief

You are doing a plain frame read-back of a draft video so an editor can check it. Describe only what you can actually see; never guess or fill in.

Video: `~/Documents/Work/Projects/kleber-content-ai/videos/walkthrough-v2/film/renders/draft4.mp4` (1920x1080, 30 fps, 3:14). It is a product walkthrough: a web app in a rounded window on a dark background, with a drawn mouse pointer, short captions on a dark plate near the bottom, and sometimes a small "Time-lapse" tag.

Your range: 132 s to 193 s, one frame every 2 s (132, 134, … 192) plus 193.

Steps:
1. Make a new folder `/private/tmp/claude-501/-Users-tamas-Documents-Work-Projects-kleber-content-ai/666b89bc-a37a-4c94-b8c9-75757dae11fa/scratchpad/review/c/` and extract the frames into it with ffmpeg, scaled to 1280 px wide, as JPEGs named by their time in seconds (for example `t140.jpg`). Use accurate seeking (`-ss` after `-i`, or the fps filter) so each file really is the stated time.
2. Read every frame image and write one entry per frame to `/private/tmp/claude-501/-Users-tamas-Documents-Work-Projects-kleber-content-ai/666b89bc-a37a-4c94-b8c9-75757dae11fa/scratchpad/review/frames-c.md`, in time order, with these fields:
   - time
   - what is on screen (title card, app window wide, zoomed-in app, end card) and, for the app, which part of it (sign-in, chat, options, image preview, settings, export sheet…) in one sentence
   - caption text exactly as written, or "none"
   - time-lapse tag text exactly as written, or "none"
   - pointer: visible or not, its shape (arrow / hand / text I-beam) and what it is on or near
   - any text typed into the app's message box, quoted, if readable
   - whether a dimmed "spotlight" is active (everything darker except one outlined area) and what the outlined area contains
   - problems, only if you see one: text cut off or overlapping, caption covering the app, anything blank, blurry, pixelated, misaligned, duplicated, an element half off screen, a spinner or skeleton placeholder where content should be. Write "none" otherwise.
3. If a frame is unreadable or you are unsure about a word, say so in that entry rather than guessing.

Reply with just the path of the file you wrote and a two-line summary of the problems you flagged (or "no problems flagged").
