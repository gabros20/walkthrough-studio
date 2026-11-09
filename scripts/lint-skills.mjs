#!/usr/bin/env node
// Frontmatter sanity for the plugin's skills and agents.
//   skills/<folder>/SKILL.md : `name` equals <folder>, `description` is present and at most 1024
//                              characters (Agent Skills spec), and the "Where the kit is" block is
//                              the same in every skill (skills.sh installs copy SKILL.md alone)
//   agents/<file>.md         : `name` (equal to <file>), `description` and `model` are present
// Exits 1 on any problem. Run by `npm run check` and the CI job `skills-lint`.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MODELS = new Set(["opus", "sonnet", "haiku", "inherit"]);
const MAX_DESCRIPTION = 1024;
// The kit-location paragraph: from its bold lead-in to the next blank line.
const KIT_BLOCK = /\*\*Where the kit is\.\*\*[\s\S]*?(?=\n\s*\n)/;

// Minimal YAML frontmatter reader: top-level `key: value` pairs, quoted values, and block
// scalars (`key: >` / `key: |`) with indented continuation lines. Enough for skill/agent files.
export function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!m) return null;
  const out = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let [, key, value] = kv;
    if (/^[>|][+-]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim());
      value = block.join(value.startsWith(">") ? " " : "\n").trim();
    } else if (/^(['"]).*\1$/.test(value)) {
      value = value.slice(1, -1);
    }
    out[key] = value.trim();
  }
  return out;
}

export function lint(root = ROOT) {
  const problems = [];
  let skills = 0;
  let agents = 0;
  let kitBlock = null;

  const skillsDir = join(root, "skills");
  if (existsSync(skillsDir)) {
    for (const folder of readdirSync(skillsDir).sort()) {
      if (folder.startsWith(".") || !statSync(join(skillsDir, folder)).isDirectory()) continue;
      const file = `skills/${folder}/SKILL.md`;
      if (!existsSync(join(root, file))) {
        problems.push(`${file}: missing`);
        continue;
      }
      skills++;
      const fm = frontmatter(readFileSync(join(root, file), "utf8"));
      if (!fm) {
        problems.push(`${file}: no YAML frontmatter (--- ... ---) at the top`);
        continue;
      }
      if (!fm.name) problems.push(`${file}: no \`name\``);
      else if (fm.name !== folder) problems.push(`${file}: name "${fm.name}" does not match its folder "${folder}"`);
      else if (!NAME.test(fm.name)) problems.push(`${file}: name "${fm.name}" is not lowercase-kebab-case`);
      if (!fm.description) problems.push(`${file}: no \`description\``);
      else if (fm.description.length > MAX_DESCRIPTION)
        problems.push(`${file}: description is ${fm.description.length} characters (max ${MAX_DESCRIPTION})`);
      const block = readFileSync(join(root, file), "utf8").match(KIT_BLOCK)?.[0];
      if (!block) problems.push(`${file}: no "**Where the kit is.**" block`);
      else if (kitBlock === null) kitBlock = { file, block };
      else if (block !== kitBlock.block) problems.push(`${file}: "Where the kit is" block differs from ${kitBlock.file}`);
    }
  }

  const agentsDir = join(root, "agents");
  if (existsSync(agentsDir)) {
    for (const f of readdirSync(agentsDir).sort()) {
      if (!f.endsWith(".md")) continue;
      const file = `agents/${f}`;
      agents++;
      const fm = frontmatter(readFileSync(join(root, file), "utf8"));
      if (!fm) {
        problems.push(`${file}: no YAML frontmatter (--- ... ---) at the top`);
        continue;
      }
      const stem = basename(f, ".md");
      if (!fm.name) problems.push(`${file}: no \`name\``);
      else if (fm.name !== stem) problems.push(`${file}: name "${fm.name}" does not match the file name "${stem}"`);
      if (!fm.description) problems.push(`${file}: no \`description\``);
      if (!fm.model) problems.push(`${file}: no \`model\``);
      else if (!MODELS.has(fm.model) && !fm.model.startsWith("claude-"))
        problems.push(`${file}: model "${fm.model}" is not one of ${[...MODELS].join(", ")} or a claude-* id`);
    }
  }

  return { problems, skills, agents };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { problems, skills, agents } = lint();
  if (problems.length) {
    for (const p of problems) console.error(`  ${p}`);
    console.error(`lint-skills: ${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log(`lint-skills: ${skills} skills, ${agents} agents ok`);
}
