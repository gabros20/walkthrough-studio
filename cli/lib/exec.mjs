// Running the kit's tools from the CLI. Every command prints what it runs (one line, prefixed "›")
// before running it, so the CLI is a convenience and never the only way: the printed line can be
// pasted into a shell as is.
//
//   exec(cmd, args, { cwd, env, inherit = true, quiet = false, maxCapture }) -> Promise<{ code, stdout, stderr }>
//     inherit = true:  stdin and stderr are the terminal's; stdout is shown live AND captured (the
//                      last `maxCapture` bytes, 4 MB by default) so a command can parse a summary line
//     inherit = false: stdout and stderr are captured, nothing is shown
//     env:             merged over process.env; the keys given here are shown in the "›" line
//                      (values of names that look secret are masked)
//     cwd:             shown as "cd <dir> &&" when it differs from the current directory
//   capture(cmd, args, { cwd, env, timeout }) -> { code, stdout, stderr }   synchronous, prints nothing
//                      (probes such as `ffmpeg -filters`; doctor uses it)
//   which(bin) -> absolute path | null
//   formatCommand(cmd, args, { cwd, env }) -> the "›" line without the prefix
//   quote(arg) -> shell-quoted arg
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";

const SECRET = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)/i;

export function quote(a) {
  const s = String(a);
  if (s === "") return "''";
  return /^[\w@%+=:,./^-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

export function formatCommand(cmd, args = [], { cwd, env } = {}) {
  const parts = [];
  if (cwd && resolve(cwd) !== process.cwd()) parts.push(`cd ${quote(cwd)} &&`);
  for (const [k, v] of Object.entries(env ?? {})) {
    if (v === undefined) continue;
    parts.push(`${k}=${SECRET.test(k) ? "***" : quote(v)}`);
  }
  // the running node is shown as "node" (the line stays pasteable and short)
  parts.push(cmd === process.execPath ? "node" : quote(cmd), ...args.map(quote));
  return parts.join(" ");
}

/** Print the "›" line for a command (also used by commands that do the work in-process). */
export function announce(cmd, args = [], opts = {}) {
  console.log(`› ${formatCommand(cmd, args, opts)}`);
}

export function exec(cmd, args = [], { cwd, env, inherit = true, quiet = false, maxCapture = 4 * 1024 * 1024 } = {}) {
  if (!quiet) announce(cmd, args, { cwd, env });
  return new Promise((done) => {
    let child;
    try {
      child = spawn(cmd, args, {
        cwd: cwd ? resolve(cwd) : undefined,
        env: { ...process.env, ...(env ?? {}) },
        stdio: inherit ? ["inherit", "pipe", "inherit"] : ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      return done({ code: 127, stdout: "", stderr: String(err?.message ?? err) });
    }
    const out = [];
    const err = [];
    let outBytes = 0;
    child.stdout.on("data", (b) => {
      if (inherit) process.stdout.write(b);
      out.push(b);
      outBytes += b.length;
      while (outBytes > maxCapture && out.length > 1) outBytes -= out.shift().length;
    });
    child.stderr?.on("data", (b) => err.push(b));
    child.on("error", (e) => done({ code: 127, stdout: Buffer.concat(out).toString("utf8"), stderr: `${e.message}\n` }));
    child.on("close", (code, signal) => {
      done({
        code: code ?? (signal === "SIGINT" ? 130 : signal ? 128 : 1),
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      });
    });
  });
}

export function capture(cmd, args = [], { cwd, env, timeout = 60_000 } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    encoding: "utf8",
    timeout,
    maxBuffer: 32 * 1024 * 1024,
  });
  return { code: r.error ? 127 : (r.status ?? 1), stdout: r.stdout ?? "", stderr: r.stderr ?? (r.error ? r.error.message : "") };
}

export function which(bin) {
  if (isAbsolute(bin)) return existsSync(bin) ? bin : null;
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, bin);
    if (existsSync(p)) return p;
  }
  return null;
}
