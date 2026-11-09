#!/usr/bin/env node
// One source of truth for the kit's version (semver).
//
//   node scripts/version.mjs <X.Y.Z> [--dry] [--date YYYY-MM-DD] [--no-changelog]
//       Sets the version in every manifest below, moves the CHANGELOG's [Unreleased] section into
//       [X.Y.Z] - date (leaving an empty [Unreleased]), updates the compare links, and prints the
//       git commands that cut the release. --dry shows what would change and writes nothing.
//   node scripts/version.mjs --current
//       Prints the current version (from .claude-plugin/plugin.json).
//   node scripts/version.mjs --notes <X.Y.Z>
//       Prints the body of that version's CHANGELOG section (the release notes). Used by release.yml.
//   node scripts/version.mjs --verify
//       Exits 1 unless every manifest carries the same version. Used by `npm run check`.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = ".claude-plugin/plugin.json";
const MARKETPLACE = ".claude-plugin/marketplace.json";
const PACKAGES = [PLUGIN, "package.json", "recorder/package.json", "film/package.json"];
const CHANGELOG = "docs/CHANGELOG.md";
const DEFAULT_REPO = "https://github.com/gabros20/walkthrough-studio";
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

const HELP = readFileSync(fileURLToPath(import.meta.url), "utf8")
  .split("\n")
  .filter((l) => l.startsWith("//"))
  .map((l) => l.replace(/^\/\/ ?/, ""))
  .join("\n");

const abs = (p) => join(ROOT, p);
const readJson = (p) => JSON.parse(readFileSync(abs(p), "utf8"));
const writeJson = (p, obj) => writeFileSync(abs(p), JSON.stringify(obj, null, 2) + "\n");
const die = (msg) => {
  console.error(`version: ${msg}`);
  process.exit(1);
};

function repoUrl() {
  for (const p of [PLUGIN, "package.json"]) {
    const r = readJson(p).repository;
    const url = typeof r === "string" ? r : r?.url;
    if (url) return url.replace(/^git\+/, "").replace(/\.git$/, "");
  }
  return DEFAULT_REPO;
}

// Sets obj.version, keeping key order: after "name" when the field is new.
function withVersion(obj, version) {
  if ("version" in obj) return { ...obj, version };
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v;
    if (k === "name") out.version = version;
  }
  if (!("version" in out)) return { version, ...obj };
  return out;
}

function currentVersions() {
  const rows = PACKAGES.map((p) => ({ path: p, version: readJson(p).version ?? null }));
  if (existsSync(abs(MARKETPLACE))) {
    const m = readJson(MARKETPLACE);
    const name = readJson(PLUGIN).name;
    if (m.metadata && "version" in m.metadata)
      rows.push({ path: `${MARKETPLACE} metadata.version`, version: m.metadata.version });
    for (const [i, p] of (m.plugins ?? []).entries())
      if (p.name === name && "version" in p)
        rows.push({ path: `${MARKETPLACE} plugins[${i}].version`, version: p.version });
  }
  return rows;
}

// ---- CHANGELOG ----------------------------------------------------------------------------

const HEADING = /^## \[([^\]]+)\](.*)$/;

function sections(text) {
  const lines = text.split("\n");
  const heads = [];
  lines.forEach((l, i) => {
    const m = l.match(HEADING);
    if (m) heads.push({ line: i, name: m[1] });
  });
  // The link-reference block at the end ("[x]: url") is not part of the last section.
  let linksStart = lines.length;
  while (linksStart > 0 && /^(\[[^\]]+\]: \S+)?\s*$/.test(lines[linksStart - 1])) linksStart--;
  return heads.map((h, i) => ({
    ...h,
    end: i + 1 < heads.length ? heads[i + 1].line : linksStart,
  }));
}

function notesFor(text, version) {
  const s = sections(text).find((x) => x.name === version);
  if (!s) return null;
  return text
    .split("\n")
    .slice(s.line + 1, s.end)
    .join("\n")
    .trim();
}

function moveUnreleased(text, version, date, repo) {
  const secs = sections(text);
  const un = secs.find((s) => s.name === "Unreleased");
  if (!un) throw new Error(`${CHANGELOG} has no "## [Unreleased]" heading`);
  if (secs.some((s) => s.name === version)) throw new Error(`${CHANGELOG} already has a [${version}] section`);
  const lines = text.split("\n");
  const body = lines.slice(un.line + 1, un.end);
  if (!body.join("").trim()) throw new Error(`[Unreleased] in ${CHANGELOG} is empty; nothing to release`);
  const prev = secs.find((s) => s.line > un.line && SEMVER.test(s.name))?.name ?? null;

  const trimmed = body.join("\n").trim().split("\n");
  const out = [
    ...lines.slice(0, un.line + 1),
    "",
    `## [${version}] - ${date}`,
    "",
    ...trimmed,
    "",
    ...lines.slice(un.end),
  ];

  // Compare links: [Unreleased] now starts at the new tag; the new version gets its own link.
  const unLink = `[Unreleased]: ${repo}/compare/v${version}...HEAD`;
  const newLink = prev
    ? `[${version}]: ${repo}/compare/v${prev}...v${version}`
    : `[${version}]: ${repo}/releases/tag/v${version}`;
  const unIdx = out.findIndex((l) => l.startsWith("[Unreleased]: "));
  if (unIdx >= 0) out.splice(unIdx, 1, unLink, newLink);
  else {
    while (out.length && !out[out.length - 1].trim()) out.pop();
    out.push("", unLink, newLink);
  }
  let result = out.join("\n").replace(/\n{3,}/g, "\n\n");
  if (!result.endsWith("\n")) result += "\n";
  return { text: result, prev, moved: trimmed.length };
}

