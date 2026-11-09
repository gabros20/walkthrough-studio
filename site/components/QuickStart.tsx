import { CopyBlock } from "./CopyBlock";
import { Code, Heading, Shell } from "./Shell";
import { BUILD_COMMANDS, REPO, ROADMAP, SETUP, blob } from "@/lib/content";

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
                  Install the plugin, then ask Claude Code for the film. The <Code>walkthrough-film</Code> skill takes it from
                  there: plan, your approval, capture test, takes, cut, review, sound, voiceover, delivery.
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
          </div>

          <div className="lg:col-span-7">
            <CopyBlock title="clone, set up, load as a plugin" code={SETUP} prompt />
          </div>
        </div>

        <div className="mt-16 md:mt-20">
          <h3 className="heading text-heading">Or drive the kit by hand</h3>
          <p className="mt-3 max-w-[52rem] text-muted">
            With <Code>KIT</Code> = this repo, <Code>P</Code> = the film’s project folder and <Code>T</Code> = the takes
            folder. The kit stays read-only; every output lands in <Code>$P</Code>. The voiceover twin is the same build with{" "}
            <Code>--no-captions</Code>, rendered to <Code>renders/final-vo.mp4</Code>.
          </p>
          <CopyBlock className="mt-6" title="build a film from takes (README.md)" code={BUILD_COMMANDS} prompt />
          <div>
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
        </div>
      </Shell>
    </section>
  );
}

const DOCS = ["PIPELINE", "LOOK", "STORYBOARD", "CONTRACT", "LESSONS", "ROADMAP", "ELEVENLABS", "DELIVERY"];

export function Roadmap() {
  return (
    <section aria-labelledby="next" className="on-ink bg-ink pb-16 pt-16 text-white md:pt-24">
      <Shell>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <Heading
            id="next"
            tone="ink"
            className="lg:col-span-5"
            title="What comes next"
            lede="Built for one film of one app, now being turned into a general studio. The suggested order from docs/ROADMAP.md:"
          />
          <ol className="lg:col-span-7 lg:pt-3">
            {ROADMAP.map((r, i) => (
              <li key={r.what} className="grid grid-cols-[2.5rem_1fr] gap-2 border-b border-ink-line py-4 first:border-t">
                <span className="font-mono text-label text-muted-ink">{i + 1}</span>
                <span>
                  <span className="font-bold">{r.what}</span>
                  <span className="block text-[0.95rem] text-muted-ink">{r.why}</span>
                  <span className="mt-1.5 block font-mono text-[0.75rem] text-muted-ink">{r.status}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </Shell>
    </section>
  );
}

export function Footer() {
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
            <p className="mt-3 font-mono text-label text-muted-ink">v0.1.0 · licence: TBD</p>
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
