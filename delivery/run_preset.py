#!/usr/bin/env python3
"""Run a delivery preset (delivery/presets.json) on one project's renders.

usage: python3 -I delivery/run_preset.py sales|web|social|docs [--project DIR] [--render final]
         [--vo-render final-vo|none] [--video FILE] [--vo-video FILE] [--out DIR] [--config package.config.json]
         [--product NAME] [--zip] [--burn | --no-burn] [--allow-silent] [--out-root DIR] [--report FILE]

A render is renders/<name>.mp4 with its sidecars renders/<name>.edl.json, .captions.srt and .cues.json (copied
beside it after every render, film/README.md). --video points at the mixed file to use instead (the sound build's
--deliver output); without it, renders/<name>-sound.mp4 is used when renders/<name>.mp4 has no audio.
Feature groups come from storyboard.json: consecutive scenes that share a "group", named by groups.<g>.name;
an ungrouped scene is its own feature, named by its first caption, else its id. Title and end cards are not
features. --vo-render defaults to final-vo when renders/final-vo.mp4 exists (sales and web use both films).

  sales   the full package from package.config.json (--config, else <project>/package.config.json or
          <project>/delivery/package.config.json; when there is none, one is generated from the renders and the
          groups and saved as <project>/package.config.json to edit): films.py, clips.py, stills.py, the
          showcase ("showcase": {"creatives": DIR, "sheets": [sheet.json, ...]}), 05_Copy and README from
          <project>/delivery/ when written there, else from delivery/templates (captions and script tables are
          filled from the .srt files), md2html.py + html2pdf.mjs, MANIFEST.txt, verify.py, zip.sh.
  web     <Product>_Walkthrough_<Variant>_1080p30_web.mp4 / _720p30_web.mp4, _poster.jpg, .srt, .vtt per film,
          description.txt (description-voiceover.txt): an intro placeholder and YouTube chapters (0:00 Intro, then
          one line per feature at its edl start, whole seconds rounded down).
  social  <nn>-<feature>.mp4 per feature, at most 60 s (a longer feature is split at a scene boundary or a gap
          between captions), captions burned in when the picture does not already carry them (the render's
          cues.json "captions": false, e.g. the voiceover twin; --burn / --no-burn override): ffmpeg subtitles
          (libass), else drawtext, else Pillow-drawn caption plates overlaid; else the .srt only, said plainly.
          Uses renders/<render>-9x16.mp4 when it exists (a 9:16 render with its own sidecars).
  docs    <nn>-<feature>.mp4 (10-30 s; outside that range is reported, not cut), .srt (that span, from 0), .gif
          (palettegen/paletteuse, 960 px at 15 fps, smaller until it is at most 8 MB), .jpg (poster at mid-clip),
          and index.md listing them with feature name and duration.

Every preset writes MANIFEST.txt (file, bytes, duration, sha256) and runs verify.py; --zip zips with zip.sh
(sales zips by default). Clip boundaries never cut a spoken line (clips.py's rule; for a captions film a caption
that cannot be kept whole is reported, not fatal). Every command is printed before it runs ("›").
--out-root DIR puts the default output folder under DIR instead of the project (the CLI uses it when the disk
policy spills to a buffer volume); --report FILE writes a JSON summary (out, zip, files, bytes, per folder).
The output folder is replaced when it holds a MANIFEST.txt or an unfinished run's marker; any other non-empty
folder is refused.
"""
import csv
import datetime
import glob
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

os.environ["WALKTHROUGH_ECHO"] = "1"
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib  # noqa: E402
from lib import (FFMPEG, chapter_ts, cues_to_srt, die, ensure, load_config, mmss, probe, run, scene_groups,  # noqa: E402
                 scene_spans, show, slice_cues, slug, srt_cues, srt_to_vtt_text, usage, write_manifest)
from clips import cut, safe_span  # noqa: E402
from films import poster, scale_short_side, web_encode  # noqa: E402

lib.ECHO = True
KIT = os.path.dirname(HERE)
MARKER = ".walkthrough-preset"
PRESETS = json.load(open(os.path.join(HERE, "presets.json"), encoding="utf-8"))


# ---------------------------------------------------------------- arguments and inputs

def opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def py(script, *args, check=True):
    cmd = [sys.executable, "-I", os.path.join(HERE, script), *[str(a) for a in args]]
    show(cmd)
    r = subprocess.run(cmd)
    if check and r.returncode != 0:
        die(f"{script} failed (exit {r.returncode})")
    return r.returncode


def has_audio(path):
    return probe(path)["audio"]


