// Film-side helpers shared by the draft, build, audit and render commands.
//
//   ensureAssets(ctx, { brand, placeholders }) -> exit code   sync-assets / stand-in creatives before a real build
//   storyboardOf(project, given?) -> absolute storyboard path (given, else <project>/storyboard.json)
//   parseAuditLine(stdout) -> { errors, warnings } | null    the last "audit: N error(s), M warning(s)" line
//   buildInputs(project, { storyboard, takes, brand, aspect, fitAudio, fitGap, fitMax }) -> Promise<inputs>
//     what a build with these flags is made from, resolved the way film/lib/config.mjs and
//     film/build.mjs resolve it: { aspect, aspectFrom, brand: { file, hash } | null, takes,
//     fitAudio: { file, hash, gap, max } | null } (files relative to the project when inside it)
//   builtInputs(project) -> { aspect, fitAudio } of the build on disk, as far as it can be told:
//     the last full build in state.builds, else index.html's canvas and edl.json's fitAudio key
//   inputChanges(before, after) -> [ "aspect 16:9 -> 1:1 (--aspect)", ... ]   [] when nothing differs
//   runBuild(ctx, { storyboard, takes, brand, aspect, fitAudio, fitGap, fitMax, dry, audit, noCaptions,
//                   placeholders, extra }) -> Promise<{ code, entry }>
//     runs `node <kit>/film/build.mjs <storyboard> --project <dir> --takes <takes> ...` in the project
//     and appends { at, dry, storyboardHash, captions, aspect, brand, takes, fitAudio, audit, exit }
//     to state.builds (saved)
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { CliError, kitPath, takesDirOf } from "./project.mjs";
import { now, rel, sha256File } from "./state.mjs";

export const ASPECTS = ["16:9", "9:16", "1:1"];

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};

export function storyboardOf(project, given) {
  const p = given ? (isAbsolute(given) ? given : resolve(given)) : project.paths.storyboard;
  if (!existsSync(p)) throw new CliError(`no storyboard at ${p}: draft one with \`walkthrough draft\` (or pass a path)`);
  return p;
}

export function parseAuditLine(stdout) {
  const all = [...String(stdout).matchAll(/audit: (\d+) error\(s\), (\d+) warning\(s\)/g)];
  const m = all.at(-1);
  return m ? { errors: Number(m[1]), warnings: Number(m[2]) } : null;
}

/**
 * Before a real build: the title and end cards need assets/creatives/manifest.json (and a brand logo
 * needs assets/brand/manifest.json). When they are missing, run sync-assets if there is something to
 * sync (creatives.json, or a logo in the brand), then stand-in creatives with `placeholders`
 * (make-placeholder.mjs --creatives), else stop with the hint.
 */
export async function ensureAssets(ctx, { brand, placeholders = false } = {}) {
  const P = ctx.project.dir;
  const brandFile = brand ? resolve(brand) : join(P, "brand.json");
  let b = {};
  try {
    b = JSON.parse(readFileSync(brandFile, "utf8"));
  } catch {}
  const creativesFile = b.assets?.creatives ? resolve(dirname(brandFile), b.assets.creatives) : join(P, "creatives.json");
  const needLogo = Boolean(b.lockup?.logo) && !existsSync(join(P, "assets/brand/manifest.json"));
  const needCreatives = !existsSync(join(P, "assets/creatives/manifest.json"));
  if ((needCreatives && existsSync(creativesFile)) || needLogo) {
    const r = await ctx.exec(process.execPath, [kitPath("film/scripts/sync-assets.mjs"), "--project", P, ...(brand ? ["--brand", brandFile] : [])], { cwd: P });
    if (r.code !== 0) return r.code;
  }
  if (existsSync(join(P, "assets/creatives/manifest.json"))) return 0;
  if (placeholders) {
    const r = await ctx.exec(process.execPath, [kitPath("film/scripts/make-placeholder.mjs"), "1", "--creatives", "--project", P], { cwd: P });
    return r.code;
  }
  throw new CliError(`no creatives for the title and end cards: list them in ${creativesFile} (film/README.md, Creatives) and build again, or pass --placeholders for flat stand-ins`);
}

