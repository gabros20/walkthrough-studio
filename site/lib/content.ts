// Every value here is quoted from the kit's repo (README.md, docs/, examples/brightpost/).

export const REPO = "https://github.com/gabros20/walkthrough-studio";
export const blob = (p: string) => `${REPO}/blob/main/${p}`;
export const tree = (p: string) => `${REPO}/tree/main/${p}`;

/** The delivered Brightpost film's cut, from examples/brightpost/README-film-notes.md ("The cut"). */
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
  { row: "Parallel takes", studio: "refused: one database, one app state", site: "--parallel N: one browser and one take folder per take" },
];

/** First steps of recorder/site-test/scenes.json, verbatim. */
export const SCENES_SNIPPET = `{
  "scenes": [
    {
      "name": "take-1-search",
      "start": "/site.html",
      "steps": [
        { "hold": 0.6 },
        { "mark": { "role": "heading", "name": "Find a bike for this spring" }, "label": "headline" },
        { "type": "ridgeline", "into": { "placeholder": "Search bikes" }, "label": "query" },
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

/**
 * docs/PIPELINE.md in order, with the batch-2 stages (docs/CHANGELOG.md Unreleased): `cli` is the
 * `walkthrough` command that runs the stage (docs/CLI.md); `emits` are files and reports it writes.
 */
export const STAGES: { dir: string; cli?: string; does: string; emits: string[] }[] = [
  {
    dir: "bin/walkthrough.mjs",
    cli: "walkthrough init · doctor",
    does: "One project folder per film, outside the kit. The CLI scaffolds it, checks the machine, and records every take, build, render, review and cost in a state file only it writes.",
    emits: ["state.json", "doctor.json"],
  },
  {
    dir: "studio/",
    cli: "walkthrough studio",
    does: "Studio mode: an APFS clone of your app with its own database, separate ports, a production build and checkpoints. Site mode skips it.",
    emits: ["CP0 … CPn"],
  },
  {
    dir: "recorder/tools/explore.mjs",
    cli: "walkthrough explore",
    does: "The tour map: a same-site crawl that never clicks, types or submits. Per page the controls from the accessibility tree and a thumbnail; one drafted scene per page to edit into scenes.json.",
    emits: ["tour-map.json", "scenes.draft.json"],
  },
  {
    dir: "recorder/",
    cli: "walkthrough take",
    does: "Playwright drives the app at 1440×810 @2x (or a 390×844 phone @3x), 60 fps, with an invisible mouse on arcs. No cursor in the footage. Three green sync flashes at each end put every logged action on the master clock.",
    emits: ["master.mp4", "events.json", "take.json"],
  },
  {
    dir: "film/scripts/draft-storyboard.mjs",
    cli: "walkthrough draft",
    does: "Drafts the edit from the log: clicks become camera framings and caption placeholders, long waits become time-lapses. The editor refines it.",
    emits: ["storyboard.json"],
  },
  {
    dir: "film/scripts/draft-captions.mjs",
    cli: "walkthrough captions brief | apply",
    does: "The tool prepares and checks; an agent writes the words. The brief gives each caption its intent, marks, window and word budget; apply writes the answers in, sets claims and runs the caption lint.",
    emits: ["captions.brief.md", "captions.answers.json"],
  },
  {
    dir: "film/build.mjs",
    cli: "walkthrough build",
    does: "Builds the HyperFrames compositions at 16:9, 9:16 or 1:1: drawn pointer, camera from logged element boxes, captions anchored to events, title and end card. A pointer that would jump at a cut is bridged or faded.",
    emits: ["edl.json pointerTreatments", "cues.json", "captions.srt"],
  },
  {
    dir: "film/build.mjs --audit",
    cli: "walkthrough audit",
    does: "Checks the cut before every review and before picture lock, and lists every pointer bridge and fade the build applied. Errors exit 1.",
    emits: ["holds", "jumps", "dead air", "claims"],
  },
  {
    dir: "film/scripts/review-bundle.mjs",
    cli: "walkthrough review",
    does: "One folder per render: a contact sheet per scene, strips around every cut, the audit, holds, audio and costs, REVIEW.md, and a static page where every finding seeks the video and takes a note.",
    emits: ["review/<name>/index.html", "REVIEW.md"],
  },
  {
    dir: "sound/build-sound.mjs",
    cli: "walkthrough sound build",
    does: "After picture lock: music bed fitted by bar-aligned loops, clicks and whooshes on the cues, −16 LUFS, ducking under a voiceover.",
    emits: ["delivered: <path>"],
  },
  {
    dir: "voiceover/",
    cli: "walkthrough vo",
    does: "Script fitted to the EDL windows, one TTS request per line from a cache (reword one line, regenerate one line), placed on the captionless twin; language twins from translation briefs.",
    emits: ["placement.json", "vo-track.wav"],
  },
  {
    dir: "delivery/",
    cli: "walkthrough deliver",
    does: "Presets from the same renders: sales (the full package), web (encodes, poster, VTT, YouTube chapters), social (per-feature clips of at most 60 s, captions burned in, vertical from a 9:16 render), docs (10–30 s clips, an .srt and a GIF each).",
    emits: ["MANIFEST.txt", "verify.py"],
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

/** docs/MODELS.md "The matrix" (read 2026-11-09): the same three tiers on each agent. */
export const MODEL_PLATFORMS = ["Claude Code", "Codex", "Antigravity", "Cursor", "Hermes"] as const;

export const MODEL_TIERS: { tier: string; models: string[] }[] = [
  {
    tier: "Large",
    models: ["Opus 5.5", "gpt-6.1-sol · high", "Gemini 4 Argon · High", "Opus 5.5 / GPT-5.6 Sol", "any provider: Opus 5.5"],
  },
  {
    tier: "Medium",
    models: ["Sonnet 5.5", "gpt-6.1-terra · medium", "Gemini 3.8 Flash · Medium", "Sonnet 5.5 / GPT-5.6 Terra", "model_map: Sonnet 5.5"],
  },
  {
    tier: "Small",
    models: ["Haiku 5.5", "gpt-6-luna · high", "Gemini 3.8 Flash · Low", "Haiku 5.5 / GPT-5.6 Luna", "model_map: Haiku 5.5"],
  },
];

export const MODELS_DOC = blob("docs/MODELS.md");

/** docs/ROADMAP.md "Next": the items still open or partly, in that list's order. */
export const ROADMAP_OPEN: { what: string; why: string; status: string }[] = [
  {
    what: "A guided “record the login” command",
    why: "Saved logins, consent dismissal and URL blocking are in; a command that walks the owner through the sign-in and checks the saved state is not.",
    status: "open",
  },
  {
    what: "Time-lapse auto-detection",
    why: "Any wait longer than N s in kept footage becomes a labelled time-lapse unless the storyboard says otherwise.",
    status: "open",
  },
  {
    what: "Themes",
    why: "Colours, font and lockup are in brand.json; named light and dark themes and lockup variants are open.",
    status: "partly",
  },
  {
    what: "Music fallbacks",
    why: "The API-key route and the beat grid are in; a local library folder, the HeyGen catalog and nudging holds onto bars are open.",
    status: "partly",
  },
  {
    what: "Hosting the review page",
    why: "The static page ships in every review bundle; publishing it (HyperFrames publish or an artifact page) so a stakeholder can comment is open.",
    status: "partly",
  },
  {
    what: "Parallel takes on their own ports",
    why: "Site mode records independent takes in parallel; each take with its own server and checkpoint, so studio mode can too, is open.",
    status: "partly",
  },
];

/** The 0.1.0 roadmap's "Suggested order": everything on it was folded in by 0.2.0 (docs/CHANGELOG.md). */
export const ROADMAP_ORDER: { what: string; status: string }[] = [
  { what: "doctor + one CLI", status: "folded in" },
  { what: "Tour map", status: "folded in" },
  { what: "Caption drafting + pointer bridging + golden test", status: "folded in" },
  { what: "Per-line VO cache + listening proxy", status: "folded in" },
  { what: "Aspect presets + package presets", status: "folded in" },
];

/** README "Quick start for a new app", verbatim: the tools without the CLI. */
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

/**
 * One install route per platform, from docs/INSTALL-RESEARCH.md ("One-liner" per section and the
 * compatibility matrix). `code` is what the block shows: lines starting with "#" are muted labels.
 * `copy` is what the Copy button puts on the clipboard. In `note`, `backticks` render as code chips.
 */
export type InstallRoute = { id: string; tab: string; title: string; code: string; copy: string; note: string };

export const INSTALL_ROUTES: InstallRoute[] = [
  {
    id: "claude-code",
    tab: "Claude Code",
    title: "install the plugin",
    code: `# install from the marketplace
