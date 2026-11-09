// Plain-text tables for the CLI (no colours, no box drawing: the output is pasted into reports).
//
//   table(rows, columns?) -> string
//     rows:    array of objects
//     columns: array of keys, or of { key, label, align: "left" | "right" } (default: the keys of
//              every row, in first-seen order; numbers are right-aligned)
//   printTable(rows, columns?)  console.log(table(...)), or "(none)" for no rows
//   fmtBytes(n) -> "12.3 GB";  fmtSeconds(s) -> "3:02.4";  fmtDate(iso) -> "2026-11-09 14:03"

export function table(rows, columns) {
  if (!rows.length) return "";
  const cols = (columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))]).map((c) => (typeof c === "string" ? { key: c } : c));
  const cell = (v) => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  for (const c of cols) {
    c.label ??= c.key;
    c.align ??= rows.every((r) => r[c.key] === undefined || r[c.key] === null || typeof r[c.key] === "number") ? "right" : "left";
    c.width = Math.max(c.label.length, ...rows.map((r) => cell(r[c.key]).length));
  }
  const pad = (s, c) => (c.align === "right" ? s.padStart(c.width) : s.padEnd(c.width));
  const line = (vals) => cols.map((c, i) => pad(vals[i], c)).join("  ").trimEnd();
  return [line(cols.map((c) => c.label)), line(cols.map((c) => "-".repeat(c.width))), ...rows.map((r) => line(cols.map((c) => cell(r[c.key]))))].join("\n");
}

export function printTable(rows, columns) {
  console.log(rows.length ? table(rows, columns) : "(none)");
}

export function fmtBytes(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "?";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

export function fmtSeconds(s) {
  if (s === null || s === undefined || Number.isNaN(s)) return "?";
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export function fmtDate(iso) {
  return iso ? String(iso).replace("T", " ").slice(0, 16) : "";
}
