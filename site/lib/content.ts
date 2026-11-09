// Every value here is quoted from the kit's repo (README.md, docs/, examples/kleber-content-ai/).

export const REPO = "https://github.com/gabros20/walkthrough-studio";
export const blob = (p: string) => `${REPO}/blob/main/${p}`;
export const tree = (p: string) => `${REPO}/tree/main/${p}`;

/** The delivered Kleber film's cut, from examples/kleber-content-ai/README-film-notes.md ("The cut"). */
export const EDL: { id: string; label: string; from: number; to: number; card?: boolean }[] = [
  { id: "title", label: "title card", from: 0, to: 7, card: true },
  { id: "s1", label: "set up", from: 7, to: 16.15 },
  { id: "s2", label: "ask", from: 16.15, to: 40.33 },
  { id: "s3", label: "choose", from: 40.33, to: 59.48 },
  { id: "s4", label: "refine", from: 59.48, to: 75.62 },
  { id: "s5", label: "expand", from: 75.62, to: 93.75 },
  { id: "s6", label: "translate", from: 93.75, to: 114.02 },
  { id: "s7", label: "teach", from: 114.02, to: 125.32 },
  { id: "s8", label: "profile", from: 125.32, to: 149.57 },
  { id: "s9", label: "proof", from: 149.57, to: 168.12 },
  { id: "s10", label: "export", from: 168.12, to: 175 },
  { id: "end", label: "end card", from: 175, to: 182, card: true },
];
export const FILM_LENGTH = 182;

export const tc = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(r % 1 ? 2 : 0)}`;
};

/** README "Two modes, two voices". */
export const MODES: { row: string; studio: string; site: string }[] = [
  { row: "For", studio: "an app whose code you own and run locally", site: "any URL: production, staging, docs, a third-party site" },
  { row: "Instance", studio: "APFS clone + own data, separate ports, production build, checkpoints", site: "none" },
  { row: "Login", studio: "demo account, one-time link, checkpoint CP0", site: "test account logged in once, saved storageState" },
  { row: "Clean frame", studio: "production build, no dev badges", site: "consent/cookie banners dismissed from a list" },
  { row: "Waiting", studio: "app-specific turn detection in an adapter", site: "generic waitQuiet (network idle + no DOM changes)" },
  { row: "Bad take", studio: "restore the checkpoint, redo", site: "idempotent scenes, or reset by hand" },
];

/** First steps of recorder/site-test/scenes.json, verbatim. */
export const SCENES_SNIPPET = `{
  "scenes": [
    {
      "name": "take-1-search",
      "start": "/site.html",
      "steps": [
        { "hold": 0.6 },
        { "mark": { "role": "heading", "name": "Find a tyre for this winter" }, "label": "headline" },
        { "type": "winter", "into": { "placeholder": "Search tyres" }, "label": "query" },
        { "click": { "role": "button", "name": "Search" }, "label": "search" },
        { "wait": { "quiet": { "ms": 600, "timeout": 15000 } }, "label": "results" },
        { "mark": { "role": "list", "name": "Results" }, "label": "results list" },
        { "click": { "text": "Result 6:" }, "label": "result 6" },
        …
      ]
    }
  ]
}`;

/** recorder/site-test/walkthrough.config.mjs, the keys that make site mode work. */
export const CONFIG_SNIPPET = `export default {
  name: "site-test",
  baseUrl: "http://127.0.0.1:8930",
  viewport: "desktop", // or "phone"
  scenes: "./scenes.json",
  blockUrls: ["**/analytics/**"],
  dismiss: ["#accept"],
  safeArea: { top: 0, bottom: 120, on: ["click", "mark"] },
};`;

export const LOGIN_SNIPPET = `node recorder/tools/save-login.mjs \\
  --url https://app.example.com/login --until /dashboard \\
  --out <project>/login.storage.json
