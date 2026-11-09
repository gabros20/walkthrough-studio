# 13 voiceover-producer: Write and time the voiceover script

- Spawned: 2026-11-06 18:11 UTC
- Agent name: `voiceover`; model: `opus`; type: `teammate`
- Follow-up messages from the lead: 4

## Brief

You are writing the voiceover for a finished 3:12 product walkthrough film, then (in a second phase, after the audio has been generated for you) cutting the recorded voice into lines and placing each one on the film's timeline. The voiceover version will have no on-screen captions; a captioned version already exists and stays as it is. The client will choose between the two, so the voiceover must carry everything the captions carried, and sound like a confident product film, not a tutorial.

## The film
- Delivered captioned version: `~/Documents/Work/Projects/kleber-content-ai/videos/kleber-content-ai-walkthrough-v2.mp4` (1920x1080, 60 fps, 192.0 s, music and soft click sounds, no voice). Its captions: `…/videos/kleber-content-ai-walkthrough-v2.srt`.
- Project: `~/Documents/Work/Projects/kleber-content-ai/videos/walkthrough-v2/film/` (`README.md`, `storyboard.json`, and beside the final render `renders/final.edl.json` with scene start times, `renders/final.cues.json`, `renders/final.captions.srt`). What happens in each take, with the exact words typed and what the app answered: `~/Documents/Work/Projects/kleber-content-ai-studio/takes/INDEX.md`. The original story intent: `~/.claude/plans/okay-first-i-want-serialized-falcon.md`, section "The story".
- Subject: "Kleber Content AI". A tyre dealer (the fictional Summit Tyre Centre) joins with a one-time link and uploads a logo; types one sentence and gets three on-brand campaign options built from Kleber's brand hub, each image checked before it is shown; picks one, edits text directly, even on the image; asks for a new layout in plain words; adds platforms with no AI wait and sees all 18 formats across 6 platforms; switches the app's language (8 available) and has the post translated to German, on the image too; tells the assistant a rule once, which it saves as a note; sets a brand kit in settings and sees the saved notes; makes a second campaign that follows the notes and the kit (logo first, colour, button shape, the sign-off added by itself); exports the kit. The audience is Kleber's own stakeholders, so the point is what this does for their dealers and their brand.
- Look at the film itself before writing: extract frames around each scene start and each caption time with ffmpeg into a new folder under `/private/tmp/claude-501/-Users-tamas-Documents-Work-Projects-kleber-content-ai/666b89bc-a37a-4c94-b8c9-75757dae11fa/scratchpad/vo/` so every line you write matches what is on screen when it is spoken.

