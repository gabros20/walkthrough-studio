# Music analysis for music.json (python3 -I, numpy + scipy + soundfile). See sound/README.md, "Measuring a new track".
# Input: a 48 kHz float WAV decoded from the generated track:  ffmpeg -i music.mp3 -ar 48000 -c:a pcm_f32le take.wav
# Order: analyze.py take.wav <groove from> <groove to> -> grid.py take.wav [bpm] -> struct.py take.wav [bpm];
# chroma.py, splice.py, fine.py, bandsovertime.py stand alone. Numbers in the defaults are the example track's (96 BPM).
import sys, numpy as np, soundfile as sf
from scipy.signal import stft, butter, sosfiltfilt

path = sys.argv[1]
x, sr = sf.read(path, dtype='float32')
mono = x.mean(axis=1)
dur = len(mono) / sr
ft, env = np.load(path + '.env.npy')
fr = 1 / (ft[1] - ft[0])

# refine the beat period: maximise folded onset contrast near 60/BPM over 8..125 s
def fold(sig, times, P, nb=125):
    ph = (times % P) / P
    idx = (ph * nb).astype(int) % nb
    h = np.bincount(idx, weights=sig, minlength=nb) / np.maximum(1, np.bincount(idx, minlength=nb))
    return h

m = (ft > 8) & (ft < 125)
best = None
BPM = float(sys.argv[2]) if len(sys.argv) > 2 else 96.0  # rough tempo; the search refines it within +-0.25%
P0 = 60 / BPM
for P in np.arange(P0 * 0.9975, P0 * 1.0025, P0 * 0.00008):
    h = fold(env[m], ft[m], P)
    c = h.max() / h.mean()
    if best is None or c > best[0]: best = (c, P, h)
c, P, h = best
print(f"best beat period {P:.5f}s -> {60/P:.3f} bpm, fold contrast {c:.2f}")
phase = (np.argmax(h) + 0.5) / len(h) * P
print(f"beat phase (onset peak) {phase*1000:.1f} ms")

# low band (kick) and mid band envelopes, fold at bar = 4P with beat-phase offset
def band_env(lo, hi):
    sos = butter(4, [lo, hi], btype='band', fs=sr, output='sos')
    y = sosfiltfilt(sos, mono)
    hop = 256
    n = len(y) // hop
    r = np.sqrt((y[:n * hop].reshape(n, hop) ** 2).mean(axis=1))
    t = (np.arange(n) + 0.5) * hop / sr
    d = np.maximum(0, np.diff(np.log(r + 1e-6), prepend=np.log(r[0] + 1e-6)))
    return t, r, d

B = 4 * P
for name, (lo, hi) in {'kick 40-120': (40, 120), 'snare 1.5-5k': (1500, 5000), 'hats 6-12k': (6000, 12000)}.items():
    t, r, d = band_env(lo, hi)
    mm = (t > 8) & (t < 125)
    # onset strength at each of 16 sixteenth positions of the bar (relative to beat phase)
    rel = ((t[mm] - phase) % B) / B
    idx = (rel * 16 + 0.5).astype(int) % 16
    w = np.bincount(idx, weights=d[mm], minlength=16) / np.bincount(idx, minlength=16)
    print(f"{name:14s} 16th-onset profile:", ' '.join(f"{v:.3f}" for v in w))

np.save(path + '.grid.npy', np.array([P, phase]))
