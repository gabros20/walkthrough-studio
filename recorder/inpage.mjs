// Code that runs inside every document of a take (installed with context.addInitScript).
// It never changes what the app does: overlays are pointer-events:none and are skipped by hit tests.

export function installRecorderPage(opts) {
  if (window.__rec) return;
  const FLASH_ID = "__rec-flash";
  const DOT_ID = "__rec-dot";
  const Z = "2147483647";
  let dotOn = !!opts.dot;
  let dot = null;
  let last = null; // last mouse position seen by the page
  let lastCursor = null;

  const editable = (el) => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === "TEXTAREA") return !el.disabled;
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return (
        !el.disabled &&
        [
          "text",
          "search",
          "email",
          "url",
          "tel",
          "password",
          "number",
        ].includes(t)
      );
    }
    return false;
  };

  /** What the pointer looks like at (x, y): the computed CSS cursor plus a resolved kind. */
  function cursorAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return { raw: "none-element", kind: "default" };
    const raw = getComputedStyle(el).cursor || "auto";
    let kind = raw;
    if (raw === "auto") {
      if (editable(el)) kind = "text";
      else {
        // Chrome shows an I-beam over selectable text with cursor:auto.
        let overText = false;
        const r = document.caretRangeFromPoint?.(x, y);
        const node = r?.startContainer;
        if (node && node.nodeType === 3 && node.textContent.trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (
              x >= rect.left &&
              x <= rect.right &&
              y >= rect.top &&
              y <= rect.bottom
            ) {
              overText = getComputedStyle(node.parentElement).userSelect !== "none";
              break;
            }
          }
        }
        kind = overText ? "text" : "default";
      }
    } else if (raw === "default" || raw === "inherit" || raw === "initial")
      kind = "default";
    return { raw, kind };
  }

  function ensureDot() {
    if (dot || !document.body) return dot;
    dot = document.createElement("div");
    dot.id = DOT_ID;
    dot.setAttribute("aria-hidden", "true");
    dot.style.cssText = `position:fixed;left:0;top:0;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#ff00ff;pointer-events:none;z-index:${Z};transform:translate(-100px,-100px);will-change:transform;contain:strict`;
    document.documentElement.appendChild(dot);
    return dot;
  }

  function placeDot() {
    if (!dotOn || !last) return;
    const d = ensureDot();
    if (d) d.style.transform = `translate(${last.x}px,${last.y}px)`;
  }

  function onMove(e) {
    last = { x: e.clientX, y: e.clientY };
    placeDot();
    const c = cursorAt(e.clientX, e.clientY);
    if (!lastCursor || c.kind !== lastCursor.kind || c.raw !== lastCursor.raw) {
      lastCursor = c;
      try {
        window.__recCursor?.({ ...c, x: e.clientX, y: e.clientY });
      } catch {}
    }
  }
  window.addEventListener("mousemove", onMove, { capture: true, passive: true });

  // Last DOM mutation (wall-clock ms), for waitQuiet. The recorder's own elements (flash, dot,
  // heartbeat: ids starting "__rec") are ignored, so they never keep a page "busy".
  let lastMutation = performance.timeOrigin + performance.now();
  const own = (n) => n && n.nodeType === 1 && typeof n.id === "string" && n.id.startsWith("__rec");
  try {
    new MutationObserver((list) => {
      for (const m of list) {
        if (own(m.target)) continue;
        if (m.type === "childList" && [...m.addedNodes, ...m.removedNodes].every(own)) continue;
        lastMutation = performance.timeOrigin + performance.now();
        return;
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  } catch {}

  window.__rec = {
    cursorAt,
    /** Wall-clock ms of the last DOM mutation not made by the recorder. */
    lastMutation: () => lastMutation,
    /** Tell a freshly loaded document where the mouse already is (no event fires on load). */
    knowMouse(x, y) {
      last = { x, y };
      placeDot();
    },
    setDot(on) {
      dotOn = !!on;
      if (!dotOn && dot) dot.style.transform = "translate(-100px,-100px)";
      placeDot();
    },
    /** Full-screen solid flash for `ms` milliseconds (sync marker). */
    flash(color, ms) {
      const f = document.createElement("div");
      f.id = FLASH_ID;
      // Below the heartbeat (z-index max - 1), and its own colour alternates by one step every frame:
      // a frame with no visible damage may not be sent by the screencast at all.
      f.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:${color};pointer-events:none;z-index:2147483646`;
      document.documentElement.appendChild(f);
      // Into the top layer when possible, so a modal <dialog> or popover cannot cover the flash.
      try {
        f.popover = "manual";
        f.showPopover();
      } catch {}
      // Remove only after the flash has been on screen for `ms` and at least 6 frames, counted in
      // animation frames: a timer alone could fire before the first paint if the main thread is busy.
      let start = null;
      let frames = 0;
      const tick = (ts) => {
        frames++;
        start ??= ts;
        f.style.opacity = frames % 2 ? "0.999" : "1";
        if (ts - start >= ms && frames >= 7) f.remove();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    /**
     * Flash at the next idle moment of the main thread; resolves with the wall-clock time (ms,
     * system clock) at which the flash was inserted, so latency excludes CDP and queueing delay.
     */
    flashWhenIdle(color, ms) {
      return new Promise((resolve) =>
        requestIdleCallback(
          () => {
            const t = performance.timeOrigin + performance.now();
            window.__rec.flash(color, ms);
            resolve(t);
          },
          { timeout: 2000 },
        ),
      );
    },
    /** Nearest scrollable ancestor at a point (for scroll logging). */
    scrollerAt(x, y) {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.documentElement) {
        const s = getComputedStyle(el);
        const can =
          (/(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
          (/(auto|scroll|overlay)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1);
        if (can) break;
        el = el.parentElement;
      }
      const root = !el || el === document.documentElement || el === document.body;
      const target = root ? document.scrollingElement : el;
      const r = root
        ? { x: 0, y: 0, width: innerWidth, height: innerHeight }
        : el.getBoundingClientRect();
      return {
        root,
        scrollLeft: target.scrollLeft,
        scrollTop: target.scrollTop,
        box: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
    },
    /** Faded horizontal rows whose edge zone contains (x, y): the hover-scroll trap. */
    edgeZones(x, y, selector, zone) {
      const hits = [];
      for (const el of document.querySelectorAll(selector)) {
        const max = el.scrollWidth - el.clientWidth;
        if (max <= 0) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top || y > r.bottom || x < r.left || x > r.right) continue;
        const pos = el.scrollLeft;
        const startFaded = pos > 1;
        const endFaded = pos < max - 1;
        hits.push({
          box: { x: r.x, y: r.y, width: r.width, height: r.height },
          inStart: startFaded && x - r.left < zone,
          inEnd: endFaded && r.right - x < zone,
          startFaded,
          endFaded,
        });
      }
      return hits;
    },
  };
  // Heartbeat: a 1x1 CSS px element in the top-left corner with a compositor-driven opacity
  // animation, so the screencast gets a damaged frame on every display refresh even on a still page
  // and even while the page's main thread is busy. A missing frame is then a capture stall, not a
  // still or blocked page. The corner pixel is clipped by the film's rounded window corner.
  if (opts.heartbeat) {
    const install = () => {
      if (document.getElementById("__rec-hb")) return;
      const st = document.createElement("style");
      st.textContent = "@keyframes __rec_hb{from{opacity:.02}to{opacity:.06}}";
      document.documentElement.appendChild(st);
      const hb = document.createElement("div");
      hb.id = "__rec-hb";
      hb.setAttribute("aria-hidden", "true");
      hb.style.cssText = `position:fixed;left:0;top:0;width:1px;height:1px;background:#808080;pointer-events:none;z-index:${Z};contain:strict;will-change:opacity;animation:__rec_hb 0.5s linear infinite alternate`;
      document.documentElement.appendChild(hb);
    };
    if (document.documentElement) install();
    else document.addEventListener("readystatechange", install, { once: true });
  }
  if (dotOn) {
    if (document.body) ensureDot();
    else document.addEventListener("DOMContentLoaded", ensureDot, { once: true });
  }
}

/**
 * popups: "same-tab" (installed with context.addInitScript when the config asks for it). Links and
 * forms with a target that opens a new browsing context, and window.open(url), navigate the same
 * page instead, so the screencast never loses the page. Each one is reported to the recorder
 * (binding __recPopup) before the navigation starts, so the nav event that follows carries
 * popup: "same-tab". Downloads (<a download>) and window.open() with no URL are left alone; a
 * popup that still opens is closed by the recorder and its URL opened in the same page.
 */
export function installPopupPolicy() {
  if (window.__recPopups) return;
  window.__recPopups = true;
  const report = (url, via) => {
    try {
      window.__recPopup?.({ url: String(url), via });
    } catch {}
  };
  const opensNew = (t) => !!t && !/^_(self|parent|top)$/i.test(t);
  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = e.composedPath?.().find((n) => n?.tagName === "A" || n?.tagName === "AREA");
      if (!a || !a.href || a.hasAttribute("download") || !opensNew(a.getAttribute("target"))) return;
      a.setAttribute("target", "_self");
      report(a.href, "link");
    },
    true,
  );
  document.addEventListener(
    "submit",
    (e) => {
      const f = e.target;
      if (!(f instanceof HTMLFormElement) || !opensNew(f.getAttribute("target"))) return;
      f.setAttribute("target", "_self");
      report(f.action || location.href, "form");
    },
    true,
  );
  const open = window.open;
  window.open = function (url, ...rest) {
    if (url === undefined || url === null || url === "" || String(url) === "about:blank") return open.call(this, url, ...rest);
    const abs = new URL(String(url), location.href).href;
    report(abs, "window.open");
    location.assign(abs);
    return window;
  };
}
