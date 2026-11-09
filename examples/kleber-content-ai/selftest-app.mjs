// Self-test of the Kleber adapter (app.mjs) on the generic core, against a mock that copies the
// composer's DOM structure and a routed POST /api/chat (no server, no ports). This proves the
// helper logic only, not the helpers against the real app.
// Usage: node examples/kleber-content-ai/selftest-app.mjs   (take goes to $WALKTHROUGH_TAKES or <repo>/takes)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openSession } from "../../recorder/take.mjs";
import { classifyTurn, guardKeys, REST_GUARD, sendChat, uploadLogo, waitForTurn } from "./app.mjs";

const MOCK = `<!doctype html><html><body style="margin:0;font:15px sans-serif">
<main><section data-pane="chat" style="padding:20px">
  <div id="log"></div>
  <div id="after"></div>
  <form id="f" style="display:flex;gap:8px;margin-top:20px">
    <div style="display:flex;gap:8px;align-items:end;width:600px">
      <textarea id="composer-dock" rows="1" style="flex:1;height:40px"></textarea>
      <button id="send" type="submit" style="cursor:pointer">Send</button>
    </div>
  </form>
  <label>Logo <input type="file" accept="image/png"></label><span id="logo"></span>
</section></main>
<script>
  const f = document.getElementById('f'), ta = document.getElementById('composer-dock');
  let value = '';
  ta.addEventListener('input', () => { value = ta.value; });
  addEventListener('keydown', () => document.documentElement.dataset.uiInput = 'keyboard', true);
  addEventListener('pointerdown', () => document.documentElement.dataset.uiInput = 'pointer', true);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = value; ta.value = ''; value = '';
    const send = document.getElementById('send'); const wrap = send.parentElement;
    const stop = document.createElement('button'); stop.type = 'button'; stop.textContent = 'Stop';
    send.replaceWith(stop);
    await (await fetch('/api/chat', { method: 'POST', body: JSON.stringify({ text }) })).text();
    // automatic resend, like sendAutomaticallyWhen after client tool calls
    await (await fetch('/api/chat', { method: 'POST', body: '{}' })).text();
    stop.replaceWith(send);
    if (text.includes('ask')) {
      document.getElementById('after').innerHTML = '<div role="group" aria-label="x"><button type="button">A</button><button type="button">B</button></div>';
    } else {
      document.getElementById('after').innerHTML = '<ul class="edge-fade-x" style="display:flex;overflow-x:auto;width:300px;gap:8px;list-style:none;padding:0">' + Array.from({length: 8}, (_, i) => '<li><button style="width:110px">Chip ' + i + '</button></li>').join('') + '</ul>';
    }
  });
  document.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    const r = await fetch('/api/company/logo', { method: 'POST', body: file });
    const id = (await r.json()).id; document.getElementById('logo').innerHTML = id + ' <img width=20 height=20 src="/api/company/logo?v=' + id + '">';
  });
</script></body></html>`;

const session = await openSession({ restGuard: REST_GUARD });
const { page } = session;
await page.route("http://mock.test/**", async (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: MOCK });
  if (url.pathname === "/api/chat") {
    await new Promise((r) => setTimeout(r, 1500));
    return route.fulfill({ contentType: "text/event-stream", body: "data: done\n\n" });
  }
  if (url.pathname === "/api/company/logo" && route.request().method() === "GET") return route.fulfill({ contentType: "image/png", body: fs.readFileSync(logo) });
  if (url.pathname === "/api/company/logo") return route.fulfill({ contentType: "application/json", body: '{"id":"logo1","findings":[]}' });
  return route.fulfill({ status: 404, body: "" });
});
await page.goto("http://mock.test/");
const logo = path.join(os.tmpdir(), `walkthrough-selftest-logo-${process.pid}.png`);
fs.writeFileSync(logo, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

const take = guardKeys(await session.startTake("_selftest-app", { overwrite: true }));
const results = {};
let w = await sendChat(take, "Winter tyre posts", { label: "turn 1" });
results.turn1 = await waitForTurn(take, w, { label: "turn 1 reply" });
w = await sendChat(take, "please ask me", { label: "turn 2" });
results.turn2 = await waitForTurn(take, w, { label: "turn 2 reply" });
results.upload = await uploadLogo(take, logo, { label: "logo", target: page.locator('input[type="file"]'), uploaded: "#logo img" });
results.logoShown = await page.locator("#logo").textContent();
try {
  await take.press("Enter", { label: "enter" });
  results.enterBlocked = false;
} catch {
  results.enterBlocked = true;
}
results.classifyNow = await classifyTurn(page);
const summary = await take.finish({ preset: "veryfast" });
await session.close();
fs.rmSync(logo);
results.sync = summary.masterSync.pass;
console.log(JSON.stringify(results, null, 2));
