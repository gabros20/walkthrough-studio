import { CopyBlock } from "./CopyBlock";
import { Film, type FilmAssets } from "./Film";
import { Code, Heading, Shell } from "./Shell";
import type { ReactNode } from "react";
import { CONFIG_SNIPPET, EXPLORE_SNIPPET, LOGIN_SNIPPET, MODES, SCENES_SNIPPET, STAGES, blob } from "@/lib/content";

export function Pipeline({ assets }: { assets: FilmAssets }) {
  return (
    <section aria-labelledby="how" className="pb-20 pt-16 md:pb-28 md:pt-24">
      <Shell>
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <Heading
            id="how"
            className="lg:col-span-5"
            title="From a logged take to a delivered film."
            lede="The recorder never films a cursor. It logs every move, click, keystroke and wait on the master clock, and the film is cut from that log. That is why the pointer, the camera and the captions can never drift from the app."
          />
          <div className="lg:col-span-7">
            <Film name="pipeline" label="Illustration: logged events from the recorder driving pointer, camera and caption in the film" assets={assets} />
          </div>
        </div>

        {/* The one bold move: the mapping, set as the section's centrepiece. */}
        <figure className="mt-16 border-y-2 border-ink py-10 md:mt-24 md:py-14">
          <p className="overflow-x-auto font-mono text-[clamp(0.85rem,3.1vw,2.6rem)] font-medium leading-tight tracking-[-0.01em] whitespace-nowrap">
            film = filmIn + (source − srcIn) / rate
          </p>
          <figcaption className="mt-5 grid grid-cols-1 gap-3 text-muted md:grid-cols-2 md:gap-10">
            <span>
              One mapping for the footage and every overlay, with <Code>rate = (srcOut − srcIn) / filmDur</Code> and every
              bound snapped to a whole frame.
            </span>
            <span>
              Re-cutting a scene never desyncs the pointer, a caption or a click sound. From{" "}
              <a className="underline decoration-2 underline-offset-4 hover:decoration-key" href={blob("docs/PIPELINE.md")}>
                docs/PIPELINE.md
              </a>
              .
            </span>
          </figcaption>
        </figure>

        <ol className="mt-14 md:mt-20" aria-label="Pipeline stages in order">
          {STAGES.map((s, i) => (
            <li
              key={s.dir}
              className="grid grid-cols-1 items-baseline gap-2 border-b border-cyc-deep py-5 first:border-t md:grid-cols-[2rem_18rem_1fr_15rem] md:gap-6"
            >
              <span className="hidden font-mono text-label text-muted md:block" aria-hidden>
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block break-words font-mono text-mono font-semibold">{s.dir}</span>
                {s.cli ? <span className="mt-0.5 block font-mono text-label text-muted">{s.cli}</span> : null}
              </span>
              <span className="text-muted">{s.does}</span>
              <span className="flex flex-wrap content-start items-start gap-1.5 md:justify-end">
                {s.emits.map((e) => (
                  <code key={e} className="chip">
                    {e}
                  </code>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </Shell>
    </section>
  );
}

/** recorder/README.md (config, "popups", downloads, "dialogs", parallel takes). */
const POLICIES: { name: string; what: ReactNode }[] = [
  {
    name: "popups",
    what: (
      <>
        <Code>same-tab</Code> (default) turns a new tab into a navigation of the same page, so the screencast never
        loses it; <Code>follow</Code> moves the screencast to the new tab, one master and one clock; <Code>block</Code>{" "}
        closes it. Each is logged.
      </>
    ),
  },
  {
    name: "downloads",
    what: (
      <>
        Saved to <Code>&lt;take&gt;/downloads/</Code> and logged as a <Code>download</Code> event (label, filename, bytes),
        so a caption can claim it.
      </>
    ),
  },
  {
    name: "dialogs",
    what: (
      <>
        Alert, confirm, prompt and beforeunload are answered at once (<Code>accept</Code> or <Code>dismiss</Code>) and
        logged; a take never hangs on one.
      </>
    ),
  },
  {
    name: "--parallel N",
    what: "Site mode only: independent scenes recorded N at a time, each in its own browser. Refused with a studio: one database, one app state.",
  },
];

/** recorder/README.md viewport presets; docs/LOOK.md "Aspect presets"; film/README.md "Aspect and bezel". */
const ASPECTS: { name: string; what: ReactNode }[] = [
  {
    name: "phone",
    what: (
      <>
        <Code>viewport: &quot;phone&quot;</Code> records 390×844 CSS px at 3x with mobile emulation. The film draws a
        neutral device bezel around it: rounded, a thin ring, no marks.
      </>
    ),
  },
  { name: "9:16", what: "A 1080×1920 film from a phone take, with title and end cards stacked and captions in up to two balanced lines." },
  { name: "1:1", what: "A 1080×1080 film from either a desktop or a phone take." },
  {
    name: "16:9",
    what: (
      <>
        The default, 1920×1080. <Code>look.aspect</Code> (or <Code>--aspect</Code>) picks one; every layout number
        follows from it.
      </>
    ),
  },
];

export function AnyApp() {
  return (
    <section aria-labelledby="any-app" className="pb-24 pt-8 md:pb-36 md:pt-12">
      <Shell>
        <Heading
          id="any-app"
          title="Your app, or anyone’s URL."
          lede={
            <>
              Studio mode films an app you own from an isolated clone with checkpoints. Site mode films any URL with no
              setup on the site’s side. Same recorder, same take format (<Code>walkthrough-take/1</Code>), same film.
            </>
          }
        />

        <dl className="mt-10 divide-y divide-cyc-deep border-y border-cyc-deep md:hidden">
          {MODES.map((m) => (
            <div key={m.row} className="py-4">
              <dt className="font-mono text-label font-medium text-muted">{m.row}</dt>
              <dd className="mt-1.5">
                <span className="font-semibold">Studio:</span> {m.studio}
              </dd>
              <dd className="mt-1">
                <span className="font-semibold">Site:</span> {m.site}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 hidden md:block">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Studio mode compared with site mode</caption>
            <thead>
              <tr className="border-b-2 border-ink">
                <th scope="col" className="w-40 py-3 pr-6">
                  <span className="sr-only">Aspect</span>
                </th>
                <th scope="col" className="heading py-3 pr-6 text-heading">
                  Studio mode
                </th>
                <th scope="col" className="heading py-3 text-heading">
                  Site mode
                </th>
              </tr>
            </thead>
            <tbody>
              {MODES.map((m) => (
                <tr key={m.row} className="border-b border-cyc-deep align-top">
                  <th scope="row" className="py-3.5 pr-6 font-mono text-label font-medium text-muted">
                    {m.row}
                  </th>
                  <td className="py-3.5 pr-6">{m.studio}</td>
                  <td className="py-3.5">{m.site}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <h3 className="heading text-heading">Map the site before writing scenes.</h3>
            <p className="mt-4 text-muted">
              <Code>walkthrough explore</Code> crawls same-site links breadth-first, one page at a time, and never clicks,
              types or submits. It honours <Code>robots.txt</Code> and the config&apos;s viewport, saved login,{" "}
              <Code>blockUrls</Code> and <Code>dismiss</Code>. Every page&apos;s controls come from the accessibility tree,
              so the storyboard is drafted against real labels, not guesses.
            </p>
            <p className="mt-4 text-muted">
              <Code>scenes.draft.json</Code> holds one scene per page: the headline marked, up to five clicks on buttons and
              navigation links. Delete, pay, checkout, sign-out, consent and submit controls are listed under{" "}
              <Code>_skipped</Code> with the reason, never clicked. It follows links only, so screens reached by clicking
              are not mapped.
            </p>
          </div>
          <div className="lg:col-span-7">
            <CopyBlock title="tour map (recorder/tools/explore.mjs)" code={EXPLORE_SNIPPET} prompt wrap />
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <h3 className="heading text-heading">Scenes are data, not code.</h3>
            <p className="mt-4 text-muted">
              A site-mode take is a <Code>.json</Code> list of declarative steps: click, type, hover, scroll, mark, wait,
              hold, nav, press, park, found by role and name, text, label, placeholder, test id or selector. The agent writes
              the data; the runner interprets it. A JS adapter stays available for complex apps.
            </p>
            <p className="mt-4 text-muted">
              <Code>mark</Code> logs an element’s box and visible text: the camera frames it and the caption audit checks
              claims against it. <Code>dismiss</Code> clicks cookie banners away off camera before the sync flashes;{" "}
              <Code>blockUrls</Code> keeps analytics out.
            </p>
          </div>
          <div className="lg:col-span-7">
            <CopyBlock title="recorder/site-test/walkthrough.config.mjs" code={CONFIG_SNIPPET} />
          </div>
        </div>

        <CopyBlock className="mt-10" title="recorder/site-test/scenes.json (first steps)" code={SCENES_SNIPPET} />

        <div className="mt-16 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <h3 className="heading text-heading">Saved login</h3>
            <p className="mt-4 text-muted">
              The owner signs in by hand once with a test account; agents never type or see the password. The saved
              storage state is a credential: it stays out of git and is passed to the takes with <Code>--storage</Code>.
            </p>
          </div>
          <div className="lg:col-span-7">
            <CopyBlock title="site mode with a login" code={LOGIN_SNIPPET} prompt />
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-6">
            <h3 className="heading text-heading">New tabs, downloads, dialogs</h3>
            <dl className="mt-5 divide-y divide-cyc-deep border-y border-cyc-deep">
              {POLICIES.map((p) => (
                <div key={p.name} className="grid grid-cols-1 gap-1 py-3.5 sm:grid-cols-[9rem_1fr] sm:gap-6">
                  <dt className="font-mono text-mono font-semibold">{p.name}</dt>
                  <dd className="text-[0.95rem] text-muted">{p.what}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="lg:col-span-6">
            <h3 className="heading text-heading">Phone takes, vertical films</h3>
            <dl className="mt-5 divide-y divide-cyc-deep border-y border-cyc-deep">
              {ASPECTS.map((a) => (
                <div key={a.name} className="grid grid-cols-1 gap-1 py-3.5 sm:grid-cols-[9rem_1fr] sm:gap-6">
                  <dt className="font-mono text-mono font-semibold">{a.name}</dt>
                  <dd className="text-[0.95rem] text-muted">{a.what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Shell>
    </section>
  );
}
