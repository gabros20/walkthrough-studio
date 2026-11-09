# Writing the captions

*Mode: how-to. The caption rules are in [LOOK.md](LOOK.md) (Captions); the storyboard fields in
[STORYBOARD.md](STORYBOARD.md) (captions, `claims`, `intent`). The design note is
[DESIGN-batch-2.md](DESIGN-batch-2.md) §6.*

The draft storyboard leaves a `"TODO: <label>"` caption before every click. Turning those into real
captions is split in two: **the tool prepares and checks, an agent writes the words.**
`film/scripts/draft-captions.mjs` makes no model call. It gathers what the agent needs per caption,
then checks and writes the agent's answers.

```
draft-storyboard.mjs  ->  draft-captions.mjs brief  ->  agent fills captions.answers.json
                      ->  draft-captions.mjs apply  ->  build.mjs --dry --audit
```

## Steps

1. **Draft and refine the cut first.** Captions anchor to events, and their windows come from the
   cut, so cut ranges, time-lapses and exits before writing copy:
   `node $KIT/film/scripts/draft-storyboard.mjs takes/<take> … --out storyboard.json`. Drop the
   placeholders you will not use now (most clicks need no caption). Optional: give each scene an
   `"intent"`, one line saying what it shows (`"intent": "Send a post and see it saved"`). The brief
   passes it to the agent. Without it the agent only gets the scene id and the take.

2. **Brief.** `node $KIT/film/scripts/draft-captions.mjs brief storyboard.json --takes <takes>`
   (`walkthrough captions brief`). It runs `build.mjs --dry --dry-out <tmp>` and maps every anchor
   through the `edl.json` that build writes, so its times are the film's own. Beside the storyboard
   it writes:
   - `captions.brief.md`: one section per `TODO:` caption (`--all`: every caption).
   - `captions.brief.json`: the same data, for tools.
   - `captions.answers.json`: a blank answer per caption. It is written only when the file does not
     exist yet, so a half-filled one is never overwritten.

   Each section gives:
   - the scene and its intent
   - the caption's current text and hold
   - the anchoring event, and the click it belongs to
   - the marks logged within 3 s of the anchor or while the caption could be on screen, with their
     logged text
   - typed text nearby
   - the next two events
   - the window: from the caption's start to the next caption, or to 0.1 s before the scene's cut
   - the **most words** the window holds under the hold rule (0.5 s + 0.3 s a word, at most 10)
   - a **claim candidate**: the nearest marked text on screen in the window, with a phrase to quote

   `--voice` adds a voice window per scene: the scene's film seconds, and how many words fit at 2.6
   words a second (`--wps`). Use it for narration lines in the voiceover script. Narration is not
   written to the storyboard.

3. **The agent writes the words** (Sonnet-tier is enough; for a short film, do it yourself). Give it
   `captions.brief.md`, `docs/LOOK.md` (Captions) and these rules:
   - One line, at most 10 words, and at most the window's `max words`.
   - **Honesty: a caption says what is visibly true in the take at that moment, or it is cut.** No
     outcome the frame does not show, no adjective it cannot prove, and every number comes from the
     recording. If nothing true and useful fits, drop the caption.
   - UI text goes in double quotes (straight `"…"` or curly `“…”`), copied exactly from a mark's
     logged text: the claim candidate, or another mark listed in the section. The phrase can be part
     of the text ("Saved" out of "Saved 2 min ago").
   - Speak to what the viewer sees, in the product's words. Vary the openings.

   It fills `captions.answers.json`:

   ```json
   {
     "a:0": { "text": "Status reads “Saved”", "claims": null },
     "a:2": { "drop": true },
     "b:0": { "text": "", "claims": null }
   }
   ```

   | Key / value | Meaning |
   |---|---|
   | `"<scene id>:<index>"` | The caption at that index in the scene's `captions` list, counted from 0 in the storyboard as briefed. |
   | `"text"` | The caption. An empty string leaves the caption as it is (skipped, reported). A bare string value is the same as `{ "text": … }`. |
   | `"claims"` | `null` (or absent): apply finds the mark itself when the text quotes something. `"mark:<label>"` (or any event ref with logged text): check the quotes against that event only. |
   | `{ "drop": true }` | Remove the caption. |
   | `"<scene>:voice"` | Narration: reported, not written. |

