# 10 sound-designer: Build music bed and sound mix

- Spawned: 2026-11-06 14:51 UTC
- Agent name: `sound`; model: `opus`; type: `teammate`
- Follow-up messages from the lead: 4

## Brief

You are doing the sound for a ~3:12 product walkthrough film (a HyperFrames project: HTML rendered to video). Nobody on this job can listen to audio, so every decision you make must be backed by measurement, and you must say plainly what was measured and what could not be judged.

## Where things are
- Film project: `~/Documents/Work/Projects/kleber-content-ai/videos/walkthrough-v2/film/` (read `README.md` there; another agent, the editor, owns `build.mjs`, `storyboard.json`, `lib/` and the compositions: do not edit those; put your work in `film/sound/` and `film/assets/audio/`). Do not touch anything outside `film/`. No commits.
- Load the `media-use` skill (mixing placed audio, sound effects) and the `hyperframes` skill's audio guidance before deciding how audio is attached to the film. HyperFrames is pinned at 0.9.16; it bundles a set of sound-effect files, find them through the skills.
- Music from ElevenLabs, already downloaded: `film/assets/audio/music-take1.mp3` (135.7 s, -13.1 LUFS) and `music-take2.mp3` (43.2 s). The request was for 195 s, instrumental, "downtempo organic electronica at 96 BPM, warm electric piano, mallet and kalimba plucks, round sub bass, brushed broken beat, airy pads; sparse first 8 s, groove enters gently, small lift late, soft resolved ending". Both came back shorter than asked. Do not generate more music (it costs the user's credits); work with these files.
- Picture: the current draft is `film/renders/draft4.mp4` (3:14.0, silent). It is under review and its length will change by a few seconds; the final length will be between 3:05 and 3:15. `film/cues.json` holds the film-time cue points (clicks, with an `inTimelapse` flag, and scene transitions: wipes, pushes, whip, hard cuts); `film/edl.json` has scene start times. Both are regenerated on every build, so read them at build time, never copy numbers out of them.

## What to build
1. **A music bed of any requested length from take 1** (take 2 only if analysis shows it is better material). Analyse it first: actual tempo and beat grid, bar positions, section structure (intro, groove, any lift, ending), energy over time, and whether the ending resolves. Then write a script that extends it to a given film duration plus a 2 s tail by repeating bar-aligned sections with short crossfades at points where the splice is clean (same harmony position in the loop, low spectral difference across the join), keeping the real intro at the start and the real ending at the end. Prefer few long repeats over many short ones. Verify each splice by measurement (beat grid continuity across the join, no level jump, no click) and report the numbers. If the material cannot be extended cleanly, say so and give the best fallback (for example a slightly slower film-length fit is NOT acceptable; a clean fade-out before a join is).
2. **Sound effects from the bundled set:** a soft click on each real pointer click that is not inside a time-lapse (inside time-lapses use no clicks), a short soft whoosh on scene-level transitions (two alternating variants; none on plain hard cuts unless it clearly helps), and one gentle riser into the end card. Each should sit only 3-6 dB over the bed, never sharp. Keep it sparse: this is a calm, focused film.
3. **Sync the picture to the music only by reporting:** list for the editor, in a small `film/sound/beat-grid.json`, the bar and beat times of the finished bed, so scene changes can be nudged onto bars. Do not change picture timing yourself.
4. **Mix:** music fades in over 0.4 s, ducks nowhere (there is no voice), fades out over 2.5 s under the end card and ends with the picture. Whole programme about -16 LUFS integrated, true peak at or below -1 dBTP.
5. **Delivery of the audio into the film:** decide from the skills whether the film should carry the bed and effects as HyperFrames audio elements or whether a single mixed track muxed onto the rendered video with ffmpeg is more reliable, choose one, and provide one command (`node sound/build-sound.mjs` or similar) that takes the current `cues.json`, `edl.json` and film duration and produces the result, so it can be re-run after the picture is locked. Prove it on `draft4.mp4`: produce `film/renders/draft4-sound.mp4`.

## Check before reporting
Measure the result on the muxed file: integrated loudness and true peak, that audio and video durations match within one frame, that click sounds land within one frame of their cue times (check a handful by locating onsets), and that there is no silence gap or clipped splice in the bed. `npx hyperframes audio <file> --json` exists for part of this.

## Report back (short, plain text)
What the music analysis found (tempo, structure, where it was extended and how clean each join measured), which sound effects are used where, the mix numbers, how to re-run for a new picture length, and what you could only measure and not judge by ear. State failures plainly; do not describe an unverified step as done.

## Follow-up messages from the lead

### 2026-11-06 15:24 UTC

Two instructions, then wait for the editor's final render.

1. Anchor the music bed so its bar lines fall on multiples of 2.5 s from film time 0 and beats on multiples of 0.625 s, whatever the film length (trim or extend only in whole bars; if the intro needs trimming, trim whole bars). The editor is nudging scene changes onto that grid now and putting the format-tour cuts on beats. Write `film/sound/beat-grid.json` accordingly. If your build cannot keep that anchor for some length, tell the editor and me at once.

2. The editor is making the final picture: `film/renders/final.mp4` (1920x1080, 60 fps, about 3:08-3:15), with `final.cues.json` and `final.edl.json` saved beside it, and will message you when it exists. Then build the sound for it and produce the deliverables:
   - `~/Documents/Work/Projects/kleber-content-ai/videos/kleber-content-ai-walkthrough-v2.mp4`: the final picture with your mix (video stream copied, not re-encoded; AAC audio 48 kHz stereo at a good bitrate; `+faststart`).
   - `~/Documents/Work/Projects/kleber-content-ai/videos/kleber-content-ai-walkthrough-v2.srt`: a copy of the film's final `captions.srt`.
   - Keep the unused second music take and your extended bed as separate files in `film/assets/audio/` so the track can be swapped.
   Measure the delivered file (integrated loudness, true peak, audio/video duration match, a handful of click onsets against cues, ffprobe of both streams) and send me the full report, including the music analysis and how clean each extension join measured, which you have not sent yet. Say plainly what was measured and what nobody has heard.

### 2026-11-06 15:49 UTC

`film/renders/final.mp4` exists (60 fps, 194.5 s, written 16:44, video stream only) with `final.cues.json` / `final.edl.json` beside it, and no delivered file has appeared yet. The user opened the silent picture and reported the film has no music. Build the sound for it now and write the deliverables as instructed (`videos/kleber-content-ai-walkthrough-v2.mp4` with your mix, and the `.srt`).

Two additions so this cannot happen again:
1. After muxing, prove the delivered file has sound: ffprobe must show an audio stream of the full duration, and the measured loudness must be in range across the start, the middle and the end (not just integrated). Put those numbers in your report.
2. Make the silent picture impossible to mistake for the film: rename or re-label it (for example `final.picture-only.mp4`, keeping your cue-file matching working), and make your build print the delivered path as its last line. Tell the editor about the naming so the next render follows it: a new full render is coming later today after app fixes and a re-record, and the same one command must produce the delivered file with sound from it.

Reply to me with the delivered path and the measurements as soon as it is done.

### 2026-11-06 18:11 UTC

New request from the owner: a second version of the film with a voiceover (ElevenLabs, female narrator) and no captions, alongside the captioned version, which must stay exactly as delivered (I ran your build on the retake picture; it delivered cleanly: 192.0 s, -16.1 LUFS, TP -1.9 dBTP).

Prepare the sound build for it now, in code only:
- A voiceover option, for example `node sound/build-sound.mjs --video renders/final-vo.picture-only.mp4 --voiceover voiceover/vo-track.wav --out <path>`. The voice track will be a film-length 48 kHz WAV, silent except where lines sit at their film times, made by another agent (`voiceover`), with `voiceover/placement.json` listing each line's film start and end.
- Mix for this version: the voice is the lead. Duck the music under each line with smooth attack and release (music roughly 10-12 dB below the voice while it speaks, returning between lines without pumping; use placement.json to drive the ducking rather than a level detector if that is cleaner), keep the music at its normal level in the gaps and under the title and end card where no one is speaking. Reduce the click sounds further or drop the ones that fall under speech; keep the transition whooshes and the riser but never louder than the voice. Light clean-up on the voice only if measurement calls for it (high-pass, gentle levelling between lines); no effects.
- Targets: programme about -16 LUFS integrated, true peak at or below -1 dBTP, voice lines consistent within about 1.5 LU of each other, speech clearly intelligible over the bed (report the voice-to-music level difference during speech).
- Delivery for this version: `~/Documents/Work/Projects/kleber-content-ai/videos/kleber-content-ai-walkthrough-v2-voiceover.mp4` (video stream copied from the captionless picture, AAC audio, faststart) and the voiceover's `.srt` beside it as `…-v2-voiceover.srt`. Same closing line convention: `delivered: <path>` or `NOT DELIVERED`. The default command for the captioned version must keep producing exactly what it does now.

The captionless picture is being rendered by the editor (`renders/final-vo.picture-only.mp4`, same 192.0 s timing) and the voice track will come from the voiceover agent; each will message you when ready. When both exist, build, measure, and report to me, saying plainly what was measured and that nobody has heard it.

### 2026-11-06 18:45 UTC

The owner asked for two picture fixes (settings scene re-recorded and re-framed; static holds trimmed), so both films are being rebuilt with new timing and a new total length. The editor will run the captioned build itself on the new `renders/final.picture-only.mp4`. For the voiceover film, wait for the `voiceover` agent's message that the re-placed `voiceover/vo-track.wav` matches the new `renders/final-vo.picture-only.mp4`, then run the voiceover build, measure as before, and report to me. The end-card wipe stays on a bar; other scene changes may now leave the grid.

Also do the whoosh fix now, for both versions (the captioned audio is being rebuilt anyway): where a whoosh would end up under the music because of peak headroom, dip the music about 2-3 dB for about 0.3 s under it so the whoosh is audible but still soft. Report the measured whoosh-to-music difference at each transition after the change.
