// walkthrough sound <music|build|beat-grid> …: thin wrappers over the sound/ tools. Each prints the
// command it runs ("›") and runs it in the project folder; paths given on the command line are made
// absolute first. music folds the cost row it appends (sound-build/cost.jsonl) into state.json;
// build applies the disk policy and records { at, video, voiceover, deliver, result, exit } in
// state.sound[].
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { diskPolicy, GB, withCaffeinate } from "../lib/disk.mjs";
import { CliError, kitPath, requireProject } from "../lib/project.mjs";
import { now, rel } from "../lib/state.mjs";
import { foldCosts } from "./vo.mjs";

const usage = `walkthrough sound <step> [args]   (sound/README.md, docs/ELEVENLABS.md)

  music --prompt-file music.prompt.txt [--seconds N] [--out music-take1.mp3] [--model music_v2_5] [--instrumental]
        node sound/generate-music.mjs: one take from the ElevenLabs music API (ELEVENLABS_API_KEY);
        --seconds defaults to the last render's length + 2 s. Never overwrites a take (it cost credits).
        Without a key it prints the connector steps (exit 2).
  build [--video renders/<name>.mp4] [--voiceover voiceover/vo-track.wav] [--deliver out/<film>.mp4] [build-sound flags]
        node sound/build-sound.mjs --project <project> …: the bed, effects, (voiceover mix), mux and checks.
        --video defaults to the last recorded render (state.renders). Disk policy first (1 GB, or
        --min-free <GB>): on a short disk the work files go to the buffer (--work). macOS: caffeinate -i.
  beat-grid [music.mp3] [--bpm 96] [--groove 10,110] [--dry]
        node sound/beat-grid.mjs: tempo and beat phase into music.json (the file defaults to music.json's "file")

Other flags pass through unchanged. Exit code: the tool's.`;

const PATH_FLAGS = new Set(["--prompt-file", "--out", "--video", "--voiceover", "--deliver", "--srt", "--music", "--music-file", "--sfx", "--work", "--cues", "--edl", "--placement", "--cost"]);
function absolutize(argv) {
  return argv.map((a, i) => {
    if (i > 0 && PATH_FLAGS.has(argv[i - 1]) && !isAbsolute(a)) return resolve(a);
    if (!a.startsWith("-") && !isAbsolute(a) && existsSync(resolve(a))) return resolve(a);
    return a;
  });
}
const has = (argv, flag) => argv.includes(flag);
const val = (argv, flag) => (has(argv, flag) ? argv[argv.indexOf(flag) + 1] : undefined);

export default {
  name: "sound",
  describe: "sound: generate a music take (API key), build the soundtrack and deliver, measure the beat grid",
  usage,
  async run(argv, ctx) {
    const [step, ...rest0] = argv;
    if (!step) { console.log(usage); return 2; }
    const project = ctx.project;
    const P = project?.dir ?? process.cwd();
    const kit = kitPath;
    let rest = absolutize(rest0);
    const lastRender = project?.state.renders?.at(-1);

    if (step === "music") {
      const extra = [];
      if (!has(rest, "--seconds")) {
        if (!lastRender?.duration) throw new CliError("--seconds is required (no render recorded to take the length from)", 2);
        const s = Math.ceil(lastRender.duration + 2);
        ctx.log.info(`--seconds ${s}: the last render (${lastRender.name ?? lastRender.file}, ${lastRender.duration} s) + 2 s`);
        extra.push("--seconds", String(s));
      }
      if (!has(rest, "--out")) extra.push("--out", join(P, "music-take1.mp3"));
      if (!has(rest, "--cost")) extra.push("--cost", join(P, "sound-build", "cost.jsonl"));
      const r = await ctx.exec(process.execPath, [kit("sound/generate-music.mjs"), ...rest, ...extra], { cwd: P });
      if (project) {
        const n = foldCosts(project, val([...rest, ...extra], "--cost"), "sound-build/cost.jsonl");
        if (n) ctx.log.info(`${n} cost row(s) from sound-build/cost.jsonl added to state.json`);
        project.state.sound.push({ at: now(), step: "music", out: rel(P, val([...rest, ...extra], "--out")), exit: r.code });
        project.save();
      }
      return r.code;
    }

    if (step === "beat-grid") {
      const pos = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--")));
      let file = [];
      if (!pos.length) {
        const mj = join(P, "music.json");
        const f = existsSync(mj) ? JSON.parse(readFileSync(mj, "utf8")).file : null;
        if (!f) throw new CliError("name the music file (or put music.json with a \"file\" in the project)", 2);
        file = [resolve(P, f)];
      }
      const flags = [...(has(rest, "--music") ? [] : ["--music", join(P, "music.json")]), ...(has(rest, "--work") ? [] : ["--work", join(P, "sound-build", "analysis")])];
      const r = await ctx.exec(process.execPath, [kit("sound/beat-grid.mjs"), ...file, ...rest, ...flags], { cwd: P });
      if (project) { project.state.sound.push({ at: now(), step: "beat-grid", exit: r.code }); project.save(); }
      return r.code;
    }

    if (step === "build") {
      requireProject(ctx);
      const extra = ["--project", P];
      if (!has(rest, "--video") && !has(rest, "--bed-only")) {
        if (!lastRender?.file) throw new CliError("--video <render> is required (no render recorded in state.json)", 2);
        const v = isAbsolute(lastRender.file) ? lastRender.file : join(P, lastRender.file);
        ctx.log.info(`--video ${rel(P, v)}: the last recorded render`);
        extra.push("--video", v);
      }
      const minFree = val(rest, "--min-free");
      if (minFree) rest = rest.filter((a, i) => a !== "--min-free" && rest[i - 1] !== "--min-free");
      const plan = diskPolicy(ctx, { step: "sound", needBytes: (minFree ? Number(minFree) : 1) * GB });
      if (plan.action === "spill" && !has(rest, "--work")) extra.push("--work", join(plan.workDir, "sound-build"));
      const w = withCaffeinate(process.execPath, [kit("sound/build-sound.mjs"), ...extra, ...rest]);
      const r = await ctx.exec(w.cmd, w.args, { cwd: P });
      const last = r.stdout.trim().split("\n").filter((l) => /^(delivered: |NOT DELIVERED|no video given)/.test(l)).at(-1) ?? null;
      project.state.sound.push({
        at: now(), step: "build", video: val([...extra, ...rest], "--video") && rel(P, val([...extra, ...rest], "--video")),
        voiceover: val(rest, "--voiceover") ? rel(P, val(rest, "--voiceover")) : null, deliver: val(rest, "--deliver") ? rel(P, val(rest, "--deliver")) : null,
        result: last, spill: plan.action === "spill" ? plan.workDir : null, exit: r.code,
      });
      if (val(rest, "--deliver") && /^delivered: /.test(last ?? "")) project.state.deliveries.push({ at: now(), file: rel(P, val(rest, "--deliver")), by: "sound build", voiceover: has(rest, "--voiceover") });
      project.save();
      return r.code;
    }
    throw new CliError(`unknown sound step "${step}"\n\n${usage}`, 2);
  },
};