def resolve_film(project, name, video=None, allow_silent=False, label=None):
    """A render and its sidecars. Dies with the fix when a sidecar is missing or the film is silent."""
    base = os.path.join(project, "renders", name)
    if not video:
        video = base + ".mp4"
        if os.path.exists(video) and not has_audio(video) and os.path.exists(base + "-sound.mp4"):
            print(f"note: renders/{name}.mp4 has no audio; using renders/{name}-sound.mp4 (the sound build's draft)")
            video = base + "-sound.mp4"
    video = os.path.abspath(video)
    if not os.path.exists(video):
        die(f"no video {video}: render it (npx --yes hyperframes@0.9.16 render -o renders/{name}.mp4) or pass --video")
    for ext in ("edl.json", "captions.srt"):
        if not os.path.exists(f"{base}.{ext}"):
            die(f"missing renders/{name}.{ext}: copy the build's sidecars beside the render "
                f"(for f in cues.json edl.json; do cp $f renders/{name}.$f; done; cp captions.srt renders/{name}.captions.srt)")
    p = probe(video)
    if not p["audio"] and not allow_silent:
        die(f"{video} has no audio. Run the sound build (node <kit>/sound/build-sound.mjs --video renders/{name}.mp4 "
            f"--deliver out/<film>.mp4) and pass --video out/<film>.mp4; --allow-silent is for test renders only.")
    captions_in_picture = None
    if os.path.exists(base + ".cues.json"):
        captions_in_picture = json.load(open(base + ".cues.json", encoding="utf-8")).get("captions", True)
    variant = label or ("Voiceover" if captions_in_picture is False else "Captions")
    return {"name": name, "video": video, "edl": base + ".edl.json", "srt": base + ".captions.srt", "probe": p,
            "captions_in_picture": captions_in_picture, "speech": captions_in_picture is False, "variant": variant,
            "cues": srt_cues(base + ".captions.srt")}


def product_name(args, project, cfg=None):
    n = opt(args, "--product") or (cfg or {}).get("product")
    if not n and os.path.exists(os.path.join(project, "brand.json")):
        n = json.load(open(os.path.join(project, "brand.json"), encoding="utf-8")).get("name")
    return re.sub(r"\s+", "-", (n or "Product").strip())


def prepare_out(out):
    """Make out an empty folder, replacing one this script made before; refuse anything else."""
    if os.path.isdir(out) and os.listdir(out):
        if not (os.path.exists(os.path.join(out, "MANIFEST.txt")) or os.path.exists(os.path.join(out, MARKER))):
            die(f"{out} is not empty and was not made by a preset: choose another --out or empty it yourself")
        run(["/bin/rm", "-rf", out])
    ensure(out)
    open(os.path.join(out, MARKER), "w").write("unfinished preset run\n")
    return out


def finish(out, title, args, zip_default=False, verify_args=None):
    os.remove(os.path.join(out, MARKER))
    rows = write_manifest(out, title)
    print(f"\nMANIFEST.txt: {len(rows)} files")
    py("verify.py", *(verify_args or ["--dir", out] + (["--allow-silent"] if "--allow-silent" in args else [])))
    zp = None
    if "--zip" in args or zip_default:
        zp = os.path.join(os.path.dirname(out), f"{os.path.basename(out)}_{datetime.date.today().isoformat()}.zip")
        cmd = ["/bin/bash", os.path.join(HERE, "zip.sh"), out, zp]
        show(cmd)
        subprocess.run(cmd, check=True)
    print(f"\n{out}")
    for rel, size, dur, _ in rows:
        sz = f"{size / 1e6:.2f} MB" if size >= 1e5 else f"{size / 1e3:.1f} KB"
        print(f"  {rel:<64} {sz:>10}{'  ' + dur + ' s' if dur and dur != '?' else ''}")
    rep = opt(args, "--report")
    if rep:  # a JSON summary for the CLI (walkthrough deliver records it in state.json)
        json.dump({"preset": args[0], "out": out, "zip": zp, "zipBytes": os.path.getsize(zp) if zp else None,
                   "files": len(rows), "bytes": sum(r[1] for r in rows),
                   "folders": folders(rows)},
                  open(rep, "w", encoding="utf-8"), indent=1)


def folders(rows):
    """{top-level folder ("." for files at the root): [files, bytes]}"""
    out = {}
    for rel, size, _d, _h in rows:
        k = rel.split(os.sep)[0] if os.sep in rel else "."
        n, b = out.get(k, [0, 0])
        out[k] = [n + 1, b + size]
    return dict(sorted(out.items()))


def place(args, project, default):
    """Where an output folder goes: --out (relative to the project) wins; else the default name, under --out-root
    when given (the CLI's disk policy spills to a buffer volume), else under the project."""
    if opt(args, "--out"):
        return os.path.abspath(os.path.join(project, opt(args, "--out")))
    if opt(args, "--out-root"):
        return os.path.join(os.path.abspath(opt(args, "--out-root")), os.path.basename(default.rstrip("/")))
    return os.path.abspath(os.path.join(project, default))


def out_dir(args, project, preset, product):
    return place(args, project, PRESETS[preset]["out"].format(product=product))


def vo_film(args, project, allow_silent):
    name = opt(args, "--vo-render")
    if name == "none":
        return None
    if not name:
        if not (os.path.exists(os.path.join(project, "renders", "final-vo.mp4")) or opt(args, "--vo-video")):
            return None
        name = "final-vo"
    return resolve_film(project, name, opt(args, "--vo-video"), allow_silent, "Voiceover")


