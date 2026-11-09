import { ArrowRight } from "lucide-react";
import { CopyBlock } from "./CopyBlock";
import { Film, type FilmAssets } from "./Film";
import { Shell } from "./Shell";
import { INSTALL, REPO } from "@/lib/content";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#any-app", label: "Any app" },
  { href: "#agents", label: "Agents" },
  { href: "#quality", label: "Quality" },
  { href: "#quick-start", label: "Quick start" },
];

export function Header() {
  return (
    <header>
      <Shell className="flex items-center justify-between gap-6 py-5">
        <a href="#top" className="flex items-center gap-3 rounded-control" aria-label="walkthrough-studio, top of page">
          <span className="inline-block h-5 w-3 -skew-x-[16deg] bg-key" aria-hidden />
          <span className="heading whitespace-nowrap text-[1.125rem]">walkthrough-studio</span>
        </a>
        <nav aria-label="Sections" className="flex items-center gap-1">
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <li key={n.href}>
                <a
                  href={n.href}
                  className="rounded-control px-3 py-2 text-[0.95rem] text-muted transition-colors hover:bg-cyc-deep hover:text-ink"
                >
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="#quick-start"
            className="hidden whitespace-nowrap rounded-control px-3 py-2 text-[0.95rem] text-muted transition-colors hover:bg-cyc-deep hover:text-ink sm:inline-block lg:hidden"
          >
            Quick start
          </a>
          <a
            href={REPO}
            className="ml-2 inline-flex items-center whitespace-nowrap rounded-control bg-ink px-4 py-2 text-[0.95rem] font-semibold text-white transition-colors hover:bg-plate"
          >
            GitHub
          </a>
        </nav>
      </Shell>
    </header>
  );
}

export function Hero({ assets }: { assets: FilmAssets }) {
  return (
    <section aria-labelledby="hero-title" className="pb-16 pt-10 md:pb-24 md:pt-16" id="top">
      <Shell>
        <h1 id="hero-title" className="display rise max-w-[15ch] text-display-xl lg:max-w-none">
          Your coding agent films
          <br className="hidden lg:block" /> the walkthrough.
        </h1>

        <div className="mt-10 grid grid-cols-1 gap-12 md:mt-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5 lg:pt-2">
            <p className="max-w-measure text-body-lg">
              walkthrough-studio is a Claude Code plugin. Point it at any web app or website and get a
              Screen-Studio-style walkthrough video back: a drawn pointer, camera punch-ins, and captions or an
              ElevenLabs voiceover.
            </p>

            <CopyBlock className="mt-8" title="install as a plugin, for one session" code={INSTALL} prompt wrap />

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href="#quick-start"
                className="group inline-flex items-center gap-2 whitespace-nowrap bg-key px-6 py-3.5 font-bold text-ink transition-colors duration-200 hover:bg-ink hover:text-white"
              >
                Quick start
                <ArrowRight size={18} strokeWidth={2.25} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
              </a>
              <a href="#how" className="whitespace-nowrap font-semibold underline decoration-2 underline-offset-4 hover:decoration-key">
                How a film gets made
              </a>
            </div>
          </div>

          <div className="lg:col-span-7">
            <Film name="hero" label="Illustration: a drawn pointer edits a draft, a camera punch-in, a captioned and labelled time-lapse in a walkthrough film" assets={assets} eager />
            <div className="mt-6 flex flex-col gap-3 pl-3 pr-4 md:flex-row md:items-center md:justify-between md:gap-6">
              <p className="plate plate-in self-start text-[1rem] md:text-[1.25rem]">
                <span>Cut from a logged take. Never a screen grab.</span>
              </p>
              <p className="font-mono text-label text-muted md:text-right">Illustration in the film&apos;s look, rendered with HyperFrames</p>
            </div>
          </div>
        </div>
      </Shell>
    </section>
  );
}
