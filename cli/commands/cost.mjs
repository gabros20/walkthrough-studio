// walkthrough cost add --kind k --units n [--amount n] [--note s] | cost show [--json]: the cost ledger.
import { parseArgs } from "../lib/args.mjs";
import { CliError, requireProject } from "../lib/project.mjs";
import { addCost, COST_KINDS } from "../lib/state.mjs";
import { fmtDate, printTable } from "../lib/table.mjs";

const usage = `walkthrough cost add --kind <${COST_KINDS.join("|")}> --units <n> [--amount <n>] [--note <text>]
walkthrough cost show [--json]

The ledger in state.json costs[]: { at, kind, units, amount, note }. Units are what the provider
counts (TTS characters, music seconds, agent turns or tokens, render minutes); amount is money in
whatever currency you keep the ledger in (optional). The sound and voiceover tools and
\`walkthrough render\` add rows themselves; \`walkthrough review\` copies the ledger into REVIEW.md.
  show     every row, then totals per kind`;

export default {
  name: "cost",
  describe: "cost ledger: add a row (tts, music, agent, render, other) or show it",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const [sub, ...rest] = argv;
    const { opts } = parseArgs(rest, { boolean: ["json"], string: ["kind", "units", "amount", "note"] });
    if (sub === "add") {
      if (!opts.kind || opts.units === undefined) throw new CliError(`cost add needs --kind and --units\n\n${usage}`, 2);
      let row;
      try {
        row = addCost(project.state, { kind: opts.kind, units: opts.units, amount: opts.amount, note: opts.note });
      } catch (err) {
        throw new CliError(err.message, 2);
      }
      project.save();
      ctx.log.info(`cost recorded: ${row.kind} ${row.units} units${row.amount !== null ? `, amount ${row.amount}` : ""}${row.note ? ` (${row.note})` : ""}`);
      return 0;
    }
    if (sub === "show" || sub === undefined) {
      const costs = project.state.costs;
      if (opts.json) {
        console.log(JSON.stringify(costs, null, 2));
        return 0;
      }
      printTable(costs.map((c) => ({ at: fmtDate(c.at), kind: c.kind, units: c.units, amount: c.amount, note: c.note ?? "" })));
      const totals = {};
      for (const c of costs) {
        const t = (totals[c.kind] ??= { kind: c.kind, rows: 0, units: 0, amount: 0 });
        t.rows++;
        t.units = Math.round((t.units + c.units) * 100) / 100;
        t.amount = Math.round((t.amount + (c.amount ?? 0)) * 100) / 100;
      }
      if (costs.length) {
        console.log("\ntotals");
        printTable(Object.values(totals));
      }
      return 0;
    }
    throw new CliError(`unknown cost action "${sub}"\n\n${usage}`, 2);
  },
};
