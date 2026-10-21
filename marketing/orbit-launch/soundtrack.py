#!/usr/bin/env python3
"""Original soundtrack for the Unifesto Orbit launch cuts. Synthesized with numpy/scipy: no samples, no licensed audio.

120 BPM, D major, I-V-vi-IV (one chord per 2 bars). Reads cuts.js, like orbit.html, so scene changes and kicks
land on the picture: a soft boom on every scene change, a riser into it, kick + bass + hats where cuts.js says kick.

  python3 soundtrack.py long  soundtrack-long.wav
  python3 soundtrack.py short soundtrack-short.wav
"""
import json, re, sys, pathlib
import numpy as np
from scipy import signal
from scipy.io import wavfile

HERE = pathlib.Path(__file__).resolve().parent
CUTS = json.loads(re.search(r"window\.CUTS = (\{.*\});", (HERE / "cuts.js").read_text(), re.S).group(1))
cut = sys.argv[1]; C = CUTS[cut]
SR = 48000; BEAT = 60 / CUTS["bpm"]; DUR = sum(d for _, d in C["scenes"]); N = int(DUR * SR)
bounds = np.cumsum([0] + [d for _, d in C["scenes"]])[1:-1]           # scene changes, seconds
K0, K1 = C["kick"]
rng = np.random.default_rng(20261021)
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)
t_all = np.arange(N) / SR

def lp(x, fc): return signal.sosfilt(signal.butter(2, fc, "low", fs=SR, output="sos"), x)
def hp(x, fc): return signal.sosfilt(signal.butter(2, fc, "high", fs=SR, output="sos"), x)
def add(bus, x, at):
    i = int(at * SR); n = min(len(x), N - i)
    if n > 0: bus[i:i + n] += x[:n]

# D, A, Bm, G: pad voicings (midi) and bass roots
CHORDS = [([62, 66, 69, 76], 38), ([61, 64, 69, 73], 45), ([62, 66, 71, 74], 47), ([62, 67, 71, 74], 43)]
chord_at = lambda t: CHORDS[int(t // (8 * BEAT)) % 4]

# ---------- pad: detuned saws, low-passed, crossfaded chord to chord ----------
pad = np.zeros((N, 2))
seg = 8 * BEAT; xf = 0.6
for k in range(int(np.ceil(DUR / seg))):
    t0 = k * seg; n = int((seg + xf) * SR); t = np.arange(n) / SR
    notes, _ = CHORDS[k % 4]
    if t0 + seg >= DUR: notes, n = CHORDS[0][0], int((DUR - t0) * SR); t = t[:n]   # resolve home at the end
    env = np.minimum(1, t / xf) * np.minimum(1, (n / SR - t) / xf)
    for ch, det in ((0, -1), (1, 1)):
        x = np.zeros(n)
        for m in notes:
            for d in (-7, 0, 7):
                f = mtof(m) * 2 ** ((d + 3 * det) / 1200)
                x += signal.sawtooth(2 * np.pi * f * t + rng.uniform(0, 6.28))
        x = lp(x, 1400) * env * 0.018
        add(pad[:, ch], x, t0)

# ---------- kick envelope (also ducks the pad and bass) ----------
kick = np.zeros(N); duck = np.ones(N)
beats = np.arange(K0, K1 + 1e-6, BEAT)
for b in beats:
    n = int(0.45 * SR); t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16) + 0.25 * np.exp(-t / 0.004) * rng.standard_normal(n) * (t < 0.01)
    add(kick, x * 0.8, b)
    d = 1 - 0.6 * np.exp(-t / 0.12); i = int(b * SR); m = min(n, N - i)
    if m > 0: duck[i:i + m] = np.minimum(duck[i:i + m], d[:m])

# ---------- bass: root on every beat where the kick plays, sine + a touch of drive ----------
bass = np.zeros(N)
for b in beats:
    _, root = chord_at(b); n = int(0.42 * SR); t = np.arange(n) / SR
    x = np.tanh(1.8 * np.sin(2 * np.pi * mtof(root) * t)) * np.minimum(1, t / 0.01) * np.exp(-t / 0.25)
    add(bass, x * 0.22, b + 0.02)

# ---------- hats on the off-beats, and a 16th arp from the chord ----------
hats = np.zeros(N)
for b in beats[:-1]:
    n = int(0.06 * SR); x = hp(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR / 0.018)
    add(hats, x * 0.07, b + BEAT / 2)
arp = np.zeros((N, 2)); a0 = K0 if cut == "short" else bounds[1]
for j, t0 in enumerate(np.arange(a0, K1, BEAT / 4)):
    notes, _ = chord_at(t0); m = notes[[0, 1, 2, 3, 2, 1][j % 6]] + 12
    n = int(0.22 * SR); t = np.arange(n) / SR
    x = lp(signal.sawtooth(2 * np.pi * mtof(m) * t, 0.5), 2600) * np.exp(-t / 0.07) * 0.035
    p = 0.5 + 0.35 * np.sin(j * 0.7)
    add(arp[:, 0], x * (1 - p), t0); add(arp[:, 1], x * p, t0)

# ---------- scene changes: riser into it, soft boom on it ----------
fx = np.zeros(N)
for b in list(bounds):
    n = int(1.0 * SR); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    sweep = signal.sosfilt(signal.butter(2, [600, 5000], "band", fs=SR, output="sos"), noise) * (t / 1.0) ** 2.5 * 0.05
    add(fx, sweep, b - 1.0)
    n2 = int(1.6 * SR); t2 = np.arange(n2) / SR
    add(fx, np.sin(2 * np.pi * (42 + 30 * np.exp(-t2 / 0.08)) * t2) * np.exp(-t2 / 0.5) * 0.35, b)

# ---------- mix, a little space, master ----------
mono = (kick + bass * duck + hats + fx)[:, None]
mix = pad * duck[:, None] + arp + mono
ir_n = int(2.2 * SR); ir = rng.standard_normal((ir_n, 2)) * np.exp(-np.arange(ir_n) / SR / 0.55)[:, None]
ir = np.stack([lp(ir[:, 0], 5000), lp(ir[:, 1], 5000)], 1) * 0.012
wet = np.stack([signal.fftconvolve(pad[:, c] + arp[:, c], ir[:, c])[:N] for c in (0, 1)], 1)
mix = mix + wet
mix = hp(mix.T, 30).T
mix *= np.minimum(1, t_all / 1.2)[:, None] * np.minimum(1, (DUR - t_all) / 2.0)[:, None]
mix = np.tanh(1.4 * mix) / np.tanh(1.4)
mix *= 0.63 / np.max(np.abs(mix))                                       # peaks about -4 dBFS, roughly -14 LUFS
wavfile.write(sys.argv[2], SR, (mix * 32767).astype(np.int16))
print(sys.argv[2], f"{DUR:.1f} s")
