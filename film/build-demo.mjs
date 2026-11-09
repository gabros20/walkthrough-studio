// Builds the component demo: title, two stage scenes (pointer moves and clicks, a punch-in and
// return, a spotlight, a push through a clicked control, a whip), captions, end card.
// Writes index.html and compositions/*.html. Usage: node build-demo.mjs
// Placeholder-only component demo on flat stand-in footage (demo/targets.mjs), with hand-placed
// times. The real path is build.mjs + storyboard.json (takes, mapping, cuts, cues); both write the
// same output files, so the one you ran last is what index.html shows.
//
// It is also the worked example of the component API: every number below is what build.mjs takes
// from the storyboard + events.json (times already mapped to film/scene time).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLOR, FILM, PROJECT_DIR, snap } from "./lib/config.mjs";
import { ensureProject } from "./lib/project.mjs";
import { n, sceneFile, merge } from "./lib/emit.mjs";
import { Pointer, moveDuration, MOTION } from "./lib/pointer.mjs";
import { Camera } from "./lib/camera.mjs";
import { spotlight } from "./lib/spotlight.mjs";
import { stage } from "./lib/stage.mjs";
import { captionsScene, lintCaptions, toSrt } from "./lib/captions.mjs";
import { titleScene, endScene } from "./lib/titlecards.mjs";
import { TARGETS as T, center } from "./demo/targets.mjs";

const film = PROJECT_DIR; // written into the project (the kit's film/ only when developing in it)
ensureProject(film);
const FOOTAGE = "assets/footage/placeholder.mp4";
if (!existsSync(join(film, FOOTAGE))) throw new Error("run node scripts/make-placeholder.mjs first");
if (!existsSync(join(film, "assets/creatives/manifest.json"))) throw new Error("no assets/creatives/manifest.json: run node scripts/make-placeholder.mjs (stand-ins) or node scripts/sync-assets.mjs");
const creatives = JSON.parse(readFileSync(join(film, "assets/creatives/manifest.json"), "utf8"));

// ---------- stage A: three moves with clicks, punch-in and return, spotlight, push-through ----------
function stageA() {
  const id = "a";
  const cam = new Camera({ stage: id });
  cam.settleIn({ at: 0 });
  const p = new Pointer({ id: `${id}-ptr`, point: { x: 1700, y: 980 } }); // off the frame, bottom right
  p.show(0.2);

  // move 1: enter and click the platform picker
  let t = 0.5;
  let to = center(T.picker);
  let d = moveDuration(p.pos, to);
  p.move({ to, start: snap(t), end: snap(t + d) });
  p.shape({ at: snap(t + d), shape: "hand" });
  p.click({ at: snap(t + d + MOTION.clickLead) });

  // move 2: into the composer; the camera frames the composer pane just before the pointer lands
  t = 2.0;
  to = { x: 620, y: 630 };
  d = moveDuration(p.pos, to);
  cam.frame({ box: T.composer, kind: "pane", at: snap(t - 0.1) });
  p.move({ to, start: snap(t), end: snap(t + d) });
  p.shape({ at: snap(t + d), shape: "ibeam" });
  p.click({ at: snap(t + d + MOTION.clickLead) });
  cam.wide({ at: 3.9 });

  // spotlight: point at the "Worked for N s" line without clicking
  const spot = spotlight({ id: `${id}-spot`, box: T.worked, start: 4.3, end: 6.3 });

  // move 3: to Export, click, push through it
  t = 6.3;
  to = center(T.exportBtn);
  d = moveDuration(p.pos, to);
  p.shape({ at: snap(t + 0.05), shape: "arrow" });
  p.move({ to, start: snap(t), end: snap(t + d) });
  p.shape({ at: snap(t + d), shape: "hand" });
  const click = snap(t + d + MOTION.clickLead);
  p.click({ at: click });
  const cut = snap(cam.pushThrough({ box: T.exportBtn, at: click + 0.12, hide: [`#${id}-ptr-arc`] }));

  const duration = cut;
  const s = stage({
    id,
    video: { src: FOOTAGE, start: 0, duration, mediaStart: 2 },
    masked: [spot],
    overlay: [p.part()],
    extra: [cam.part()],
  });
  return { id, duration, file: sceneFile({ id, duration, ...s }), endPointer: p.pos };
}

