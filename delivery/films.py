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
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import FFMPEG, die, ensure, load_config, probe, run, srt_to_vtt_text, usage  # noqa: E402
from lib import sha256 as sha  # noqa: E402


def scale_short_side(short):
    """Scale filter that sets the short side (1080, 720) and keeps the shape: 16:9 -> 1920x1080, 9:16 -> 1080x1920."""
    return f"scale='if(gte(iw,ih),-2,{short})':'if(gte(iw,ih),{short},-2)':flags=lanczos"


def web_encode(src, dst, short=1080, fps=30, crf=23):
    """The web encode: H.264 high, yuv420p, CRF 23, AAC 160k 48 kHz, +faststart (audio only if the source has it)."""
    run([FFMPEG, "-v", "error", "-y", "-i", src, "-vf", f"fps={fps},{scale_short_side(short)},format=yuv420p",
         "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", str(crf),
         "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-movflags", "+faststart", dst])
    return probe(dst)


def poster(src, dst, t, short=1080):
    run([FFMPEG, "-v", "error", "-y", "-ss", str(t), "-i", src, "-frames:v", "1", "-vf", scale_short_side(short), "-q:v", "2", dst])


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
        poster(f["master"], os.path.join(out, stem + "_poster_1920x1080.jpg"), t)
        print(f"poster  {stem}_poster_1920x1080.jpg at {t} s")
        if skip_web:
            continue
        for h in (1080, 720):
            dst = os.path.join(web, f"{prod}_Walkthrough_{f['variant']}_{h}p30_web.mp4")
            p = web_encode(f["master"], dst, h)
            print(f"web     {dst}  ({p['size'] / 1e6:.1f} MB, audio {'yes' if p['audio'] else 'NO'})")


if __name__ == "__main__":
    main()
