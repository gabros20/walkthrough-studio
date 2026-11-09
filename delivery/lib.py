# Shared helpers for the delivery scripts: config loading, EDL scene spans, ffprobe, SRT parsing.
# Stdlib only (Pillow is imported by the scripts that draw). Run every script with `python3 -I`.
import json
import os
import re
import shutil
import subprocess
import sys

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def usage(doc, argv, min_args=1):
    """-h/--help prints the script's docstring and exits 0; too few arguments prints it as an error."""
    if any(a in ("-h", "--help") for a in argv):
        print(doc.strip())
        sys.exit(0)
    if len(argv) < min_args:
        die(doc)


def load_config(path):
    """Read package.config.json. ${VAR} in paths expands from the environment; relative paths resolve against
    the config file's folder."""
    base = os.path.dirname(os.path.abspath(path))
    cfg = json.load(open(path, encoding="utf-8"))
    cfg["_base"] = base

    def fix(p):
        if not p:
            return p
        p = os.path.expandvars(p)
        if "$" in p:
            die(f"unset environment variable in config path {p!r}: export it first")
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(base, p))

    cfg["out"] = fix(cfg["out"])
    for f in cfg.get("films", []):
        for k in ("master", "srt", "edl"):
            if f.get(k):
                f[k] = fix(f[k])
    cfg["brand"] = load_brand(cfg.get("brand", {}), base)
    return cfg


def load_brand(b, base):
    """Brand tokens for the package: either inline {accent, ink, paper, logo, fonts, ...} or the path of the
    film kit's brand.json (colors.accent/ink/paper, lockup.logo.onLight), optionally with inline overrides
    under "brand": {"file": "brand.json", "footer": "..."}. ${VAR} in paths expands from the environment."""
    if isinstance(b, str):
        b = {"file": b}
    out = {}
    if b.get("file"):
        p = b["file"] if os.path.isabs(b["file"]) else os.path.join(base, b["file"])
        bj = json.load(open(p, encoding="utf-8"))
        c = bj.get("colors", {})
        out = {"name": bj.get("name", ""), "accent": c.get("accent"), "ink": c.get("ink"), "paper": c.get("paper"),
               "logo": ((bj.get("lockup") or {}).get("logo") or {}).get("onLight")}
        base = os.path.dirname(os.path.abspath(p))
    out.update({k: v for k, v in b.items() if k != "file"})
    out = {k: v for k, v in out.items() if v is not None}

    def fix(p):
        p = os.path.expandvars(p)
        return p if os.path.isabs(p) else os.path.normpath(os.path.join(base, p))

    if out.get("logo"):
        out["logo"] = fix(out["logo"])
    if out.get("fonts"):
        out["fonts"] = {w: fix(p) for w, p in out["fonts"].items()}
    return out


def film(cfg, variant):
    for f in cfg["films"]:
        if f["variant"] == variant:
            return f
    die(f"no film with variant {variant!r} in config (have: {[f['variant'] for f in cfg['films']]})")


def run(cmd, quiet=True):
    """Run a command list; raise with its stderr on failure."""
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd[:3])}... failed:\n{r.stderr[-2000:]}")
    return r.stdout


def probe(path):
    """Duration, size, fps, and whether an audio stream exists (with its duration)."""
    out = run([FFPROBE, "-v", "error", "-show_streams", "-show_format", "-of", "json", path])
    d = json.loads(out)
    v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    fps = None
    if v and v.get("avg_frame_rate", "0/0") != "0/0":
        n, m = v["avg_frame_rate"].split("/")
        fps = round(int(n) / int(m), 3)
    return {
        "duration": float(d["format"].get("duration", 0)),
        "width": v and v["width"],
        "height": v and v["height"],
        "fps": fps,
        "vcodec": v and v["codec_name"],
        "audio": bool(a),
        "acodec": a and a["codec_name"],
        "aduration": float(a["duration"]) if a and a.get("duration") else None,
        "size": os.path.getsize(path),
    }


def scene_spans(edl_path):
    """[(id, start, end)] in film seconds, including the title and end cards.

    The film kit's edl.json lists the app scenes only (id, start, duration); the title runs from 0 to the
    first scene and the end card from the last scene's end to the film's total.
    """
    d = json.load(open(edl_path, encoding="utf-8"))
    scenes = sorted(d["scenes"], key=lambda s: s["start"])
    total = d.get("durations", {}).get("total") or d.get("duration")
    spans = []
    if scenes and scenes[0]["start"] > 0:
        spans.append(("title", 0.0, float(scenes[0]["start"])))
    for s in scenes:
        spans.append((s["id"], float(s["start"]), float(s["start"]) + float(s["duration"])))
    if total and spans and total - spans[-1][2] > 0.05:
        spans.append(("end", spans[-1][2], float(total)))
    return spans


TS = re.compile(r"(\d+):(\d{2}):(\d{2})[,.](\d{3})")


def srt_cues(path):
    """[(start, end, text)] from an .srt file."""
    if not path or not os.path.exists(path):
        return []
    blocks = re.split(r"\n\s*\n", open(path, encoding="utf-8-sig").read().strip())
    cues = []
    for b in blocks:
        lines = b.strip().splitlines()
        tl = next((i for i, l in enumerate(lines) if "-->" in l), None)
        if tl is None:
            continue
        a, z = TS.findall(lines[tl])[:2]
        sec = lambda m: int(m[0]) * 3600 + int(m[1]) * 60 + int(m[2]) + int(m[3]) / 1000
        cues.append((sec(a), sec(z), " ".join(lines[tl + 1:]).strip()))
    return cues


def srt_to_vtt_text(srt):
    """WebVTT from SRT text: header, dots in timestamps, cue numbers kept as identifiers."""
    body = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", srt.replace("\r\n", "\n").strip())
    return "WEBVTT\n\n" + body + "\n"


def mmss(t):
    return f"{int(t // 60)}:{t % 60:04.1f}"


def ensure(path):
    os.makedirs(path, exist_ok=True)
    return path
