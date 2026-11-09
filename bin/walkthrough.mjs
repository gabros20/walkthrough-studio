#!/usr/bin/env node
// `walkthrough`: one CLI over the kit's tools (docs/CLI.md). Zero dependencies, Node 22+.
//   node <kit>/bin/walkthrough.mjs <command> [args]      or  npm run cli -- <command> [args]  (in the kit)
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(`walkthrough: Node 22 or newer is required (this is ${process.versions.node})`);
  process.exit(1);
}
const { main } = await import("../cli/index.mjs");
process.exitCode = await main(process.argv.slice(2));