// ---- main ---------------------------------------------------------------------------------

const args = process.argv.slice(2);
if (!args.length || args.includes("--help") || args.includes("-h")) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}

if (args[0] === "--current") {
  console.log(readJson(PLUGIN).version);
  process.exit(0);
}

if (args[0] === "--verify") {
  const rows = currentVersions();
  const want = rows[0].version;
  const bad = rows.filter((r) => r.version !== want);
  if (!SEMVER.test(want ?? "")) die(`${PLUGIN} version "${want}" is not semver`);
  if (bad.length) {
    for (const r of bad) console.error(`  ${r.path}: ${r.version ?? "(missing)"} (expected ${want})`);
    die(`versions disagree; run: npm run version:set -- ${want}`);
  }
  console.log(`${want} in ${rows.length} manifests`);
  process.exit(0);
}

if (args[0] === "--notes") {
  const v = (args[1] ?? "").replace(/^v/, "");
  if (!v) die("--notes needs a version");
  const notes = notesFor(readFileSync(abs(CHANGELOG), "utf8"), v);
  if (!notes) die(`no non-empty [${v}] section in ${CHANGELOG}`);
  console.log(notes);
  process.exit(0);
}

const dry = args.includes("--dry") || args.includes("--dry-run");
const skipChangelog = args.includes("--no-changelog");
const dateIdx = args.indexOf("--date");
const date = dateIdx >= 0 ? args[dateIdx + 1] : new Date().toISOString().slice(0, 10);
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--date");
const version = (positional[0] ?? "").replace(/^v/, "");
if (!SEMVER.test(version)) die(`"${positional[0] ?? ""}" is not a semver version (X.Y.Z)`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) die(`--date must be YYYY-MM-DD`);

const tag = `v${version}`;
console.log(`${dry ? "[dry run] " : ""}set version ${version}\n`);

// Plan every change first; write nothing until all of it is known to work.
const writes = [];
for (const p of PACKAGES) {
  const obj = readJson(p);
  const from = obj.version ?? "(none)";
  console.log(`  ${p}: ${from} -> ${version}${from === version ? " (unchanged)" : ""}`);
  if (from !== version) writes.push(() => writeJson(p, withVersion(obj, version)));
}

if (existsSync(abs(MARKETPLACE))) {
  const m = readJson(MARKETPLACE);
  const name = readJson(PLUGIN).name;
  let touched = false;
  if (m.metadata && "version" in m.metadata) {
    console.log(`  ${MARKETPLACE} metadata.version: ${m.metadata.version} -> ${version}`);
    m.metadata.version = version;
    touched = true;
  }
  for (const [i, p] of (m.plugins ?? []).entries()) {
    if (p.name === name && "version" in p) {
      console.log(`  ${MARKETPLACE} plugins[${i}].version: ${p.version} -> ${version}`);
      p.version = version;
      touched = true;
    }
  }
  if (!touched) console.log(`  ${MARKETPLACE}: no version field for "${name}" (left alone)`);
  else writes.push(() => writeJson(MARKETPLACE, m));
} else {
  console.log(`  ${MARKETPLACE}: not present (skipped)`);
}

let changelogProblem = null;
if (skipChangelog) {
  console.log(`  ${CHANGELOG}: skipped (--no-changelog)`);
} else {
  const text = readFileSync(abs(CHANGELOG), "utf8");
  try {
    const r = moveUnreleased(text, version, date, repoUrl());
    console.log(
      `  ${CHANGELOG}: [Unreleased] (${r.moved} lines) -> [${version}] - ${date}; ` +
        `links: compare ${r.prev ? `v${r.prev}...${tag}` : `release ${tag}`}, [Unreleased] from ${tag}`,
    );
    writes.push(() => writeFileSync(abs(CHANGELOG), r.text));
  } catch (e) {
    changelogProblem = e.message;
    console.log(`  ${CHANGELOG}: ${e.message}`);
  }
}

if (changelogProblem && !dry) die(`${changelogProblem}. Nothing was written. (--no-changelog sets versions only.)`);

if (dry) {
  console.log(`\n[dry run] ${writes.length} file(s) would change; nothing written.`);
} else {
  for (const w of writes) w();
  console.log(`\nwrote ${writes.length} file(s) under ${relative(process.cwd(), ROOT) || "."}`);
}

console.log(`
Next (main is protected, so the bump goes through a pull request):

  git switch -c release/${tag}
  git add -A && git commit -m "chore(release): ${tag}"
  git push -u origin release/${tag}
  gh pr create --fill --title "chore(release): ${tag}"
  # after the checks pass and the PR is merged:
  git switch main && git pull --ff-only
  git tag -a ${tag} -m "${tag}"
  git push origin ${tag}          # release.yml publishes the GitHub Release from the CHANGELOG
`);
