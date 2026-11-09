# Kleber Content AI walkthrough: what the final cut did

The film this toolkit was extracted from: a 3:02 product walkthrough of Kleber Content AI (a tyre
dealer turns one sentence into a ready-to-post campaign), delivered in two versions, captioned and
voiceover. These files are the data it was built from. The footage, renders, audio, creatives and
logos are the client's and are not in this repo.

| File | What it is |
|---|---|
| `storyboard.json` | The final storyboard: 13 stage scenes over 9 takes, 10 story groups. Copied as built, except `takesDir` made relative and `brand` / `fps` added. |
| `brand.json` | The Kleber brand as the film used it (ink, paper, Kleber red `#FD000D`, Roboto, the 16° button slant, the 20° wipe, the header lockup with the real logo files by path). |
| `creatives.json` | The 19 real outputs used on the title wall, the end cascade and the slanted columns, with crops. |
| `captions.srt` | The 23 captions as delivered. |
| `music.json` | The measured facts about the music take (96 BPM, 4-bar loop Am / C/G / Dm / F), with the evidence. |
| `beat-grid.json` | The film-time bar grid of the delivered bed: splices, final chord, every transition's nearest bar. |
| `voiceover/` | `script.txt` and `script.json` (27 lines, written for the first 192 s cut), `placement.json` and `voiceover.srt` (placed on the final 182 s cut). |

To rebuild the picture you need the takes (`--takes <studio>/takes`), the client's logo
(`KLEBER_REPO=<kleber-content-ai checkout>`) and the creatives (`creatives.json` `sourceDir`):

```
cd film
KLEBER_REPO=… node scripts/sync-assets.mjs --brand ../examples/kleber-content-ai/brand.json
node build.mjs ../examples/kleber-content-ai/storyboard.json --takes <studio>/takes --dry
```

When this repo was made, that build reproduced the delivered film's 13 scene compositions, the
captions track, `index.html`, `cues.json` and `edl.json` byte for byte (title and end card differ
only in the synced logo's file name), and `sound/build-sound.mjs` reproduced the delivered beat grid,
joins, effect levels and loudness exactly.

## The cut

- **3:02.0** (182.000 s), **60 fps** film over **60 fps** masters (`clipFps` 60; captured at 1440x810
  CSS px, 2x). Title 0-7 s, 13 scenes 7-175 s, end card 175-182 s.
- Scenes (film seconds): s1 7.00-16.15 set up · s2 16.15-40.33 ask · s3a 40.33-51.92 and s3b
  51.92-59.48 choose · s4 59.48-75.62 refine · s5 75.62-93.75 expand (the format tour) · s6a
  93.75-101.83 and s6b 101.83-114.02 translate · s7 114.02-125.32 teach · s8 125.32-149.57 profile
  · s9a 149.57-158.35 and s9b 158.35-168.12 proof · s10 168.12-175.00 export.
- Agent waits as labelled time-lapses (the `wait` range sugar: 1-1.8 s of loaders at normal speed,
  then the rest compressed). Three still moments held longer with `stretch` ranges instead (in s1,
  s7 and s8; in s7 the 0.8 s "Noting that for next time…" status line plays over 2 s), untagged,
  pointer at rest.
- Capture stalls from the take index excised automatically; single blank preview frames held.
- 23 captions, 65 cues (clicks and transitions), 6 spotlights.
- Pointer continuity at hard cuts between takes: `enterFrom` on three scenes, an `exit` on one,
  pushes and whips where the story had a natural break.

## The music grid

- **96 BPM: bars every 2.5 s, beats every 0.625 s** from film 0. The bed starts one bar into the
  take (offset 2.5 s), so the groove enters at 7.5 s, just after the 7 s title.
- **Longer than the take**: the 135.7 s take was stretched to the 182 s film with +6 loops: at
  film 97.5 s the bed jumps from source 100 s back to 40 s. The short outro (120 -> 125 s) puts the
  final chord at film 177.5 s, exactly on the end card's wipe cut (`end.wipeStart` 2.05: cut at
  175 + 2.05 + 0.45 = 177.5, one bar after the end card starts).
- The end card (175 s) and its wipe cut (177.5 s) sit on bars. Earlier drafts also landed s2, s3b and
  s4 on bars by adjusting holds; after the static holds were trimmed the other scene changes are
  0.3-1.25 s off a bar (`beat-grid.json` `transitions` lists each one's `moveBy`).
- **The format tour (s5) is cut on beats**: one `montage` range, one slice per format, each exactly
  one beat long on the film clock (37 or 38 frames at 60 fps), the first slice landing on a beat line.
- Sound: -16.0 LUFS integrated, true peak -2.0 dBTP on the delivered file; 42 clicks and 5 whooshes
  (title wipe, two pushes, two whips) landing within a frame of their cues, the riser cresting on the
  final chord.

## The voiceover version

- The same picture with the captions track left out (`--no-captions`), checked as a twin of the
  captioned render.
- 27 lines, 234 words, written against the first (192 s) cut with the 2.4 words/s + 0.35 s rule;
  one take of the whole script from ElevenLabs (`eleven_v4`, voice "Emily E.", warm British female,
  100.9 s), never regenerated.
- When the picture was trimmed to 182 s (static holds over about a second cut, the settings scene
  re-recorded), the windows were remapped and fit-checked on dry runs before the one render, then
  the same take was re-placed: voice on 92.0 s, 50.5% of the film.
- Mixed with the voice 3 dB over the music's normal level and the music ducked 11 dB under each line.

## Known flaws (as handed over)

- **2:37-2:40**: on the second campaign's option 1, the dealer logo sits over lettering in the
  campaign artwork (about 3 s, both versions). An app rendering issue caught on film, not a film
  edit.
- **The settings scene's preview card is cut off**: at wide framing the brand-kit preview card's
  bottom 70 px lie below the capture (the page was taller than 810 px there), so the card's foot is
  never seen.
- **Pointer jumps at hard cuts** (listed in the handover). `film/scripts/audit.mjs` now measures
  them on the delivered edl: six cuts had the pointer 339-1080 px apart and all six are treated (two
  pushes, two whips, two `enterFrom`); the other hard cuts measure 0 px, because the recorder chains
  the pointer from take to take. Watch the treated ones: an `enterFrom` slide is visible by design.
  The format tour's 18 beat slices also jump (441-923 px), as montage cuts do.
- The audit also flags two dead-air spots: after "Every image is checked before you see it" (s2,
  1.3 s of nothing logged before the cut at 40.33 s) and after "Tell it a rule once" (s7, 1.4 s
  before 124.63 s). UI that changes without a logged event (images landing) does not count, so look
  before trimming.
- Nobody listened to the audio before delivery (the numbers were all measured, none heard); the
  commercial licence of the generated music was an open check for the owner.
