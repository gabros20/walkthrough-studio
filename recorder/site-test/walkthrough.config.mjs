// Site-mode test project: a public-website style config with no studio and no adapter code.
// Used by site-test.mjs, which serves recorder/pages/ on a local port and sets the base URL.
export default {
  name: "site-test",
  baseUrl: "http://127.0.0.1:8930", // replaced by site-test.mjs (WALKTHROUGH_BASE_URL)
  viewport: "desktop", // or "phone" (site-test.mjs --viewport phone)
  scenes: "./scenes.json",
  blockUrls: ["**/analytics/**"],
  dismiss: ["#accept"],
  safeArea: { top: 0, bottom: 120, on: ["click", "mark"] },
  session: { heartbeat: true },
  finish: { keepRaw: false, preset: "veryfast" },
  gate: { maxGapMs: 250 },
};
