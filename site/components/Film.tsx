"use client";

import { useEffect, useRef } from "react";

export type FilmAssets = { video: boolean; poster: boolean };

type Props = {
  name: string;
  label: string;
  assets: FilmAssets;
  /** Above the fold: fetch at once. Below the fold: fetch nothing until it scrolls near. */
  eager?: boolean;
  tone?: "cyc" | "ink";
  className?: string;
};

/**
 * A film window: the ink frame, 16px radius and film shadow from DESIGN.md.
 * Plays muted and looped only while on screen; under prefers-reduced-motion it stays on its poster.
 * Missing files render a placeholder slot so the layout is already final.
 */
export function Film({ name, label, assets, eager = false, tone = "cyc", className = "" }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (video.preload === "none") {
            video.preload = "auto";
          }
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { rootMargin: "200px 0px", threshold: 0.15 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, []);

  // On an ink band the window is lifted one step (plate), as the film lifts its caption plate off ink.
  const surface = tone === "ink" ? "bg-plate shadow-film" : "bg-ink shadow-film-light";
  const frame = `relative aspect-video w-full overflow-hidden rounded-window ${surface} ${className}`;

  if (!assets.video && !assets.poster) {
    return (
      <figure className={frame} aria-label={`${label} (visual rendering)`}>
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex items-center gap-3 font-mono text-label text-muted-ink">
            <span className="size-2.5 rounded-full bg-key" aria-hidden />
            visual rendering
          </div>
        </div>
        <span className="absolute bottom-4 left-5 font-mono text-label text-muted-ink">
          visuals/{name}.mp4
        </span>
      </figure>
    );
  }

  return (
    <figure className={frame}>
      {assets.video ? (
        <video
          ref={ref}
          className="absolute inset-0 size-full object-cover"
          muted
          loop
          playsInline
          preload={eager ? "metadata" : "none"}
          poster={assets.poster ? `/visuals/${name}.jpg` : undefined}
          aria-label={label}
        >
          <source src={`/visuals/${name}.mp4`} type="video/mp4" />
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/visuals/${name}.jpg`}
          alt={label}
          className="absolute inset-0 size-full object-cover"
          loading={eager ? "eager" : "lazy"}
        />
      )}
    </figure>
  );
}