def storyboard(project):
    return os.path.join(project, "storyboard.json")


def spoken_safe(f, a, z, total, name):
    """clips.py's rule: never cut a spoken line (strict for speech; a caption that cannot be kept whole is noted)."""
    return safe_span(a, z, f["cues"], total, name, strict=f["speech"])


def nice(name):
    s = re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-")
    return (s[:1].upper() + s[1:]) or "Part"


# ---------------------------------------------------------------- web

def chapters(f, cfg):
    spans = scene_spans(f["edl"])
    total = spans[-1][2]
    groups = scene_groups(f["edl"], cfg["storyboard"], f["cues"])
    ch = []
    if spans and spans[0][0] == "title":
        ch.append((0.0, cfg["intro"]))
    for g in groups:
        ch.append((0.0 if not ch else g["start"], g["name"]))
    warn = []
    yt = PRESETS["web"]["youtube"]
    if len(ch) < yt["min_chapters"]:
        warn.append(f"{len(ch)} chapters: YouTube shows chapters only with {yt['min_chapters']} or more")
    for i, (t, n) in enumerate(ch):
        end = ch[i + 1][0] if i + 1 < len(ch) else total
        if end - t < yt["min_chapter_seconds"]:
            warn.append(f"chapter {chapter_ts(t)} {n!r} is {end - t:.1f} s: YouTube needs {yt['min_chapter_seconds']} s or more per chapter")
    seen = {}
    for t, n in ch:
        if chapter_ts(t) in seen:
            warn.append(f"{n!r} and {seen[chapter_ts(t)]!r} both start at {chapter_ts(t)}")
        seen[chapter_ts(t)] = n
    return ch, warn


def preset_web(args, project):
    P = PRESETS["web"]
    allow = "--allow-silent" in args
    main = resolve_film(project, opt(args, "--render", "final"), opt(args, "--video"), allow)
    films = [main] + [x for x in [vo_film(args, project, allow)] if x]
    prod = product_name(args, project)
    out = prepare_out(out_dir(args, project, "web", prod))
    warns = []
    for f in films:
        stem = f"{prod}_Walkthrough_{f['variant']}"
        for e in P["encodes"]:
            web_encode(f["video"], os.path.join(out, f"{stem}_{e['label']}_web.mp4"), e["short"], e["fps"], e["crf"])
        d = f["probe"]["duration"]
        poster(f["video"], os.path.join(out, f"{stem}_poster.jpg"), min(P["poster_t"], d / 2))
        shutil.copyfile(f["srt"], os.path.join(out, stem + ".srt"))
        open(os.path.join(out, stem + ".vtt"), "w", encoding="utf-8").write(srt_to_vtt_text(open(f["srt"], encoding="utf-8-sig").read()))
        ch, w = chapters(f, {"storyboard": storyboard(project), "intro": P["intro_chapter"]})
        warns += [f"{f['variant']}: {x}" for x in w]
        name = "description.txt" if f is main else f"description-{f['variant'].lower()}.txt"
        body = (f"[Intro: one paragraph on what {prod.replace('-', ' ')} is, who it is for and what this film shows. "
                "Plain words. Replace this line before publishing.]\n\n"
                "Chapters\n" + "\n".join(f"{chapter_ts(t)} {n}" for t, n in ch) + "\n\n"
                f"Subtitles: {stem}.vtt (upload it as the caption track).\n")
        open(os.path.join(out, name), "w", encoding="utf-8").write(body)
        print(f"{name}: {len(ch)} chapters from renders/{f['name']}.edl.json")
    for w in warns:
        print(f"warning: {w}")
    finish(out, f"{prod} web package", args)


# ---------------------------------------------------------------- social and docs: shared

