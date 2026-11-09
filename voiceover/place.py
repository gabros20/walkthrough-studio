"""Cut a one-take narration into its lines and place each line on the film clock.

usage: python3 -I voiceover/place.py <narration audio> <words.json> --vo-dir <vo dir>
           (--edl film/edl.json --cues film/cues.json | --windows windows.json) [--name film] [--dry]

The narration is ONE TTS take of script.txt (all lines, a blank line between them). words.json is
the word-level transcript of that take: `npx hyperframes@0.9.16 transcribe <audio> --json --dir <vo dir>`
writes it to <vo dir>/transcript.json (a flat [{text, start, end}] list; {"words": [...]} also works).

How lines are found: the transcript's words are sequence-aligned to the script's words, which gives
each line a rough span in the take; the take's 10 ms RMS envelope (silence threshold 12 dB over the
10th-percentile floor, at least -55 dB) gives the real speech chunks, bridged across gaps under
0.18 s; each chunk belongs to the line whose span it overlaps most. A line's clip runs from 40 ms
before its first chunk to 80 ms after its last (never past halfway into the silence to a neighbour),
with a 10 ms fade in and 40 ms fade out.

How lines are placed: speech onset at window start + 0.15 s. If that leaves under 0.3 s before the
window end, up to 0.15 s of lead-in is given back; if the line still overruns, it moves earlier
inside its scene (never closer than 0.3 s to the previous line). Overruns left are printed.

Writes into the vo dir: vo-track.wav (film-length, 48 kHz, 24-bit, silent between lines),
placement.json (film start/end of each placed clip, speech start/end, source span, slack) and
voiceover.srt (one cue per line, from speech start). --dry prints the placement only.
--windows takes the windows.json from fitcheck.py after the picture was re-timed.
"""
import json, os, re, subprocess, sys, difflib
import numpy as np

if any(a in ("-h", "--help") for a in sys.argv[1:]) or len(sys.argv) < 2:
    print(__doc__.strip())
    sys.exit(0 if len(sys.argv) >= 2 else 1)

SR = 48000
FADE_IN, FADE_OUT = 0.010, 0.040
LEAD = 0.15  # speech onset placed 0.15 s after window start


def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else None


def scenes_of(edl, total):
    """Film spans of every scene, plus "title" (0 to the first scene) and "end" (last scene to total)."""
    out = {}
    for s in edl["scenes"]:
        out[s["id"]] = (s["start"], round(s["start"] + s["duration"], 4))
    out["title"] = (0.0, edl["scenes"][0]["start"])
    out["end"] = (max(v[1] for v in out.values()), total)
    return out


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower().replace("’", "'"))


