import fs from "node:fs";
import path from "node:path";
import { ChevronDown } from "lucide-react";
import { CopyBlock } from "./CopyBlock";
import { InstallTabs } from "./InstallTabs";
import { Code, Heading, Shell } from "./Shell";
import { BUILD_COMMANDS, CLI_COMMANDS, REPO, ROADMAP_OPEN, ROADMAP_ORDER, blob } from "@/lib/content";

/**
 * Version and licence of the kit, read from the repo root's package.json at build time (the page is
 * static). When the site is built without the repo around it (a Vercel CLI deploy uploads only
 * site/), it falls back to site/package.json, whose version scripts/version.mjs keeps in step.
 */
function kitMeta(): { version: string; license: string } {
  let fallback = { version: "0.0.0", license: "MIT" };
  try {
    const own = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    fallback = { version: own.version ?? fallback.version, license: own.license ?? fallback.license };
  } catch {
    /* keep the defaults */
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "package.json"), "utf8"));
    if (pkg?.name !== "walkthrough-studio") return fallback;
    return { version: pkg.version ?? fallback.version, license: pkg.license ?? fallback.license };
  } catch {
    return fallback;
  }
}

const PREREQS = [
  "macOS (APFS clones for studio mode)",
  "Node 24 (22+ for the recorder)",
  "ffmpeg 8 with ffprobe",
  "Python 3 with numpy and Pillow",
  "HyperFrames via npx hyperframes@0.9.16",
  "ElevenLabs connector or ELEVENLABS_API_KEY",
];

