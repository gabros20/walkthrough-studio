"use client";

import { useId, useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { CopyBlock, Words } from "./CopyBlock";
import { Code } from "./Shell";
import { INSTALL_DOC, INSTALL_ROUTES } from "@/lib/content";

/*
 * The chosen platform is one value shared by every switcher on the page (hero and quick start),
 * remembered in localStorage. Storage can be blocked (private mode, sandboxed previews), so every
 * access is guarded and an in-memory choice keeps the tabs working without it.
 */
const KEY = "walkthrough-studio:install-platform";
const EVENT = "walkthrough-studio:install-platform";
const DEFAULT = INSTALL_ROUTES[0].id;
const isRoute = (v: string | null): v is string => !!v && INSTALL_ROUTES.some((r) => r.id === v);

let chosen: string | null = null;

function read(): string {
  if (chosen) return chosen;
  try {
    const v = window.localStorage.getItem(KEY);
    return isRoute(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

function subscribe(onChange: () => void) {
  const fromOtherTab = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    chosen = null;
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", fromOtherTab);
  };
}

function choose(id: string) {
  chosen = id;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Not remembered across visits; the in-memory choice still applies.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The platform chosen in any switcher on the page, for content that follows the tabs. */
export function useInstallPlatform(): string {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}

/** A note with `backticks` around paths and commands, rendered as code chips that wrap only at spaces. */
function Note({ text }: { text: string }) {
  return (
    <p className="text-[0.95rem] text-muted">
      {text.split("`").map((part, i) =>
        i % 2 ? (
          <Code key={i} className="whitespace-normal">
            <Words text={part} />
          </Code>
        ) : (
          part
        ),
      )}
    </p>
  );
}

export function InstallTabs({ className = "" }: { className?: string }) {
  const selected = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const uid = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabId = (id: string) => `${uid}-tab-${id}`;
  const panelId = (id: string) => `${uid}-panel-${id}`;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = INSTALL_ROUTES.length - 1;
    const next =
      e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    choose(INSTALL_ROUTES[next].id);
    tabs.current[next]?.focus();
  }

  return (
    <div className={className}>
      {/* Quiet tabs: mono labels on the grey; the chosen one gets the slanted key-green tick of the logo. */}
      <div role="tablist" aria-label="Install for" className="-ml-1.5 flex flex-wrap gap-y-1">
        {INSTALL_ROUTES.map((r, i) => {
          const on = r.id === selected;
          return (
            <button
              key={r.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={tabId(r.id)}
              aria-selected={on}
              aria-controls={panelId(r.id)}
              tabIndex={on ? 0 : -1}
              onClick={() => choose(r.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`group inline-flex items-center gap-1.5 whitespace-nowrap rounded-control px-1.5 py-1.5 font-mono text-label outline-offset-1 transition-colors duration-200 ${
                on ? "font-semibold text-ink" : "text-muted hover:bg-cyc-deep hover:text-ink"
              } motion-reduce:transition-none`}
            >
              <span
                aria-hidden
                className={`inline-block h-3.5 w-2 -skew-x-[16deg] transition-colors duration-200 motion-reduce:transition-none ${
                  on ? "bg-key" : "bg-transparent group-hover:bg-muted/40"
                }`}
              />
              {r.tab}
            </button>
          );
        })}
      </div>

      {/*
       * Every panel sits in the same two grid rows (block, note) via subgrid, so the block and the
       * note area take the tallest variant's height at any width: switching tabs never moves the page.
       */}
      <div className="mt-3 grid grid-rows-[auto_auto] gap-y-3">
        {INSTALL_ROUTES.map((r) => {
          const on = r.id === selected;
          return (
            <div
              key={r.id}
              role="tabpanel"
              id={panelId(r.id)}
              aria-labelledby={tabId(r.id)}
              inert={!on}
              className={`col-start-1 row-span-2 row-start-1 grid grid-rows-subgrid ${on ? "" : "invisible"}`}
            >
              <CopyBlock className="flex flex-col" title={r.title} code={r.code} copy={r.copy} prompt wrap />
              <Note text={r.note} />
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[0.95rem]">
        <a className="font-semibold underline decoration-2 underline-offset-4 hover:decoration-key" href={INSTALL_DOC}>
          All install routes and what each platform gets
        </a>
      </p>
    </div>
  );
}
