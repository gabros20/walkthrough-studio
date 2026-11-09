#!/usr/bin/env python3
"""Check a delivery package before it is zipped or sent. Exits non-zero on any failure.

usage: python3 -I delivery/verify.py package.config.json [--loudness]
       python3 -I delivery/verify.py --dir PACKAGE_DIR [--allow-silent] [--max-gif-mb 8]

Checks (both forms):
  - every .mp4: video stream, audio stream present and as long as the video (within 0.1 s);
    --allow-silent accepts a video without audio (test renders only: a silent film is never sent);
  - every .vtt starts with WEBVTT and uses dots in timestamps; every .srt parses (an empty .srt, for a clip
    with no caption in its span, is reported as a note);
  - every .gif is at most --max-gif-mb (default 8 MB);
  - MANIFEST.txt, when present: every listed file exists with that size and sha256, and no file is unlisted;
  - stills open and are non-empty; no .DS_Store left; "TODO" left in a .md file is reported as a note.
With a config also:
  - masters in 01_Films are byte-identical to the configured sources;
  - --loudness: integrated loudness and true peak of each master, plus momentary loudness at the start,
    middle and end (a silent stretch or a dead track shows up here). Reported as measured, not heard.
"""
import glob
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import FFMPEG, load_config, probe, read_manifest, sha256, srt_cues, usage  # noqa: E402


def loud(path, ss=None, t=None):
    cmd = [FFMPEG, "-hide_banner", "-nostats"]
    if ss is not None:
        cmd += ["-ss", str(ss), "-t", str(t)]
    cmd += ["-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(cmd, capture_output=True, text=True).stderr
    i = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    p = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", err)
    return (float(i[-1]) if i else None, float(p[-1]) if p else None)


def check_tree(root, allow_silent=False, max_gif=8_000_000):
    """The checks that need no config. Returns (bad, notes)."""
    bad, notes = [], []
    for v in sorted(glob.glob(os.path.join(root, "**", "*.mp4"), recursive=True)):
        p = probe(v)
        rel = os.path.relpath(v, root)
        ok = (p["audio"] or allow_silent) and (p["aduration"] is None or abs(p["aduration"] - p["duration"]) < 0.1)
        print(f"{'ok ' if ok else 'BAD'} {rel}  {p['duration']:.2f} s  {p['width']}x{p['height']}@{p['fps']}  audio={p['acodec'] or 'NONE'}  {p['size'] / 1e6:.1f} MB")
        if not ok:
            bad.append(f"{rel}: audio missing or shorter than video")
        elif not p["audio"]:
            notes.append(f"{rel}: no audio (accepted by --allow-silent)")
    for g in sorted(glob.glob(os.path.join(root, "**", "*.gif"), recursive=True)):
        sz = os.path.getsize(g)
        rel = os.path.relpath(g, root)
        print(f"{'ok ' if sz <= max_gif else 'BAD'} {rel}  {sz / 1e6:.2f} MB")
        if sz > max_gif:
            bad.append(f"{rel}: {sz / 1e6:.2f} MB is over {max_gif / 1e6:.0f} MB")
    for v in glob.glob(os.path.join(root, "**", "*.vtt"), recursive=True):
        t = open(v, encoding="utf-8").read()
        if not t.startswith("WEBVTT") or re.search(r"\d{2}:\d{2}:\d{2},\d{3}", t):
            bad.append(f"{v}: invalid WebVTT")
    for s in glob.glob(os.path.join(root, "**", "*.srt"), recursive=True):
        if not srt_cues(s):
            if os.path.getsize(s) == 0:
                notes.append(f"{os.path.relpath(s, root)}: empty (no caption in that span)")
            else:
                bad.append(f"{s}: no cues parsed")
    for png in glob.glob(os.path.join(root, "03_Screenshots", "**", "*.png"), recursive=True):
        if os.path.getsize(png) < 10_000:
            bad.append(f"{png}: suspiciously small")
    for md in glob.glob(os.path.join(root, "**", "*.md"), recursive=True):
        n = open(md, encoding="utf-8").read().count("TODO")
        if n:
            notes.append(f"{os.path.relpath(md, root)}: {n} TODO left to fill before sending")
    man = os.path.join(root, "MANIFEST.txt")
    if os.path.exists(man):
        rows = read_manifest(man)
        listed = set()
        for rel, size, _dur, digest in rows:
            p = os.path.join(root, rel)
            listed.add(rel)
            if not os.path.exists(p):
                bad.append(f"MANIFEST: {rel} missing")
            elif os.path.getsize(p) != size or sha256(p) != digest:
                bad.append(f"MANIFEST: {rel} differs from its listed size or sha256")
        for d, _, fs in os.walk(root):
            for f in fs:
                rel = os.path.relpath(os.path.join(d, f), root)
                if f not in ("MANIFEST.txt", ".DS_Store") and rel not in listed:
                    bad.append(f"MANIFEST: {rel} is not listed")
        print(f"manifest: {len(rows)} files checked against their sha256")
    ds = glob.glob(os.path.join(root, "**", ".DS_Store"), recursive=True)
    if ds:
        notes.append(f"{len(ds)} .DS_Store files (zip.sh removes them)")
    return bad, notes


def report(bad, notes):
    for n in notes:
        print(f"note: {n}")
    if bad:
        print("\nFAILED:\n- " + "\n- ".join(bad))
        sys.exit(1)
    print("\npackage checks passed")


def main():
    a = sys.argv[1:]
    usage(__doc__, a)
    allow_silent = "--allow-silent" in a
    max_gif = int(float(a[a.index("--max-gif-mb") + 1]) * 1_000_000) if "--max-gif-mb" in a else 8_000_000
    if a[0] == "--dir":
        if len(a) < 2 or not os.path.isdir(a[1]):
            print(__doc__.strip(), file=sys.stderr)
            sys.exit(1)
        report(*check_tree(a[1], allow_silent, max_gif))
        return
    cfg = load_config(a[0])
    root = cfg["out"]
    bad, notes = check_tree(root, allow_silent, max_gif)
    for f in cfg["films"]:
        top = os.path.join(root, "01_Films")
        m = [x for x in glob.glob(os.path.join(top, f"*_Walkthrough_{f['variant']}_*.mp4"))]
        if not m:
            bad.append(f"master for {f['variant']} missing in 01_Films")
        elif sha256(m[0]) != sha256(f["master"]):
            bad.append(f"{m[0]} differs from {f['master']}")
        if "--loudness" in a and m:
            d = probe(m[0])["duration"]
            I, P = loud(m[0])
            parts = [loud(m[0], s, 10) for s in (1, max(0, d / 2 - 5), max(0, d - 11))]
            print(f"loudness {f['variant']}: integrated {I} LUFS, true peak {P} dBTP; start/middle/end {[x[0] for x in parts]} LUFS (measured, not heard)")
            if any(x[0] is None or x[0] < -45 for x in parts):
                bad.append(f"{f['variant']}: near-silent stretch at start, middle or end")
    report(bad, notes)


if __name__ == "__main__":
    main()
