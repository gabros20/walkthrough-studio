"use client";

import { CopyBlock, Words } from "./CopyBlock";
import { useInstallPlatform } from "./InstallTabs";
import { Code } from "./Shell";
import { ASK_REQUEST, ASK_REQUEST_VO, ASK_ROUTES, ASK_STEPS, INSTALL_ROUTES, MODELS_DOC } from "@/lib/content";

/** Text with `backticks` around commands and paths, rendered as code chips that wrap only at spaces. */
function Ticks({ text }: { text: string }) {
  return text.split("`").map((part, i) =>
    i % 2 ? (
      <Code key={i} className="whitespace-normal">
        <Words text={part} />
      </Code>
    ) : (
      part
    ),
  );
}

/**
 * Step 2 of the quick start. Plain content keyed to the platform chosen in the install tabs (the same
 * shared choice), not a second tablist: switching a tab anywhere on the page rewrites the left column.
 * The example request on the right is the same on every platform and is the section's focal element.
 */
export function AskAgent() {
  const selected = useInstallPlatform();
  const route = ASK_ROUTES.find((r) => r.id === selected) ?? ASK_ROUTES[0];
  const tab = INSTALL_ROUTES.find((r) => r.id === route.id)?.tab ?? route.agent;

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-5">
        <h3 id="ask" className="heading scroll-mt-6 text-heading">
          Ask your agent
        </h3>
        <p className="mt-2 font-mono text-label text-muted" data-testid="ask-platform">
          for {tab}, as chosen in the install tabs
        </p>
        <p className="mt-4 text-muted">
          In a new session, start the lead skill. It asks before it decides anything that changes the plan.
        </p>

        <ul className="mt-5 flex flex-wrap gap-2" aria-label={`Invoke the skill in ${route.agent}`} data-testid="ask-invoke">
          {route.invoke.map((cmd) => (
            <li key={cmd}>
              <code className="inline-block rounded-control bg-white px-3 py-1.5 font-mono text-mono font-semibold text-ink">
                {cmd}
              </code>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[0.95rem] text-muted">
          <Ticks text={route.say} />
        </p>

        <p className="mt-6 border-t border-cyc-deep pt-4 text-[0.95rem] text-muted">
          <Ticks text={route.models} /> Every tier on every agent:{" "}
          <a className="underline decoration-2 underline-offset-4 hover:decoration-key" href="#models">
            the models table
          </a>{" "}
          and{" "}
          <a className="underline decoration-2 underline-offset-4 hover:decoration-key" href={MODELS_DOC}>
            docs/MODELS.md
          </a>
          .
        </p>
      </div>

      <div className="lg:col-span-7 lg:pt-1">
        <CopyBlock title="ask for the film" code={ASK_REQUEST} prose />
        <CopyBlock className="mt-3" title="or with a voiceover" code={ASK_REQUEST_VO} wrap />

        <h4 className="mt-8 font-semibold">What happens next</h4>
        <ol className="mt-3 divide-y divide-cyc-deep border-y border-cyc-deep">
          {ASK_STEPS.map((s, i) => (
            <li key={s.text} className="grid grid-cols-[1.75rem_1fr] gap-2 py-2.5 text-[0.95rem]">
              <span className="font-mono text-label leading-[1.6rem] text-muted">{i + 1}</span>
              <span>
                <Ticks text={s.text} />
                {s.you ? <span className="mt-0.5 block font-mono text-label text-muted">you: {s.you}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