export function QuickStart() {
  return (
    <section aria-labelledby="quick-start" className="pb-24 pt-16 md:pb-36 md:pt-24">
      <Shell>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <Heading
              id="quick-start"
              title="Quick start"
              lede={
                <>
                  Install it for your agent, then ask for the film: the <Code>walkthrough-film</Code> skill plans, waits for
                  your approval, and runs the takes, cut, review, sound, voiceover and delivery. Or run every step yourself
                  with one CLI.
                </>
              }
            />
            <h3 className="heading mt-12 text-heading">You need</h3>
            <ul className="mt-4 divide-y divide-cyc-deep border-y border-cyc-deep">
              {PREREQS.map((p) => (
                <li key={p} className="py-2.5 text-[0.95rem] text-muted">
                  {p}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.95rem] text-muted">
              <Code>walkthrough doctor</Code> checks the tools above, free disk, whether the ElevenLabs key is set (never its
              value) and the project&apos;s config, and exits 1 on any failure.
            </p>
          </div>

          <div className="lg:col-span-7 lg:pt-3">
            <div id="install">
              <h3 className="sr-only">Install</h3>
              <InstallTabs />
            </div>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 md:mt-20 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <h3 id="cli" className="heading scroll-mt-6 text-heading">
              One film from the CLI
            </h3>
            <p className="mt-4 text-muted">
              <Code>walkthrough</Code> is one command over every stage: no npm dependencies, Node 22+. Each command prints
              the command it runs (<Code>›</Code>), so the CLI is a shortcut and never the only way. The Claude Code plugin
              carries the whole repo; to run the CLI from a project folder, clone the kit once.
            </p>
            <p className="mt-4 text-muted">
              Without the alias: <Code>node $KIT/bin/walkthrough.mjs &lt;command&gt;</Code> from anywhere, or{" "}
              <Code>npm run cli -- &lt;command&gt;</Code> inside the kit. <Code>walkthrough help --all</Code> prints every
              command&apos;s usage; the reference is{" "}
              <a className="underline decoration-2 underline-offset-4 hover:decoration-key" href={blob("docs/CLI.md")}>
                docs/CLI.md
              </a>
              .
            </p>
          </div>
          <div className="lg:col-span-7">
            <CopyBlock title="a site tour, from init to delivery" code={CLI_COMMANDS} prompt wrap groups />
          </div>
        </div>

        <details className="group mt-16 border-y border-cyc-deep md:mt-20">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 [&::-webkit-details-marker]:hidden">
            <span className="heading text-heading">Or drive the kit by hand</span>
            <span className="flex items-center gap-2 font-mono text-label text-muted">
              <span className="hidden sm:inline">the tools without the CLI</span>
              <ChevronDown
                size={18}
                strokeWidth={2.25}
                aria-hidden
                className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="pb-10 pt-1">
            <p className="max-w-[52rem] text-muted">
              With <Code>KIT</Code> = this repo, <Code>P</Code> = the film’s project folder and <Code>T</Code> = the takes
              folder. The kit stays read-only; every output lands in <Code>$P</Code>. The voiceover twin is the same build
              with <Code>--no-captions</Code>, rendered to <Code>renders/final-vo.mp4</Code>.
            </p>
            <CopyBlock className="mt-6" title="build a film from takes (README.md)" code={BUILD_COMMANDS} prompt />
            <p className="mt-6 text-muted">
              Full reference:{" "}
              <a className="underline decoration-2 underline-offset-4 hover:decoration-key" href={blob("README.md")}>
                README.md
              </a>{" "}
              and{" "}
              <a className="underline decoration-2 underline-offset-4 hover:decoration-key" href={blob("recorder/README.md")}>
                recorder/README.md
              </a>
              . What went wrong on the first film, and the fix for each:{" "}
              <a className="underline decoration-2 underline-offset-4 hover:decoration-key" href={blob("docs/LESSONS.md")}>
                docs/LESSONS.md
              </a>
              .
            </p>
          </div>
        </details>
      </Shell>
    </section>
  );
}

const DOCS = ["CLI", "PIPELINE", "LOOK", "STORYBOARD", "CAPTIONS", "REVIEW", "VOICE", "DELIVERY", "CONTRACT", "LESSONS", "ROADMAP", "ELEVENLABS"];

export function Roadmap() {
  return (
    <section aria-labelledby="next" className="on-ink bg-ink pb-16 pt-16 text-white md:pt-24">
      <Shell>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <Heading
              id="next"
              tone="ink"
              title="What comes next"
              lede="Built for one film of one app, now a general studio. Version 0.2.0 folded in the whole suggested order from docs/ROADMAP.md; this is what is still open, in the order the roadmap gives."
            />
            <h3 className="mt-10 font-mono text-label text-muted-ink">the 0.1.0 suggested order, all folded in</h3>
            <ol className="mt-3 divide-y divide-ink-line border-y border-ink-line">
              {ROADMAP_ORDER.map((r, i) => (
                <li key={r.what} className="grid grid-cols-[1.75rem_1fr_auto] items-baseline gap-2 py-2.5 text-[0.95rem]">
                  <span className="font-mono text-label text-muted-ink">{i + 1}</span>
                  <span>{r.what}</span>
                  <span className="font-mono text-[0.75rem] text-muted-ink">{r.status}</span>
                </li>
              ))}
            </ol>
          </div>
          <ul className="lg:col-span-7 lg:pt-3" aria-label="Open roadmap items">
            {ROADMAP_OPEN.map((r) => (
              <li key={r.what} className="border-b border-ink-line py-4 first:border-t">
                <span className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <span className="font-bold">{r.what}</span>
                  <span className={`font-mono text-[0.75rem] ${r.status === "in progress" ? "text-key" : "text-muted-ink"}`}>
                    {r.status}
                  </span>
                </span>
                <span className="mt-1 block text-[0.95rem] text-muted-ink">{r.why}</span>
              </li>
            ))}
          </ul>
        </div>
      </Shell>
    </section>
  );
}

export function Footer() {
  const kit = kitMeta();
  return (
    <footer className="on-ink bg-ink pb-12 text-white">
      <Shell>
        <div className="grid grid-cols-1 gap-10 border-t-2 border-white pt-10 md:grid-cols-12">
          <div className="md:col-span-5">
            <p className="flex items-center gap-3">
              <span className="inline-block h-5 w-3 -skew-x-[16deg] bg-key" aria-hidden />
              <span className="heading text-[1.125rem]">walkthrough-studio</span>
            </p>
            <p className="mt-4 max-w-measure text-[0.95rem] text-muted-ink">
              Extracted from a real client walkthrough job; the example on this page is anonymised as Brightpost. The plan, configs, storyboard, voiceover and every agent brief
              are in <Code>examples/brightpost/</Code>.
            </p>
            <p className="mt-3 font-mono text-label text-muted-ink">v{kit.version} · licence: {kit.license}</p>
          </div>
          <nav aria-label="Docs" className="md:col-span-4">
            <p className="font-mono text-label text-muted-ink">docs/</p>
            <ul className="mt-3 grid grid-cols-2 gap-y-2">
              {DOCS.map((d) => (
                <li key={d}>
                  <a href={blob(`docs/${d}.md`)} className="text-[0.95rem] underline-offset-4 hover:text-key hover:underline">
                    {d}.md
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="md:col-span-3">
            <p className="font-mono text-label text-muted-ink">source</p>
            <a
              href={REPO}
              className="mt-3 inline-flex items-center whitespace-nowrap bg-key px-5 py-3 font-bold text-ink transition-colors hover:bg-white"
            >
              View on GitHub
            </a>
            <p className="mt-3 font-mono text-label text-muted-ink">gabros20/walkthrough-studio</p>
          </div>
        </div>
      </Shell>
    </footer>
  );
}
