import type { ReactNode } from "react";

export function Shell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-shell px-4 md:px-10 ${className}`}>{children}</div>;
}

/** The slanted band join: the film's wipe, led by a thin key-green bar. */
export function Join({ from, to, flip = false }: { from: "cyc" | "ink"; to: "cyc" | "ink"; flip?: boolean }) {
  const bg = from === "cyc" ? "bg-cyc" : "bg-ink";
  const fill = to === "cyc" ? "bg-cyc" : "bg-ink";
  return (
    <div className={`join ${flip ? "flip" : ""} ${bg}`} aria-hidden>
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
