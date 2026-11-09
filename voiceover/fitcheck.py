"""Fit check of placed voice lines against a re-timed picture.

usage: python3 -I voiceover/fitcheck.py --vo-dir <vo dir>
           --old-edl <old.edl.json> --old-cues <old.cues.json>
           --new-edl <new.edl.json> --new-cues <new.cues.json>
           [--out windows.json] [L21=start,end ...]

When the picture changes after the voice was placed, every line's window has to move with it.
This maps each old window through anchors shared by the old and new cut (scene starts and ends,
labelled cues such as clicks and transitions), then places each line exactly as place.py would
(speech onset at window start + LEAD, giving back up to LEAD of lead-in when short) and reports the
slack against the new window end. Lines with less than MIN_SLACK are listed as SHORT; fix them by
re-cutting the picture, overriding a window (L21=141.0,150.2), or rewriting and re-recording the line.
Writes a windows.json that place.py --windows can use. Reads script.json and placement.json from the
vo dir.
"""
import bisect, json, os, sys

if any(a in ("-h", "--help") for a in sys.argv[1:]) or len(sys.argv) < 2:
    print(__doc__.strip())
    sys.exit(0 if len(sys.argv) >= 2 else 1)

LEAD, MIN_SLACK, GAP = 0.15, 0.3, 0.5


def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def scenes(edl, total):
    out = {"title": [0.0, None]}
    sc = edl["scenes"]
    for s in sc:
        out[s["id"]] = [s["start"], round(s["start"] + s["duration"], 4)]
    out["title"][1] = sc[0]["start"]
    last = max(v[1] for k, v in out.items() if k != "title")
    out["end"] = [last, total]
    return out


def keyed(cues):
    """Each cue keyed by (type, label or kind:target, occurrence) so the same cue is found in both cuts."""
    seen, out = {}, {}
    for c in cues["cues"]:
        k = (c["type"], c.get("label") or c.get("kind", "") + ":" + str(c.get("to", c.get("where", ""))))
        n = seen.get(k, 0); seen[k] = n + 1
        out[k + (n,)] = c["t"]
    return out


def main():
    vo = arg("--vo-dir")
    need = ["--vo-dir", "--old-edl", "--old-cues", "--new-edl", "--new-cues"]
    if any(arg(n) is None for n in need):
        sys.exit(__doc__)
    old_edl, old_cues = json.load(open(arg("--old-edl"))), json.load(open(arg("--old-cues")))
    new_edl, new_cues = json.load(open(arg("--new-edl"))), json.load(open(arg("--new-cues")))
    old_total, new_total = old_cues["duration"], new_cues["duration"]
    S_old, S_new = scenes(old_edl, old_total), scenes(new_edl, new_total)
    anchors = [(0.0, 0.0), (old_total, new_total)]
    for k in S_old:
        if k in S_new:
            anchors += [(S_old[k][0], S_new[k][0]), (S_old[k][1], S_new[k][1])]
    ko, kn = keyed(old_cues), keyed(new_cues)
    missing = [k for k in ko if k not in kn]
    for k in ko:
        if k in kn:
            anchors.append((ko[k], kn[k]))
    anchors = sorted(set(anchors))
    mono = []  # keep the map monotone
    for a in anchors:
        if not mono or (a[0] > mono[-1][0] and a[1] >= mono[-1][1]):
            mono.append(a)
    xs = [a[0] for a in mono]

    def m(t):
        i = max(0, min(bisect.bisect_right(xs, t) - 1, len(mono) - 2))
        (x0, y0), (x1, y1) = mono[i], mono[i + 1]
        return y0 + (t - x0) * (y1 - y0) / (x1 - x0)

    overrides = {}
    for a in sys.argv[1:]:
        if "=" in a and not a.startswith("--"):
            k, v = a.split("="); s, e = map(float, v.split(",")); overrides[k] = (s, e)

    script = json.load(open(os.path.join(vo, "script.json")))["lines"]
    placed = {p["key"]: p for p in json.load(open(os.path.join(vo, "placement.json")))["lines"]}
    print(f"film {old_total:.3f} -> {new_total:.3f} s ({new_total - old_total:+.3f}); {len(mono)} anchors; old cues unmatched: {[k[1] for k in missing]}")
    rows, wins = [], {}
    for l in script:
        ws, we = m(l["window"]["start"]), m(l["window"]["end"])
        if l["id"] in overrides:
            ws, we = overrides[l["id"]]
        wins[l["id"]] = [round(ws, 3), round(we, 3)]
        rows.append([l, ws, we])
    for a, b in zip(rows, rows[1:]):  # windows stay GAP apart
        if b[1] - a[2] < GAP:
            a[2] = b[1] - GAP
            wins[a[0]["id"]][1] = round(a[2], 3)
    bad = []
    print(f'{"id":4} {"scene":5} {"old win":>15} {"new win":>17} {"len":>5} {"line":>5} {"slack":>6}')
    for l, ws, we in rows:
        p = placed[l["id"]]
        onset = p["speechStart"] - p["start"]
        fs = ws + LEAD - onset
        fe = fs + p["measuredDuration"]
        slack = we - fe
        lead_note = ""
        if slack < MIN_SLACK:  # place.py gives back up to LEAD of lead-in first
            back = min(LEAD, MIN_SLACK - slack); fe -= back; slack += back
            lead_note = f"(lead-in {LEAD - back:.2f}) "
        flag = ""
        if slack < MIN_SLACK:
            flag = f"SHORT by {MIN_SLACK - slack:.2f}s"
            bad.append(l["id"])
        print(f'{l["id"]:4} {str(l["scene"]):5} {l["window"]["start"]:7.2f}-{l["window"]["end"]:7.2f} {ws:8.2f}-{we:8.2f} {we - ws:5.2f} {p["measuredDuration"]:5.2f} {slack:+6.2f} {lead_note}{flag}')
    print("ALL FIT" if not bad else f"{len(bad)} line(s) short: {', '.join(bad)}")
    if arg("--out"):
        json.dump({"film": new_total, "scenes": S_new, "windows": wins}, open(arg("--out"), "w"), indent=1)
        print("wrote", arg("--out"))
    sys.exit(1 if bad else 0)


main()
