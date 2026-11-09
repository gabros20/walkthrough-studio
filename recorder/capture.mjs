// Browser launch, DevTools screencast capture and constant-frame-rate master encoding.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

export const nowWall = () => (performance.timeOrigin + performance.now()) / 1000;
export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));

/**
 * Capture methods, in the order the capture test tries them.
 *  shell  : headless shell (Playwright's default headless). Software GPU (SwiftShader): passed the
 *           synthetic test but fell to 10-14 fps on a real app with backdrop blur.
 *  new    : full Chromium, new headless mode, real GPU. The default.
 *  headed : full Chromium with a visible window.
 */
export async function launchBrowser({ mode = "new", scale = 2, args = [] } = {}) {
  const common = [
    // Screencast frames come at the window's device scale, not the emulated one: force it.
    `--force-device-scale-factor=${scale}`,
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--force-color-profile=srgb",
    ...args,
  ];
  if (mode === "shell") return chromium.launch({ headless: true, args: common });
  if (mode === "new")
    return chromium.launch({ headless: true, channel: "chromium", args: common });
  if (mode === "headed") return chromium.launch({ headless: false, args: common });
  throw new Error(`unknown capture mode ${mode}`);
}

export function contextOptions({ width = 1440, height = 810, scale = 2, ...rest } = {}) {
  return {
    viewport: { width, height },
    screen: { width, height },
    deviceScaleFactor: scale,
    colorScheme: "light",
    reducedMotion: "no-preference",
    forcedColors: "none",
    ...rest,
  };
}

/**
 * Screencast writer. Every frame is acknowledged at once. Frames are slotted by the browser's own
 * timestamp: slot = round((ts - T0) * fps) with T0 = first frame. Only the last frame of each slot
 * is written (one pending frame is held in memory), so disk grows by at most fps frames per second
 * and memory stays flat. Raw JPEG bytes go to raw/frames.bin, one index line per stored frame to
 * raw/frames.ndjson: {"i", "slot", "ts", "off", "len"}.
 */
export class Screencast {
  constructor(cdp, dir, { fps = 60, width, height, quality = 90, everyNthFrame = 1 } = {}) {
    this.everyNthFrame = everyNthFrame;
    this.cdp = cdp;
    this.dir = dir;
    this.fps = fps;
    this.width = width;
    this.height = height;
    this.quality = quality;
    this.T0 = null;
    this.delivered = []; // browser timestamps of every delivered frame (stats)
    this.receivedWall = [];
    this.stored = 0;
    this.offset = 0;
    this.pending = null;
    this.lastSlot = -Infinity; // slot of the last frame written (slots in frames.ndjson only increase)
    this.firstFrame = null;
    this.stopped = false;
    this.listeners = new Set();
  }

  async start() {
    fs.mkdirSync(path.join(this.dir, "raw"), { recursive: true });
    this.binFd = fs.openSync(path.join(this.dir, "raw", "frames.bin"), "w");
    this.idxFd = fs.openSync(path.join(this.dir, "raw", "frames.ndjson"), "w");
    this.firstFrame = new Promise((resolve) => {
      this._resolveFirst = resolve;
    });
    await this.attach(this.cdp);
  }

