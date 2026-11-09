// A small argument parser for command files (zero dependencies).
//
//   parseArgs(argv, { boolean: ["dry", ...], string: ["out", ...] }) -> { opts, positional, unknown }
//     --flag / --no-flag       boolean (opts.flag = true / false)
//     --key value / --key=val  string
//     -h                       same as --help
//     --                       everything after it is positional
//     unknown --flags are collected verbatim in `unknown` (with their value when the next token is
//     not a flag), so a wrapper can pass them through to the tool it runs.
//   num(value, name) -> number   (throws CliError when not a number)
import { CliError } from "./project.mjs";

export function parseArgs(argv, { boolean = [], string = [] } = {}) {
  const B = new Set([...boolean, "help"]);
  const S = new Set(string);
  const opts = {};
  const positional = [];
  const unknown = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a === "-h") {
      opts.help = true;
      continue;
    }
    if (!a.startsWith("--") || a === "--") {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
    if (B.has(key)) {
      opts[key] = eq > 0 ? !/^(false|0|no)$/i.test(a.slice(eq + 1)) : true;
    } else if (key.startsWith("no-") && B.has(key.slice(3))) {
      opts[key.slice(3)] = false;
    } else if (S.has(key)) {
      if (eq > 0) opts[key] = a.slice(eq + 1);
      else if (i + 1 < argv.length) opts[key] = argv[++i];
      else throw new CliError(`--${key} needs a value`, 2);
    } else {
      unknown.push(a);
      if (eq < 0 && i + 1 < argv.length && !argv[i + 1].startsWith("--")) unknown.push(argv[++i]);
    }
  }
  return { opts, positional, unknown };
}

export function num(v, name) {
  const n = Number(v);
  if (v === undefined || v === null || v === "" || !Number.isFinite(n)) throw new CliError(`--${name} must be a number (got "${v}")`, 2);
  return n;
}
