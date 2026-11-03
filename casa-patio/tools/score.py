"""Score for the patio house film. Pure Python, standard library, 48 kHz.

Every time comes from film/timeline.json. One key (D major). Accent, never
narrate: a soft pad that changes chord with the date, a small tick on each
button press, a low thud and some air when the house is cut open.

    python3 casa-patio/tools/score.py out/score.wav
"""
import json, math, os, random, struct, sys, wave

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
TL = json.load(open(os.path.join(HERE, '..', 'film', 'timeline.json')))
DUR = TL['duration'] + 1.5
N = int(DUR * SR)
out = [0.0] * N
rnd = random.Random(4)

def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

# Chords in D major, one per date. Mar = Dmaj9, Jun = Gmaj7 (brighter), Dec = Bm7 (darker).
CHORDS = {'mar': [50, 57, 61, 64, 66], 'jun': [43, 55, 59, 62, 66], 'dec': [47, 54, 57, 62, 64]}

# Chord timeline from the date presses.
changes = [(0.0, 'mar')]
for b in TL['beats']:
    if b['press'] and b['press'].startswith('date:'):
        changes.append((b['t'], b['press'].split(':')[1]))

def chord_at(t):
    cur = changes[0][1]
    for ct, c in changes:
        if ct <= t:
            cur = c
    return cur

# --- Pad: each note fades in/out with the chord it belongs to (0.9 s crossfade).
XF = 0.9
segs = []
for i, (ct, c) in enumerate(changes):
    end = changes[i + 1][0] if i + 1 < len(changes) else DUR
    segs.append((ct, end, c))

for (t0, t1, c) in segs:
    a0, a1 = max(0, int((t0 - XF / 2) * SR)), min(N, int((t1 + XF / 2) * SR))
    for k, m in enumerate(CHORDS[c]):
        f = hz(m)
        amp = 0.05 if k == 0 else 0.032
        ph = rnd.random() * 6.28
        w = 2 * math.pi * f / SR
        lfo_w = 2 * math.pi * (0.07 + 0.03 * k) / SR
        for n in range(a0, a1):
            t = n / SR
            # crossfade envelope
            e = 1.0
            if t < t0 + XF / 2: e = max(0.0, (t - (t0 - XF / 2)) / XF)
            if t > t1 - XF / 2: e = min(e, max(0.0, ((t1 + XF / 2) - t) / XF))
            if t < 2.0: e *= t / 2.0                       # opening swell
            if t > DUR - 3.0: e *= max(0.0, (DUR - t) / 3.0)  # closing fade
            s = math.sin(w * n + ph) + 0.25 * math.sin(2 * w * n + ph * 1.3) + 0.08 * math.sin(3 * w * n)
            out[n] += amp * e * (0.8 + 0.2 * math.sin(lfo_w * n + k)) * s

# --- Tick on each press: a short high partial of the current chord plus a click.
for b in TL['beats']:
    if not b['press']:
        continue
    t0 = b['t']
    root = CHORDS[chord_at(t0 + 0.01)][2] + 24
    f = hz(root)
    n0 = int(t0 * SR)
    for n in range(n0, min(N, n0 + int(0.5 * SR))):
        d = (n - n0) / SR
        env = math.exp(-d * 14)
        out[n] += 0.07 * env * math.sin(2 * math.pi * f * d) + (0.05 * math.exp(-d * 400) * (rnd.random() * 2 - 1))

# --- The cut: low thud and a breath of air under the section move.
for b in TL['beats']:
    if b['press'] == 'mode:section':
        n0 = int(b['t'] * SR)
        lp = 0.0
        for n in range(n0, min(N, n0 + int(1.6 * SR))):
            d = (n - n0) / SR
            thud = 0.22 * math.exp(-d * 5) * math.sin(2 * math.pi * (hz(38) + 30 * math.exp(-d * 20)) * d)
            lp += 0.04 * ((rnd.random() * 2 - 1) - lp)    # one-pole low-passed noise
            air = 0.35 * lp * math.sin(math.pi * min(1.0, d / 1.6))
            out[n] += thud + air

# --- Mastering: integrated loudness (BS.1770 K-weighting, gated) to -14 LUFS,
# then a soft limiter so the sample peak stays under -2 dBFS.
def biquad(x, b0, b1, b2, a1, a2):
    y = [0.0] * len(x); x1 = x2 = y1 = y2 = 0.0
    for i, v in enumerate(x):
        r = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, r
        y[i] = r
    return y

def lufs(x):
    k = biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585)
    k = biquad(k, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = []
    for s in range(0, len(k) - blk, hop):
        ms.append(sum(v * v for v in k[s:s + blk]) / blk)
    L = lambda m: -0.691 + 10 * math.log10(max(m, 1e-12))
    g = [m for m in ms if L(m) > -70]
    rel = L(sum(g) / len(g)) - 10
    g2 = [m for m in g if L(m) > rel]
    return L(sum(g2) / len(g2))

level = lufs(out)
gain = 10 ** ((-14 - level) / 20)
ceil = 10 ** (-2.3 / 20)
for _ in range(3):   # the limiter takes a little loudness back; nudge the gain and redo
    final = [ceil * math.tanh(v * gain / ceil) for v in out]
    after = lufs(final)
    if abs(after + 14) < 0.15: break
    gain *= 10 ** ((-14 - after) / 20)
print(f'loudness before {level:.1f} LUFS, after {after:.1f} LUFS, sample peak {20 * math.log10(max(abs(v) for v in final)):.1f} dBFS')

path = sys.argv[1] if len(sys.argv) > 1 else 'score.wav'
with wave.open(path, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(b''.join(struct.pack('<hh', int(v * 32767), int(v * 32767)) for v in final))
print('wrote', path)
