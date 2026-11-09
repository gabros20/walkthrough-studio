#!/usr/bin/env python3
"""01_Films: renamed masters (byte copies, checksum-verified), .srt + .vtt, web encodes, posters.

usage: python3 -I delivery/films.py package.config.json [--skip-web] [--only <variant>]

For each film in the config:
  01_Films/<product>_Walkthrough_<Variant>_1080p<fps>.mp4      exact copy of the master (sha256 compared)
  01_Films/<same>.srt / .vtt                                    subtitles (captions or spoken lines)
  01_Films/<same>_poster_1920x1080.jpg                          frame at film.poster_t (default 4 s)
  01_Films/web/<product>_Walkthrough_<Variant>_1080p30_web.mp4  H.264 high, CRF 23, AAC 160k, +faststart
  01_Films/web/<product>_Walkthrough_<Variant>_720p30_web.mp4   same at 1280x720
"""
import hashlib
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import FFMPEG, die, ensure, load_config, probe, run, srt_to_vtt_text, usage  # noqa: E402


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    args = sys.argv[1:]
    usage(__doc__, args)
    cfg = load_config(args[0])
    skip_web = "--skip-web" in args
    only = args[args.index("--only") + 1] if "--only" in args else None
    out = ensure(os.path.join(cfg["out"], "01_Films"))
    web = ensure(os.path.join(out, "web"))
    prod = cfg["product"]
    for f in cfg["films"]:
        if only and f["variant"] != only:
            continue
        m = probe(f["master"])
        if not m["audio"]:
            die(f"{f['master']} has no audio stream. A silent master must never be packaged (see docs/LESSONS.md).")
        fps = int(round(m["fps"] or 30))
        stem = f"{prod}_Walkthrough_{f['variant']}_{m['height']}p{fps}"
        dst = os.path.join(out, stem + ".mp4")
        shutil.copyfile(f["master"], dst)
        if sha(dst) != sha(f["master"]):
            die(f"checksum mismatch after copying {f['master']}")
        print(f"master  {dst}  ({m['duration']:.1f} s, {m['width']}x{m['height']}@{fps}, audio {m['acodec']})")
        if f.get("srt"):
            shutil.copyfile(f["srt"], os.path.join(out, stem + ".srt"))
            open(os.path.join(out, stem + ".vtt"), "w", encoding="utf-8").write(srt_to_vtt_text(open(f["srt"], encoding="utf-8-sig").read()))
            print(f"subs    {stem}.srt / .vtt")
        t = f.get("poster_t", 4.0)
        run([FFMPEG, "-v", "error", "-y", "-ss", str(t), "-i", f["master"], "-frames:v", "1", "-vf", "scale=1920:1080:flags=lanczos", "-q:v", "2", os.path.join(out, stem + "_poster_1920x1080.jpg")])
        print(f"poster  {stem}_poster_1920x1080.jpg at {t} s")
        if skip_web:
            continue
        for h, crf in ((1080, 23), (720, 23)):
            w = 1920 if h == 1080 else 1280
            dst = os.path.join(web, f"{prod}_Walkthrough_{f['variant']}_{h}p30_web.mp4")
            run([FFMPEG, "-v", "error", "-y", "-i", f["master"], "-vf", f"fps=30,scale={w}:{h}:flags=lanczos,format=yuv420p",
                 "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", str(crf),
                 "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", dst])
            p = probe(dst)
            print(f"web     {dst}  ({p['size'] / 1e6:.1f} MB, audio {'yes' if p['audio'] else 'NO'})")


if __name__ == "__main__":
    main()
