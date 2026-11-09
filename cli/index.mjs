// The `walkthrough` CLI: a command registry by directory (docs/CLI.md).
//
// Every file in cli/commands/*.mjs default-exports { name, describe, usage, run(argv, ctx) }. The
// loader reads the directory at start and sorts by name; a module that fails to import is skipped
// with one warning line, so one broken command never takes the others down. Adding a command is
// adding a file.
//
// ctx = {
//   kit: { root },
//   project: { dir, name, config, configFile, configError, state, save(), paths } | null,
//   log: { info, warn, error },
//   exec(cmd, args, { cwd, env, inherit = true }) -> Promise<{ code, stdout, stderr }>  (prints "› <command>")
// }
// run() returns the exit code (undefined = 0). A thrown CliError prints its message and exits with
// its code; anything else prints the stack and exits 1.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { exec } from "./lib/exec.mjs";
import { CliError, findProjectDir, KIT_ROOT, loadProject } from "./lib/project.mjs";

const log = {
  info: (...a) => console.log(...a),
  warn: (...a) => console.error("warning:", ...a),
  error: (...a) => console.error("error:", ...a),
};

async function loadCommands() {
  const dir = join(KIT_ROOT, "cli", "commands");
  let files = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".mjs")).sort();
  } catch {
    return [];
  }
  const cmds = [];
  for (const f of files) {
    try {
      const mod = await import(pathToFileURL(join(dir, f)).href);
      const c = mod.default;
      if (!c || typeof c.run !== "function" || !c.name) throw new Error("default export needs { name, describe, usage, run }");
      cmds.push(c);
    } catch (err) {
      console.error(`walkthrough: skipped cli/commands/${f}: ${String(err?.message ?? err).split("\n")[0]}`);
    }
  }
  return cmds.sort((a, b) => a.name.localeCompare(b.name));
}

/** Take the global --project <dir> / --project=<dir> out of argv (it may stand anywhere). */
function takeProjectFlag(argv) {
  const rest = [];
  let project = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      rest.push(...argv.slice(i));
      break;
    }
    if (a === "--project") {
      if (i + 1 >= argv.length) throw new CliError("--project needs a folder", 2);
      project = argv[++i];
    } else if (a.startsWith("--project=")) project = a.slice("--project=".length);
    else rest.push(a);
  }
  return { project, rest };
}

function version() {
  try {
    return JSON.parse(readFileSync(join(KIT_ROOT, "package.json"), "utf8")).version;
  } catch {
    return "?";
  }
}

function help(cmds, project) {
  const w = Math.max(8, ...cmds.map((c) => c.name.length));
  console.log(`walkthrough ${version()}: one CLI over the walkthrough-studio kit

usage: walkthrough <command> [args] [--project <dir>]
       walkthrough <command> --help
       walkthrough help --all     (every command's usage, as Markdown)

commands:
${cmds.map((c) => `  ${c.name.padEnd(w)}  ${c.describe ?? ""}`).join("\n")}

kit:     ${KIT_ROOT}
project: ${project ? `${project.dir}` : "none (run inside a project folder, or --project <dir>, or WALKTHROUGH_PROJECT)"}
Every command prints the command it runs ("› ..."); reference: docs/CLI.md`);
}

export async function main(argv) {
  let code = 0;
  try {
    const { project: projectFlag, rest } = takeProjectFlag(argv);
    const cmds = await loadCommands();
    const [name, ...args] = rest;
    const wantsHelp = !name || name === "help" || name === "--help" || name === "-h";
    if (name === "--version" || name === "-v" || name === "version") {
      console.log(version());
      return 0;
    }
    let project = null;
    const found = findProjectDir({ explicit: projectFlag });
    if (found) {
      project = await loadProject(found.dir);
      project.source = found.source;
      if (project.configError && !wantsHelp) log.warn(`${project.configFile}: ${String(project.configError.message).split("\n")[0]}`);
    }
    if (wantsHelp) {
      // help --all: every command's usage, in Markdown (docs/CLI.md "Usage of every command" is this output)
      if (args.includes("--all") || rest.includes("--all")) {
        for (const c of cmds) console.log(`### \`walkthrough ${c.name}\`\n\n${c.describe ?? ""}\n\n\`\`\`text\n${String(c.usage ?? c.describe ?? "").trim()}\n\`\`\`\n`);
        return 0;
      }
      const target = name === "help" && args[0] ? cmds.find((c) => c.name === args[0]) : null;
      if (target) console.log(target.usage ?? target.describe);
      else if (name === "help" && args[0]) {
        log.error(`unknown command "${args[0]}"`);
        return 2;
      }
      else help(cmds, project);
      return 0;
    }
    const cmd = cmds.find((c) => c.name === name);
    if (!cmd) {
      log.error(`unknown command "${name}"; \`walkthrough help\` lists them`);
      return 2;
    }
    if (args.includes("--help") || args.includes("-h")) {
      console.log(cmd.usage ?? cmd.describe);
      return 0;
    }
    const ctx = {
      kit: { root: KIT_ROOT },
      project,
      log,
      exec: (c, a, o) => exec(c, a, o),
    };
    const r = await cmd.run(args, ctx);
    code = typeof r === "number" ? r : 0;
  } catch (err) {
    if (err instanceof CliError) {
      log.error(err.message);
      code = err.code ?? 1;
    } else {
      console.error(err?.stack ?? String(err));
      code = 1;
    }
  }
  return code;
}