/** The brand file the film build will read (film/lib/config.mjs brandPath): --brand, FILM_BRAND, the storyboard's "brand", <project>/brand.json. */
function brandFileOf(project, sbPath, sb, brand) {
  if (brand) return resolve(brand);
  if (process.env.FILM_BRAND) return resolve(process.env.FILM_BRAND);
  if (sb?.brand) return isAbsolute(sb.brand) ? sb.brand : resolve(dirname(sbPath), sb.brand);
  const local = join(project.dir, "brand.json");
  return existsSync(local) ? local : null;
}

/**
 * The inputs a build with these flags is made from, resolved in the film build's order. Aspect:
 * --aspect, FILM_ASPECT, the storyboard's look.aspect, the brand's look.aspect, else 16:9. Fit-audio:
 * --fit-audio <placement>, else the storyboard's "fitAudio" (a path, or { placement, gap, max }),
 * relative to the storyboard; gap and max from --fit-gap / --fit-max, else the spec, else 0.3 and 6.
 * Relative flag paths are taken from the current directory, like --brand and --takes.
 */
export async function buildInputs(project, { storyboard, takes, brand, aspect, fitAudio, fitGap, fitMax } = {}) {
  const sbPath = storyboardOf(project, storyboard);
  const sb = readJson(sbPath) ?? {};
  const brandFile = brandFileOf(project, sbPath, sb, brand);
  const b = brandFile ? (readJson(brandFile) ?? {}) : {};
  const [a, aspectFrom] = aspect
    ? [aspect, "--aspect"]
    : process.env.FILM_ASPECT
      ? [process.env.FILM_ASPECT, "FILM_ASPECT"]
      : sb.look?.aspect
        ? [sb.look.aspect, "the storyboard's look.aspect"]
        : b.look?.aspect
          ? [b.look.aspect, "the brand's look.aspect"]
          : ["16:9", "the default"];
  if (!ASPECTS.includes(a)) throw new CliError(`unknown aspect "${a}" (from ${aspectFrom}; ${ASPECTS.join(" | ")})`, 2);
  const spec0 = fitAudio ?? sb.fitAudio ?? null;
  let fit = null;
  if (spec0) {
    const spec = typeof spec0 === "string" ? { placement: spec0 } : spec0;
    const file = fitAudio ? resolve(fitAudio) : resolve(dirname(sbPath), spec.placement ?? "");
    fit = { file: rel(project.dir, file), hash: sha256File(file), gap: Number(fitGap ?? spec.gap ?? 0.3), max: Number(fitMax ?? spec.max ?? 6) };
  }
  const takesDir = takes ? resolve(takes) : await takesDirOf(project);
  return {
    aspect: a,
    aspectFrom,
    brand: brandFile ? { file: rel(project.dir, brandFile), hash: sha256File(brandFile) } : null,
    takes: rel(project.dir, takesDir),
    fitAudio: fit,
  };
}

/** The aspect of a canvas size, or "<w>x<h>" when it is none of the three. */
const aspectOf = (w, h) => (w * 9 === h * 16 ? "16:9" : w * 16 === h * 9 ? "9:16" : w === h ? "1:1" : `${w}x${h}`);

/**
 * The inputs of the build on disk, as far as they can be told. The aspect is read from index.html's
 * canvas (the truth, whoever built it); the rest from the last full build in state.builds, and, for a
 * build recorded before these fields existed, whether fit-audio was on from edl.json's "fitAudio" key.
 * A field that cannot be told is undefined (and is then not compared).
 */
export function builtInputs(project) {
  const P = project.dir;
  const last = project.state.builds.filter((x) => !x.dry && x.exit === 0).at(-1) ?? null;
  let aspect = last?.aspect;
  try {
    const html = readFileSync(join(P, "index.html"), "utf8");
    const m = html.match(/data-composition-id="main"[^>]*?data-width="(\d+)" data-height="(\d+)"/);
    if (m) aspect = aspectOf(Number(m[1]), Number(m[2]));
  } catch {}
  let fitAudio = last && "fitAudio" in last ? last.fitAudio : undefined;
  if (fitAudio === undefined) {
    const edl = readJson(join(P, "edl.json"));
    if (edl) fitAudio = "fitAudio" in edl ? { file: null, hash: null, gap: null, max: null } : null;
  }
  return {
    storyboardHash: last?.storyboardHash,
    aspect,
    brand: last && "brand" in last ? last.brand : undefined,
    takes: last?.takes,
    fitAudio,
  };
}

