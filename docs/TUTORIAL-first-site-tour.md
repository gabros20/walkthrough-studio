# Tutorial: your first site tour

*Mode: tutorial. You finish with a 60-second captioned tour of a public website, with music, made by hand
with the kit's commands in site mode. For the full agent-run job, ask Claude Code for a walkthrough film and
the `walkthrough-film` skill takes over; this page teaches you what it does.*

You will: describe a few scenes as data, record them with an invisible mouse, draft a storyboard from the
recording, write the captions, build and render the film, and add a music bed. No studio, no adapter code.

**What was run while writing this page** (2026-11-09). Steps 1-3 against a public URL. Steps 4-5 against the
same URL, where the take failed on a heading name that had been guessed instead of read from step 3 (hence
step 3), and against the kit's local test site (`recorder/site-test/`, same runner, `--auto`), where it
passed. Steps 6-9 on that test-site take, through to a rendered film. Step 10 only with a synthetic test tone,
which the delivery guard refused (`NOT DELIVERED`, true peak), as it should for that signal. **Not run here:**
the sign-in sidebar, and step 10 with real music.

**The `walkthrough` command beside each step.** Every by-hand step below is followed by a **CLI** line: the
`walkthrough` command that does the same ([`CLI.md`](CLI.md)), prints the by-hand command it runs and records
the step in `$P/state.json`. Use either. Of those lines, `walkthrough init`, `walkthrough doctor` and
`walkthrough build --dry --audit` were run (2026-11-09, on a scratch project made from the kit's test fixture);
the others are marked *(not run here)*.

## Before you start

- The kit is installed and `npm run setup` has run in it (see the [README](../README.md#install)).
- `KIT` is the kit's folder. Pick a project folder outside the kit and a site you are allowed to record:

  ```bash
  export KIT=~/walkthrough-studio
  export P=~/films/my-site-tour
  ```

  **CLI:** `walkthrough doctor` checks the machine (node, ffmpeg, Python, HyperFrames, Chromium, disk) and, inside
  a project, its config and base URL (`walkthrough` = `node $KIT/bin/walkthrough.mjs`).

- Do not record a site in a way that creates orders, payments, messages to real people or public posts; use a
  test account if it needs one.

## 1. Make the project folder

Start from the working site-mode template:

```bash
mkdir -p $P
cp $KIT/recorder/site-test/walkthrough.config.mjs $KIT/recorder/site-test/scenes.json $P/
```

**CLI:** `walkthrough init $P --url https://www.example.org` writes a site-mode config and a one-scene
`scenes.json` (plus the film files of step 6 and `state.json`) instead of copying the template.

## 2. Point the config at the site

Replace `$P/walkthrough.config.mjs` with your site's values. The template's `finish` (a fast encode) and
`gate` (a loosened gap limit) lines are for the kit's self-test; leave them out so takes get the default CRF 12
master and the 100 ms gap gate.

```js
export default {
  name: "my-site-tour",
  baseUrl: "https://www.example.org",   // the site, no trailing slash
  viewport: "desktop",                  // 1440x810 at 2x; "phone" for 390x844 at 3x
  takesDir: "./takes",                  // relative to this file: $P/takes
  scenes: "./scenes.json",
  blockUrls: [],                        // e.g. ["**/googletagmanager.com/**"]: analytics, chat widgets
  dismiss: [],                          // e.g. [{ "role": "button", "name": "Accept all" }]: cookie banners
};
```

Every other key has a default; the full list is in [`recorder/README.md`](../recorder/README.md#walkthroughconfigmjs).

## 3. Look at the pages before writing scenes

Open each page you want to show at the take's viewport. Nothing is recorded:

```bash
node $KIT/recorder/tools/inspect.mjs --config $P/walkthrough.config.mjs --path / --out $P/inspect
node $KIT/recorder/tools/inspect.mjs --config $P/walkthrough.config.mjs --path /pricing --out $P/inspect
```

**CLI:** there is no `walkthrough` command for `inspect.mjs`; `walkthrough explore /` maps the reachable pages
into `tour-map.md`, thumbnails and a `scenes.draft.json` *(not run here)*.

Each run prints the interactive elements in view with their boxes and names, for example
`a [679,743 82x19] "Learn more"`, and saves a screenshot in `$P/inspect/`. Open the screenshot. Write your
targets from what was printed and what you see, not from memory: a heading or link text you assume will make
the take fail with `locator.waitFor: Timeout`.

## 4. Write three scenes

A 60-second film here is an 8 s title card, about 45 s of site in three scenes, and a 7 s end card. Each
scene becomes one take. Replace `$P/scenes.json` with your own, in this shape:

```json
{ "scenes": [
  {
    "name": "take-1-home",
    "start": "/",
    "steps": [
      { "hold": 1.0 },
      { "mark": { "role": "heading", "name": "<the page's main heading>" }, "label": "headline" },
      { "hover": { "role": "link", "name": "<a link>" }, "label": "nav link", "hold": 0.8 },
      { "click": { "role": "link", "name": "<a link>" }, "label": "open pricing" },
      { "wait": "quiet", "label": "pricing page" },
      { "mark": { "role": "heading", "name": "<the next page's heading>" }, "label": "pricing headline" },
      { "hold": 1.5 },
      { "park": true, "label": "pricing park" }
    ]
  },
  { "name": "take-2-…", "start": "/pricing", "steps": [ … ] },
  { "name": "take-3-…", "start": "/…", "steps": [ … ] }
] }
```

- `start` is opened off camera before the take. Every step that the film may point at needs a `label`,
  unique per step type within the take.
- `mark` the elements your captions will talk about: the recorder logs their box and visible text, and the
  film's audit checks quoted caption text against it.
- `wait: "quiet"` waits for no network requests and no DOM changes. A page with a carousel or a ticking clock
  never goes quiet: use `{ "wait": { "visible": <target> } }` instead.
- Leave at least 0.5 s before an action and 1.2 s after a visible result.

All step types and target forms: [`recorder/README.md`](../recorder/README.md#site-mode-scenes-as-steps).

> [!NOTE]
> **If the site needs a sign-in** (not run here): save a signed-in state once. A visible browser opens, you
> sign in by hand with the test account, and the state is saved when the URL contains the `--until` text.
>
> ```bash
> node $KIT/recorder/tools/save-login.mjs --url https://www.example.org/login --until /dashboard \
>      --out $P/login.storage.json
> ```
>
> Add `storageState: "./login.storage.json"` to the config (or pass `--storage` in step 5). The file is a
> credential: keep it out of git and never print it.

## 5. Record the takes

Close anything heavy (renders, encodes, other browsers): a busy machine causes frame gaps.

```bash
node $KIT/recorder/takes/run.mjs --config $P/walkthrough.config.mjs --auto
```

**CLI:** `walkthrough take --auto` (from `$P`; records each take in `state.json`) *(not run here)*.

The runner opens one browser session and records the scenes in order. For each take it prints a line such
as `take 1: ok=true sync=true gapOut=49.27ms -> …/takes/take-1-home` and writes `$P/takes/<take>/`
(`master.mp4`, `events.json`, `take.json`, `verify/sheet.jpg`). Open each `verify/sheet.jpg` and check the
pages look right: no cookie banner, no half-loaded images.

`--auto` stops at the first take that fails. Read why in `$P/takes/_runner/status-<n>.json` (`error`, `sync`,
`gaps`), fix the scene, and record just that scene again by its number:

```bash
node $KIT/recorder/takes/run.mjs --config $P/walkthrough.config.mjs 2 --auto
```

**CLI:** `walkthrough take 2 --auto` *(not run here)*.

A take that fails only on a capture gap is usually the machine being busy; record it again on a quiet machine
rather than loosening the gate.

## 6. Make a film project and draft the storyboard

```bash
node $KIT/film/scripts/init-project.mjs $P
node $KIT/film/scripts/draft-storyboard.mjs $P/takes/take-1-home $P/takes/take-2-… $P/takes/take-3-… \
     --out $P/storyboard.json
```

**CLI:** `walkthrough init $P --force` (keeps your config, scenes and takes; never overwrites a file), then
`walkthrough draft` (every take with an `events.json`, in name order; `storyboard.json` when there is none).
`init` was run here; `draft` *(not run here)*.

`init-project.mjs` adds the HyperFrames project files, a neutral `brand.json` and `storyboard.example.json`
to `$P` without touching your config or takes. The draft has one scene per take, a camera framing and a
`"TODO: <label>"` caption before every click, and the marks as spotlight candidates. It prints the draft's
length (`about 27 s` for one 12 s take plus the two cards).

## 7. Write the copy and check it

Edit `$P/storyboard.json`:

- Replace every `"TODO: …"` caption with a line of at most 10 words that is true on screen at that moment.
  Delete most of them: one caption every few seconds reads better than one per click. Keep a caption's
  `hold` at least 0.5 s + 0.3 s per word, and the last one at least 2.5 s.
- Add `"fps": 60` at the top (the capture is 60 fps) and the title lines:
  `"title": { "duration": 8, "lines": ["<line 1>", "<line 2>"] }`. The end card takes `"lines"` the same way.
- Set the brand in `$P/brand.json`: `name`, `colors.accent`, `font.family`, and `lockup.logo` if you have the
  site owner's logo files ([`film/README.md`](../film/README.md#brand)).

Then check it without writing any files:

```bash
cd $P
node $KIT/film/build.mjs --dry --audit
```

**CLI:** `walkthrough build --dry --audit` (run here: it printed the durations and audit tables and
`build recorded: dry, aspect 16:9, captions on, audit 0 error(s) 1 warning(s), exit 0`).

You get a durations table (title, each scene, end, the total against the target range) and an audit table.
Fix every `error` (for example `caption 1: overlaps caption 0`: delete one or move it) and read every
`warn`. Repeat until it reports `0 error(s)`. `python3 $KIT/film/scripts/list-events.py $P/takes/<take>`
lists the labels you can anchor to; the storyboard format is in [`docs/STORYBOARD.md`](STORYBOARD.md).

## 8. Add the title-card images

The title wall and the end cascade show real images from the recording. A site tour has no generated
outputs, so cut stills of the toured pages from the takes:

```bash
mkdir -p $P/stills
for t in 2 6 10 14; do ffmpeg -v error -ss $t -i $P/takes/take-1-home/master.mp4 -frames:v 1 $P/stills/home-$t.png; done
```

Do the same for the other takes (eight or more stills is best; fewer repeat), list them in
`$P/creatives.json`:

```json
{ "sourceDir": "stills", "items": [
  { "id": "home-2", "source": "home-2.png" },
  { "id": "home-6", "source": "home-6.png" }
] }
```

and copy them, with the logo, into the project:

```bash
node $KIT/film/scripts/sync-assets.mjs
```

**CLI:** `walkthrough build` runs `sync-assets.mjs` itself before a real build when `creatives.json` lists
images that are not synced yet *(not run here)*.

It prints `synced <n> creatives` (and `the lockup is text only` when `brand.json` names no logo).

## 9. Build and render

```bash
node $KIT/film/build.mjs --audit
npx --yes hyperframes@0.9.16 check --json
npx --yes hyperframes@0.9.16 render -o renders/final.mp4 --fps 60
for f in cues.json edl.json; do cp $f renders/final.$f; done; cp captions.srt renders/final.captions.srt
```

**CLI:** `walkthrough build --audit`, then `walkthrough render --name final` (checks free disk, rebuilds first
when the build is stale, renders at 60 fps and copies the three sidecars); `check` has no CLI command *(not run here)*.

The build cuts one clip per scene and writes the compositions, `cues.json`, `edl.json` and `captions.srt`.
`check` must report `"ok": true`. The render of a 27 s test film took 39 s here. The copies beside the
render keep its cues and captions with it, so a later rebuild cannot desync it. Watch `renders/final.mp4`: it
is the picture only, with no sound.

## 10. Add music and deliver

You need one music track with a steady tempo, a repeating groove and a real ending, a little longer than the
film is fine: generate it once ([`docs/ELEVENLABS.md`](ELEVENLABS.md)) or use a track you have a licence for.
Put it in `$P`, copy `$KIT/sound/music.example.json` to `$P/music.json`, and fill in its tempo, sections and
splice window from measurements ([`sound/README.md`](../sound/README.md#measuring-a-new-track-analysis)).
Then:

```bash
node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/my-site-tour.mp4
```

**CLI:** `walkthrough sound build --video renders/final.mp4 --deliver out/my-site-tour.mp4` *(not run here)*.

The build renames the silent render to `renders/final.picture-only.mp4`, fits the bed, adds clicks and
whooshes, mixes to −16 LUFS, muxes, measures the result and copies the captions beside it as
`out/my-site-tour.srt`. Its last line is either `delivered: <path>` (exit 0): the film is done, or
`NOT DELIVERED (checks failed): <path>` (exit 2) with the reason above it: the file exists but must not be
sent. To run it again after a failure, pass the renamed render:

```bash
node $KIT/sound/build-sound.mjs --video renders/final.picture-only.mp4 --deliver out/my-site-tour.mp4
```

**CLI:** `walkthrough sound build --video renders/final.picture-only.mp4 --deliver out/my-site-tour.mp4` *(not run here)*.

Listen to the result on headphones and on laptop speakers before you send it: the numbers say the sound is
there and in range, not that it sounds right.

## 11. Clean up

A tour leaves work files behind: raw screencast frames, the HyperFrames frame cache, draft renders, review
contact sheets. `walkthrough take` and `walkthrough render` already remove their own (raw frames of ok takes,
the frame cache after a successful render). For the rest, see what is left and how much it really costs:

```bash
walkthrough clean --dry
```

The table lists each item with its logical size (what Finder shows) and its size on disk, whether it goes or
stays, and why. Your takes' masters, the latest render of each name, `out/` and anything that cost money
(`voiceover/cache/`) stay. Once you are happy with the film:

```bash
walkthrough clean --yes          # what the table said
walkthrough clean --all --yes    # after the film is accepted: the raw/ folders and capture tests too
```

Nothing outside the project folder (and its buffer folder, if you set one) is ever touched.

## Where to go next

- A voiceover version of the same picture: skill `voiceover`, [`voiceover/README.md`](../voiceover/README.md).
- Camera framings, spotlights, time-lapses and scene exits: [`docs/STORYBOARD.md`](STORYBOARD.md) and
  [`docs/LOOK.md`](LOOK.md).
- A delivery package with clips and stills: [`docs/DELIVERY.md`](DELIVERY.md).
- Why it works this way: [`docs/adr/`](adr/).
