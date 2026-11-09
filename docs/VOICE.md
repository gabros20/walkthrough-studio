# Voice: per-line voiceover, lexicon, languages, listening proxy

*Mode: how-to. Making and checking the voiceover version of a film with the scripted tools. `$KIT` is the kit, the project folder is the current directory. The one-take route and every placement rule are in [`voiceover/README.md`](../voiceover/README.md); the mix is in [`sound/README.md`](../sound/README.md); both generation routes (connector and API key) are in [`ELEVENLABS.md`](ELEVENLABS.md).*

The CLI wraps every step (`walkthrough vo …`, `walkthrough sound …`) and prints the command it runs; the commands below are those underlying commands, so either works.

## Picture first or voice first

- **Picture first** (the default, and how the example film was made): the picture is locked, every line gets a window on the film clock, and the words are written to fit the window. `make_script.py` checks the fit before any audio exists; `tts.mjs assemble` places each line at its window start.
- **Voice first** (tutorials, where the narration leads): write `script.json` lines without windows and the assembler places them one after another (`--start 0.5`, `--gap 0.6` s between clips), so the voice track's length follows the words. Give each line an `anchor` (the event it talks about, e.g. `"anchor": "click:send"` or `{ "ref": "mark:options", "offset": 0.2 }`) and a `scene`: `tts.mjs` copies both into `placement.json`, and `node $KIT/film/build.mjs --fit-audio voiceover/placement.json` then holds a rest moment wherever a line is longer than its picture, so the film makes room for the voice ([`STORYBOARD.md`](STORYBOARD.md), "Script-first timing"; `walkthrough build --fit-audio …` passes the flag through). After a fit, re-place the voice on the new cut (`fitcheck.py`, then `assemble --windows`).

## Two ways to generate the voice

| | One take (`place.py`) | Per line (`tts.mjs`) |
|---|---|---|
| Calls | One for the whole script | One per line |
| Changing one line | Regenerate everything, re-transcribe, re-place | Regenerates that line only (cache) |
| Evenness | One read: pace and level even by nature | Lines read separately; the sound build levels them toward their median (±4 dB) |
| Cutting | Transcript + silence detection | None: line boundaries are known |
| Best for | The first full read through the connector | Iterating, API key, languages |

Through the connector, per-line generation means one call per line, and each call makes two takes by default: use it when only a few lines change, or with an API key.

## Per-line generation with a cache

```
node $KIT/voiceover/tts.mjs render --script voiceover/script.json --voice <voice_id>
#   -> voiceover/lines/01.mp3 … 27.mp3, then vo-track.wav, placement.json, voiceover.srt
```

- **Voice id**: from `GET /v2/voices` or the connector's `creative_list_voices`; never guessed. Model `eleven_v4` unless `--model`.
- **The cache**: every answer is stored in `voiceover/cache/<hash>.mp3`, keyed by the voice, the model, the lexicon version, the output format and the exact text sent. Rewording a line, or a lexicon entry that changes it, regenerates that line and nothing else; the run prints `hit` or `miss` per line. The cache is safe to delete (it costs a regeneration). Mock runs never write here (below).
- **Cost**: characters actually sent are appended to `voiceover/cost.jsonl`; `walkthrough vo tts` folds the rows into `state.json` (shown by `walkthrough cost show`).
- **Without a key** the cache hits are still used; each miss gets `voiceover/lines/<nn>.txt` (the exact text to speak, lexicon applied) and the run prints the connector steps and the file names to save the audio as. Then `tts.mjs assemble --script voiceover/script.json` checks every file is there, caches the dropped-in files and assembles.
- **Testing without credits**: `ELEVENLABS_MOCK=1` prints each request (the key is never shown) and returns a tone as long as the line would take; `ELEVENLABS_MOCK=say` speaks the line with macOS `say`, so the listening proxy has real words to hear. A mock is safe in the project's own `voiceover/`: each run opens with a `MOCK … NOT REAL SPEECH` banner (and `assemble` repeats it over mock line files); the mock audio is keyed by the mock mode as well (and by the contents of `ELEVENLABS_MOCK_FILE` when one is given) and kept apart in `voiceover/cache-mock/`, so a real run never finds it; `lines/manifest.json` carries `"mock": "<mode>"`, so a real run after a mock treats those line files as stale rather than as dropped-in audio; and its cost rows carry `"mock": true`, which the CLI does not fold into `state.json` (nor older rows whose note ends in `[mock]`). The track, placement and subtitles a mock writes are the same as before the split; only the manifest's cache keys and its `mock` field differ.

**Assembly** measures each line file (speech found from its level), cuts it 40 ms before the speech and 80 ms after with short fades, and places it exactly as `place.py` would: speech onset 0.15 s after the window start, the lead-in given back when the line is short of 0.3 s slack, then moved earlier inside its scene; what still overruns is printed. Windows come from `windows.json` (written by `fitcheck.py` after the picture was re-timed) when it is in the voiceover folder or given with `--windows`, else from the script. The film length comes from `windows.json`, `--cues cues.json` or `--film <s>`. `placement.json` has the same fields as `place.py`'s, so `sound/build-sound.mjs --voiceover voiceover/vo-track.wav` mixes it unchanged.

## Pronunciation lexicon

`voiceover/lexicon.json` (template: `$KIT/voiceover/lexicon.example.json`):

```json
{ "version": 1, "entries": { "Brightpost": "Bright post", "SKU": "S K U" } }
```

