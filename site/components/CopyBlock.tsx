"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

type Props = {
  code: string;
  /** Shown in the block's top bar: a file name, or what the commands do. */
  title?: string;
  /** Prefix each command line with a muted "$" (not copied). */
  prompt?: boolean;
  /** Wrap long lines instead of scrolling (short one-liners on a phone). */
  wrap?: boolean;
  /** What the Copy button copies, when it differs from what the block shows. */
  copy?: string;
  className?: string;
};

/**
 * Text that may wrap only at spaces: each word is kept whole, so a long command never splits after
 * the hyphen inside a flag or a repo name ("--market" / "place"). Copy and selection are unchanged.
 */
export function Words({ text }: { text: string }) {
  return text.split(/( +)/).map((part, i) =>
    part.trim() ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

function Line({ text, prompt, wrap }: { text: string; prompt: boolean; wrap: boolean }) {
  // Whole-line and trailing shell comments render muted; JSON and JS lines render as-is.
  if (text.startsWith("#")) return <span className="block text-muted-ink">{text}</span>;
  const hash = text.indexOf("  #");
  const body = hash >= 0 ? text.slice(0, hash) : text;
  const comment = hash >= 0 ? text.slice(hash) : "";
  const isCommand = prompt && text.trim().length > 0 && !text.startsWith(" ");
  // A wrapped command hangs under its own first character, not under the "$".
  return (
    <span className={`block ${isCommand && wrap ? "pl-[2ch] -indent-[2ch]" : ""}`}>
      {isCommand ? (
        <span className="select-none text-muted-ink" aria-hidden>
          ${" "}
        </span>
      ) : null}
      {wrap ? <Words text={body} /> : body}
      {comment ? <span className="text-muted-ink">{comment}</span> : null}
    </span>
  );
}

export function CopyBlock({ code, title, prompt = false, wrap = false, copy: copyText, className = "" }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText ?? code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={`overflow-hidden rounded-control bg-ink text-white ${className}`}>
      <div className="flex items-center justify-between gap-4 border-b border-ink-line py-2 pl-5 pr-2">
        <span className="truncate font-mono text-label text-muted-ink">{title ?? "shell"}</span>
        <button
          type="button"
          onClick={copy}
          className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-control px-3 py-1.5 font-mono text-label transition-colors duration-200 ${
            copied ? "bg-key text-ink" : "text-muted-ink hover:bg-plate hover:text-white"
          }`}
          aria-label={copied ? "Copied" : `Copy ${title ?? "code"}`}
        >
          {copied ? <Check size={14} strokeWidth={2.25} aria-hidden /> : <Copy size={14} strokeWidth={2.25} aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className={`flex-1 px-5 py-4 text-mono leading-relaxed ${wrap ? "overflow-x-auto whitespace-pre-wrap" : "overflow-x-auto"}`}>
        <code>
          {code.split("\n").map((l, i) => (
            <Line key={i} text={l} prompt={prompt} wrap={wrap} />
          ))}
        </code>
      </pre>
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}