4. **Apply.** `node $KIT/film/scripts/draft-captions.mjs apply captions.answers.json storyboard.json --takes <takes>`
   (`walkthrough captions apply`). Before writing anything it checks every answer:
   - A quoted phrase must appear in a mark's logged text. Matching ignores case, runs of spaces and
     curly against straight apostrophes, and `…` matches `...`. Without `claims`, apply picks the
     mark of the scene's take that holds every quoted phrase and is nearest the anchor, and sets
     `"claims": "mark:<label>"`. A phrase no mark holds is an error. A caption that quotes nothing
     loses any old `claims`. A note warns when the claimed mark was logged outside the caption's
     window.
   - An answer over 10 words, or over its window's `max words` (counted after the drops), is refused.
     `--force` writes it anyway.
   - A text still starting with `TODO:` is an error, and so is an unknown key.

   With any error or refusal, apply writes nothing and exits 1. Otherwise it writes the storyboard
   (or `--out`) and keeps the file it replaces as `<file>.bak`. Where a numeric `hold` is shorter than
   the hold rule asks for the new text (2.5 s at least for the film's last line), it raises the hold
   as far as the window allows and says so. Then it runs the caption lint (`lib/captions.mjs`
   `lintCaptions`) on the whole film, places captions the way the build does, and lists the `TODO:`
   placeholders still left. Lint problems are printed, not fatal: the build reports the same ones as
   warnings.

5. **Check.** `node $KIT/film/build.mjs storyboard.json --takes <takes> --dry --audit`. The audit
   checks the claims again (an error when a quoted phrase is not in the claimed mark's text) and lints
   the captions. Fix and repeat until it has no errors. Then look at the frames: the audit checks the
   words, not the picture.

## Worked example (the golden-test fixture)

`test/fixtures/brightpost-mini/` has two scenes over an 8 s trim of the sample take; its
`mark:status line` logged the text `Saved`. It has no `TODO:` captions, so `--all` briefs both. On
a copy of the fixture (`cp -R test/fixtures/brightpost-mini /tmp/mini && cd /tmp/mini`):

```
$ node $KIT/film/scripts/draft-captions.mjs brief --all
wrote captions.brief.md, captions.brief.json, captions.answers.json
brief: 2 caption(s)
```

The section for `a:0` in `captions.brief.md`:

```markdown
## a:0

- scene: a (take sample-mini) (no `intent` in the storyboard)
- now: "It says “Saved”" (3 words, holds 1.40 s, claims mark:status line)
- anchor: mark:status line (source 2.25 s, film 4.10 s); nearest click (within 1 s): "send"
- marks (within 3 s of the anchor, or on screen in the window):
  - `mark:status line` film 4.12 (in the window): "Saved"
- next: move "option 2" (cut out of the film), then down "option 2" (cut out of the film)
- window: 4.10-5.60 s (1.50 s, until 0.1 s before the cut out of a): **max 3 words**
- claim candidate: `mark:status line`, quote "Saved"

answer: 
claims: mark:status line (only if the answer quotes it)
```

The window is 1.5 s, so 3 words at most. The status line shows "Saved" inside it. The answer file:

```json
{
  "a:0": { "text": "Status reads “Saved”", "claims": null },
  "b:0": { "text": "", "claims": null }
}
```

```
$ node $KIT/film/scripts/draft-captions.mjs apply captions.answers.json
a:0  "Status reads “Saved”" (3 words, window 1.50 s)  claims mark:status line
skipped (empty answer): b:0
caption lint:
  b:0: holds 1.50 s, needs 2.50 s
wrote storyboard.json (previous version: storyboard.json.bak)
captions: applied 1, dropped 0, skipped 1

$ node $KIT/film/build.mjs storyboard.json --dry --audit
…
audit: 0 error(s), 1 warning(s) …
```

The lint line is the fixture's own: `b:0` is the film's last line and holds 1.5 s, under the 2.5 s
the last line wants, because its scene ends 1.7 s after it starts.

What the checks catch, on the same fixture:

```
$ … apply e1.json            # { "a:0": { "text": "Status reads “Sent”" } }
error: a:0: "Sent" matches no mark's logged text in take sample-mini (quote UI text exactly as a mark logged it, or drop the quotes)
nothing written to storyboard.json

$ … apply e2.json            # { "a:0": { "text": "The status line under the box reads “Saved”" } }
refused: a:0: 8 words, its window (1.50 s, until 0.1 s before the cut out of a) holds 3: "The status line under the box reads “Saved”" (--force writes it anyway)
nothing written to storyboard.json
```

An answer of 11 words is refused the same way (`11 words, the limit is 10`), whatever its window.

## From the CLI

`walkthrough captions brief [storyboard.json] [--all] [--voice]` and
`walkthrough captions apply [captions.answers.json] [storyboard.json] [--force]` run the same script
in the project with its takes folder. Each prints the `node …` line it runs. They record
`state.captions` (`briefAt`, `appliedAt`, `count` briefed, `applied`).

## Notes

- Keys are indexes into each scene's `captions` list as briefed. Re-run `brief` after you add, move
  or drop captions by hand.
- The window is a ceiling, not a target. A caption that fills its whole window often leaves dead air
  before the cut. The audit reports that ("dead air").
- With a voiceover, captions still feed the `.srt` and the captioned twin. Size holds for the slower
  of reading and speech (skill `build-film`).
