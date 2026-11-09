"""Map film times from an old cut to a new cut through source time, and show where each voice
line's window and placed audio land.

usage: python3 -I voiceover/remap.py <old.edl.json> <new.edl.json> [--vo-dir <vo dir>]

A film time in the old cut is turned into (scene, source second) with the old edl's ranges
(film = filmIn + (source - srcIn) / rate, inverted), then into the new film time with the new
edl. A source second the new cut dropped snaps to the next kept frame (noted). The title and end
card keep their own clocks (title from 0, end from its start). Prints scene start changes; with
--vo-dir also every line of script.json / placement.json, old -> new. Use it to see what a re-cut
does to a placed voiceover before running fitcheck.py.
"""
import json, os, sys

if any(a in ("-h", "--help") for a in sys.argv[1:]) or len(sys.argv) < 2:
    print(__doc__.strip())
    sys.exit(0 if len(sys.argv) >= 2 else 1)

old = json.load(open(sys.argv[1]))
new = json.load(open(sys.argv[2]))
VO = sys.argv[sys.argv.index("--vo-dir") + 1] if "--vo-dir" in sys.argv else None
OT, NT = old["durations"]["total"], new["durations"]["total"]
N = {s["id"]: s for s in new["scenes"]}
TITLE = old["scenes"][0]["start"]
O_END = old["scenes"][-1]["start"] + old["scenes"][-1]["duration"]
N_END = new["scenes"][-1]["start"] + new["scenes"][-1]["duration"]


def to_src(t):
    if t < TITLE:
        return ("title", t)
    for s in old["scenes"]:
        if s["start"] - 1e-6 <= t < s["start"] + s["duration"]:
            lt = t - s["start"]
            for r in s["ranges"]:
                if r["filmIn"] - 1e-6 <= lt <= r["filmIn"] + r["filmDur"] + 1e-6:
                    return (s["id"], r["srcIn"] + (lt - r["filmIn"]) * r["rate"])
    return ("end", t - O_END)


def to_new(sid, src):
    if sid == "title":
        return src, ""
    if sid == "end":
        return N_END + src, ""
    s = N.get(sid)
    if s is None:
        return None, "scene gone"
    best = None
    for r in s["ranges"]:
        if r["srcIn"] - 1e-6 <= src <= r["srcOut"] + 1e-6:
            return s["start"] + r["filmIn"] + (src - r["srcIn"]) / r["rate"], ""
        if r["srcIn"] > src and (best is None or r["srcIn"] < best[0]):  # cut away: the next kept frame
            best = (r["srcIn"], s["start"] + r["filmIn"])
    if best:
        return best[1], "cut away: next kept frame"
    return s["start"] + s["duration"], "cut away: scene end"


def remap(t):
    sid, src = to_src(t)
    nt, note = to_new(sid, src)
    return sid, src, nt, note


print(f"film {OT:.3f} -> {NT:.3f} s\nscene starts:\ntitle    0.000 ->    0.000")
for s in old["scenes"]:
    print(f"{s['id']:5} {s['start']:8.3f} -> {N[s['id']]['start']:8.3f}" if s["id"] in N else f"{s['id']} gone")
print(f"end   {O_END:8.3f} -> {N_END:8.3f}")
if VO:
    sc = json.load(open(os.path.join(VO, "script.json")))
    pp = os.path.join(VO, "placement.json")
    pl = {l["key"]: l for l in json.load(open(pp))["lines"]} if os.path.exists(pp) else {}
    print("\nline  scene  window old -> new  | placed audio start old -> new")
    for l in sc["lines"]:
        a, b = l["window"]["start"], l["window"]["end"]
        _, _, na, n1 = remap(a)
        _, _, nb, n2 = remap(min(b, OT - 1e-3))
        ps = pl.get(l["id"], {}).get("start")
        _, _, nps, n3 = remap(ps) if ps is not None else (None, None, None, "")
        notes = "; ".join(x for x in (n1, n2, n3) if x)
        fmt = lambda x: "  gone " if x is None else f"{x:7.2f}"
        print(f"{l['id']}  {str(l['scene']):5} {a:7.2f}-{b:7.2f} -> {fmt(na)}-{fmt(nb)}  | {ps} -> {nps if nps is None else round(nps, 2)}  {notes}  :: {l.get('onScreen', '')}")
