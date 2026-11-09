#!/usr/bin/env node
// `npm run check`: fast, dependency-free checks for the whole kit (the site has its own: check:site).
//   - node --check on every .mjs
//   - Python syntax of every .py (compiled in memory, the same check as py_compile, no __pycache__)
//   - bash -n on every .sh
//   - JSON.parse of every .json
//   - skill and agent frontmatter (scripts/lint-skills.mjs)
//   - the same version in every manifest (scripts/version.mjs --verify)
//   - claude plugin validate . --profile directory: the local `claude` binary if there is one; in CI
//     (CI=true) `npx @anthropic-ai/claude-code@latest`, which needs no login; otherwise skipped.
// Files are the ones git tracks plus untracked files it does not ignore, so node_modules, .next and
// other ignored output are never scanned. Flags: --no-validate skips the plugin validation.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lint } from "./lint-skills.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "out", "__pycache__", ".hyperframes"]);
const args = new Set(process.argv.slice(2));
const failures = [];

function listFiles() {
  const git = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  let files;
  if (git.status === 0) {
    files = git.stdout.split("\0").filter(Boolean);
  } else {
    files = [];
    const walk = (dir) => {
      for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name)) continue;
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) walk(rel);
        else files.push(rel);
      }
    };
    walk("");
  }
  return [...new Set(files)]
    .filter((f) => !f.split("/").some((part) => part === "node_modules" || part === ".next"))
    .filter((f) => existsSync(join(ROOT, f)) && statSync(join(ROOT, f)).isFile())
    .sort();
}

const run = (cmd, argv, opts = {}) => spawnSync(cmd, argv, { cwd: ROOT, encoding: "utf8", ...opts });
const has = (bin) => run(process.platform === "win32" ? "where" : "which", [bin]).status === 0;
const firstLines = (s, n = 6) => (s || "").trim().split("\n").slice(0, n).join("\n    ");

function step(label, fn) {
  const before = failures.length;
  const note = fn();
  const failed = failures.length - before;
  console.log(`${failed ? "FAIL" : note?.skipped ? "skip" : " ok "}  ${label}${note?.text ? `: ${note.text}` : ""}`);
}

const files = listFiles();
const byExt = (ext) => files.filter((f) => f.endsWith(ext));

step("node --check *.mjs", () => {
  const list = byExt(".mjs");
  for (const f of list) {
    const r = run(process.execPath, ["--check", f]);
    if (r.status !== 0) failures.push(`node --check ${f}\n    ${firstLines(r.stderr)}`);
  }
  return { text: `${list.length} files` };
});

step("python syntax *.py", () => {
  const list = byExt(".py");
  if (!list.length) return { text: "no files" };
  if (!has("python3")) {
    failures.push("python3 not found on PATH");
    return;
  }
  const code =
    "import sys\nbad=0\nfor f in sys.argv[1:]:\n" +
    "    try:\n        compile(open(f,'rb').read(), f, 'exec')\n" +
    "    except SyntaxError as e:\n        bad+=1; print(f'{f}:{e.lineno}: {e.msg}')\n" +
    "sys.exit(1 if bad else 0)";
  const r = run("python3", ["-I", "-c", code, ...list]);
  if (r.status !== 0) failures.push(`python syntax\n    ${firstLines(r.stdout + r.stderr, 20)}`);
  return { text: `${list.length} files` };
});

step("bash -n *.sh", () => {
  const list = byExt(".sh");
  for (const f of list) {
    const r = run("bash", ["-n", f]);
    if (r.status !== 0) failures.push(`bash -n ${f}\n    ${firstLines(r.stderr)}`);
  }
  return { text: `${list.length} files` };
});

step("JSON.parse *.json", () => {
  const list = byExt(".json");
  for (const f of list) {
    try {
      JSON.parse(readFileSync(join(ROOT, f), "utf8"));
    } catch (e) {
      failures.push(`JSON ${f}: ${e.message}`);
    }
  }
  return { text: `${list.length} files` };
});

step("skill and agent frontmatter", () => {
  const { problems, skills, agents } = lint(ROOT);
  for (const p of problems) failures.push(`frontmatter ${p}`);
  return { text: `${skills} skills, ${agents} agents` };
});

step("versions agree", () => {
  const r = run(process.execPath, ["scripts/version.mjs", "--verify"]);
  if (r.status !== 0) failures.push(`versions\n    ${firstLines(r.stderr, 10)}`);
  return { text: (r.stdout || "").trim() };
});

step("claude plugin validate", () => {
  if (args.has("--no-validate")) return { skipped: true, text: "skipped (--no-validate)" };
  let cmd;
  let argv = ["plugin", "validate", ".", "--profile", "directory"];
  if (has("claude")) cmd = "claude";
  else if (process.env.CI) {
    cmd = "npx";
    argv = ["--yes", "@anthropic-ai/claude-code@latest", ...argv];
  } else {
    return { skipped: true, text: "skipped: no `claude` binary on PATH (CI=true uses npx instead)" };
  }
  const r = run(cmd, argv, { timeout: 5 * 60 * 1000 });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  if (r.status !== 0) {
    failures.push(`${cmd} ${argv.join(" ")} exited ${r.status ?? r.signal}\n    ${firstLines(out, 40)}`);
    return;
  }
  const verdict = out.split("\n").find((l) => /Validation (passed|failed)/.test(l));
  return { text: `${cmd === "npx" ? "npx " : ""}${(verdict || "passed").replace(/^\W+/, "").trim()}` };
});

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nall checks passed");
