// One-shot exploration helper (no recording): opens a session with an optional saved browser
// storage state, runs fn(page, session), saves the storage state back.
import fs from "node:fs";
import { openSession } from "../take.mjs";

export async function withSession(fn, { state, save = true, ...opts } = {}) {
  const session = await openSession({
    ...opts,
    storageState: state && fs.existsSync(state) ? state : undefined,
  });
  try {
    return await fn(session.page, session);
  } finally {
    if (state && save) await session.context.storageState({ path: state }).catch(() => {});
    await session.close();
  }
}

/** Short text dump of interactive elements in view, for orientation. */
export async function outline(page, root = "body") {
  return page.evaluate((sel) => {
    const out = [];
    const r0 = document.querySelector(sel);
    for (const el of r0.querySelectorAll("button, a[href], input, textarea, select, [role=button], [role=tab], [role=menuitem], [role=option], [role=radio], [contenteditable=true], h1, h2, h3, img")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
      const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt") || el.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
      const attrs = [...el.attributes].filter((a) => a.name.startsWith("data-") || ["id", "type", "role", "name", "aria-pressed", "aria-selected", "aria-checked", "aria-expanded"].includes(a.name)).map((a) => `${a.name}=${a.value.slice(0, 40)}`).join(" ");
      out.push(`${el.tagName.toLowerCase()} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] "${label}" ${attrs}`);
    }
    return out.join("\n");
  }, root);
}
