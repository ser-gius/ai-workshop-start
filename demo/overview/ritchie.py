#!/usr/bin/env python3
"""Cuts ritchie.mjs's recording into the 20-second caper: `ritchie.py <work dir> <out.mp4>`.

The work dir has raw.webm, marks.json ({shot: [start, end]} in seconds) and cards/*.png.
Each piece of the timeline is rendered to its own MP4 (1280x800, 30 fps), then they are joined
with a soundtrack made here: a swung beat and a bass riff, a hit on every freeze frame.
"""
import json, os, subprocess, sys, wave
import numpy as np

WORK, OUT = sys.argv[1], sys.argv[2]
LENGTH, FPS, W, H = 20.0, 30, 1280, 800
RAW, CARDS = os.path.join(WORK, 'raw.webm'), os.path.join(WORK, 'cards')
SEG = os.path.join(WORK, 'seg'); os.makedirs(SEG, exist_ok=True)
marks = json.load(open(os.path.join(WORK, 'marks.json')))
# The recording's clock is not the recorder's: line them up on the sync flash, the first red frame.
frames = subprocess.run(['ffmpeg', '-v', 'error', '-t', '15', '-i', RAW, '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                         '-vsync', 'passthrough', '-'], capture_output=True, check=True).stdout
times = subprocess.run(['ffprobe', '-v', 'error', '-read_intervals', '%+15', '-select_streams', 'v', '-show_entries', 'frame=pts_time',
                        '-of', 'csv=p=0', RAW], capture_output=True, text=True, check=True).stdout.split()
px = np.frombuffer(frames, np.uint8).reshape(-1, 64, 3).mean(axis=1)
red = next(i for i, (r, g, b) in enumerate(px) if r > 200 and g < 60 and b < 60)
offset = float(times[red]) - marks.pop('_flash')
print(f'sync flash at {float(times[red]):.3f} s in the video: offset {offset:+.3f} s')
marks = {k: [s + offset, e + offset] for k, (s, e) in marks.items()}

GRADE = ('eq=contrast=1.18:saturation=0.82:brightness=-0.02,'
         'colorbalance=rs=0.05:gs=0.01:bs=-0.06:rh=0.04:bh=-0.05,vignette=PI/5')
GRAIN = 'noise=alls=5:allf=t+u'
ENC = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-r', str(FPS), '-an']
def punch(amount=0.12, ms=0.18):
    z = f'(1+{amount}*max(0\\,1-t/{ms}))'
    return f"scale=w='trunc({W}*{z}/2)*2':h='trunc({H}*{z}/2)*2':eval=frame,crop={W}:{H}"

timeline, hits, n = [], [], [0]
def render(args, dur):
    path = os.path.join(SEG, f'{n[0]:02d}.mp4'); n[0] += 1
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args, '-t', f'{dur:.3f}', *ENC, path], check=True)
    timeline.append((path, dur))
    return path
def now(): return sum(d for _, d in timeline)

def clip(shot, take, dur, tag=None, stamp=None, stamp_at=0.0):
    """The last `take` seconds of a shot, played in `dur` seconds, with a tag or a stamp over it."""
    s, e = marks[shot]
    speed = take / dur
    v = f"[0:v]trim={max(s, e - take):.3f}:{e:.3f},setpts=(PTS-STARTPTS)/{speed:.4f},fps={FPS},{GRADE},{punch()},{GRAIN}[v]"
    inputs, f = ['-i', RAW], [v]
    if tag:
        inputs += ['-loop', '1', '-i', os.path.join(CARDS, f't-{tag}.png')]
        f.append("[1:v]format=rgba[t];[v][t]overlay=x='-W+W*min(t/0.12\\,1)':y=0:shortest=1[v]")
    if stamp:
        inputs += ['-loop', '1', '-i', os.path.join(CARDS, f's-{stamp}.png')]
        k = inputs.count('-i') - 1
        z = f'(1+0.7*max(0\\,1-(t-{stamp_at})/0.14))'
        f.append(f"[{k}:v]format=rgba,setpts=PTS-STARTPTS,scale=w='trunc({W}*{z}/2)*2':h='trunc({H}*{z}/2)*2':eval=frame[s];"
                 f"[v][s]overlay=x='(W-w)/2':y='(H-h)/2':enable='gte(t\\,{stamp_at})':shortest=1[v]")
        hits.append(('stamp', now() + stamp_at))
    path = render([*inputs, '-filter_complex', ';'.join(f), '-map', '[v]'], dur)
    return path

def freeze(after, label, dur):
    """The last frame of `after`, frozen and drained of colour, a character's name sliding in."""
    still = os.path.join(SEG, f'still-{n[0]:02d}.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.05', '-i', after, '-frames:v', '1', '-update', '1', still], check=True)
    hits.append(('freeze', now()))
    f = (f"[0:v]fps={FPS},hue=s=0.25,eq=contrast=1.25,"
         f"scale=w='trunc({W}*(1.06+0.03*t)/2)*2':h='trunc({H}*(1.06+0.03*t)/2)*2':eval=frame,crop={W}:{H},{GRAIN}[v];"
         f"[1:v]format=rgba[l];[v][l]overlay=x='-W+W*min(t/0.1\\,1)':y=0[v]")
    render(['-loop', '1', '-i', still, '-loop', '1', '-i', os.path.join(CARDS, f'l-{label}.png'),
            '-filter_complex', f, '-map', '[v]'], dur)

