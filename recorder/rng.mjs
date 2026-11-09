// Small seeded PRNG so typing cadence is natural but identical on every run.

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Per-character delays (seconds, the wait BEFORE each character) for typing `text`.
 * Base rate `cps` characters per second, +-30% jitter, longer after spaces and punctuation, and a
 * rare short hesitation. Deterministic for a given (seed, text, cps).
 */
export function typingDelays(text, { cps = 14, seed = 1 } = {}) {
  const rand = mulberry32(hashString(`${seed}|${cps}|${text}`));
  const base = 1 / cps;
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const prev = text[i - 1];
    let d = i === 0 ? 0.06 : base * (0.7 + 0.6 * rand());
    if (prev === " ") d += base * 0.35 * rand();
    if (prev && ".,!?;:".includes(prev)) d += 0.12 + 0.1 * rand();
    if (i > 0 && rand() < 0.04) d += 0.12 + 0.12 * rand();
    out.push(d);
  }
  return out;
}
