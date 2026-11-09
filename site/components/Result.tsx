import { Film, type FilmAssets } from "./Film";
import { Code, Heading, Shell } from "./Shell";
import { EDL, FILM_LENGTH, tc } from "@/lib/content";

const CONTENTS: { term: string; detail: React.ReactNode }[] = [
  {
    term: "Title and end card",
    detail: "Built from real outputs of the recording (19 on the first film), with the brand's own logo files, never redrawn.",
  },
  {
    term: "Drawn pointer",
    detail: "Arrow, hand or I-beam from the cursor the page reported, on the recorder's own arcs. It cannot drift from the UI.",
  },
  {
    term: "Camera punch-ins",
    detail: "Wide, pane (1.3–1.5×) and control (up to 1.85×), framed from logged element boxes, never guessed pixels.",
  },
  {
    term: "Labelled time-lapses",
    detail: "Agent waits are compressed and tagged “Time-lapse N×”. Nothing is mocked or painted over.",
  },
  {
    term: "Captions or a voice",
    detail: "Captions of at most 10 words, each anchored to a logged event; or a voiceover over the captionless twin.",
  },
];

const TWINS: { row: string; captions: string; voice: string }[] = [
  { row: "Carries the message", captions: "short on-screen lines", voice: "a narrator, no captions" },
  { row: "Pacing", captions: "≥ 0.5 s + 0.3 s a word", voice: "2.4 words/s + 0.35 s a line" },
  { row: "Plays muted", captions: "yes", voice: "no" },
  { row: "First film", captions: "23 captions + music", voice: "27 lines, 234 words, one take" },
];

function Timeline() {
  return (
    <figure className="mt-16 md:mt-20" aria-labelledby="cut-caption">
      <figcaption id="cut-caption" className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="heading text-heading">The cut of the first film</span>
        <span className="font-mono text-label text-muted-ink">examples/brightpost · 3:02 · 1920×1080 · 60 fps</span>
      </figcaption>

      {/* Desktop: proportional EDL track */}
      <ol className="mt-6 hidden h-28 md:flex" aria-label="Scenes in film order">
        {EDL.map((s) => {
          const w = ((s.to - s.from) / FILM_LENGTH) * 100;
          const narrow = w < 6;
          return (
            <li
              key={s.id}
              style={{ width: `${w}%` }}
              className={`relative flex flex-col justify-between border-l border-ink py-2.5 ${narrow ? "px-1.5" : "px-2.5"} ${
                s.card ? "bg-key text-ink" : "bg-plate text-white"
              }`}
            >
              <span className={`font-mono text-[0.75rem] ${s.card ? "text-ink" : "text-muted-ink"} ${narrow ? "invisible" : ""}`}>
                {tc(s.from)}
              </span>
              <span className={`font-semibold leading-tight ${narrow ? "text-[0.75rem]" : "text-[0.95rem]"}`}>
                {s.card ? s.label.replace(" card", "") : s.label}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-2 hidden justify-between font-mono text-[0.75rem] text-muted-ink md:flex" aria-hidden>
        <span>0:00</span>
        <span>1:00</span>
        <span>2:00</span>
        <span>3:02</span>
      </div>

      {/* Phone: the same cut as a list */}
      <ol className="mt-5 divide-y divide-ink-line border-y border-ink-line md:hidden" aria-label="Scenes in film order">
        {EDL.map((s) => (
          <li key={s.id} className="flex items-center gap-4 py-2.5">
            <span className="w-14 font-mono text-[0.8rem] text-muted-ink">{tc(s.from)}</span>
            <span className={`h-2.5 ${s.card ? "bg-key" : "bg-muted-ink"}`} style={{ width: `${Math.max(((s.to - s.from) / 24.18) * 6, 0.5)}rem` }} aria-hidden />
            <span className="font-semibold">{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 max-w-measure text-muted-ink">
        13 scenes cut from nine takes, 23 captions, 65 cues, 6 spotlights. The title and end card are the green spans,
        where the film itself spends its one accent colour.
      </p>
    </figure>
  );
}

export function Result({ assets }: { assets: FilmAssets }) {
  return (
    <section aria-labelledby="result" className="on-ink bg-ink pb-24 pt-16 text-white md:pb-36 md:pt-24">
      <Shell>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
          <Heading id="result" tone="ink" className="lg:col-span-7" title="One picture lock. Two films." />
          <p className="max-w-measure text-body-lg text-muted-ink lg:col-span-5">
            Choose captions or a voiceover, or ship both from one picture lock with identical timing. The voiceover twin is
            the same build with <Code>--no-captions</Code>. The first film shipped both.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-12 md:mt-16 lg:grid-cols-12 lg:gap-10">
          <div className="order-2 lg:col-span-5">
            <dl className="divide-y divide-ink-line border-y border-ink-line">
              {CONTENTS.map((c) => (
                <div key={c.term} className="grid grid-cols-1 gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                  <dt className="font-bold">{c.term}</dt>
                  <dd className="text-muted-ink">{c.detail}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="order-1 lg:col-span-7">
            <Film name="twins" tone="ink" label="Illustration: the captioned and the voiceover twin of one film, side by side, on one timeline" assets={assets} />

            <table className="mt-10 w-full border-collapse text-left">
              <caption className="sr-only">Captions twin compared with voiceover twin</caption>
              <thead>
                <tr className="border-b border-ink-line font-mono text-label text-muted-ink">
                  <th scope="col" className="py-3 pr-4 font-medium">
                    <span className="sr-only">Aspect</span>
                  </th>
                  <th scope="col" className="py-3 pr-4 font-medium">
                    captions twin
                  </th>
                  <th scope="col" className="py-3 font-medium">
                    voiceover twin
                  </th>
                </tr>
              </thead>
              <tbody>
                {TWINS.map((t) => (
                  <tr key={t.row} className="border-b border-ink-line align-top">
                    <th scope="row" className="py-3 pr-4 text-[0.95rem] font-semibold">
                      {t.row}
                    </th>
                    <td className="py-3 pr-4 text-[0.95rem] text-muted-ink">{t.captions}</td>
                    <td className="py-3 text-[0.95rem] text-muted-ink">{t.voice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <Timeline />
      </Shell>
    </section>
  );
}