def ffmpeg_filters():
    out = subprocess.run([FFMPEG, "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    names = set()
    for line in out.splitlines():
        t = line.split()
        if len(t) >= 3 and "->" in t[2]:
            names.add(t[1])
    return names


FONTS = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/Library/Fonts/Arial Bold.ttf",
         "/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf"]


def caption_font():
    for p in [os.environ.get("WALKTHROUGH_CAPTION_FONT")] + FONTS:
        if p and os.path.exists(p):
            return p
    return None


def out_size(p, short=1080):
    w, h = p["width"], p["height"]
    if w >= h:
        return int(w * short / h) // 2 * 2, short
    return short, int(h * short / w) // 2 * 2


def wrap(text, max_px, measure):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        t = f"{cur} {wd}".strip()
        if cur and measure(t) > max_px:
            lines.append(cur)
            cur = wd
        else:
            cur = t
    return lines + ([cur] if cur else [])


def group_parts(f, groups, max_s):
    """[(nn, feature, a, z)]: one per group, a group longer than max_s split at scene boundaries or caption gaps."""
    spans = {sid: (a, z) for sid, a, z in scene_spans(f["edl"])}
    out = []
    for i, g in enumerate(groups, 1):
        a, z = g["start"], g["end"]
        if max_s is None or z - a <= max_s:
            out.append((i, g["name"], a, z, None))
            continue
        pts = sorted({spans[s][0] for s in g["scenes"][1:]} |
                     {round((e + s2) / 2, 3) for (s1, e, _), (s2, _, _) in zip(f["cues"], f["cues"][1:]) if s2 - e >= 0.3})
        parts, s = [], a
        while z - s > max_s:
            c = max([p for p in pts if s + 1 < p <= s + max_s], default=s + max_s)
            parts.append((s, c))
            s = c
        parts.append((s, z))
        for k, (pa, pz) in enumerate(parts, 1):
            out.append((i, g["name"], pa, pz, k))
    return out


# ---------------------------------------------------------------- social

def burn_plan(args, f, P, filters):
    if "--no-burn" in args:
        return None, "not burned (--no-burn)"
    if f["captions_in_picture"] and "--burn" not in args:
        return None, "not burned: the picture already carries the captions (cues.json \"captions\": true); --burn forces it"
    for m in P["burn"]:
        if m in ("subtitles", "drawtext") and m in filters and (m == "subtitles" or caption_font()):
            return m, f"burned with ffmpeg {m}"
        if m == "overlay":
            try:
                import PIL  # noqa: F401
                return m, "burned as Pillow-drawn caption plates (this ffmpeg has neither subtitles nor drawtext)"
            except ImportError:
                pass
    return None, "NOT burned: this ffmpeg has no subtitles (libass) or drawtext filter and Pillow is missing; the .srt sits beside each clip"


def plate(text, W, H, P, path):
    """A caption plate PNG (ink at 78% behind white type), sized to the text, for the overlay route."""
    from PIL import Image, ImageDraw, ImageFont
    portrait = H > W
    px = round(min(W, H) * P["caption"]["font_frac"])
    fp = caption_font()
    font = ImageFont.truetype(fp, px) if fp else ImageFont.load_default(px)
    d0 = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    lines = wrap(text, W * P["caption"]["max_width_frac"]["portrait" if portrait else "landscape"], lambda t: d0.textlength(t, font=font))
    pad, gap = round(px * 0.55), round(px * 0.28)
    lw = max(d0.textlength(l, font=font) for l in lines)
    w, h = int(lw + 2 * pad), int(len(lines) * px + (len(lines) - 1) * gap + 2 * pad)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=round(px * 0.35), fill=(20, 20, 20, 200))
    for i, l in enumerate(lines):
        d.text(((w - d.textlength(l, font=font)) / 2, pad + i * (px + gap) - round(px * 0.1)), l, font=font, fill=(255, 255, 255, 255))
    im.save(path)


def social_clip(f, a, z, dst, srt_rel, cues, method, P, tmp):
    dur = round(z - a, 3)
    W, H = out_size(f["probe"])
    base = f"fps={P['fps']},{scale_short_side(1080)},format=yuv420p"
    bottom = round(H * P["caption"]["bottom_frac"]["portrait" if H > W else "landscape"])
    audio = f["probe"]["audio"]
    if not method or not cues:
        return cut(f["video"], a, dur, dst, vf=base, crf=P["crf"], audio=audio)
    if method == "subtitles":
        size = round(min(W, H) * P["caption"]["font_frac"] / H * 288, 1)
        style = f"FontName=Arial,Bold=1,FontSize={size},PrimaryColour=&H00FFFFFF,BackColour=&H38141414,BorderStyle=4,Outline=0,Shadow=0,MarginV={round(bottom / H * 288)},Alignment=2"
        return cut(f["video"], a, dur, dst, vf=f"{base},subtitles=filename={srt_rel}:force_style='{style}'", crf=P["crf"], cwd=os.path.dirname(dst), audio=audio)
    if method == "drawtext":
        px = round(min(W, H) * P["caption"]["font_frac"])
        parts = [base]
        for i, (s, e, t) in enumerate(cues):
            tf = os.path.join(tmp, f"cue-{i}.txt")
            lines = wrap(t, W * P["caption"]["max_width_frac"]["portrait" if H > W else "landscape"], lambda x: len(x) * px * 0.55)
            open(tf, "w", encoding="utf-8").write("\n".join(lines))
            parts.append(f"drawtext=fontfile='{caption_font()}':textfile='{tf}':fontsize={px}:fontcolor=white:line_spacing={round(px * 0.28)}"
                         f":box=1:boxcolor=0x141414@0.78:boxborderw={round(px * 0.55)}:x=(w-text_w)/2:y=h-text_h-{bottom}"
                         f":enable='between(t,{s},{e})'")
        return cut(f["video"], a, dur, dst, vf=",".join(parts), crf=P["crf"], audio=audio)
    # overlay: one Pillow plate per cue, shown between its times
    inputs, chain, last = [], [f"[0:v]{base}[b0]"], "b0"
    for i, (s, e, t) in enumerate(cues, 1):
        png = os.path.join(tmp, f"plate-{os.path.basename(dst)}-{i}.png")
        plate(t, W, H, P, png)
        inputs.append(["-loop", "1", "-t", str(dur), "-i", png])
        chain.append(f"[{last}][{i}:v]overlay=x=(main_w-overlay_w)/2:y=main_h-overlay_h-{bottom}:enable='between(t,{s},{e})'[b{i}]")
        last = f"b{i}"
    chain.append(f"[{last}]format=yuv420p[v]")
    return cut(f["video"], a, dur, dst, crf=P["crf"], extra_inputs=inputs, filter_complex=";".join(chain), audio=audio)


