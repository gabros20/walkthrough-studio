"""Write voiceover/script.json and script.txt from the lines you wrote per scene, and check they fit.

usage: python3 -I voiceover/make_script.py <lines.json> --out <vo dir>
           [--edl film/edl.json] [--cues film/cues.json] [--duration s]
           [--wps 2.4] [--pad 0.35] [--max-fill 0.85] [--gap 0.5]

lines.json (you write this, one entry per line, in film order):
  {
    "film": "my-walkthrough",                     # optional name
    "voice": "warm, assured narrator, calm pace", # what you will ask the TTS voice for
    "lines": [
      { "id": "L01", "scene": "title", "window": [1.0, 6.6],
        "text": "One sentence in. A campaign, ready to post.", "onScreen": "title lockup lands" },
      { "id": "L02", "scene": "s1", "sceneWindow": [0.3, 5.1], "text": "...", "onScreen": "..." }
    ]
  }
  "window" is film seconds; "sceneWindow" is seconds from the scene's start (needs --edl). Scene ids
  are the storyboard's, plus "title" and "end". Write each line against what is on screen in that
  window (look at the frames: python3 film/scripts/scene-sheets.py).

Fit rule (the one the example film used): a line needs words / wps + pad seconds (2.4 words a
second plus 0.35 s for breath and onset); it may fill at most max-fill (85%) of its window, and
windows must be at least gap (0.5 s) apart, so the music can come up between lines. Every problem
is listed; the exit code is 1 when any line does not fit.
"""
import json, os, re, sys

if any(a in ("-h", "--help") for a in sys.argv[1:]) or len(sys.argv) < 2:
    print(__doc__.strip())
    sys.exit(0 if len(sys.argv) >= 2 else 1)


def arg(name, default=None, cast=str):
    if name in sys.argv:
        return cast(sys.argv[sys.argv.index(name) + 1])
    return default


def scenes_of(edl, total):
    """Film spans of every scene, plus "title" (0 to the first scene) and "end" (last scene to total)."""
    out = {}
    sc = edl["scenes"]
    for s in sc:
        out[s["id"]] = [s["start"], round(s["start"] + s["duration"], 4)]
    out["title"] = [0.0, sc[0]["start"]]
    out["end"] = [max(v[1] for v in out.values()), total]
    return out


def main():
    src = sys.argv[1]
    out = arg("--out")
    if not out:
        sys.exit("--out <vo dir> is required")
    wps, pad = arg("--wps", 2.4, float), arg("--pad", 0.35, float)
    max_fill, gap = arg("--max-fill", 0.85, float), arg("--gap", 0.5, float)
    spec = json.load(open(src))
    edl = json.load(open(arg("--edl"))) if arg("--edl") else None
    cues = json.load(open(arg("--cues"))) if arg("--cues") else None
    total = arg("--duration", None, float) or (cues or {}).get("duration") or ((edl or {}).get("durations") or {}).get("total")
    if total is None:
        sys.exit("film length unknown: pass --cues, an --edl with durations.total, or --duration")
    S = scenes_of(edl, total) if edl else {}

    lines, problems, notes, prev_end, words_total, est_total = [], [], [], None, 0, 0.0
    for l in spec["lines"]:
        if "window" in l:
            a, b = l["window"]
        elif "sceneWindow" in l:
            if l["scene"] not in S:
                problems.append(f'{l["id"]}: scene {l["scene"]} not in the edl (pass --edl)'); continue
            a, b = S[l["scene"]][0] + l["sceneWindow"][0], S[l["scene"]][0] + l["sceneWindow"][1]
        else:
            problems.append(f'{l["id"]}: no window'); continue
        a, b = round(a, 3), round(b, 3)
        w = len(re.findall(r"[A-Za-z0-9'’-]+", l["text"]))
        est = round(w / wps + pad, 2)
        win = round(b - a, 2)
        if est > max_fill * win + 1e-9:
            problems.append(f'{l["id"]}: needs ~{est:.2f} s, window {win:.2f} s allows {max_fill * win:.2f} s: shorten the line or widen the window')
        if prev_end is not None and a < prev_end + gap - 1e-9:
            problems.append(f'{l["id"]}: starts {a - prev_end:.2f} s after the previous window (min {gap} s)')
        if S and l.get("scene") in S and not (S[l["scene"]][0] - 1e-6 <= a and b <= S[l["scene"]][1] + 0.5):
            notes.append(f'{l["id"]}: window {a}-{b} leaves scene {l["scene"]} ({S[l["scene"]][0]}-{S[l["scene"]][1]})')
        prev_end = b
        words_total += w
        est_total += est
        lines.append(dict(id=l["id"], scene=l.get("scene"), window={"start": a, "end": b}, windowLength=win, text=l["text"],
                          words=w, estDuration=est, fillOfWindow=round(est / win, 3) if win > 0 else None, onScreen=l.get("onScreen", "")))

    doc = dict(film=f'{spec.get("film", "film")} ({total} s)', voice=spec.get("voice", ""),
               estimateRule=f"words/{wps} + {pad} s; every line <= {int(max_fill * 100)}% of its window; windows >= {gap} s apart",
               totals=dict(lines=len(lines), words=words_total, estSpeech=round(est_total, 2), speakingShare=round(est_total / total, 3)),
               scenes=S, lines=lines)
    os.makedirs(out, exist_ok=True)
    json.dump(doc, open(os.path.join(out, "script.json"), "w"), indent=2, ensure_ascii=False)
    open(os.path.join(out, "script.txt"), "w").write("\n\n".join(l["text"] for l in lines) + "\n")
    print(doc["totals"])
    for l in lines:
        print(f'{l["id"]} {str(l["scene"]):5} {l["window"]["start"]:7.2f}-{l["window"]["end"]:7.2f} ({l["windowLength"]:.2f}) est {l["estDuration"]:.2f} fill {l["fillOfWindow"]:.2f} | {l["text"]}')
    for n in notes:
        print("note: " + n)
    if problems:
        print("\n".join(["DOES NOT FIT:"] + ["  " + p for p in problems]))
        sys.exit(1)
    print(f"all {len(lines)} lines fit; wrote {out}/script.json and script.txt")


main()
