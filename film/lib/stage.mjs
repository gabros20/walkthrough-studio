// The stage: flat ink ground, the app window holding the footage, inside the camera wrapper.
//
//   #<id>-ground                       flat ink, full frame (outside the camera)
//   #<id>-cam                          camera wrapper (scale/x/y, origin 0 0), full frame
//     #<id>-win                        1536x864 at (192, 36), radius 16, the plan's shadow
//       <video id="<id>-video">        the take, 2880x1620 drawn at 1536x864 (timed, muted)
//     #<id>-ovl                        same box as the window, NOT clipped: pointer lives here
//       #<id>-mask                     same box, clipped to the window's radius: spotlights here
//
// Overlay coordinates are window-local stage px (capture px * K); components convert for you.

import { COLOR, FILM, WINDOW } from "./config.mjs";
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
  const css = `
    #${id}-ground { position: absolute; inset: 0; background: ${COLOR.ink}; }
    #${id}-cam { position: absolute; left: 0; top: 0; width: ${FILM.width}px; height: ${FILM.height}px; }
    #${id}-win { position: absolute; ${box} border-radius: ${WINDOW.radius}px; overflow: hidden; box-shadow: ${WINDOW.shadow}; background: ${COLOR.paper}; }
    #${id}-video { position: absolute; left: 0; top: 0; width: ${WINDOW.width}px; height: ${WINDOW.height}px; object-fit: cover; }
    #${id}-ovl { position: absolute; ${box} }
    #${id}-band { position: absolute; left: 0; top: ${WINDOW.top + WINDOW.height}px; width: ${FILM.width}px; height: ${FILM.height - WINDOW.top - WINDOW.height}px; background: ${COLOR.ink}; opacity: 0; }
    #${id}-mask { position: absolute; left: 0; top: 0; width: ${WINDOW.width}px; height: ${WINDOW.height}px; border-radius: ${WINDOW.radius}px; overflow: hidden; }
    ${m.css}
    ${o.css}
    ${x.css}
    ${f.css}`;
  const rate = video.rate && video.rate !== 1 ? ` data-playback-rate="${n(video.rate)}"` : "";
  const html = `    <div id="${id}-ground"></div>
    <div id="${id}-cam" data-layout-allow-overflow>
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
