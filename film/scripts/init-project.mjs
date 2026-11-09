// Start a film project: a folder outside the kit that holds one film's inputs and receives every
// output, and is a HyperFrames project of its own (check / render run inside it).
//
//   node <kit>/film/scripts/init-project.mjs <dir>
//
// Writes, never overwriting: hyperframes.json, meta.json, package.json (pinned hyperframes
// scripts), CLAUDE.md + AGENTS.md (HyperFrames instructions), .gitignore, kit.json (the kit's paths,
// refreshed on every build), compositions/, brand.json (the neutral example brand, to edit), and
// storyboard.example.json. Run it again any time; it only adds what is missing. Every kit command
// then takes --project <dir> (or FILM_PROJECT=<dir>, or run it from inside <dir>).

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { KIT_FILM_DIR, ensureProject } from "../lib/project.mjs";

const dir = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!dir) { console.error("usage: node <kit>/film/scripts/init-project.mjs <dir>"); process.exit(1); }
const P = resolve(dir);
if (P === KIT_FILM_DIR || P.startsWith(KIT_FILM_DIR + "/")) { console.error("a project lives outside the kit's film/ folder"); process.exit(1); }
mkdirSync(P, { recursive: true });
const wrote = ensureProject(P);
for (const [from, to] of [["brand.example.json", "brand.json"], ["storyboard.example.json", "storyboard.example.json"]]) {
  if (!existsSync(join(P, to))) { copyFileSync(join(KIT_FILM_DIR, from), join(P, to)); wrote.push(to); }
}
const kit = KIT_FILM_DIR;
console.log(`project ${P}${wrote.length ? `: wrote ${wrote.join(", ")}` : ": already complete"}

Next (from anywhere; or cd into the project and drop --project):
  node ${kit}/scripts/draft-storyboard.mjs <takes>/<take> [...] --out ${join(P, "storyboard.json")}
  node ${kit}/build.mjs --project ${P} --takes <takes> --dry --audit
  node ${kit}/scripts/sync-assets.mjs --project ${P}          # logo (brand.json) + creatives (creatives.json)
  node ${kit}/build.mjs --project ${P} --takes <takes> --audit
  cd ${P} && npx --yes hyperframes@0.9.16 check --json && npx --yes hyperframes@0.9.16 render -o renders/final.mp4
  cd ${P} && for f in cues.json edl.json; do cp $f renders/final.$f; done && cp captions.srt renders/final.captions.srt
  node ${resolve(kit, "../sound/build-sound.mjs")} --project ${P} --video ${join(P, "renders/final.mp4")} --deliver <out.mp4>`);