claude plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio
# or for one session
claude --plugin-dir ./walkthrough-studio`,
    copy: "claude plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio",
    note: "Skills and the 9 agents, namespaced `walkthrough-studio:*`.",
  },
  {
    id: "skills-sh",
    tab: "Any agent (skills.sh)",
    title: "install the skills",
    code: "npx skills add gabros20/walkthrough-studio",
    copy: "npx skills add gabros20/walkthrough-studio",
    note: "Skills only (`SKILL.md`), into `.agents/skills`; works for Codex, Cursor, Antigravity, Hermes, Gemini CLI. Clone the repo for the recorder and film tooling.",
  },
  {
    id: "codex",
    tab: "Codex",
    title: "marketplace, then plugin",
    code: "codex plugin marketplace add gabros20/walkthrough-studio && codex plugin add walkthrough-studio@walkthrough-studio",
    copy: "codex plugin marketplace add gabros20/walkthrough-studio && codex plugin add walkthrough-studio@walkthrough-studio",
    note: "Reads the same `.claude-plugin/marketplace.json`; skills only, no agents.",
  },
  {
    id: "cursor",
    tab: "Cursor",
    title: "install into Cursor",
    code: "npx skills add gabros20/walkthrough-studio -a cursor",
    copy: "npx skills add gabros20/walkthrough-studio -a cursor",
    note: "Agents: copy `agents/*.md` to `~/.cursor/agents`.",
  },
  {
    id: "antigravity",
    tab: "Antigravity",
    title: "install into Antigravity",
    code: "npx skills add gabros20/walkthrough-studio -a antigravity",
    copy: "npx skills add gabros20/walkthrough-studio -a antigravity",
    note: "Skills only, into `.agents/skills`; invoke one with `/<skill-name>`.",
  },
  {
    id: "hermes",
    tab: "Hermes",
    title: "install into Hermes, global",
    code: "npx skills add gabros20/walkthrough-studio -a hermes-agent -g",
    copy: "npx skills add gabros20/walkthrough-studio -a hermes-agent -g",
    note: "Native: `hermes skills install gabros20/walkthrough-studio/skills/<skill>`, one skill at a time.",
  },
];

export const INSTALL_DOC = blob("docs/INSTALL.md");

/**
 * One film from the CLI (docs/CLI.md "Running it" and the usage of each command). Lines starting
 * with "#" are muted labels. The setup lines are the README's clone + `npm run setup` and CLI.md's
 * WALKTHROUGH_STUDIO_HOME + alias.
 */
