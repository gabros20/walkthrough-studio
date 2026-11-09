// Recorder config for the Brightpost walkthrough (the project this toolkit came from).
// Relative paths resolve against this file. Environment variables and runner flags override:
// WALKTHROUGH_BASE_URL / --base-url, WALKTHROUGH_TAKES / --takes, WALKTHROUGH_STORAGE / --storage,
// WALKTHROUGH_MODE / --mode, STUDIO_CONFIG / --studio-config.
//
//   node recorder/takes/run.mjs --config examples/brightpost/walkthrough.config.mjs 2 3
import os from "node:os";
import path from "node:path";

// The studio instance folder (outside this repo): tree/, data/, checkpoints/, takes/, run/.
const STUDIO = process.env.BRIGHTPOST_STUDIO ?? path.join(os.homedir(), "Projects/brightpost-studio");

export default {
  name: "brightpost",
  baseUrl: "http://localhost:3011", // the studio's production web build, not the dev server (:3000)
  viewport: "desktop", // 1440x810 @2. "phone" = 390x844 @3 with mobile emulation; or { width, height } + scale
  fps: 60,
  // Site-mode keys, unused here (this is an owned app in a studio sandbox; nothing to block, no banners):
  // blockUrls: ["**/googletagmanager.com/**", "**/widget.intercom.io/**"],
  // dismiss: ["#onetrust-accept-btn-handler", { role: "button", name: "Accept all" }],
  // The takes were recorded before the safe band existed. To re-record them exactly, keep the
  // automatic safe scroll off; new projects keep the default (on for clicks and marks).
  safeArea: { top: 0, bottom: 120, on: [] },
  takesDir: path.join(STUDIO, "takes"),
  adapter: "./app.mjs",
  scenes: "./scenes.mjs",
  session: {
    mode: "new",
    heartbeat: true,
    calibrationDot: false,
    pointerStart: { x: 1080, y: 850 }, // 40 px below the viewport: the pointer enters from off-screen
    restGuard: { selector: ".edge-fade-x", zone: 56, margin: 8 },
    context: { permissions: ["clipboard-read", "clipboard-write"] },
  },
  finish: { keepRaw: false, crf: 12, preset: "medium" },
  reload: { path: "/", settleMs: 2500 },
  studio: {
    bin: "../../studio/bin",
    config: "./studio.config.sh",
    checkpointsDir: path.join(STUDIO, "checkpoints"),
  },
  project: {
    studioRoot: STUDIO,
    // A one-time sign-in link for the demo shop owner, written by the provisioning step at CP0.
    // Secret and single use: keep it out of git (it is read only by take 1's pre step).
    linkFile: path.join(STUDIO, "link.txt"),
    logoFile: path.join(STUDIO, "assets", "harbor-logo.png"),
  },
};