def load_audio(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def rms_env(x, win=0.010):
    n = int(SR * win)
    m = len(x) // n
    e = np.sqrt((x[: m * n].reshape(m, n) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(e), n


def main():
    audio, words_path = sys.argv[1], sys.argv[2]
    dry = "--dry" in sys.argv
    OUT = arg("--vo-dir")
    if not OUT:
        sys.exit("--vo-dir <dir> is required (it holds script.json; outputs go there)")
    OUT = os.path.join(OUT, "")
    FILM, SCENES = None, None
    if arg("--edl") and arg("--cues"):
        FILM = float(json.load(open(arg("--cues")))["duration"])
        SCENES = scenes_of(json.load(open(arg("--edl"))), FILM)
    script = json.load(open(OUT + "script.json"))["lines"]
    if "--windows" in sys.argv:  # re-timed picture: {"film": s, "scenes": {id: [s, e]}, "windows": {L01: [s, e]}}
        wj = json.load(open(sys.argv[sys.argv.index("--windows") + 1]))
        FILM = float(wj["film"])
        SCENES = {k: tuple(v) for k, v in wj["scenes"].items()}
        for l in script:
            if l["id"] in wj["windows"]:
                a, b = wj["windows"][l["id"]]
                l["window"] = {"start": a, "end": b}
                if l["id"] in wj.get("sceneOf", {}):
                    l["scene"] = wj["sceneOf"][l["id"]]
    if FILM is None:
        sys.exit("pass --edl and --cues (the picture the voice goes on), or --windows")
    print(f"film {FILM:.3f}s")
    words = json.load(open(words_path))
    if isinstance(words, dict):
        words = words.get("words", words.get("segments", []))
    x = load_audio(audio)
    env, hop = rms_env(x)
    floor = np.percentile(env, 10)
    thr = max(floor + 12, -55)  # silence threshold, dB
    print(f"audio {len(x)/SR:.2f}s, noise floor {floor:.1f} dB, threshold {thr:.1f} dB")

    # sequence-align transcript words to script words
    sw = []
    for li, l in enumerate(script):
        for w in re.findall(r"[A-Za-z0-9'’-]+", l["text"]):
            sw.append((li, norm(w)))
    tw = [norm(w["text"]) for w in words]
    sm = difflib.SequenceMatcher(a=[s[1] for s in sw], b=tw, autojunk=False)
    span = {}
    for a, b, n in sm.get_matching_blocks():
        for k in range(n):
            li = sw[a + k][0]
            w = words[b + k]
            s, e = span.get(li, (1e9, -1e9))
            span[li] = (min(s, w["start"]), max(e, w["end"]))
    print(f"matched {sum(n for *_, n in sm.get_matching_blocks())}/{len(sw)} script words")
    for op in sm.get_opcodes():
        if op[0] != "equal":
            print("  diff", op[0], [s[1] for s in sw[op[1]:op[2]]], tw[op[3]:op[4]])

    # speech chunks from the envelope: runs above threshold, bridged across gaps < MIN_GAP
    MIN_GAP = 0.18
    loud = env > thr
    chunks = []
    i = 0
    while i < len(loud):
        if loud[i]:
            j = i
            while j < len(loud) and loud[j]:
                j += 1
            cs, ce = i * hop / SR, j * hop / SR
            if chunks and cs - chunks[-1][1] < MIN_GAP:
                chunks[-1][1] = ce
            else:
                chunks.append([cs, ce])
            i = j
        else:
            i += 1
    chunks = [c for c in chunks if c[1] - c[0] >= 0.04]
    print(f"{len(chunks)} speech chunks")
    owner = {}
    for c in chunks:
        best, bo = None, -1e9
        for li, (s, e) in span.items():
            o = min(c[1], e) - max(c[0], s)
            if o > bo:
                best, bo = li, o
        owner.setdefault(best, []).append(c)
    placed = []
    keys = sorted(owner)
    for li, l in enumerate(script):
        if li not in owner:
            print("!! no audio chunk for", l["id"]); continue
        cs = owner[li]
        sp_s, sp_e = cs[0][0], cs[-1][1]
        k = keys.index(li)
        prev_e = owner[keys[k - 1]][-1][1] if k > 0 else 0.0
        next_s = owner[keys[k + 1]][0][0] if k + 1 < len(keys) else len(x) / SR
        src_s = max(sp_s - 0.04, (prev_e + sp_s) / 2)
        src_e = min(sp_e + 0.08, (sp_e + next_s) / 2)
        s, e = sp_s, sp_e
        # speech onset inside the clip (for placing onset on window start)
        onset = s - src_s
        dur = src_e - src_s
        ws, we = l["window"]["start"], l["window"]["end"]
        sc0, sc1 = SCENES[l["scene"]]
        film_s = ws - onset + LEAD
        film_e = film_s + dur
        note = ""
        if we - film_e < 0.295:  # take back some of the lead-in first (onset no earlier than window start)
            back = min(LEAD, 0.3 - (we - film_e))
            film_s -= back; film_e -= back
            note = f"lead-in cut to {LEAD - back:.2f}s; "
        if film_e > we:
            # shift earlier within scene, not into the previous line's window gap (keep 0.3 s after prev end)
            prev_end = placed[-1]["end"] if placed else 0
            earliest = max(sc0, prev_end + 0.3)
            shift = film_e - we
            new_s = max(film_s - shift, earliest)
            if new_s < film_s:
                note = f"shifted {film_s - new_s:+.2f}s earlier"
                film_e -= film_s - new_s
                film_s = new_s
            if film_e > we:
                note += f" OVERRUNS window end by {film_e - we:.2f}s"
        placed.append(dict(id=li + 1, key=l["id"], scene=l["scene"], text=l["text"],
                           start=round(film_s, 3), end=round(film_e, 3),
                           speechStart=round(film_s + onset, 3), speechEnd=round(film_s + (e - src_s), 3),
                           sourceStart=round(src_s, 3), sourceEnd=round(src_e, 3),
                           windowStart=ws, windowEnd=we, slack=round(we - film_e, 3),
                           estDuration=l["estDuration"], measuredDuration=round(dur, 3), note=note.strip()))
    for p in placed:
        print(f'{p["key"]} {p["scene"]:5} film {p["start"]:7.3f}-{p["end"]:7.3f} win {p["windowStart"]:6.2f}-{p["windowEnd"]:6.2f} '
              f'slack {p["slack"]:+.2f} dur {p["measuredDuration"]:.2f} (est {p["estDuration"]:.2f}) src {p["sourceStart"]:.2f}-{p["sourceEnd"]:.2f} {p["note"]}')
    for a, b in zip(placed, placed[1:]):
        if b["start"] < a["end"] + 0.3:
            print("!! close/overlap", a["key"], b["key"], round(b["start"] - a["end"], 3))
    speech = sum(p["end"] - p["start"] for p in placed)
    print(f"voice on {speech:.1f}s = {speech/FILM:.1%} of film")
    if dry:
        return

    track = np.zeros(int(round(FILM * SR)), dtype=np.float64)
    for p in placed:
        a, b = int(round(p["sourceStart"] * SR)), int(round(p["sourceEnd"] * SR))
        seg = x[a:b].astype(np.float64).copy()
        fi, fo = int(FADE_IN * SR), int(FADE_OUT * SR)
        seg[:fi] *= np.linspace(0, 1, fi)
        seg[-fo:] *= np.linspace(1, 0, fo)
        o = int(round(p["start"] * SR))
        if o >= len(track):
            print(f'!! {p["key"]} starts at {p["start"]:.2f} s, after the film ends: left out of the track'); continue
        track[o:o + len(seg)] += seg[: len(track) - o]
    peak = np.abs(track).max()
    print(f"track peak {20*np.log10(peak):.2f} dBFS")
    if peak >= 0.999:
        track *= 0.98 / peak
        print("scaled to avoid clipping")
    pcm = (np.clip(track, -1, 1) * 8388607).astype("<i4")
    b = pcm.astype("<i4").view(np.uint8).reshape(-1, 4)[:, :3].tobytes()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "s24le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    "-c:a", "pcm_s24le", OUT + "vo-track.wav"], input=b, check=True)

    json.dump({"film": arg("--name") or "film", "duration": FILM, "sampleRate": SR,
               "source": audio, "fades": {"in": FADE_IN, "out": FADE_OUT},
               "note": "start/end cover the audio placed (incl. fades); speechStart/End are transcript word bounds; slack = windowEnd - end",
               "lines": placed}, open(OUT + "placement.json", "w"), indent=2, ensure_ascii=False)

    def ts(t):
        ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
        return f"{h:02}:{m:02}:{s:02},{ms:03}"
    with open(OUT + "voiceover.srt", "w") as f:
        for k, p in enumerate(placed):
            nxt = placed[k + 1]["speechStart"] - 0.05 if k + 1 < len(placed) else FILM
            end = min(max(p["speechEnd"] + 0.2, p["speechStart"] + 1.0), nxt)
            f.write(f'{p["id"]}\n{ts(p["speechStart"])} --> {ts(end)}\n{p["text"]}\n\n')
    print("wrote vo-track.wav, placement.json, voiceover.srt")


main()
