// ElevenLabs REST calls shared by voiceover/tts.mjs and sound/generate-music.mjs. Zero dependencies
// (Node 22 fetch). The key comes from ELEVENLABS_API_KEY and is never printed or written anywhere.
//
// Endpoints (checked against the ElevenLabs API reference on 9 November 2026, see docs/ELEVENLABS.md):
//   POST /v1/text-to-speech/{voice_id}?output_format=…   body { text, model_id }          -> audio bytes
//   POST /v1/music?output_format=…                        body { prompt, music_length_ms,
//                                                               force_instrumental, model_id } -> audio bytes
//
// Mock mode, for tests and dry runs (no network, no credits):
//   ELEVENLABS_MOCK=1    prints each request (key redacted) and returns a short silent MP3 made with
//                        ffmpeg anullsrc; a TTS mock gets a tone as long as the text would take to say,
//                        so placement and lengths can be checked
//   ELEVENLABS_MOCK=say  TTS only: speaks the text with macOS `say` (real words, so the transcription
//                        and listening checks have something to hear); music falls back to silence
//   ELEVENLABS_MOCK_FILE=<mp3>  return this file instead
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const API = "https://api.elevenlabs.io";
export const hasKey = () => Boolean(process.env.ELEVENLABS_API_KEY);
export const mockMode = () => process.env.ELEVENLABS_MOCK || "";

/** Duration in seconds of an audio file (ffprobe), or NaN when it is not audio. */
export function probeDuration(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { encoding: "utf8" });
  return r.status === 0 ? parseFloat(r.stdout.trim()) : NaN;
}

/** Append one cost row to a JSONL ledger; the CLI folds these into state.json (by id, once). */
export function appendCost(file, row) {
  mkdirSync(dirname(file), { recursive: true });
  const full = { id: `${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`, at: new Date().toISOString(), amount: null, ...row };
  appendFileSync(file, JSON.stringify(full) + "\n");
  return full;
}

function ff(args) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

/** The bytes a mock request returns. */
function mockAudio(kind, body) {
  if (process.env.ELEVENLABS_MOCK_FILE) return readFileSync(process.env.ELEVENLABS_MOCK_FILE);
  const dir = mkdtempSync(join(tmpdir(), "el-mock-"));
  const out = join(dir, "mock.mp3");
  const words = kind === "tts" ? (body.text.match(/\S+/g) || []).length : 0;
  if (kind === "tts" && mockMode() === "say") {
    const r = spawnSync("say", ["-o", join(dir, "say.aiff"), body.text]);
    if (r.status !== 0) throw new Error("ELEVENLABS_MOCK=say needs macOS `say`");
    ff(["-i", join(dir, "say.aiff"), "-af", "adelay=120|120,apad=pad_dur=0.2", "-ar", "44100", "-ac", "1", "-b:a", "128k", out]);
  } else if (kind === "tts") {
    // a 220 Hz tone as long as the line would take (2.6 words a second), with 0.12 s silence each side
    const d = Math.max(0.4, words / 2.6).toFixed(3);
    ff(["-f", "lavfi", "-i", `sine=frequency=220:sample_rate=44100:duration=${d}`, "-af", "volume=0.3,adelay=120|120,apad=pad_dur=0.12", "-ac", "1", "-b:a", "128k", out]);
  } else {
    // music: a tiny valid MP3 (1 s of silence); the caller then sees a short take, as with the real model
    ff(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", "1", "-b:a", "128k", out]);
  }
  return readFileSync(out);
}

/**
 * POST JSON to an ElevenLabs endpoint and return the audio bytes.
 * Throws with the API's error message (never the key) when the answer is not audio.
 */
export async function postAudio(path, query, body, { kind, log = console.log } = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== "")).toString();
  const url = `${API}${path}${qs ? `?${qs}` : ""}`;
  const headers = { "Content-Type": "application/json", Accept: "audio/mpeg" };
  if (mockMode()) {
    log(`[mock] POST ${url}`);
    log(`[mock] headers: xi-api-key: <${hasKey() ? "set, redacted" : "not set"}>, Content-Type: application/json, Accept: audio/mpeg`);
    log(`[mock] body: ${JSON.stringify(body)}`);
    return mockAudio(kind, body);
  }
  if (!hasKey()) throw new Error("ELEVENLABS_API_KEY is not set");
  const res = await fetch(url, { method: "POST", headers: { ...headers, "xi-api-key": process.env.ELEVENLABS_API_KEY }, body: JSON.stringify(body) });
  const type = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || !/^audio\//.test(type)) {
    let msg = buf.toString("utf8").slice(0, 400);
    try { const j = JSON.parse(buf.toString("utf8")); msg = JSON.stringify(j.detail ?? j).slice(0, 400); } catch {}
    throw new Error(`ElevenLabs ${res.status} ${res.statusText} (${type || "no content type"}): ${msg}`);
  }
  return buf;
}

/** Write bytes and check ffprobe can read them as audio; returns the duration in seconds. */
export function saveAudio(file, bytes) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  const d = probeDuration(file);
  if (!(d > 0)) throw new Error(`${file} is not readable audio (ffprobe); the response may have been an error body`);
  return d;
}