// ---------- stage B: arrives through the push, one whip (format montage cut) ----------
function stageB(pointerAt) {
  const id = "b";
  const duration = 4;
  const cam = new Camera({ stage: id });
  cam.settleIn({ at: 0 });
  const p = new Pointer({ id: `${id}-ptr`, point: pointerAt, shape: "arrow" });
  p.show(0);
  p.move({ to: { x: 980, y: 520 }, start: 0.5, end: 0.5 + moveDuration(pointerAt, { x: 980, y: 520 }) });
  // whip: out ends between frames and in starts there, so the seam frame already shows the incoming shot
  cam.whipOut({ at: 2.0, dir: -1, dur: 0.15 });
  cam.whipIn({ at: 2.15, dir: -1 });
  const s = stage({
    id,
    video: { src: FOOTAGE, start: 0, duration, mediaStart: 14 },
    overlay: [p.part()],
    extra: [cam.part()],
  });
  return { id, duration, file: sceneFile({ id, duration, ...s }) };
}


// ---------- assemble ----------
const TITLE = 8, END = 7;
const A = stageA();
const B = stageB(A.endPointer);
const scenes = [A, B];
const tA = TITLE, tB = tA + A.duration;
const captions = [
  { text: "Describe the post in your own words", start: snap(tA + 0.4), end: snap(tA + 3.2), variant: "wipe" },
  { text: "Every image is checked before you see it", start: snap(tA + 4.1), end: snap(tA + 7.1), variant: "words" },
  { text: "Download the kit. Paste the text. Post.", start: snap(tB + 0.5), end: snap(tB + 3.3), variant: "tick" },
];
let t = TITLE;
for (const sc of scenes) { sc.start = t; t += sc.duration; }
const tEnd = t, total = tEnd + END;
const problems = lintCaptions(captions);
if (problems.length) console.warn("captions:\n  " + problems.join("\n  "));

mkdirSync(join(film, "compositions"), { recursive: true });
writeFileSync(join(film, "compositions/title.html"), titleScene({ id: "title", creatives, duration: TITLE }));
for (const sc of scenes) writeFileSync(join(film, `compositions/${sc.id}.html`), sc.file);
writeFileSync(join(film, "compositions/end.html"), endScene({ id: "end", creatives, duration: END }));
writeFileSync(join(film, "compositions/captions.html"), captionsScene({ id: "captions", duration: total, items: captions }));
writeFileSync(join(film, "captions.srt"), toSrt(captions));

const host = (id, start, duration, z, kind = "graphics") =>
  `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${n(start)}" data-duration="${n(duration)}" data-track-index="${z}" data-track-kind="${kind}" data-width="${FILM.width}" data-height="${FILM.height}" style="z-index:${z}"></div>`;

writeFileSync(
  join(film, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${FILM.width}, height=${FILM.height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${FILM.width}px; height: ${FILM.height}px; overflow: hidden; background: ${COLOR.ink}; }
      #root { position: relative; width: 100%; height: 100%; background: ${COLOR.ink}; }
    </style>
  </head>
  <body>
    <!-- Generated by build-demo.mjs. Edit the lib/ components or the build script, not this file. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${n(total)}" data-fps="${FILM.fps}" data-width="${FILM.width}" data-height="${FILM.height}">
${host("title", 0, TITLE, 1)}
${scenes.map((sc, i) => host(sc.id, sc.start, sc.duration, 2 + i)).join("\n")}
${host("end", tEnd, END, 2 + scenes.length)}
${host("captions", 0, total, 10, "captions")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`,
);
console.log(`demo: ${n(total)} s @ ${FILM.fps} fps; title 0-${TITLE}, ${scenes.map((sc) => `${sc.id} ${n(sc.start)}-${n(sc.start + sc.duration)}`).join(", ")}, end ${n(tEnd)}-${n(total)}; footage ${FOOTAGE}`);
