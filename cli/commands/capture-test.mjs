// walkthrough capture-test [mode scale phase seconds]: the recorder's capture-quality test.
import { kitPath, takesDirOf } from "../lib/project.mjs";

const usage = `walkthrough capture-test [mode] [scale] [phase] [seconds]

Runs node <kit>/recorder/capture-test.mjs <mode> <scale> <phase> [seconds] (default: new 2 idle 30) and
prints the verdict. Results go to <takes>/_capture-test/<mode>-<scale>x-<phase>/result.json, with
<takes> = the project's takes folder (WALKTHROUGH_TAKES), else the recorder's default.
  mode   new | shell | headed        scale  2 | 1.5        phase  idle | load | drift
Exit 1 when any pass flag (unique fps, longest gap, sync, frame size) is false. The pass table is in
docs/CAPTURE_TEST.md. Record on a quiet machine: no renders or encodes while it runs.`;

export default {
  name: "capture-test",
  describe: "the recorder's capture-quality test (default: new 2 idle 30)",
  usage,
  async run(argv, ctx) {
    const args = argv.length ? argv : ["new", "2", "idle", "30"];
    const env = ctx.project?.configFile ? { WALKTHROUGH_TAKES: await takesDirOf(ctx.project) } : {};
    const r = await ctx.exec(process.execPath, [kitPath("recorder/capture-test.mjs"), ...args], { env });
    if (r.code !== 0) return r.code;
    const line = r.stdout.trim().split("\n").reverse().find((l) => l.startsWith("{"));
    let c;
    try {
      c = JSON.parse(line);
    } catch {
      ctx.log.warn("no JSON result line from capture-test.mjs");
      return 1;
    }
    const flags = { uniquePass: c.uniquePass, gapPass: c.gapPass, syncPass: c.syncPass, frameSizePass: c.frameSizePass, redPass: c.redPass };
    const pass = c.uniquePass && c.gapPass && c.syncPass && c.frameSizePass;
    ctx.log.info(`\ncapture-test ${c.name}: ${pass ? "pass" : "FAIL"}: ${c.delivery.fps} fps delivered, ${c.uniquePerSecond.median} unique/s median (min ${c.uniquePerSecond.min}), longest gap ${c.longestGapMs} ms, drift ${c.sync.driftFrames} frames, ${c.frameSize}`);
    ctx.log.info(Object.entries(flags).map(([k, v]) => `${k}=${v}`).join(" "));
    return pass ? 0 : 1;
  },
};
