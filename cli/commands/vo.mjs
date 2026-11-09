// walkthrough vo <tts|assemble|lexicon|translate|listen-check|fitcheck|place|script> …: thin wrappers
// over the voiceover/ tools. Each prints the command it runs ("›") and runs it in the project folder
// (or the current one when there is no project); paths given on the command line are made absolute
// first. After a run, cost rows the tools appended to voiceover/cost.jsonl are folded into
// state.json costs[] (once each, by id; ELEVENLABS_MOCK rows, marked "mock": true, never are) and the
// step is recorded in state.voiceover[].
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { CliError, kitPath } from "../lib/project.mjs";
import { addCost, now } from "../lib/state.mjs";

const usage = `walkthrough vo <step> [args]   (the voiceover tools; docs/VOICE.md, voiceover/README.md)

  tts --voice <id> [--script voiceover/script.json] [--model eleven_v4] [--lang de] [--lexicon f] [--no-assemble]
        node voiceover/tts.mjs render: one TTS request per line, cached by text; then assemble.
        Without ELEVENLABS_API_KEY it lists the lines to generate with the connector (exit 2).
  assemble [--script …] [--windows windows.json] [--cues cues.json] [--film <s>] [--lang de] [--dry]
        node voiceover/tts.mjs assemble: the line files -> vo-track.wav, placement.json, voiceover.srt
  lexicon check|show [script.json] [--lexicon f]
        node voiceover/lexicon.mjs: words TTS may get wrong / what the lexicon changes
  translate brief|apply <lang> [--script …] [--captions captions.srt] [--windows …] [--ui-translated]
        node voiceover/translate-brief.mjs: translation briefs, then script.<lang>.json + captions.<lang>.srt
  listen-check <mix.mp4|vo-track.wav> [--vo voiceover/vo-track.wav] [--bed sound-build/bed.wav] [--script …]
        node voiceover/listen-check.mjs: transcript vs script, voice over music, clipping (measured, not heard)
  fitcheck --old-edl … --old-cues … --new-edl … --new-cues … [--out windows.json] [L21=s,e …]
        python3 -I voiceover/fitcheck.py --vo-dir voiceover …: re-timed picture vs placed lines
  place <take.mp3> <words.json> (--edl … --cues … | --windows …) [--name film] [--dry]
        python3 -I voiceover/place.py … --vo-dir voiceover: cut a one-take narration into placed lines
  script <lines.json> [--edl edl.json --cues cues.json]
        python3 -I voiceover/make_script.py … --out voiceover: script.json + script.txt, fit checked

The script defaults to voiceover/script.json and the voiceover folder to voiceover/ in the project.
Other flags pass through unchanged. Exit code: the tool's.`;

// flags whose value is a path (made absolute against the current directory before the tool runs)
const PATH_FLAGS = new Set(["--script", "--out", "--windows", "--cues", "--edl", "--lexicon", "--vo", "--bed", "--placement", "--transcript", "--captions", "--old-edl", "--old-cues", "--new-edl", "--new-cues", "--vo-dir"]);
function absolutize(argv) {
  return argv.map((a, i) => {
    if (i > 0 && PATH_FLAGS.has(argv[i - 1]) && !isAbsolute(a)) return resolve(a);
    if (!a.startsWith("-") && !isAbsolute(a) && !/=/.test(a) && existsSync(resolve(a))) return resolve(a); // positional files
    return a;
  });
}
const has = (argv, flag) => argv.includes(flag);

/**
 * Fold new rows of a tool's cost.jsonl into state.costs (dedup by id). Mock rows ("mock": true, or a
 * note ending in "[mock]" from before the flag existed) cost nothing and are skipped. Returns the number added.
 */
export function foldCosts(project, file, source) {
  if (!project || !existsSync(file)) return 0;
  const seen = new Set(project.state.costs.map((c) => c.id).filter(Boolean));
  let n = 0;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.id || seen.has(r.id)) continue;
    if (r.mock === true || /\[mock\]\s*$/.test(r.note ?? "")) continue;
    const row = addCost(project.state, { kind: r.kind, units: r.units, amount: r.amount ?? null, note: r.note ?? null, at: r.at });
    row.id = r.id; row.source = source;
    seen.add(r.id); n++;
  }
  return n;
}

export default {
  name: "vo",
  describe: "voiceover: per-line TTS, assemble, lexicon, translations, listening proxy, fit check, place",
  usage,
  async run(argv, ctx) {
    const [step, ...rest0] = argv;
    if (!step) { console.log(usage); return 2; }
    const project = ctx.project;
    const P = project?.dir ?? process.cwd();
    const kit = kitPath;
    const rest = absolutize(rest0);
    const vodir = join(P, "voiceover");
    const script = has(rest, "--script") ? [] : ["--script", join(vodir, "script.json")];
    let cmd = process.execPath, args;
    switch (step) {
      case "tts": args = [kit("voiceover/tts.mjs"), "render", ...script, ...(has(rest, "--out") ? [] : ["--out", vodir]), ...rest]; break;
      case "assemble": args = [kit("voiceover/tts.mjs"), "assemble", ...script, ...(has(rest, "--out") ? [] : ["--out", vodir]), ...rest]; break;
      case "lexicon": {
        const [sub = "check", ...r] = rest;
        const pos = r.find((a) => a.endsWith(".json") && !r[r.indexOf(a) - 1]?.startsWith("--"));
        args = [kit("voiceover/lexicon.mjs"), sub, ...(pos ? [] : [join(vodir, "script.json")]), ...r];
        break;
      }
      case "translate": args = [kit("voiceover/translate-brief.mjs"), ...rest.slice(0, 2), ...script, ...rest.slice(2)]; break;
      case "listen-check": args = [kit("voiceover/listen-check.mjs"), ...rest, ...script]; break;
      case "fitcheck": cmd = "python3"; args = ["-I", kit("voiceover/fitcheck.py"), ...(has(rest, "--vo-dir") ? [] : ["--vo-dir", vodir]), ...rest]; break;
      case "place": cmd = "python3"; args = ["-I", kit("voiceover/place.py"), ...rest, ...(has(rest, "--vo-dir") ? [] : ["--vo-dir", vodir])]; break;
      case "script": cmd = "python3"; args = ["-I", kit("voiceover/make_script.py"), ...rest, ...(has(rest, "--out") ? [] : ["--out", vodir])]; break;
      default: throw new CliError(`unknown vo step "${step}"\n\n${usage}`, 2);
    }
    const r = await ctx.exec(cmd, args, { cwd: P });
    if (project) {
      const outDir = rest[rest.indexOf("--out") + 1] && has(rest, "--out") ? rest[rest.indexOf("--out") + 1] : vodir;
      const added = foldCosts(project, join(outDir, "cost.jsonl"), "voiceover/cost.jsonl");
      if (added) ctx.log.info(`${added} cost row(s) from voiceover/cost.jsonl added to state.json`);
      const lang = has(rest, "--lang") ? rest[rest.indexOf("--lang") + 1] : step === "translate" ? rest[1] : undefined;
      project.state.voiceover.push({ at: now(), step: step === "translate" ? `translate ${rest[0]}` : step === "lexicon" ? `lexicon ${rest[0] ?? "check"}` : step, ...(lang ? { lang } : {}), exit: r.code });
      project.save();
    }
    return r.code;
  },
};
