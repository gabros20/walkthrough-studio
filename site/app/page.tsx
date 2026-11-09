import fs from "node:fs";
import path from "node:path";
import { Agents, Quality } from "@/components/Agents";
import type { FilmAssets } from "@/components/Film";
import { Header, Hero } from "@/components/Hero";
import { AnyApp, Pipeline } from "@/components/Pipeline";
import { Footer, QuickStart, Roadmap } from "@/components/QuickStart";
import { Result } from "@/components/Result";
import { Join } from "@/components/Shell";

/** Resolved at build time: a visual that has not been rendered yet gets a placeholder slot. */
function assets(name: string): FilmAssets {
  const dir = path.join(process.cwd(), "public", "visuals");
  return {
    video: fs.existsSync(path.join(dir, `${name}.mp4`)),
    poster: fs.existsSync(path.join(dir, `${name}.jpg`)),
  };
}

export default function Page() {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="overflow-x-clip">
        <Hero assets={assets("hero")} />
        <Join from="cyc" to="ink" />
        <Result assets={assets("twins")} />
        <Join from="ink" to="cyc" flip />
        <Pipeline assets={assets("pipeline")} />
        <AnyApp />
        <Join from="cyc" to="ink" />
        <Agents />
        <Quality assets={assets("audit")} />
        <Join from="ink" to="cyc" flip />
        <QuickStart />
        <Join from="cyc" to="ink" />
        <Roadmap />
      </main>
      <Footer />
    </>
  );
}