  /** Listen to one CDP session's frames and start its screencast (frames are acked on that session). */
  async attach(cdp) {
    this.cdp = cdp;
    this._onFrame = (f) => this.onFrame(f, cdp);
    cdp.on("Page.screencastFrame", this._onFrame);
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: this.quality,
      maxWidth: this.width,
      maxHeight: this.height,
      everyNthFrame: this.everyNthFrame,
    });
  }

  /**
   * Move the screencast to another page (a followed popup) mid-take: same writer, same T0, same
   * slots. Frame timestamps are system-clock seconds in every renderer, so the clock carries over;
   * until the new page paints, the master holds the old page's last frame (a hard cut).
   */
  async switchTo(cdp) {
    if (this.stopped || cdp === this.cdp) return;
    const old = this.cdp;
    old.off("Page.screencastFrame", this._onFrame);
    await old.send("Page.stopScreencast").catch(() => {});
    await this.attach(cdp);
    this.switches = (this.switches ?? 0) + 1;
  }

  onFrame(f, cdp = this.cdp) {
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    if (this.stopped) return;
    const recv = nowWall();
    const ts = f.metadata.timestamp ?? recv;
    if (this.T0 === null) {
      this.T0 = ts;
      this._resolveFirst({ ts, recv });
    }
    this.delivered.push(ts);
    this.receivedWall.push(recv);
    const slot = Math.round((ts - this.T0) * this.fps);
    const frame = { ts, slot, data: f.data, recv };
    if (this.pending && ts < this.pending.ts) {
      // Out of order: the browser delivered a frame older than the one held (seen under heavy CPU
      // load, about 1 in 10 frames with two takes recording at once). It never replaces the newer
      // held frame (that could be a sync flash): it is written first when its slot lies between the
      // last written slot and the held one, and dropped otherwise (its slot is already shown).
      this.outOfOrder = (this.outOfOrder ?? 0) + 1;
      if (slot > this.lastSlot && slot < this.pending.slot) this.write(frame);
    } else {
      if (this.pending && slot > this.pending.slot) this.write(this.pending);
      this.pending = frame;
    }
    for (const l of this.listeners) l(frame);
  }

  write(frame) {
    const buf = Buffer.from(frame.data, "base64");
    fs.writeSync(this.binFd, buf);
    const line = JSON.stringify({
      i: this.stored,
      slot: frame.slot,
      ts: frame.ts,
      off: this.offset,
      len: buf.length,
    });
    fs.writeSync(this.idxFd, `${line}\n`);
    this.offset += buf.length;
    this.stored++;
    this.lastSlot = frame.slot;
  }

  /** Subscribe to frames as they arrive (used for sync-flash detection). */
  onEachFrame(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async stop() {
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    this.stopped = true;
    this.cdp.off("Page.screencastFrame", this._onFrame);
    if (this.pending) this.write(this.pending);
    this.pending = null;
    fs.closeSync(this.binFd);
    fs.closeSync(this.idxFd);
    const stats = deliveryStats([...this.delivered].sort((a, b) => a - b));
    // Node receive time minus browser frame timestamp, early vs late: a direct read of clock drift
    // between the frame clock and the action clock (both should be the system clock).
    const off = this.receivedWall.map((r, i) => r - this.delivered[i]);
    const med = (a) => {
      const s2 = [...a].sort((x, y) => x - y);
      return s2[s2.length >> 1];
    };
    if (off.length > 20) {
      const n = Math.min(120, off.length >> 1);
      stats.recvMinusTsStartMs = Math.round(med(off.slice(0, n)) * 1e5) / 100;
      stats.recvMinusTsEndMs = Math.round(med(off.slice(-n)) * 1e5) / 100;
    }
    fs.writeFileSync(
      path.join(this.dir, "raw", "delivered.json"),
      JSON.stringify({ T0: this.T0, ts: this.delivered }),
    );
    return { T0: this.T0, stored: this.stored, bytes: this.offset, ...(this.switches ? { pageSwitches: this.switches } : {}), ...(this.outOfOrder ? { outOfOrderFrames: this.outOfOrder } : {}), ...stats };
  }
}

export function deliveryStats(ts) {
  if (ts.length < 2) return { delivered: ts.length };
  const gaps = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    delivered: ts.length,
    deliveredFps: (ts.length - 1) / (ts.at(-1) - ts[0]),
    deliveryGapMedianMs: sorted[sorted.length >> 1] * 1000,
    deliveryGapP99Ms: sorted[Math.floor(sorted.length * 0.99)] * 1000,
    deliveryGapMaxMs: sorted.at(-1) * 1000,
  };
}

