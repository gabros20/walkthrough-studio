# Music analysis for music.json (python3 -I, numpy + scipy + soundfile). See sound/README.md, "Measuring a new track".
# Input: a 48 kHz float WAV decoded from the generated track:  ffmpeg -i music.mp3 -ar 48000 -c:a pcm_f32le take.wav
# Order: analyze.py take.wav <groove from> <groove to> -> grid.py take.wav [bpm] -> struct.py take.wav [bpm];
# chroma.py, splice.py, fine.py, bandsovertime.py stand alone. Numbers in the defaults are the example track's (96 BPM).
import sys, numpy as np, soundfile as sf
x, sr = sf.read(sys.argv[1], dtype='float32'); m = x.mean(axis=1)
a, b, w = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
out=[]
for t0 in np.arange(a, b, w):
    s = m[int(t0*sr):int((t0+w)*sr)]
    if len(s)==0: break
    out.append(f"{t0:6.2f}:{20*np.log10(np.sqrt((s**2).mean())+1e-9):6.1f}")
for i in range(0, len(out), 8): print('  '.join(out[i:i+8]))