def preset_social(args, project):
    P = PRESETS["social"]
    allow = "--allow-silent" in args
    name = opt(args, "--render", "final")
    vert = name + P["vertical_suffix"]
    if not name.endswith(P["vertical_suffix"]) and not opt(args, "--video") and os.path.exists(os.path.join(project, "renders", vert + ".mp4")):
        print(f"note: using the 9:16 render renders/{vert}.mp4")
        name = vert
    f = resolve_film(project, name, opt(args, "--video"), allow)
    if f["probe"]["width"] > f["probe"]["height"]:
        print(f"note: renders/{name}.mp4 is landscape; the clips keep its shape. A 9:16 render "
              f"(renders/{name}{P['vertical_suffix']}.mp4 with its sidecars) is used instead when it exists.")
    method, how = burn_plan(args, f, P, ffmpeg_filters())
    print(f"captions: {how}")
    prod = product_name(args, project)
    out = prepare_out(out_dir(args, project, "social", prod))
    total = f["probe"]["duration"]
    groups = scene_groups(f["edl"], storyboard(project), f["cues"])
    rows, tmp = [], tempfile.mkdtemp(prefix="social-")
    try:
        for nn, feat, a, z, part in group_parts(f, groups, P["max_seconds"]):
            stem = f"{nn:02d}-{slug(feat)}" + (f"-part-{part}" if part else "")
            a, z, notes = spoken_safe(f, a, z, total, stem)
            cues = slice_cues(f["cues"], a, z)
            open(os.path.join(out, stem + ".srt"), "w", encoding="utf-8").write(cues_to_srt(cues))
            social_clip(f, a, z, os.path.join(out, stem + ".mp4"), stem + ".srt", cues, method, P, tmp)
            rows.append((stem, feat + (f" (part {part})" if part else ""), z - a))
            print(f"{stem}: {mmss(a)}-{mmss(z)} ({z - a:.1f} s){'  ' + '; '.join(notes) if notes else ''}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    with open(os.path.join(out, "index.md"), "w", encoding="utf-8") as fh:
        fh.write(f"# {prod.replace('-', ' ')}: social clips\n\nFrom `renders/{os.path.basename(f['video'])}`, one clip per feature, "
                 f"at most {P['max_seconds']} s. Captions: {how}.\n\n| Clip | Feature | Duration |\n|---|---|---|\n")
        fh.writelines(f"| `{s}.mp4` | {n} | {d:.1f} s |\n" for s, n, d in rows)
    finish(out, f"{prod} social clips", args)


# ---------------------------------------------------------------- docs

def make_gif(src, dst, G):
    """Palette GIF at the first (width, fps) step that fits max_bytes. Returns (width, fps, bytes, fits)."""
    for w, fps in G["steps"]:
        run([FFMPEG, "-v", "error", "-y", "-i", src, "-vf",
             f"fps={fps},scale={w}:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];"
             f"[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0", dst])
        sz = os.path.getsize(dst)
        if sz <= G["max_bytes"]:
            return w, fps, sz, True
        print(f"  gif {w} px {fps} fps is {sz / 1e6:.1f} MB: smaller")
    return w, fps, sz, False


def preset_docs(args, project):
    P = PRESETS["docs"]
    allow = "--allow-silent" in args
    f = resolve_film(project, opt(args, "--render", "final"), opt(args, "--video"), allow)
    prod = product_name(args, project)
    out = prepare_out(out_dir(args, project, "docs", prod))
    total = f["probe"]["duration"]
    W, H = out_size(f["probe"])
    rows, warns = [], []
    for g_i, g in enumerate(scene_groups(f["edl"], storyboard(project), f["cues"]), 1):
        stem = f"{g_i:02d}-{slug(g['name'])}"
        a, z, notes = spoken_safe(f, g["start"], g["end"], total, stem)
        dur = round(z - a, 3)
        if not P["min_seconds"] <= dur <= P["max_seconds"]:
            warns.append(f"{stem}: {dur:.1f} s is outside {P['min_seconds']}-{P['max_seconds']} s (regroup the scenes in the storyboard to change it)")
        mp4 = os.path.join(out, stem + ".mp4")
        cut(f["video"], a, dur, mp4, vf=f"fps={P['fps']},{scale_short_side(1080)},format=yuv420p", crf=P["crf"], audio=f["probe"]["audio"])
        open(os.path.join(out, stem + ".srt"), "w", encoding="utf-8").write(cues_to_srt(slice_cues(f["cues"], a, z)))
        poster(mp4, os.path.join(out, stem + ".jpg"), dur / 2)
        gw, gfps, gsz, fits = make_gif(mp4, os.path.join(out, stem + ".gif"), P["gif"])
        if not fits:
            warns.append(f"{stem}.gif is {gsz / 1e6:.1f} MB at the smallest step ({gw} px, {gfps} fps): shorten the feature")
        rows.append((stem, g["name"], dur, gw, gfps, gsz))
        print(f"{stem}: {mmss(a)}-{mmss(z)} ({dur:.1f} s), gif {gw} px {gfps} fps {gsz / 1e6:.2f} MB{'  ' + '; '.join(notes) if notes else ''}")
    with open(os.path.join(out, "index.md"), "w", encoding="utf-8") as fh:
        fh.write(f"# {prod.replace('-', ' ')}: feature clips for docs\n\n"
                 f"Cut from `{os.path.basename(f['video'])}` ({total:.1f} s, {W}x{H}) on the film's scene groups. Each feature has an MP4"
                 f"{' with sound' if f['probe']['audio'] else ''}, a looping silent GIF, its captions as an .srt (times from 0) and a poster frame.\n\n"
                 "| # | Feature | Duration | Files | GIF |\n|---|---|---|---|---|\n")
        for s, n, d, gw, gfps, gsz in rows:
            fh.write(f"| {s[:2]} | {n} | {d:.1f} s | [mp4]({s}.mp4) · [gif]({s}.gif) · [srt]({s}.srt) · [jpg]({s}.jpg) | {gw} px, {gfps} fps, {gsz / 1e6:.1f} MB |\n")
        if rows:
            s, n = rows[0][0], rows[0][1]
            fh.write(f"\n## Embedding\n\nMarkdown (GitHub, most help centres): `![{n}]({s}.gif)`\n\n"
                     f"HTML: `<video src=\"{s}.mp4\" poster=\"{s}.jpg\" controls muted playsinline></video>`\n")
    for w in warns:
        print(f"warning: {w}")
    finish(out, f"{prod} docs clips", args)


# ---------------------------------------------------------------- sales

def find_config(args, project):
    c = opt(args, "--config")
    if c:
        return os.path.abspath(os.path.join(project, c))
    for p in ("package.config.json", "delivery/package.config.json"):
        if os.path.exists(os.path.join(project, p)):
            return os.path.join(project, p)
    return None


def generate_config(args, project, path):
    allow = "--allow-silent" in args
    main = resolve_film(project, opt(args, "--render", "final"), opt(args, "--video"), allow, "Captions")
    vo = vo_film(args, project, allow)
    prod = product_name(args, project)
    rel = lambda p: os.path.relpath(p, project)  # noqa: E731
    films = [{"variant": f["variant"], "master": rel(f["video"]), "srt": rel(f["srt"]), "edl": rel(f["edl"]),
              "poster_t": 6.0, "speech": f is vo} for f in [main, vo] if f]
    groups = scene_groups(main["edl"], storyboard(project), main["cues"])
    spans = {s: (a, z) for s, a, z in scene_spans(main["edl"])}
    clips = ([{"name": "00_Title", "scenes": ["title"]}] if "title" in spans else []) + \
        [{"name": f"{i:02d}_{nice(g['name'])}", "scenes": g["scenes"]} for i, g in enumerate(groups, 1)] + \
        ([{"name": f"{len(groups) + 1:02d}_End-card", "scenes": ["end"]}] if "end" in spans else [])
    still_from = vo or main
    items = ([{"name": "00_Title-card", "t": round(min(6.0, spans["title"][1] - 0.5), 2), "crop": "full"}] if "title" in spans else []) + \
        [{"name": f"{i:02d}_{nice(g['name'])}", "t": round((g["start"] + g["end"]) / 2, 2), "crop": "full" if vo else "band"}
         for i, g in enumerate(groups, 1)]
    cfg = {"_comment": "Generated by delivery/run_preset.py sales from the renders and the storyboard's scene groups. "
                       "Still times are mid-feature guesses: look at each still and change its time, then run again.",
           "product": prod, "out": PRESETS["sales"]["out"].format(product=prod)}
    if os.path.exists(os.path.join(project, "brand.json")):
        cfg["brand"] = "brand.json"
    cfg.update({"films": films, "clips": clips,
                "stills": {"from": still_from["variant"], "crop": PRESETS["sales"]["stills_crop"], "items": items}})
    json.dump(cfg, open(path, "w", encoding="utf-8"), indent=1)
    print(f"generated {path}: {len(films)} films, {len(clips)} clips, {len(items)} stills (edit names and still times, then run again)")


def effective_config(args, project, cfg_path):
    """The config with absolute paths (and --out applied), saved beside the package as <package>.config.json."""
    cfg = load_config(cfg_path)
    raw = json.load(open(cfg_path, encoding="utf-8"))
    cfg["out"] = place(args, project, cfg["out"])
    sc = raw.get("showcase")
    if sc:
        base = os.path.dirname(os.path.abspath(cfg_path))
        fix = lambda p: p if os.path.isabs(p) else os.path.normpath(os.path.join(base, os.path.expandvars(p)))  # noqa: E731
        cfg["showcase"] = {**sc, "creatives": fix(sc["creatives"]) if sc.get("creatives") else None,
                           "sheets": [fix(s) for s in sc.get("sheets", [])], "readme": fix(sc["readme"]) if sc.get("readme") else None}
    cfg.pop("_base", None)
    path = cfg["out"].rstrip("/") + ".config.json"
    ensure(os.path.dirname(path))
    json.dump(cfg, open(path, "w", encoding="utf-8"), indent=1)
    return cfg, path


def fill(template, **kw):
    t = open(template, encoding="utf-8").read()
    for k, v in kw.items():
        t = t.replace("{" + k + "}", v)
    return t


def srt_table(title, srt, note):
    rows = "".join(f"| {i} | {mmss(a)} | {mmss(z)} | {t} |\n" for i, (a, z, t) in enumerate(srt_cues(srt), 1))
    return f"# {title}\n\n{note}\n\n| # | From | To | Text |\n|---|---|---|---|\n{rows}"


def showcase(cfg, out, prod):
    sc = cfg.get("showcase") or {}
    if not sc.get("creatives"):
        print("showcase: skipped (no \"showcase\": {\"creatives\": DIR} in the config)")
        return
    from PIL import Image
    d = ensure(os.path.join(out, "04_Creative-Showcase"))
    dst = os.path.join(d, "creatives")
    show(["cp", "-R", sc["creatives"], dst])
    shutil.copytree(sc["creatives"], dst, ignore=shutil.ignore_patterns(".DS_Store", "manifest.json"))
    imgs = sorted(p for p in glob.glob(os.path.join(dst, "**", "*"), recursive=True) if p.lower().endswith((".png", ".jpg", ".jpeg", ".webp")))
    with open(os.path.join(d, "index.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "campaign", "pixel_size", "bytes"])
        for p in imgs:
            rel = os.path.relpath(p, d)
            camp = rel.split(os.sep)[1] if rel.count(os.sep) >= 2 else ""
            w.writerow([rel, camp, "x".join(map(str, Image.open(p).size)), os.path.getsize(p)])
    sheets_dir = ensure(os.path.join(d, "sheets"))
    sheets = sc.get("sheets") or []
    if not sheets and imgs:
        step = max(1, len(imgs) // PRESETS["sales"]["showcase_auto_images"])
        auto = {"size": [3840, 2160], "brand": {k: v for k, v in cfg.get("brand", {}).items() if k in ("accent", "ink", "paper", "logo")},
                "eyebrow": "Creative showcase", "title": f"What {prod.replace('-', ' ')} makes",
                "caption": "TODO: one line on what these images show.", "images": imgs[::step][:PRESETS["sales"]["showcase_auto_images"]]}
        tmpd = tempfile.mkdtemp(prefix="sheet-")
        sheets = [os.path.join(tmpd, "01_Overview_16x9.json")]
        json.dump(auto, open(sheets[0], "w", encoding="utf-8"))
    for s in sheets:
        py("showcase_sheet.py", s, os.path.join(sheets_dir, os.path.splitext(os.path.basename(s))[0] + ".png"), "--jpg")
    if not sc.get("sheets") and imgs:
        shutil.rmtree(os.path.dirname(sheets[0]), ignore_errors=True)
    readme = sc.get("readme") or os.path.join(HERE, "templates", "04_Creative-Showcase", "README.md")
    open(os.path.join(d, "README.md"), "w", encoding="utf-8").write(fill(readme, count=str(len(imgs))))


def folder_rows(out, cfg):
    rows = []
    def n(pat):  # noqa: E306
        return len(glob.glob(os.path.join(out, pat), recursive=True))
    if os.path.isdir(os.path.join(out, "01_Films")):
        rows.append(f"| `01_Films/` | {len(cfg['films'])} version(s) of the walkthrough ({', '.join(f['variant'] for f in cfg['films'])}), each with subtitle files (`.srt`, `.vtt`) and a poster image. | Showing the whole story. |")
        rows.append("| `01_Films/web/` | Lighter copies at 1080p and 720p, 30 fps. | Web pages, email links, slides that must stay small. |")
    if os.path.isdir(os.path.join(out, "02_Feature-Clips")):
        rows.append(f"| `02_Feature-Clips/` | The film cut into {len(cfg.get('clips', []))} short clips, one per feature, numbered in film order. | One clip per slide in a deck. |")
    if os.path.isdir(os.path.join(out, "03_Screenshots")):
        rows.append(f"| `03_Screenshots/` | {n('03_Screenshots/*.png')} stills from the film; `full-frame-16x9/` holds them uncropped. | Slides, documents, a web page. |")
    if os.path.isdir(os.path.join(out, "04_Creative-Showcase")):
        rows.append(f"| `04_Creative-Showcase/` | Sheets of the app's output and {n('04_Creative-Showcase/creatives/**/*.*')} individual images with an `index.csv`. | Showing the output itself. |")
    rows.append("| `05_Copy/` | Key messages, facts and figures, the captions and script with times, presenter notes, slide copy. | Writing a deck, a web page or an email; presenting live. |")
    return "\n".join(rows)


def preset_sales(args, project):
    cfg_path = find_config(args, project)
    if not cfg_path:
        cfg_path = os.path.join(project, "package.config.json")
        generate_config(args, project, cfg_path)
    cfg, eff = effective_config(args, project, cfg_path)
    print(f"config: {cfg_path}\neffective config (absolute paths): {eff}")
    out = prepare_out(cfg["out"])
    prod = cfg["product"]
    py("films.py", eff)
    if cfg.get("clips"):
        py("clips.py", eff)
    if (cfg.get("stills") or {}).get("items"):
        py("stills.py", eff)
    showcase(cfg, out, prod)
    # written material: the project's own (delivery/README.md, delivery/05_Copy/*.md) wins over the templates
    own = os.path.join(project, "delivery")
    copy = ensure(os.path.join(out, "05_Copy"))
    f0 = cfg["films"][0]
    groups = scene_groups(f0["edl"], storyboard(project), srt_cues(f0.get("srt")))
    spans = {sid: (a, z) for sid, a, z in scene_spans(f0["edl"])}
    beats = ([(*spans["title"], "Title card")] if "title" in spans else []) + [(g["start"], g["end"], g["name"]) for g in groups] + \
        ([(*spans["end"], "End card")] if "end" in spans else [])
    gen = {
        "Presenter-notes.md": lambda t: fill(t, rows="\n".join(f"| {mmss(a)}-{mmss(z)} | {n} | TODO |" for a, z, n in beats)),
        "Slide-copy.md": lambda t: fill(t, slides="\n".join(
            f"## {i}. {c['name'].split('_', 1)[-1].replace('-', ' ')}\n\n**Headline:** TODO\n\n**Body:** TODO (two lines)\n\n**Clip:** `02_Feature-Clips/{cfg['films'][0]['variant'].lower()}/{prod}_{c['name']}_{cfg['films'][0]['variant']}.mp4`\n"
            for i, c in enumerate(cfg.get("clips", []), 1))),
    }
    for t in sorted(glob.glob(os.path.join(HERE, "templates", "05_Copy", "*.md"))):
        name = os.path.basename(t)
        mine = os.path.join(own, "05_Copy", name)
        text = open(mine, encoding="utf-8").read() if os.path.exists(mine) else gen.get(name, lambda x: open(x, encoding="utf-8").read())(t)
        open(os.path.join(copy, name), "w", encoding="utf-8").write(text)
    for f in cfg["films"]:
        if not f.get("srt"):
            continue
        name, title = ("Voiceover-script.md", "Voiceover script") if f.get("speech") else ("Film-captions.md", "Film captions")
        mine = os.path.join(own, "05_Copy", name)
        text = open(mine, encoding="utf-8").read() if os.path.exists(mine) else \
            srt_table(title, f["srt"], f"Exact text with film times, from `{os.path.basename(f['srt'])}` ({f['variant']} film).")
        open(os.path.join(copy, name), "w", encoding="utf-8").write(text)
    readme = os.path.join(out, "README.md")
    if os.path.exists(os.path.join(own, "README.md")):
        shutil.copyfile(os.path.join(own, "README.md"), readme)
    else:
        open(readme, "w", encoding="utf-8").write(fill(os.path.join(HERE, "templates", "README.md"), product=prod.replace("-", " "),
                                                       month=datetime.date.today().strftime("%B %Y"), folders=folder_rows(out, cfg)))
    py("md2html.py", readme, os.path.join(out, "README.html"), "--config", eff)
    cmd = ["node", os.path.join(HERE, "html2pdf.mjs"), os.path.join(out, "README.html"), os.path.join(out, "README.pdf")]
    show(cmd)
    if subprocess.run(cmd).returncode != 0:
        print("warning: README.pdf not made (html2pdf.mjs needs Playwright: npm run setup); README.md and README.html are there")
    finish(out, f"{prod} demo package", args, zip_default=PRESETS["sales"]["zip"],
           verify_args=[eff] + (["--allow-silent"] if "--allow-silent" in args else []))


def main():
    sys.stdout.reconfigure(line_buffering=True)  # keep "›" lines and errors in order when piped
    args = sys.argv[1:]
    usage(__doc__, args)
    preset = args[0]
    if preset not in ("sales", "web", "social", "docs"):
        die(f"unknown preset {preset!r}: sales, web, social or docs")
    project = os.path.abspath(opt(args, "--project", os.getcwd()))
    print(f"preset {preset}: {PRESETS[preset]['describe']}\nproject {project}")
    {"sales": preset_sales, "web": preset_web, "social": preset_social, "docs": preset_docs}[preset](args, project)


if __name__ == "__main__":
    main()
