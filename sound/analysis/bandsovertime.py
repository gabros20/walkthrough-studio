# Music analysis for music.json (python3 -I, numpy + scipy + soundfile). See sound/README.md, "Measuring a new track".
# Input: a 48 kHz float WAV decoded from the generated track:  ffmpeg -i music.mp3 -ar 48000 -c:a pcm_f32le take.wav
# Order: analyze.py take.wav <groove from> <groove to> -> grid.py take.wav [bpm] -> struct.py take.wav [bpm];
# chroma.py, splice.py, fine.py, bandsovertime.py stand alone. Numbers in the defaults are the example track's (96 BPM).
import sys, numpy as np, soundfile as sf
x, sr = sf.read(sys.argv[1], dtype='float32'); m = x.mean(axis=1) if x.ndim>1 else x
w=float(sys.argv[2]); end=float(sys.argv[3])
bands=[(20,150),(150,600),(600,2000),(2000,6000),(6000,16000)]
print("t     "+"  ".join(f"{a}-{b}" for a,b in bands))
for t0 in np.arange(0,end,w):
    s=m[int(t0*sr):int((t0+w)*sr)]
    if len(s)<256: break
    S=np.abs(np.fft.rfft(s*np.hanning(len(s))))**2; f=np.fft.rfftfreq(len(s),1/sr)
    print(f"{t0:5.2f} "+"  ".join(f"{10*np.log10(S[(f>=a)&(f<b)].sum()+1e-12):7.1f}" for a,b in bands))
