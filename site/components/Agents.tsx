import { Film, type FilmAssets } from "./Film";
import { Code, Heading, Shell } from "./Shell";
import { SKILLS, TIERS, tree } from "@/lib/content";

const RULES = [
  "Agent waits are shown as labelled time-lapses.",
  "Nothing is mocked, redrawn or composited into the app.",
  "A caption or spoken line is cut if its claim is not visibly true in the take.",
  "Audio is reported as “measured, not heard”; listening is handed to a human.",
];

export function Agents() {
  return (
    <section aria-labelledby="agents" className="on-ink bg-ink pb-20 pt-16 text-white md:pb-28 md:pt-24">
      <Shell>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <Heading
            id="agents"
            tone="ink"
            className="lg:col-span-6"
            title="Built to be run by a coding agent."
            lede={
              <>
                The plugin is 7 skills and 9 agents. You ask for the film; <Code>walkthrough-film</Code> makes your session
                the lead. It plans, briefs, rules and checks, and spends its own tokens on nothing else.
              </>
            }
          />
          <p className="text-muted-ink lg:col-span-5 lg:col-start-8 lg:self-end">
            Agents are long-lived and named, so the lead can send numbered rulings to the editor or a retake request to
            the take operator without re-briefing. Critical reviews are never skipped; everything else spends as few tokens
            as it can.
          </p>
        </div>

        {/* Call sheet: agents grouped by the model tier that runs them. */}
        <div className="mt-14 border-t-2 border-white md:mt-20">
          {TIERS.map((t) => (
            <div key={t.model} className="grid grid-cols-1 gap-4 border-b border-ink-line py-7 md:grid-cols-12 md:gap-10 md:py-9">
              <div className="md:col-span-4">
                <p className="display text-display-lg">{t.model}</p>
                <p className="mt-2 text-muted-ink">{t.why}</p>
              </div>
              <ul className="grid grid-cols-1 gap-x-10 gap-y-3 md:col-span-8 md:grid-cols-2 md:pt-3">
                {t.agents.map((a) => (
                  <li key={a.name}>
                    <span className="font-mono text-mono font-semibold text-key">{a.name}</span>
                    <span className="block text-[0.95rem] text-muted-ink">{a.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="py-6 text-muted-ink">
            Haiku describes frames; an Opus critic checks what the small models reported before anyone acts on it, so the
            cheap model never grades its own reading.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <h3 className="heading text-heading">Seven skills</h3>
            <ul className="mt-5 divide-y divide-ink-line border-y border-ink-line">
              {SKILLS.map((s) => (
                <li key={s.name} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <a href={tree(`skills/${s.name}`)} className="font-mono text-mono font-semibold underline-offset-4 hover:underline">
                    {s.name}
                  </a>
                  <span className="text-[0.95rem] text-muted-ink">{s.use}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-5">
            <h3 className="heading text-heading">House rules, in every brief</h3>
            <ul className="mt-5 space-y-3">
              {RULES.map((r) => (
                <li key={r} className="relative bg-plate py-3 pl-6 pr-4 font-semibold">
                  <span className="absolute inset-y-0 left-0 w-1.5 bg-key" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Shell>
    </section>
  );
}

export function Quality({ assets }: { assets: FilmAssets }) {
  const checks: { name: string; flag?: string; what: React.ReactNode }[] = [
    { name: "holds", flag: "--hold 1.0", what: "static stretches longer than a second: no pointer move, no tween, no UI change." },
    { name: "jumps", flag: "--jump 120", what: "the pointer jumping at a cut, in stage px; pushes, whips and enterFrom count as treated." },
    { name: "dead air", flag: "--tail 1.0", what: "a caption that ends before the cut, then nothing logged happens." },
    { name: "captions", what: "words, hold and overlap lint; an overlap is an error." },
    {
      name: "claims",
      what: (
        <>
          a caption with <code className="chip whitespace-normal">&quot;claims&quot;: &quot;mark:&lt;label&gt;&quot;</code> whose quoted phrase is not in that
          mark’s logged text. An error: the caption says something the screen does not.
        </>
      ),
    },
  ];

  return (
    <section aria-labelledby="quality" className="on-ink bg-ink pb-24 pt-8 text-white md:pb-36 md:pt-12">
      <Shell>
        <div className="border-t border-ink-line pt-16 md:pt-24">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
            <Heading
              id="quality"
              tone="ink"
              className="lg:col-span-5"
              title="It checks its own film."
              lede={
                <>
                  <Code>build.mjs --audit</Code> runs before every review and before picture lock, and exits 1 on an error. On
                  the delivered Kleber cut it reports 0 errors and 2 dead-air warnings.
                </>
              }
            />
            <div className="lg:col-span-7">
              <Film name="audit" tone="ink" label="Illustration: the build audit flagging faults in a cut" assets={assets} />
            </div>
          </div>

          <dl className="mt-14 grid grid-cols-1 gap-x-10 md:mt-20 md:grid-cols-2">
            {checks.map((c) => (
              <div
                key={c.name}
                className={`grid grid-cols-[7rem_1fr] gap-4 border-t border-ink-line py-4 ${
                  c.name === "claims" ? "md:col-span-2 md:border-b" : ""
                }`}
              >
                <dt>
                  <span className="font-mono text-mono font-semibold text-key">{c.name}</span>
                  {c.flag ? <span className="block font-mono text-[0.75rem] text-muted-ink">{c.flag}</span> : null}
                </dt>
                <dd className={c.name === "claims" ? "text-body-lg text-white" : "text-[0.95rem] text-muted-ink"}>{c.what}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
            <div className="lg:col-span-6">
              <h3 className="heading text-heading">Sound is guarded, not trusted</h3>
              <p className="mt-4 text-muted-ink">
                <Code>sound/build-sound.mjs</Code> measures the mix before it hands anything over: −16 LUFS integrated (±0.5),
                true peak at most −1 dBTP, a full-length audio stream within a frame of the picture, every effect within a
                frame of its cue. Its last line says which way it went.
              </p>
              <pre className="mt-6 overflow-x-auto rounded-control bg-plate px-5 py-4 font-mono text-mono">
                <span className="block text-key">delivered: out/&lt;film&gt;.mp4</span>
                <span className="block text-muted-ink">NOT DELIVERED (checks failed): out/&lt;film&gt;.mp4</span>
              </pre>
            </div>
            <div className="lg:col-span-6">
              <h3 className="heading text-heading">The review loop</h3>
              <ol className="mt-4 space-y-2 text-muted-ink">
                <li>Draft render.</li>
                <li>Haiku describers read one frame every 2 s, in parallel ranges.</li>
                <li>An Opus critic verifies their flags and reviews contact sheets and the strips around every cut.</li>
                <li>The lead rules on the list; the editor fixes; the audit runs; next draft.</li>
              </ol>
              <p className="mt-4 text-muted-ink">Two or three rounds were enough for the first film.</p>
            </div>
          </div>
        </div>
      </Shell>
    </section>
  );
}