## Phase 1: the script (do this now)
- Voice: a warm, assured female narrator, British English spelling and idiom, calm pace. Write for the ear: short sentences, plain words, no jargon, no hype words, no lists of features read out. Say what the dealer gets and why it matters to Kleber. Do not narrate clicks ("now she clicks…"). Do not read the on-screen text back.
- Truth: say nothing the film does not show or the app does not do. Numbers must match the film (three options, six platforms, eighteen formats, eight languages). The saved-notes idea must be explained plainly: what the dealer tells the assistant once is saved and added to every later request, and the second campaign proves it.
- Shape: an opening line over the title (the title card reads "One sentence in. A ready-to-post campaign out."), one or two lines per scene, and a closing line over the end card ("From one sentence to every channel."). The voice may rephrase those card lines rather than repeat them. Leave air: the voice should be speaking for roughly 55-65% of the film, with clear pauses at the reveals (three options arriving, the redesign, the German version, the second campaign). Silence over a strong picture is good.
- Timing: plan each line into a window on the film's clock, starting at or just after the scene change or action it belongs to and finishing at least 0.5 s before the next line's window and before the picture moves on to something else. Estimate each line's spoken length at 2.4 words per second plus 0.35 s, and keep every line inside its window with at least 15% to spare. The picture's timing is fixed; fit the words to it.
- Write to `film/voiceover/`: `script.json` (ordered lines: id, scene, window start and end in film seconds, text, word count, estimated duration) and `script.txt` (the full narration as it should be sent to a text-to-speech model: one line per paragraph, in order, with punctuation that makes natural phrasing; nothing but the words to be spoken).
- Then stop and send me (the team lead) the complete `script.txt` content, the line table (id, window, estimated duration), the total word count and speaking share, and any place where the film gave you too little time to say what needed saying. I will have the voice generated (one take, to spare the client's credits) and send you the audio path.

## Phase 2: placing the voice (after I send you the audio)
- You will get one audio file of the whole narration. Find each line's exact start and end in it (word-level timestamps from a local transcription: see the `media-use` and `hyperframes` skills for the bundled transcribe command; check boundaries against the waveform so no word is clipped), cut it into lines with short fades, and check each against its window. A line that overruns its window is first shifted earlier or later within the scene; if it still does not fit, report it with numbers rather than speeding the voice up.
- Deliver `film/voiceover/vo-track.wav`: 48 kHz, film length (192.0 s), silence except where lines sit at their film times, voice level even from line to line; and `film/voiceover/placement.json` (id, film start, film end, source start, source end, slack to the window). Also write `film/voiceover/voiceover.srt` with the spoken lines at their real times, for accessibility. Another agent (`sound`) will mix this track with the music, ducking the music under the voice; tell it the path when the track exists, and tell me.

Do not edit files outside `film/voiceover/` and the scratchpad. No commits. In your reports say plainly what you measured and what you could not judge (nobody on this job can listen to audio).

## Follow-up messages from the lead

### 2026-11-06 18:21 UTC

Script approved as written and the voice is generated: `film/voiceover/vo-take1.mp3` (one take, 100.88 s, mono 44.1 kHz, ElevenLabs eleven_v4, voice "Emily E." warm British female). The whole narration is in that one file, paragraphs in script order.

Start phase 2 now: find each line's exact start and end, cut and place the 27 lines at their film times, deliver `vo-track.wav` (48 kHz, 192.0 s), `placement.json` and `voiceover.srt`, and message the `sound` agent with the path as soon as the track exists (the captionless picture `renders/final-vo.picture-only.mp4` is already rendered, 192.0 s, same cue times). Then report to me: each line's real duration against its window and slack, any line you had to shift or that does not fit, the measured speaking share, the voice's level consistency, and whether the transcription shows every word was spoken as scripted (in particular how the word "Kleber" was transcribed, as a hint to its pronunciation). The take's total of 100.9 s including pauses suggests the lines run a little shorter than estimated, so prefer placing each line at its window start plus a small lead-in rather than centring it.

### 2026-11-06 18:45 UTC

The owner approved the voiceover version apart from two picture fixes that change timing: the settings scene is being re-recorded and re-framed (scene 8, your lines L20-L22), and static holds longer than about a second are being trimmed across the film, starting with the one at 1:03. The script and the generated take stay as they are; no new audio is being generated.

When the editor has rebuilt the captionless picture it will message you with the new `renders/final-vo.edl.json` and `final-vo.cues.json` and a table of old versus new film times for scene starts and for the events your lines hang on. Then:
1. Recompute every line's window from the new times (same rule: start at or just after the action it belongs to, end at least 0.5 s before the next line and before the picture moves on) and re-place the 27 lines from the existing take. Look at frames of the new picture around each line in scenes 3 to 8 to confirm each line still sits over the right picture; in the settings scene, L21 ("Each choice shows straight away…") should run over the brand-kit clicks and L22 ("And here are the assistant's saved notes.") over the notes.
2. If trimming has left a window too short for its line, shift within the scene first; if a line still does not fit, tell the editor exactly how much more time that moment needs and tell me, rather than cutting words.
3. Rewrite `vo-track.wav` (film length to the frame), `placement.json` and `voiceover.srt`, then message `sound` with the path so it builds the voiceover film. Report to me: every line's new span and slack, anything that moved relative to its picture, and the new speaking share.

### 2026-11-06 18:50 UTC

Change of order to avoid rendering twice: the editor is trimming about 12 s of static holds (the film drops to about 3:00) and will send you a dry-run EDL, cues and an old-versus-new time table before it renders. Run your fit check against that dry run straight away and reply to the editor with a list: each line that no longer fits its moment, how many seconds short, and where in the scene the time would help most. Repeat until every line fits with at least 0.3 s of slack, then tell the editor "all lines fit". Only place the lines for real (track, placement, srt) and message `sound` once the editor confirms the captionless picture is rendered with those exact timings.

### 2026-11-06 19:15 UTC

The captionless picture is rendered: `film/renders/final-vo.picture-only.mp4`, 182.000 s, written 20:13, with `final-vo.edl.json` and `final-vo.cues.json` beside it (the sound agent confirms its cue timings match the captioned build, which is already delivered at 182.0 s). Check those sidecars against your proposal-2 windows (they should be identical; if any time differs, re-run your fit check on the real files first), then place the 27 lines for real, rewrite `vo-track.wav` (182.000 s), `placement.json` and `voiceover.srt`, and message `sound` straight away so it builds the voiceover film. Then send me the short report.
