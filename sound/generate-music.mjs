#!/usr/bin/env node
// One music take from the ElevenLabs music API, with an API key (no connector needed).
//
//   node sound/generate-music.mjs --prompt-file music.prompt.txt --seconds 197
//        [--out music-take1.mp3] [--model music_v2_5] [--instrumental] [--format mp3_48000_192]
//        [--cost sound-build/cost.jsonl] [--force]
//
// POST https://api.elevenlabs.io/v1/music with { prompt, music_length_ms, model_id, force_instrumental }
// (key from ELEVENLABS_API_KEY, never printed). --seconds is the film length + 2 s; 3-600 s. The
// model defaults to music_v2_5 (music_v1, the API's own default, is deprecated); --format is the
// output_format query (default: the API's "auto", an MP3). The prompt describes genre, tempo,
// instruments and the energy curve, never artist names (docs/ELEVENLABS.md, Rules).
// Each call charges credits, so an existing --out is never overwritten (--force to replace it; better,
// keep it and write music-take2.mp3). The file is checked with ffprobe and its real length printed:
// the model may return less than asked, which the sound build makes up with bar-aligned loops
// (sound/README.md); do not regenerate for length. A cost row { at, kind: "music", units: <seconds
// asked>, note } is appended to --cost (default: sound-build/cost.jsonl in the output's folder,
// normally the project).
// Without a key: prints the connector steps instead and exits 2. ELEVENLABS_MOCK=1: prints the
// request and saves a 1 s silent MP3, no network, no credits.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendCost, hasKey, mockMode, postAudio, saveAudio } from "../voiceover/lib/elevenlabs.mjs";

const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
if (!args.length || flag("help")) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(flag("help") ? 0 : 1);
}
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
const rel = (p) => { const r = relative(process.cwd(), p); return !r ? p : r.startsWith("..") ? p : r; };

const promptFile = opt("prompt-file") ?? die("--prompt-file <file> is required");
if (!existsSync(promptFile)) die(`no prompt file ${promptFile}`);
const prompt = readFileSync(promptFile, "utf8").trim();
if (!prompt) die("the prompt file is empty");
if (prompt.length > 4100) die(`the prompt is ${prompt.length} characters (the API takes at most 4100)`);
const seconds = +(opt("seconds") ?? die("--seconds <n> is required (film length + 2 s)"));
if (!(seconds >= 3 && seconds <= 600)) die("--seconds must be 3-600");
const out = resolve(opt("out", "music-take1.mp3"));
const model = opt("model", "music_v2_5");
const format = opt("format");
const instrumental = flag("instrumental");
const costFile = resolve(opt("cost") ?? join(dirname(out), "sound-build", "cost.jsonl"));
if (existsSync(out) && !flag("force")) die(`${rel(out)} exists and cost credits: keep it and pass --out music-take2.mp3 (or --force to replace it)`);

const body = { prompt, music_length_ms: Math.round(seconds * 1000), model_id: model, ...(instrumental ? { force_instrumental: true } : {}) };
if (!hasKey() && !mockMode()) {
  console.log(`No ELEVENLABS_API_KEY: generate the take with the ElevenLabs connector instead (docs/ELEVENLABS.md, Connector route).
  1. creative_create_flow, once per film; keep the flow_id.
  2. creative_get_flow_node_types: confirm a music model exists (the first film used eleven_music_v2_5).
  3. creative_add_flow_node with that model on the flow.
  4. creative_update_node with the prompt below and duration_seconds = ${seconds}
     (creative_get_model_schema for the exact parameter names).
  5. creative_run_flow_nodes, then poll creative_get_flow_run_status until all_completed.
  6. Download at once: curl -L -o ${rel(out)} "<result url>"
     then: ffprobe -v error -show_entries format=duration -of csv=p=0 ${rel(out)}
  Prompt (${prompt.length} characters):
${prompt.split("\n").map((l) => `    ${l}`).join("\n")}`);
  process.exit(2);
}
console.log(`music: ${seconds} s asked, model ${model}${instrumental ? ", instrumental" : ""}, prompt ${prompt.length} characters -> ${rel(out)}`);
let got;
try {
  const bytes = await postAudio("/v1/music", { output_format: format }, body, { kind: "music" });
  got = saveAudio(out, bytes);
} catch (e) { die(e.message); }
const row = appendCost(costFile, { kind: "music", units: seconds, note: `music ${seconds} s asked, ${got.toFixed(1)} s returned, model ${model}, ${rel(out)}${mockMode() ? " [mock]" : ""}`, ...(mockMode() ? { mock: true } : {}) });
console.log(`saved ${rel(out)}: ${got.toFixed(2)} s (asked ${seconds} s)`);
if (got < 30) console.log(`only ${got.toFixed(1)} s: too short to loop into a bed. Check the file (and the prompt) before anything else.`);
else if (got < seconds - 0.5) console.log(`short by ${(seconds - got).toFixed(1)} s: normal for this model. Do not regenerate; the sound build extends the bed by whole loops (sound/README.md, How the bed is fitted).`);
console.log(`cost row ${row.id} -> ${rel(costFile)}`);
console.log(`next: measure the grid (node sound/beat-grid.mjs ${rel(out)} --music ${rel(join(dirname(out), "music.json"))}), then fill music.json's sections (sound/README.md, Measuring a new track) and listen.`);
