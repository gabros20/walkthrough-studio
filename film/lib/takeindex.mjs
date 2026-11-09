// Reads the recorder's takes/INDEX.md for what events.json does not carry: the capture gaps
// ("frozen stretches", 100-320 ms with no new frame) per take, on each take's master clock.

import { existsSync, readFileSync } from "node:fs";

/** parseIndex(path) -> Map(takeName -> [{ from, to, ms, note }]) (empty map when the file is missing) */
export function parseIndex(path) {
  const out = new Map();
  if (!existsSync(path)) return out;
  let take = null;
  let inGaps = false;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const h = /^## ([\w.-]+)/.exec(line); // "## take-3 …": a take folder name opens its section
    if (h) { take = h[1]; out.set(take, []); inGaps = false; continue; }
    if (!take) continue;
    if (/^- (Capture gaps|Frozen stretches)/.test(line)) { inGaps = true; continue; }
    if (inGaps) {
      // "  - 11.95 s +251 ms near …" (older index) or "  - 33.05-33.29 s (249 ms): …; pointer at rest"
      const g = /^\s+- ([\d.]+) s \+(\d+) ms\s*(.*)$/.exec(line);
      if (g) { const from = Number(g[1]); const ms = Number(g[2]); out.get(take).push({ from, to: from + ms / 1000, ms, note: g[3].trim() }); continue; }
      const r = /^\s+- ([\d.]+)-([\d.]+) s \((\d+) ms\):\s*(.*)$/.exec(line);
      if (r) { out.get(take).push({ from: Number(r[1]), to: Number(r[2]), ms: Number(r[3]), note: r[4].trim(), moving: /pointer MOVING/i.test(r[4]) }); continue; }
      if (/^- /.test(line)) inGaps = false; // the next top-level bullet ends the list
    }
  }
  return out;
}