node recorder/takes/run.mjs --config walkthrough.config.mjs \\
  --storage <project>/login.storage.json`;

/** docs/PIPELINE.md, in order. */
export const STAGES: { dir: string; does: string; emits: string[] }[] = [
  {
    dir: "studio/",
    does: "Studio mode: an APFS clone of your app with its own database, separate ports, a production build and checkpoints. Site mode skips it.",
    emits: ["CP0 … CPn"],
  },
  {
    dir: "recorder/",
    does: "Playwright drives the app at 1440×810 @2x, 60 fps, with an invisible mouse on arcs. No cursor in the footage. Three green sync flashes at each end put every logged action on the master clock.",
    emits: ["master.mp4", "events.json", "take.json"],
  },
  {
    dir: "film/scripts/draft-storyboard.mjs",
    does: "Drafts the edit from the log: clicks become camera framings and caption placeholders, long waits become time-lapses. The editor refines it.",
    emits: ["storyboard.json"],
  },
  {
    dir: "film/build.mjs",
    does: "Builds the HyperFrames compositions: drawn pointer, camera from logged element boxes, captions anchored to events, title and end card.",
    emits: ["edl.json", "cues.json", "captions.srt"],
  },
  {
    dir: "film/build.mjs --audit",
    does: "Checks the cut before every review and before picture lock. Errors exit 1.",
    emits: ["holds", "jumps", "dead air", "claims"],
  },
  {
    dir: "sound/build-sound.mjs",
    does: "After picture lock: music bed fitted by bar-aligned loops, clicks and whooshes on the cues, −16 LUFS, ducking under a voiceover.",
    emits: ["delivered: <path>"],
  },
  {
    dir: "voiceover/",
    does: "Script fitted to the EDL windows, one TTS take, transcribed and placed line by line on the captionless twin.",
    emits: ["placement.json", "vo-track.wav"],
  },
  {
    dir: "delivery/",
    does: "Masters and web encodes, per-feature clips, cropped stills, showcase sheets, README in md/html/pdf, a verify run, a zip.",
    emits: ["the package"],
  },
];

/** README "Skills and agents". */
export const SKILLS: { name: string; use: string }[] = [
  { name: "walkthrough-film", use: "run the whole job as the lead: steps, gates, which agent and model for what, guardrails" },
  { name: "record-takes", use: "studio, capture test, adapter, rehearsals, takes with checkpoints, INDEX.md" },
  { name: "build-film", use: "storyboard, build, drafts, pointer treatments, holds audit, picture lock, captionless twin" },
  { name: "review-film", use: "Haiku describers + Opus critic + rulings loop, contact sheets, holds" },
  { name: "film-sound", use: "one music generation, bed extension, effects, mix, verified delivery" },
  { name: "voiceover", use: "script fitted to windows, one TTS take, placement, re-timing fit checks" },
  { name: "deliver-package", use: "the package: films, clips, stills, showcase, copy, README, verify, zip" },
];

export const TIERS: { model: string; why: string; agents: { name: string; role: string }[] }[] = [
  {
    model: "Opus",
    why: "complex code and client-facing text",
    agents: [
      { name: "take-operator", role: "recorder, capture test, takes, retakes, INDEX.md" },
      { name: "film-editor", role: "components, storyboard, cuts, renders" },
      { name: "film-critic", role: "independent review; verifies the describers" },
      { name: "app-fixer", role: "fixes app issues the film exposed, verifies on camera, commits" },
      { name: "sound-designer", role: "bed, effects, mix and the delivered: check" },
      { name: "voiceover-producer", role: "narration script and placement" },
    ],
  },
  {
    model: "Sonnet",
    why: "mechanical, self-checking work",
    agents: [
      { name: "studio-builder", role: "studio instance, re-sync and rebuild" },
      { name: "delivery-packager", role: "the delivery package (Sonnet for media, Opus for copy)" },
    ],
  },
  {
    model: "Haiku",
    why: "“what is on screen at 1:03?”",
    agents: [{ name: "frame-describer", role: "factual frame read-back, run 3 in parallel on disjoint ranges" }],
  },
];

/** docs/ROADMAP.md "Suggested order". */
export const ROADMAP = [
  { what: "doctor + one CLI", why: "removes most setup friction for a new project", status: "open" },
  { what: "Declarative scenes + tour map", why: "makes “any website” real without writing JS", status: "scenes in · tour map open" },
  { what: "Caption drafting + pointer bridging + golden test", why: "finishes the editing-cost work", status: "open" },
  { what: "Per-line VO cache + listening proxy", why: "makes the voiceover twin cheap to iterate", status: "open" },
  { what: "Aspect presets + package presets", why: "new outputs from the same takes", status: "partly: 16:9 only today" },
];

/** README "Quick start for a new app", verbatim. */
export const BUILD_COMMANDS = `node $KIT/film/scripts/init-project.mjs $P
node $KIT/film/scripts/draft-storyboard.mjs $T/<take> [$T/<take> ...] --out $P/storyboard.json
cd $P
node $KIT/film/build.mjs --takes $T --dry --audit
node $KIT/film/scripts/sync-assets.mjs            # after editing brand.json / adding creatives.json
node $KIT/film/build.mjs --takes $T --audit
npx --yes hyperframes@0.9.16 check --json
npx --yes hyperframes@0.9.16 render -o renders/final.mp4 --fps 60
for f in cues.json edl.json; do cp $f renders/final.$f; done; cp captions.srt renders/final.captions.srt
node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/<film>.mp4`;

export const INSTALL = `claude --plugin-dir /path/to/walkthrough-studio`;
export const SETUP = `git clone https://github.com/gabros20/walkthrough-studio
cd walkthrough-studio
npm run setup                 # Playwright Chromium for the recorder
claude plugin validate .
claude --plugin-dir "$PWD"`;
