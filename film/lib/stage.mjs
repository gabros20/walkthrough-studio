// The stage: flat ink ground, the app window holding the footage, inside the camera wrapper.
//
//   #<id>-ground                       flat ink, full frame (outside the camera)
//   #<id>-cam                          camera wrapper (scale/x/y, origin 0 0), full frame
//     #<id>-bezel                      phone takes only (lib/config.mjs BEZEL): a neutral device
//                                      frame around the window, rounded (window radius x 2.4), a thin
//                                      ring in the plate colour, carrying the shadow; no notch, no marks
//     #<id>-win                        1536x864 at (192, 36), radius 16, the plan's shadow (16:9 over a
//                                      desktop take; lib/config.mjs WINDOW for other aspects); with a
//                                      bezel: clipped to the bezel's inner radius, no shadow of its own
//       <video id="<id>-video">        the take, 2880x1620 drawn at 1536x864 (timed, muted)
//     #<id>-ovl                        same box as the window, NOT clipped: pointer lives here
//       #<id>-mask                     same box, clipped to the window's radius: spotlights here
//
// Overlay coordinates are window-local stage px (capture px * K); components convert for you.

import { BAND, BEZEL, COLOR, FILM, WINDOW } from "./config.mjs";
import { n, esc, merge } from "./emit.mjs";

/**
 * stage({ id, video: { src, start, duration, mediaStart, rate }, masked: [parts], overlay: [parts], extra: [parts], outside: [parts] })
 *   -> { css, html, tl }
 * masked parts (spotlights) are clipped to the window; overlay parts (pointer) are not.
 * extra parts (camera timelines) contribute only their timelines/css; outside parts (the time-lapse
 * tag) sit on the frame, outside the camera, so they never move with the screen.
 */
export function stage({ id, video, masked = [], overlay = [], extra = [], outside = [] }) {
  const m = merge(masked);
  const o = merge(overlay);
  const x = merge(extra);
  const f = merge(outside);
  const box = `left: ${WINDOW.left}px; top: ${WINDOW.top}px; width: ${WINDOW.width}px; height: ${WINDOW.height}px;`;
  // with a bezel the footage is clipped to the bezel's inner radius and the bezel carries the shadow
  const radius = BEZEL ? BEZEL.innerRadius : WINDOW.radius;
  const B = BEZEL?.thickness ?? 0;
  const bezelCss = BEZEL
    ? `
    #${id}-bezel { position: absolute; left: ${n(WINDOW.left - B)}px; top: ${n(WINDOW.top - B)}px; width: ${n(WINDOW.width + 2 * B)}px; height: ${n(WINDOW.height + 2 * B)}px; border-radius: ${n(BEZEL.outerRadius)}px; background: ${BEZEL.body}; box-shadow: inset 0 0 0 ${n(BEZEL.ringWidth)}px ${BEZEL.ring}, ${WINDOW.shadow}; }`
    : "";
  const css = `
    #${id}-ground { position: absolute; inset: 0; background: ${COLOR.ink}; }
    #${id}-cam { position: absolute; left: 0; top: 0; width: ${FILM.width}px; height: ${FILM.height}px; }${bezelCss}
    #${id}-win { position: absolute; ${box} border-radius: ${radius}px; overflow: hidden; box-shadow: ${BEZEL ? "none" : WINDOW.shadow}; background: ${COLOR.paper}; }
    #${id}-video { position: absolute; left: 0; top: 0; width: ${WINDOW.width}px; height: ${WINDOW.height}px; object-fit: cover; }
    #${id}-ovl { position: absolute; ${box} }
    #${id}-band { position: absolute; left: 0; top: ${BAND.top}px; width: ${FILM.width}px; height: ${FILM.height - BAND.top}px; background: ${COLOR.ink}; opacity: 0; }
    #${id}-mask { position: absolute; left: 0; top: 0; width: ${WINDOW.width}px; height: ${WINDOW.height}px; border-radius: ${radius}px; overflow: hidden; }
    ${m.css}
    ${o.css}
    ${x.css}
    ${f.css}`;
  const rate = video.rate && video.rate !== 1 ? ` data-playback-rate="${n(video.rate)}"` : "";
  const html = `    <div id="${id}-ground"></div>
    <div id="${id}-cam" data-layout-allow-overflow>${BEZEL ? `\n      <div id="${id}-bezel"></div>` : ""}
      <div id="${id}-win">
        <video id="${id}-video" class="clip" src="${esc(video.src)}" muted playsinline data-start="${n(video.start ?? 0)}" data-duration="${n(video.duration)}" data-media-start="${n(video.mediaStart ?? 0)}"${rate}></video>
      </div>
      <div id="${id}-ovl" data-layout-allow-overflow data-layout-allow-occlusion>
        <div id="${id}-mask" data-layout-ignore>${m.html}
        </div>${o.html}
      </div>
    </div>
    <div id="${id}-band"></div>
${f.html}`;
  const tl = merge({ tl: x.tl }, { tl: m.tl }, { tl: o.tl }, { tl: f.tl }).tl;
  return { css, html, tl };
}
