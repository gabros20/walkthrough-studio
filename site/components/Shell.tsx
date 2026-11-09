import type { ReactNode } from "react";

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-shell px-4 md:px-10 ${className}`}>{children}</div>;
}

/** The slanted band join: the film's wipe, led by a thin key-green bar. */
export function Join({ from, to, flip = false }: { from: "cyc" | "ink"; to: "cyc" | "ink"; flip?: boolean }) {
  const fill = to === "cyc" ? "bg-cyc" : "bg-ink";
  // The bottom 2px already carry the next band's colour, so no antialiased seam shows at the join.
  const background = `linear-gradient(to bottom, var(--color-${from}) calc(100% - 2px), var(--color-${to}) 0)`;
  return (
    <div className={`join ${flip ? "flip" : ""}`} style={{ background }} aria-hidden>
      <i className="join-bar" />
      <i className={`join-fill ${fill}`} />
    </div>
  );
}

/** A section heading block: one display line, an optional lede. Never an eyebrow. */
export function Heading({
  id,
  title,
  lede,
  tone = "cyc",
  className = "",
}: {
  id: string;
  title: ReactNode;
  lede?: ReactNode;
  tone?: "cyc" | "ink";
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 id={id} className="display text-display-lg">
        {title}
      </h2>
      {lede ? (
        <p className={`mt-5 max-w-measure text-body-lg ${tone === "ink" ? "text-muted-ink" : "text-muted"}`}>{lede}</p>
      ) : null}
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="chip">{children}</code>;
}
