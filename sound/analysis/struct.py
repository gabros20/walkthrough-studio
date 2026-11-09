# Music analysis for music.json (python3 -I, numpy + scipy + soundfile). See sound/README.md, "Measuring a new track".
# Input: a 48 kHz float WAV decoded from the generated track:  ffmpeg -i music.mp3 -ar 48000 -c:a pcm_f32le take.wav
# Order: analyze.py take.wav <groove from> <groove to> -> grid.py take.wav [bpm] -> struct.py take.wav [bpm];
# chroma.py, splice.py, fine.py, bandsovertime.py stand alone. Numbers in the defaults are the example track's (96 BPM).
import sys, numpy as np, soundfile as sf
from scipy.signal import stft

path = sys.argv[1]
x, sr = sf.read(path, dtype='float32')
mono = x.mean(axis=1)
dur = len(mono) / sr
P, phase = np.load(path + '.grid.npy')
# the measured grid is used as exact: beat 60/BPM, first downbeat at 0 (pass bpm to override)
P = 60 / float(sys.argv[2]) if len(sys.argv) > 2 else round(float(P), 4); phase = 0.0

hop = 1024; nfft = 8192
f, t, Z = stft(mono, sr, nperseg=nfft, noverlap=nfft - hop)
A = np.abs(Z)
# chroma
fm = (f > 55) & (f < 2000)
pc = (np.round(12 * np.log2(f[fm] / 440.0)) % 12).astype(int)
C = np.zeros((12, A.shape[1]))
for k in range(12): C[k] = A[fm][pc == k].sum(axis=0)
# bands
def band(lo, hi): return (A[(f >= lo) & (f < hi)] ** 2).sum(axis=0)
sub = band(30, 120); low = band(120, 500); mid = band(500, 4000); high = band(4000, 16000)
tot = (A ** 2).sum(axis=0)

nbeats = int(dur / P)
def per(seg_len, arr):
    out = []
    for i in range(int(dur / seg_len)):
        m = (t >= phase + i * seg_len) & (t < phase + (i + 1) * seg_len)
        out.append(arr[..., m].mean(axis=-1))
    return np.array(out)

Cb = per(P, C)  # beats x 12
Cb = Cb / (np.linalg.norm(Cb, axis=1, keepdims=True) + 1e-9)
nov = np.r_[0, 1 - (Cb[1:] * Cb[:-1]).sum(axis=1)]
print("chroma novelty by beat-in-bar (offset 0..3):", [round(float(nov[8 + o::4][:180].mean()), 4) for o in range(4)])

# loop length: mean beat-chroma similarity at lag L beats over groove 16..176 beats
for L in [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]:
    i = np.arange(16, min(176, nbeats - L))
    s = (Cb[i] * Cb[i + L]).sum(axis=1).mean()
    print(f"  chroma sim at lag {L:3d} beats ({L/4:4.1f} bars): {s:.4f}")

# per bar: level and bands, chroma
B = 4 * P
nb = int(np.ceil(dur / B))
print("\nbar  start   rms_dB  sub   low   mid   high  (dB)  dom.chroma")
names = 'A A# B C C# D D# E F F# G G#'.split()
rows = []
for i in range(nb):
    m = (t >= i * B) & (t < (i + 1) * B)
    if not m.any(): continue
    db = lambda a: 10 * np.log10(a[m].mean() + 1e-12)
    c = C[:, m].mean(axis=1); top = np.argsort(c)[::-1][:3]
    rows.append((i, i * B, db(tot), db(sub), db(low), db(mid), db(high)))
    print(f"{i:3d} {i*B:7.2f}  {db(tot):6.1f} {db(sub):5.1f} {db(low):5.1f} {db(mid):5.1f} {db(high):5.1f}   {' '.join(names[k] for k in top)}")
np.save(path + '.bars.npy', np.array(rows))
