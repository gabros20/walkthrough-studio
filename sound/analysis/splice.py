# Music analysis for music.json (python3 -I, numpy + scipy + soundfile). See sound/README.md, "Measuring a new track".
# Input: a 48 kHz float WAV decoded from the generated track:  ffmpeg -i music.mp3 -ar 48000 -c:a pcm_f32le take.wav
# Order: analyze.py take.wav <groove from> <groove to> -> grid.py take.wav [bpm] -> struct.py take.wav [bpm];
# chroma.py, splice.py, fine.py, bandsovertime.py stand alone. Numbers in the defaults are the example track's (96 BPM).
import sys, numpy as np, soundfile as sf
# usage: splice.py take.wav [music.json]: candidate bar-aligned loop splices, by spectral distance
import json
x, sr = sf.read(sys.argv[1], dtype='float32'); m = x.mean(axis=1)
MJ = json.load(open(sys.argv[2])) if len(sys.argv) > 2 else {'bpm': 96, 'beatsPerBar': 4, 'loopBars': 4, 'spliceWindow': {'from': 12.5, 'to': 107.5}}
P = 60 / MJ['bpm']
LOOP = P * MJ['beatsPerBar'] * MJ['loopBars']
W0, W1 = MJ['spliceWindow']['from'], MJ['spliceWindow']['to']
def spec(t, w=0.3, n=2048, hop=512):
    a=int((t-w)*sr); b=int((t+w)*sr); seg=m[a:b]
    fr=[np.abs(np.fft.rfft(seg[i:i+n]*np.hanning(n))) for i in range(0,len(seg)-n,hop)]
    return 20*np.log10(np.array(fr)+1e-6)
f=np.fft.rfftfreq(2048,1/sr); band=(f>40)&(f<16000)
def rms(a,b): s=m[int(a*sr):int(b*sr)]; return 20*np.log10(np.sqrt((s**2).mean()))
res=[]
for k in [5,6,7,8]:
    L=LOOP*k
    for n in range(int(round(W0/P)), int((W1-L)/P)+1):
        b=n*P; a=b+L
        d=np.abs(spec(a)[:,band]-spec(b)[:,band]).mean()
        # waveform corr over +-20ms
        ia=int(round((a-0.02)*sr)); ib=int(round((b-0.02)*sr)); wa=m[ia:ia+1920]; wb=m[ib:ib+1920]
        c=np.corrcoef(wa,wb)[0,1]
        lj=rms(b,b+P)-rms(a,a+P)
        res.append((d,k,a,b,c,lj, n%4, (n%16)//4))
res.sort()
for k in [5,6,7,8]:
    r=[q for q in res if q[1]==k]
    print(f"k={k}: {len(r)} candidates; best 5:")
    for d,k_,a,b,c,lj,beat,bar in r[:5]: print(f"   a={a:7.3f} -> b={b:7.3f}  specdist {d:5.2f} dB  wavecorr {c:+.3f}  leveljump {lj:+.2f} dB  beat {beat+1} of bar, loopbar {bar+1}")
    print("   median specdist", np.median([q[0] for q in r]).round(2), " worst", max(q[0] for q in r).round(2))
