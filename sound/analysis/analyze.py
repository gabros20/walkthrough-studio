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
print(f"dur {dur:.3f}s sr {sr}")

# onset envelope: spectral flux, hop 256 @48k = 5.33 ms
hop = 256; nfft = 2048
f, t, Z = stft(mono, sr, nperseg=nfft, noverlap=nfft - hop, boundary=None, padded=False)
M = np.log1p(100 * np.abs(Z))
flux = np.maximum(0, np.diff(M, axis=1)).sum(axis=0)
flux = np.concatenate([[0], flux])
ft = t  # frame centre times
fr = sr / hop
env = flux - np.convolve(flux, np.ones(int(fr)) / int(fr), mode='same')
env = np.maximum(env, 0)

# autocorrelation tempo over whole groove section (10..110 s)
a, b = int(float(sys.argv[2]) * fr), int(float(sys.argv[3]) * fr)
e = env[a:b] - env[a:b].mean()
ac = np.correlate(e, e, mode='full')[len(e) - 1:]
ac /= ac[0]
lags = np.arange(len(ac)) / fr
for lo, hi in [(0.3, 0.75), (0.75, 1.4), (1.4, 2.2), (2.2, 4.2), (6, 9), (13, 17), (28, 32)]:
    m = (lags >= lo) & (lags <= hi)
    i = np.argmax(ac[m]); L = lags[m][i]
    print(f"AC peak in [{lo},{hi}] at lag {L:.4f}s  r={ac[m][i]:.3f}  -> {60/L:.2f} bpm-equiv")
# compare candidate beat periods
for bpm in [64, 96, 128, 127.5, 128.5]:
    L = 60 / bpm
    k = int(round(L * fr))
    print(f"  AC at {bpm} bpm lag ({L:.4f}s): {ac[k]:.3f}; 1.5x lag: {ac[int(round(1.5*L*fr))]:.3f}")

np.save(path + '.env.npy', np.stack([ft, env]))
