// Insert a mark measured after the take (e.g. a logo lockup that has no DOM element) into a take's
// events.json, positioned relative to another mark's box. The mark carries `source`.
// Usage: node add-mark.mjs <takeDir> <label> <anchorLabel> <fx,fy,fw,fh> "<source>"
import fs from "node:fs";
import path from "node:path";

const [dir, label, anchor, frac, source] = process.argv.slice(2);
const file = path.join(dir, "events.json");
const doc = JSON.parse(fs.readFileSync(file, "utf8"));
const a = doc.events.find((e) => e.type === "mark" && e.label === anchor);
if (!a) throw new Error(`no mark ${anchor}`);
if (doc.events.some((e) => e.type === "mark" && e.label === label)) throw new Error(`mark ${label} exists`);
const [fx, fy, fw, fh] = frac.split(",").map(Number);
const r2 = (v) => Math.round(v * 100) / 100;
const box = { x: r2(a.box.x + a.box.width * fx), y: r2(a.box.y + a.box.height * fy), width: r2(a.box.width * fw), height: r2(a.box.height * fh) };
doc.events.push({ type: "mark", t: a.t, label, box, source, measuredAfterTake: true });
doc.events.sort((x, y) => x.t - y.t);
doc.events.forEach((e, i) => {
  e.id = i;
});
fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
console.log(label, box);
