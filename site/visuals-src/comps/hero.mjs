// hero.mp4: a 10 s seamless loop of the film's grammar on a mock app.
// The pointer enters from off the frame on the recorder's arc, clicks a card title (press + disc),
// the camera punches in to it, a slanted caption plate lands, the camera returns wide, the pointer
// clicks Generate and the cards shimmer back in under a labelled "Time-lapse 3x" tag, then the
// pointer leaves the way it came. First and last frame are the same picture.

import { snap, K, COLOR } from "../../../film/lib/config.mjs";
import { sceneFile, Timeline } from "../../../film/lib/emit.mjs";
import { Pointer, moveDuration, MOTION } from "../../../film/lib/pointer.mjs";
import { Camera } from "../../../film/lib/camera.mjs";
import { stage } from "../../../film/lib/stage.mjs";
import { captionsScene } from "../../../film/lib/captions.mjs";
import { timelapseTag } from "../../../film/lib/tag.mjs";
import { mockApp, center } from "../lib/mockapp.mjs";

export const DURATION = 10;

/** The kit's stage with the mock app in place of the <video>. */
export function appStage({ id, app, parts }) {
  const s = stage({ id, video: { src: "assets/none.mp4", start: 0, duration: 1 }, ...parts });
  return { ...s, css: s.css + app.css, html: s.html.replace(/<video[^>]*><\/video>/, app.html) };
}

export function build() {
  const id = "hero";
  const app = mockApp({ p: "h", K });
  const B = app.boxes;
  const cam = new Camera({ stage: id });
  const OFF = { x: 1700, y: 860 }; // off the frame, bottom right (canvas x ~2005)
  const p = new Pointer({ id: `${id}-ptr`, point: OFF });
  p.show(0);
  const tl = new Timeline();

  // 1. enter on the arc to the first card's title, after "Spring"; I-beam; click
  const caretPt = { x: 414, y: 651 };
  let t = 0.5;
  let d = moveDuration(OFF, caretPt);
  p.move({ to: caretPt, start: snap(t), end: snap(t + d) });
  p.shape({ at: snap(t + d - 0.1), shape: "ibeam" });
  const click1 = snap(t + d + MOTION.clickLead);
  p.click({ at: click1 });

  // edit mode: focus ring + blinking caret (sets only: a caret blinks hard)
  tl.fromTo("#h-ring", { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "power2.out" }, click1 + 0.04);
  const editEnd = 4.45;
  for (let k = 0, on = true, at = click1 + 0.04; at < editEnd; k++, on = !on, at = snap(at + 0.5)) tl.set("#h-caret", { opacity: on ? 1 : 0 }, at);
  tl.set("#h-caret", { opacity: 0 }, editEnd);
  tl.fromTo("#h-ring", { opacity: 1 }, { opacity: 0, duration: 0.15, ease: "power3.in" }, editEnd);

  // camera punches in to the title just after the press, holds, returns wide
  cam.frame({ box: B.titles[0], kind: "control", scale: 1.7, at: snap(click1 + 0.08) });
  cam.wide({ at: editEnd });

  // 2. to Generate, click
  t = 4.62;
  const btnPt = center(B.btn);
  d = moveDuration(caretPt, btnPt);
  p.shape({ at: snap(t), shape: "arrow" });
  p.move({ to: btnPt, start: snap(t), end: snap(t + d) });
  p.shape({ at: snap(t + d), shape: "hand" });
  const click2 = snap(t + d + MOTION.clickLead);
  p.click({ at: click2 });

  // the cards go back to skeletons and shimmer in under the time-lapse tag
  const L0 = snap(click2 + 0.08);
  const resolve = [snap(L0 + 1.1), snap(L0 + 1.6), snap(L0 + 2.1)];
  tl.fromTo("#h-btnl", { opacity: 1 }, { opacity: 0.5, duration: 0.12, ease: "power2.out" }, L0);
  tl.fromTo("#h-btnl", { opacity: 0.5 }, { opacity: 1, duration: 0.2, ease: "expo.out" }, resolve[2] + 0.2);
  B.cards.forEach((c, i) => {
    const s0 = snap(L0 + i * 0.05);
    tl.fromTo(`#h-sk${i}`, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power2.out" }, s0);
    tl.fromTo(`#h-cc${i}`, { opacity: 1 }, { opacity: 0, duration: 0.12, ease: "power2.out" }, s0);
    const sweep = 0.5;
    const reps = Math.max(0, Math.floor((resolve[i] - s0 - 0.1) / sweep) - 1);
    tl.fromTo(`#h-skhi${i}`, { x: -200 }, { x: c.w + 20, duration: sweep, ease: "power1.inOut", repeat: reps }, s0 + 0.06);
    tl.set(`#h-cc${i}`, { opacity: 1 }, resolve[i]);
    tl.fromTo(`#h-sk${i}`, { clipPath: "inset(0% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: "expo.out" }, resolve[i]);
    tl.fromTo(`#h-ttl${i}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out", immediateRender: false }, resolve[i] + 0.1);
  });
  const tag = timelapseTag({ id: `${id}-tag`, start: snap(L0 + 0.12), end: snap(resolve[2] + 0.45), rate: 3 });

  // 3. leave the way it came
  t = snap(resolve[2] + 0.55);
  d = moveDuration(btnPt, OFF);
  p.shape({ at: t, shape: "arrow" });
  p.move({ to: OFF, start: t, end: snap(t + d) });

  const s = appStage({ id, app, parts: { overlay: [p.part()], extra: [cam.part(), { tl }], outside: [tag] } });
  const caption = { text: "Click any text to edit it", start: snap(click1 + 0.42), end: snap(editEnd - 0.1), variant: "wipe" };
  return {
    duration: DURATION,
    scenes: [
      { id, file: sceneFile({ id, duration: DURATION, ...s }) },
      { id: "captions", kind: "captions", file: captionsScene({ id: "captions", duration: DURATION, items: [caption] }) },
    ],
    info: { click1, click2, L0, resolve, leave: t + d, caption },
  };
}