export const CLI_COMMANDS = `# once: the kit, the recorder's Chromium, the CLI on your path
cd ~ && git clone https://github.com/gabros20/walkthrough-studio
npm --prefix ~/walkthrough-studio run setup
export WALKTHROUGH_STUDIO_HOME=~/walkthrough-studio
alias walkthrough='node "$WALKTHROUGH_STUDIO_HOME/bin/walkthrough.mjs"'
# a project folder for the film, then check the machine
walkthrough init my-tour --mode site --url https://example.com
cd my-tour
walkthrough doctor
# map the site, then edit scenes.draft.json into scenes.json
walkthrough explore
# record every scene, then draft the cut from the takes
walkthrough take --auto
walkthrough draft
# the tool briefs, an agent fills captions.answers.json, apply checks it
walkthrough captions brief
walkthrough captions apply
# check the cut, render it, build the review bundle
walkthrough build --dry --audit
walkthrough render
walkthrough review
# picture lock, one music take, its beat grid, the mix
walkthrough state lock
walkthrough sound music --prompt-file music.prompt.txt
walkthrough sound beat-grid music-take1.mp3
walkthrough sound build --deliver out/my-tour.mp4
# the web package: 1080p30 + 720p, poster, .srt + .vtt, YouTube chapters
walkthrough deliver --preset web --video out/my-tour.mp4`;

/** recorder/README.md "Tour map" and the usage of `walkthrough explore`. */
export const EXPLORE_SNIPPET = `walkthrough explore https://example.com --depth 2 --max-pages 20
# tour-map.json      per page: landmarks, h1-h3, up to 80 controls
# tour-map.md        the same, one controls table per page
# thumbs/<n>.jpg     480 px wide thumbnails
# scenes.draft.json  a scene per page; destructive ones under _skipped`;