/** What differs between the built inputs and the wanted ones, one phrase each ([] when nothing does). */
export function inputChanges(before, after) {
  const out = [];
  if (before.aspect !== undefined && before.aspect !== after.aspect) out.push(`aspect ${before.aspect} -> ${after.aspect} (from ${after.aspectFrom})`);
  if (before.brand !== undefined) {
    const was = before.brand?.file ?? "none", cur = after.brand?.file ?? "none";
    if (was !== cur) out.push(`brand ${was} -> ${cur}`);
    else if ((before.brand?.hash ?? null) !== (after.brand?.hash ?? null)) out.push(`brand ${cur} changed`);
  }
  if (before.takes !== undefined && before.takes !== after.takes) out.push(`takes ${before.takes} -> ${after.takes}`);
  const f0 = before.fitAudio, f1 = after.fitAudio;
  if (f0 !== undefined) {
    if (!f0 && f1) out.push(`fit-audio on (${f1.file})`);
    else if (f0 && !f1) out.push("fit-audio off");
    else if (f0 && f1 && f0.file !== null) {
      if (f0.file !== f1.file) out.push(`fit-audio placement ${f0.file} -> ${f1.file}`);
      else if (f0.hash !== f1.hash) out.push(`fit-audio placement ${f1.file} changed`);
      if (f0.gap !== f1.gap) out.push(`fit-gap ${f0.gap} -> ${f1.gap}`);
      if (f0.max !== f1.max) out.push(`fit-max ${f0.max} -> ${f1.max}`);
    }
  }
  return out;
}

export async function runBuild(ctx, { storyboard, takes, brand, aspect, fitAudio, fitGap, fitMax, dry = false, audit = false, noCaptions = false, placeholders = false, extra = [] } = {}) {
  const project = ctx.project;
  const sb = storyboardOf(project, storyboard);
  const inputs = await buildInputs(project, { storyboard, takes, brand, aspect, fitAudio, fitGap, fitMax });
  const recorded = { aspect: inputs.aspect, brand: inputs.brand, takes: inputs.takes, fitAudio: inputs.fitAudio };
  if (!dry) {
    const code = await ensureAssets(ctx, { brand, placeholders });
    if (code !== 0) return { code, entry: { at: now(), dry, storyboardHash: sha256File(sb), captions: !noCaptions, ...recorded, audit: null, exit: code } };
  }
  const takesDir = takes ? resolve(takes) : await takesDirOf(project);
  const hash = sha256File(sb);
  const lock = project.state.pictureLock;
  if (lock && lock.hash !== hash) ctx.log.warn(`the storyboard changed since picture lock (${lock.at}); \`walkthrough state lock\` again when the change is intended`);
  const args = [kitPath("film/build.mjs"), sb, "--project", project.dir, "--takes", takesDir];
  if (brand) args.push("--brand", resolve(brand));
  if (aspect) args.push("--aspect", aspect);
  if (fitAudio) args.push("--fit-audio", resolve(fitAudio));
  if (fitGap !== undefined) args.push("--fit-gap", String(fitGap));
  if (fitMax !== undefined) args.push("--fit-max", String(fitMax));
  if (dry) args.push("--dry");
  if (audit) args.push("--audit");
  if (noCaptions) args.push("--no-captions");
  args.push(...extra);
  const r = await ctx.exec(process.execPath, args, { cwd: project.dir });
  let sbCaptions = true;
  try {
    sbCaptions = JSON.parse(readFileSync(sb, "utf8")).captions !== false;
  } catch {}
  const auditResult = audit ? parseAuditLine(r.stdout) : null;
  const entry = { at: now(), dry, storyboardHash: hash, captions: !noCaptions && sbCaptions, ...recorded, audit: auditResult, exit: r.code };
  project.state.builds.push(entry);
  if (auditResult) project.state.lastAudit = { at: entry.at, ...auditResult, exit: r.code };
  project.save();
  return { code: r.code, entry };
}