export function readIndex(dir) {
  const text = fs.readFileSync(path.join(dir, "raw", "frames.ndjson"), "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

/**
 * Write a constant-frame-rate H.264 master from the stored frames. Slot s of the output shows the
 * last stored frame whose slot <= s (static stretches hold the last frame). `lastSlot` is the final
 * output slot (inclusive). If `fps` differs from the capture rate, frames are re-slotted from their
 * timestamps: slot = round((ts - T0) * fps).
 */
export async function encodeMaster({
  dir,
  out = path.join(dir, "master.mp4"),
  fps = 60,
  T0,
  lastSlot,
  crf = 12,
  preset = "medium",
  log = () => {},
}) {
  const index = readIndex(dir);
  if (!index.length) throw new Error("no frames captured");
  const slots = index.map((f) => Math.round((f.ts - T0) * fps));
  const end = lastSlot ?? slots.at(-1);
  const fd = fs.openSync(path.join(dir, "raw", "frames.bin"), "r");
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-c:v",
    "mjpeg",
    "-i",
    "-",
    "-vf",
    // Chrome's JPEGs are full-range BT.601 YCbCr; the master is limited-range BT.709.
    "scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bicubic,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv",
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    String(crf),
    "-g",
    String(fps),
    "-pix_fmt",
    "yuv420p",
    "-colorspace",
    "bt709",
    "-color_primaries",
    "bt709",
    "-color_trc",
    "bt709",
    "-color_range",
    "tv",
    "-r",
    String(fps),
    "-fps_mode",
    "cfr",
    "-movflags",
    "+faststart",
    out,
  ];
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((resolve, reject) => {
    ff.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    ff.on("error", reject);
  });
  const write = (buf) =>
    new Promise((resolve) => {
      if (ff.stdin.write(buf)) resolve();
      else ff.stdin.once("drain", resolve);
    });
  let k = 0; // next stored frame to consider
  let current = null;
  let currentIdx = -1;
  let duplicated = 0;
  for (let s = 0; s <= end; s++) {
    let pick = currentIdx;
    while (k < index.length && slots[k] <= s) pick = k++;
    if (pick < 0) pick = 0; // before the first frame: show the first frame
    if (pick !== currentIdx) {
      const f = index[pick];
      current = Buffer.allocUnsafe(f.len);
      fs.readSync(fd, current, 0, f.len, f.off);
      currentIdx = pick;
    } else duplicated++;
    await write(current);
    if (s % (fps * 30) === 0 && s) log(`encode ${(s / fps).toFixed(0)} s`);
  }
  ff.stdin.end();
  await done;
  fs.closeSync(fd);
  return { out, frames: end + 1, fps, duplicatedSlots: duplicated };
}

/** Decode a video (or part of it) to raw frames, calling onFrame(buffer, index) for each. */
export function decodeFrames(file, { width, height, pix = "rgb24", vf = "", ss, t, frames } = {}, onFrame) {
  const bpp = pix === "gray" ? 1 : 3;
  const size = width * height * bpp;
  const args = ["-hide_banner", "-loglevel", "error"];
  if (ss !== undefined) args.push("-ss", String(ss));
  args.push("-i", file);
  if (t !== undefined) args.push("-t", String(t));
  if (frames !== undefined) args.push("-frames:v", String(frames));
  const scale = `scale=${width}:${height}:in_color_matrix=bt709:in_range=tv:out_range=pc:flags=area+accurate_rnd+full_chroma_int`;
  args.push("-vf", vf ? `${vf},${scale}` : scale, "-pix_fmt", pix, "-f", "rawvideo", "-");
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "inherit"] });
    const frame = Buffer.allocUnsafe(size);
    let fill = 0;
    let n = 0;
    ff.stdout.on("data", (chunk) => {
      let o = 0;
      while (o < chunk.length) {
        const k = Math.min(size - fill, chunk.length - o);
        chunk.copy(frame, fill, o, o + k);
        fill += k;
        o += k;
        if (fill === size) {
          onFrame(frame, n++);
          fill = 0;
        }
      }
    });
    ff.on("exit", (code) => (code === 0 ? resolve(n) : reject(new Error(`ffmpeg decode exit ${code}`))));
    ff.on("error", reject);
  });
}

/** Decode JPEG buffers (e.g. raw screencast frames) to tiny RGB thumbnails. */
export function decodeJpegs(buffers, { width = 16, height = 9 } = {}) {
  return new Promise((resolve, reject) => {
    const size = width * height * 3;
    const ff = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-i",
        "-",
        "-vf",
        `scale=${width}:${height}:flags=area`,
        "-pix_fmt",
        "rgb24",
        "-f",
        "rawvideo",
        "-",
      ],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    const chunks = [];
    ff.stdout.on("data", (c) => chunks.push(c));
    ff.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg jpeg decode exit ${code}`));
      const all = Buffer.concat(chunks);
      const out = [];
      for (let o = 0; o + size <= all.length; o += size) out.push(all.subarray(o, o + size));
      resolve(out);
    });
    ff.on("error", reject);
    for (const b of buffers) ff.stdin.write(b);
    ff.stdin.end();
  });
}

/** True when every pixel of an RGB thumbnail is close to the flash colour. */
export function isFlash(rgb, color = [0, 255, 0], tol = 60) {
  for (let i = 0; i < rgb.length; i += 3) {
    if (
      Math.abs(rgb[i] - color[0]) > tol ||
      Math.abs(rgb[i + 1] - color[1]) > tol ||
      Math.abs(rgb[i + 2] - color[2]) > tol
    )
      return false;
  }
  return true;
}

export function probe(file) {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_packets",
      "-show_entries",
      "stream=width,height,r_frame_rate,avg_frame_rate,nb_read_packets,pix_fmt,color_space,color_transfer,color_primaries,color_range,codec_name:format=duration,size",
      "-of",
      "json",
      file,
    ]);
    let s = "";
    ff.stdout.on("data", (c) => (s += c));
    ff.on("exit", (code) => {
      if (code !== 0) return reject(new Error("ffprobe failed"));
      const j = JSON.parse(s);
      resolve({ ...j.streams[0], ...j.format });
    });
  });
}
