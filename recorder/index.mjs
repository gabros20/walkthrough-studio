// Public surface of the recorder, for adapters and scenes that prefer one import.
export { launchBrowser, contextOptions, encodeMaster, probe, nowWall, sleep } from "./capture.mjs";
export { openSession, Take, SCHEMA, defaultTakesDir, verifyMasterSync, locate } from "./take.mjs";
export { MOTION, moveDuration, controlPoint, power3InOut, bezier, positionOnMove, pointerAt } from "./motion.mjs";
export { typingDelays } from "./rng.mjs";
export { loadConfig, defaultConfig, sessionOptions, loadAdapter, loadScenes, parseArgs, VIEWPORTS } from "./config.mjs";
export { runStep, runSteps, sceneFromSteps } from "./takes/steps.mjs";
export * from "./takes/lib.mjs";
export { contactSheet, uniqueFps } from "./takes/report.mjs";
