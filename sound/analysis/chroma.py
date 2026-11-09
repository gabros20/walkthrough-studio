# Music analysis for music.json (python3 -I, numpy + scipy + soundfile). See sound/README.md, "Measuring a new track".
# Input: a 48 kHz float WAV decoded from the generated track:  ffmpeg -i music.mp3 -ar 48000 -c:a pcm_f32le take.wav
# Order: analyze.py take.wav <groove from> <groove to> -> grid.py take.wav [bpm] -> struct.py take.wav [bpm];
# chroma.py, splice.py, fine.py, bandsovertime.py stand alone. Numbers in the defaults are the example track's (96 BPM).
import sys, numpy as np, soundfile as sf
from scipy.signal import stft
x, sr = sf.read(sys.argv[1], dtype='float32'); m = x.mean(axis=1)
f, t, Z = stft(m, sr, nperseg=16384, noverlap=16384-2048)
A = np.abs(Z)**2
fm = (f > 60) & (f < 1500)
pc = (np.round(12*np.log2(f[fm]/440.0)) % 12).astype(int)
C = np.zeros((12, A.shape[1]))
for k in range(12): C[k] = A[fm][pc==k].sum(axis=0)
N = 'A A# B C C# D D# E F F# G G#'.split()
def prof(a,b):
    mm=(t>=a)&(t<b); c=C[:,mm].mean(axis=1); c=c/c.max(); return c
def show(lbl,c): print(f"{lbl:22s}", ' '.join(f"{N[i]}:{c[i]:.2f}" for i in np.argsort(c)[::-1][:6]))
# The spans below are the example track's (groove 10-110 s in 4-bar loops of 2.5 s bars; intro, outro,
# final chord): edit them to your track's sections before reading the output.
for p in range(4):
    c = np.mean([prof(10+10*k+2.5*p, 10+10*k+2.5*(p+1)) for k in range(10)], axis=0); show(f"loop bar {p+1}", c)
for lbl,(a,b) in {'intro 0-10':(0,10),'outro 110-125':(110,125),'bar48':(120,122.5),'bar49':(122.5,125),'bar50 final':(125,127.5),'tail 127.5-131':(127.5,131)}.items(): show(lbl, prof(a,b))
# key estimate
maj=np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]); mn=np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
g = prof(10,110)
res=[]
for k in range(12):
    res.append((np.corrcoef(g, np.roll(maj,k))[0,1], N[k]+' major')); res.append((np.corrcoef(g, np.roll(mn,k))[0,1], N[k]+' minor'))
print(sorted(res)[::-1][:4])