- Applied to the text sent to text-to-speech only. Captions, `script.json`, `placement.json` and the `.srt` keep the real spelling.
- Whole words; each entry matched case-sensitively first, then in any case (`Brightpost`, `BRIGHTPOST`, `BrightPost` all become `Bright post`); dotted names (`brightpost.app`) are left alone unless they are an entry themselves.
- Editing an entry regenerates only the lines whose sent text changes. Bumping `version` regenerates every line.
- `node $KIT/voiceover/lexicon.mjs check voiceover/script.json` lists words worth a listen: mixed case (`BrightPost`), all capitals (`SKU`), digits with letters (`4K`), dotted names, and words capitalised mid-sentence (names). `lexicon.mjs show` prints every line the lexicon changes, before and after.
- A language twin uses `lexicon.<lang>.json` when it exists, else `lexicon.json`.

Example (one line of the Brightpost script, with `Brightpost` in it):

```
L05  before: Three Brightpost options, from the brand hub.
     sent:   Three Bright post options, from the brand hub.
```

## Languages (twins from the same picture lock)

The picture stays the same; only the words change. The full flow for German:

```
# 1. briefs: per line the English, what is on screen, its window, the most words and characters that fit
node $KIT/voiceover/translate-brief.mjs brief de --captions captions.srt
#    -> voiceover/script.de.brief.md, captions.de.brief.md, and blank *.de.answers.json
# 2. the translator (an agent) fills voiceover/script.de.answers.json and captions.de.answers.json
# 3. check and write the twins
node $KIT/voiceover/translate-brief.mjs apply de --captions captions.srt
#    -> voiceover/script.de.json, captions.de.srt (beside captions.srt, never in voiceover/: the sound build
#       takes the one .srt beside a voice track as its subtitles); exit 1 lists what does not fit or broke a claim
# 4. the German voice (a voice that speaks German; eleven_v4 is multilingual)
node $KIT/voiceover/tts.mjs render --lang de --script voiceover/script.de.json --voice <voice_id>
#    -> voiceover/de/lines/…, voiceover/de/vo-track.wav, placement.json, voiceover.srt
# 5. the captionless twin of the picture (once; shared by every language)
node $KIT/film/build.mjs --no-captions          # render it as renders/final-vo.mp4
# 6. the mix, with the German voice and the German voiceover subtitles
node $KIT/sound/build-sound.mjs --video renders/final-vo.mp4 --voiceover voiceover/de/vo-track.wav \
     --deliver out/my-film-de.mp4
# 7. a German captions-only version: the same captionless render, delivered with captions.de.srt
#    (it warns that the captionless picture has no voiceover; the German captions ride beside it)
node $KIT/sound/build-sound.mjs --video renders/final-vo.mp4 --srt captions.de.srt \
     --deliver out/my-film-de-captions.mp4
```

How the limits are set: a line may speak for its window minus 0.42 s (the clip's 0.12 s of edges and the 0.3 s of slack `fitcheck.py` requires). The estimate scales the English line's measured length (from `placement.json`) by the larger of the translated/English word and character ratios, so an unchanged line fits exactly when it fitted in English; lines without a measurement use the English take's pace (2.6 words a second by default). Captions stay one line: at most 10 words, 60 characters, and the words their hold allows (0.5 s + 0.3 s a word).

Claims are checked on apply: UI text in double quotes stays verbatim in English (the app on screen is in English) unless `--ui-translated`; numbers written as digits stay; lexicon names stay. Count words (`three`, `eighteen`, `once`) are listed in the brief for the translator.

After rendering the twin, `assemble` prints the real slack per line; a line that overruns is shortened in the answers and applied again (only that line is regenerated).

## Listening proxy (measured, not heard)

```
node $KIT/voiceover/listen-check.mjs out/my-film-voiceover.mp4 --script voiceover/script.json \
     --vo voiceover/vo-track.wav
#   -> out/listen-check.json (+ listen-check.words.json, the transcript) and a table
```

- **Words**: the mix is transcribed with `npx --yes hyperframes@0.9.16 transcribe` and the whole script is aligned to what was heard by word sequence (whisper's word times drift by up to a second, so lines are not matched by time alone). Per line: word error rate, script words not heard, heard words not in the script. A twin is transcribed in its language with the multilingual whisper model.
- **Voice over music**, per line over its speech: with a mix and `--vo`, the voice in the mix is the voice stem times its best-fit gain and the rest is everything else; with `--vo` and `--bed` (the stems before mixing; the bed unducked) the stems are compared as given. K-weighted, as the sound build measures. Under 8 dB is flagged.
- **Clipping**: the file's peak (ffmpeg `astats`) and every run of samples at or over -0.1 dBFS, with its time.
- Exit 2 when anything is found (missing or wrong words, a low ratio, clipping, or no transcription available), 0 when nothing is.

What it does not do: it cannot tell a mispronounced brand name that the transcriber still spelled right, a harsh sibilant, a breath at an edge, music pumping, or a line over the wrong picture. Someone still listens (`voiceover/README.md`, Listening checks).

What was verified when it was built (9 November 2026): on a two-line film made with `ELEVENLABS_MOCK=say` over a synthetic chord bed, the transcript matched both lines (WER 0); a script with two words changed reported exactly those two as not heard and the spoken ones as heard instead; the ratio measured in the mix (WAV and AAC) agreed with the stems plus the mix gains to within 0.1 dB; a 0.2 s burst was reported as one clipping run at its time; with no transcriber on the PATH the report said so and still measured the rest.