def card(name, dur, shake=True):
    hits.append(('card', now()))
    j = "if(lt(t\\,0.25)\\,14*sin(t*130)\\,0)"
    f = (f"[0:v]fps={FPS},{punch(0.25, 0.16)},crop={W - 40}:{H - 28}:x='20+{j}':y='14+{j}*0.6',scale={W}:{H},{GRAIN}"
         if shake else f"[0:v]fps={FPS},{GRAIN}")
    render(['-loop', '1', '-i', os.path.join(CARDS, f'{name}.png'), '-vf', f], dur)

# Part one: the atlas. Few shots, and each name held long enough to read.
card('title', 1.2)
freeze(clip('cli', 2.0, 1.0), 'cli', 1.4)
freeze(clip('filter', 1.5, 1.1), 'filter', 1.4)
clip('orgscan', 2.4, 0.8, stamp='later', stamp_at=0.1)
freeze(clip('org', 1.8, 1.0), 'org', 1.4)
# Part two: the firm
card('chapter', 1.1)
freeze(clip('issues', 1.4, 0.8), 'red', 1.5)
freeze(clip('slack', 1.5, 1.0), 'agent', 1.6)
freeze(clip('review', 1.3, 0.8), 'reviewer', 1.4)
clip('checks', 1.2, 1.3, stamp='green', stamp_at=0.3)
end = LENGTH - now()
assert end >= 1.0, f'the end card would be {end:.2f} s: shorten a shot'
card('end', end)

# The soundtrack: 112 bpm, swung hats, a minor bass riff, a hit on every freeze, card and stamp.
SR, BPM = 44100, 112
t = np.arange(int(SR * LENGTH)) / SR
mix = np.zeros_like(t)
beat = 60 / BPM
def add(at, sound):
    i = int(at * SR); j = min(len(mix), i + len(sound))
    if 0 <= i < len(mix): mix[i:j] += sound[: j - i]
def env(d, decay): tt = np.arange(int(SR * d)) / SR; return tt, np.exp(-tt * decay)
def kick():
    tt, e = env(0.35, 9); return 0.9 * np.sin(2 * np.pi * (45 * tt + 90 * (1 - np.exp(-tt * 30)) / 30)) * e
def snare():
    tt, e = env(0.2, 22); return 0.35 * np.random.uniform(-1, 1, len(tt)) * e + 0.25 * np.sin(2 * np.pi * 190 * tt) * e
def hat():
    tt, e = env(0.05, 90); x = np.random.uniform(-1, 1, len(tt)); return 0.12 * np.diff(x, prepend=0) * e
def bass(freq, d):
    tt, e = env(d, 5); saw = 2 * ((tt * freq) % 1) - 1
    return 0.28 * np.tanh(2.5 * saw * e) * np.minimum(1, tt * 400)
def boom():
    tt, e = env(0.6, 5); return 0.9 * np.sin(2 * np.pi * (38 * tt + 120 * (1 - np.exp(-tt * 18)) / 18)) * e \
        + 0.4 * np.random.uniform(-1, 1, len(tt)) * np.exp(-tt * 35)
riff = [82.4, 0, 98.0, 82.4, 110.0, 0, 123.5, 110.0]  # E2 . G2 E2 A2 . B2 A2, in eighths
bar = 0
while bar * 4 * beat < LENGTH - 0.6:
    b0 = bar * 4 * beat
    for k in range(4):
        add(b0 + k * beat, kick() if k % 2 == 0 else snare())
    for k in range(8):
        swing = 0.0 if k % 2 == 0 else beat * 0.16
        add(b0 + k * beat / 2 + swing, hat())
        if riff[k]: add(b0 + k * beat / 2 + swing, bass(riff[k] * (1 if bar % 4 != 3 else 1.335), beat / 2 * 0.95))
    bar += 1
for kind, at in hits:
    add(at, boom() * (1.2 if kind == 'freeze' else 1.0))
add(LENGTH - 1.0, boom() * 1.3)
fade = np.clip((LENGTH - t) / 0.5, 0, 1) * np.clip(t / 0.05, 0, 1)
mix = np.tanh(1.4 * mix) * fade * 0.85
wav = os.path.join(WORK, 'music.wav')
with wave.open(wav, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())

lst = os.path.join(WORK, 'list.txt')
open(lst, 'w').write(''.join(f"file '{p}'\n" for p, _ in timeline))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-i', wav,
                '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20',
                '-c:a', 'aac', '-b:a', '160k', '-t', str(LENGTH), '-movflags', '+faststart', OUT], check=True)
