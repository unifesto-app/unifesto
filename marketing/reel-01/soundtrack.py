#!/usr/bin/env python3
"""Original soundtrack for Unifesto Reel 01.

Synthesized from scratch with numpy/scipy: no samples, no loops, no licensed audio.
128 BPM, 16 bars of 4/4 (exactly 30 s), A-flat major, IV-V-vi-I.
It reads score.json, the same beat map the animation uses, so every hit lands on its visual.

  python3 soundtrack.py OUT.wav [--stems DIR]
"""
import json, pathlib, sys
import numpy as np
from scipy import signal

HERE = pathlib.Path(__file__).resolve().parent
score = json.loads(next(p for p in (HERE / "score.json", HERE.parent / "src/score.json") if p.exists()).read_text()); B = score["beats"]
SR = 48000; BPM = score["bpm"]; BEAT = 60 / BPM; S16 = BEAT / 4; DUR = score["duration"]
N = int(round(DUR * SR)); TAIL = 4 * SR
T = lambda b: (b - 1) * BEAT                      # beat (1-indexed) -> seconds
BAR = lambda n: T(1 + (n - 1) * 4)                # bar (1-indexed) -> seconds
mtof = lambda m: 440.0 * 2 ** ((m - 69) / 12)
dB = lambda x: 10 ** (x / 20)

# ------------------------------------------------------------------ dsp helpers
def lp(x, fc, order=2):  return signal.sosfilt(signal.butter(order, fc, "low", fs=SR, output="sos"), x, axis=0)
def hp(x, fc, order=2):  return signal.sosfilt(signal.butter(order, fc, "high", fs=SR, output="sos"), x, axis=0)
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0)
def onepole(x, fc): a = np.exp(-2 * np.pi * fc / SR); return signal.lfilter([1 - a], [1, -a], x, axis=0)
def pan(p): th = (np.clip(p, -1, 1) + 1) * np.pi / 4; return np.cos(th), np.sin(th)
def fades(x, a=0.001, r=0.006):
    na, nr = max(1, int(a * SR)), max(1, int(r * SR)); x = x.copy()
    x[:na] *= np.linspace(0, 1, na)[(...,) + (None,) * (x.ndim - 1)]
    x[-nr:] *= np.linspace(1, 0, nr)[(...,) + (None,) * (x.ndim - 1)]
    return x
def stereo(x, p=0.0):
    if x.ndim == 2: return x
    l, r = pan(p); return np.stack([x * l, x * r], 1)

class Mix(dict):
    def bus(self, name):
        if name not in self: self[name] = np.zeros((N + TAIL, 2))
        return self[name]
    def add(self, name, sig, t, gain=1.0, p=0.0):
        buf = self.bus(name); sig = stereo(np.asarray(sig, float), p) * gain
        i = int(round(t * SR))
        if i < 0: sig = sig[-i:]; i = 0
        n = min(len(sig), len(buf) - i)
        if n > 0: buf[i:i + n] += sig[:n]
M = Mix()

def saw_blep(freq, n, ph0=0.0):
    """Band-limited sawtooth (polyBLEP)."""
    inc = np.full(n, freq / SR) if np.isscalar(freq) else freq / SR
    ph = (ph0 + np.cumsum(inc)) % 1.0
    y = 2 * ph - 1
    m = ph < inc;      t = ph[m] / inc[m];            y[m] -= t + t - t * t - 1
    m = ph > 1 - inc;  t = (ph[m] - 1) / inc[m];      y[m] -= t * t + t + t + 1
    return y

def tv_lowpass(x, fc, q=0.72, block=64):
    """Low-pass with a cutoff that moves over time (RBJ biquad, coefficients updated per block)."""
    y = np.empty_like(x); zi = np.zeros((2,) + x.shape[1:]); n = len(x)
    for i in range(0, n, block):
        f = float(np.clip(fc[min(i + block // 2, n - 1)], 30, SR * 0.45))
        w = 2 * np.pi * f / SR; al = np.sin(w) / (2 * q); c = np.cos(w); a0 = 1 + al
        b = np.array([(1 - c) / 2, 1 - c, (1 - c) / 2]) / a0; a = np.array([1, -2 * c / a0, (1 - al) / a0])
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], axis=0, zi=zi)
    return y

def automation(points, n=N + TAIL, log=True):
    """Piecewise curve from (seconds, value) points."""
    ts = np.array([p[0] for p in points]); vs = np.array([p[1] for p in points], float)
    t = np.arange(n) / SR
    return np.exp(np.interp(t, ts, np.log(vs))) if log else np.interp(t, ts, vs)

def shaped_noise(dur, fc, bw_oct, amp, seed, width=1.0):
    """Noise through a band-pass whose centre sweeps over time (done in the STFT domain, so it is artefact-free).
    fc and amp are functions of u in [0,1]."""
    n = int(dur * SR); r = np.random.default_rng(seed); out = np.zeros((n, 2))
    base = r.standard_normal(n); side = r.standard_normal(n)
    for ch, sgn in ((0, 1), (1, -1)):
        x = base + sgn * width * side
        f, tt, Z = signal.stft(x, SR, nperseg=1024, noverlap=768)
        u = np.clip(tt / dur, 0, 1)
        G = np.exp(-0.5 * (np.log2((f[:, None] + 20) / fc(u)[None, :]) / (bw_oct / 2.355)) ** 2)
        _, y = signal.istft(Z * G, SR, nperseg=1024, noverlap=768)
        out[:, ch] = y[:n] if len(y) >= n else np.pad(y, (0, n - len(y)))
    out *= amp(np.arange(n) / n)[:, None]
    return fades(out / (np.abs(out).max() + 1e-9), 0.004, 0.02)

# ------------------------------------------------------------------ instruments
def kick(vel=1.0, f_end=51.9, f_start=170.0, tp=0.030, dec=0.16, length=0.40, click=0.22, drive=1.7, soft=False):
    n = int(length * SR); t = np.arange(n) / SR
    f = f_end + (f_start - f_end) * np.exp(-t / tp)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / dec)
    knock = np.sin(2 * np.pi * np.cumsum(125 + 300 * np.exp(-t / 0.011)) / SR) * np.exp(-t / 0.028) * 0.32
    r = np.random.default_rng(5)
    clk = hp(r.standard_normal(n), 4500) * np.exp(-t / 0.0035) * click
    x = np.tanh(drive * (body + knock)) / np.tanh(drive) + clk
    if soft: x = lp(x, 260, 2)
    return fades(x, 0.0006, 0.012) * vel

def hat(vel=1.0, dec=0.022, seed=0, tone=8200):
    n = int((dec * 7 + 0.01) * SR); t = np.arange(n) / SR
    x = np.random.default_rng(100 + seed).standard_normal(n)
    x = hp(x, tone, 4); x = x + 0.5 * bp(x, 9000, 12500)
    return fades(x * np.exp(-t / dec), 0.0004, 0.004) * vel

def clap(vel=1.0, seed=0):
    n = int(0.34 * SR); t = np.arange(n) / SR; r = np.random.default_rng(200 + seed)
    x = r.standard_normal(n); env = np.zeros(n)
    for d in (0.0, 0.011, 0.021, 0.030):
        i = int(d * SR); env[i:] += np.exp(-(t[:n - i]) / 0.006) * 0.9
    env += np.exp(-np.maximum(t - 0.030, 0) / 0.085) * (t >= 0.030) * 0.9
    x = bp(x * env, 850, 4200, 2)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.045) * 0.25
    return fades(x / np.abs(x).max() + body, 0.0005, 0.01) * vel

def snare(vel=1.0, seed=0, bright=1.0):
    n = int(0.16 * SR); t = np.arange(n) / SR; r = np.random.default_rng(300 + seed)
    x = bp(r.standard_normal(n), 600, 3000 + 5000 * bright, 2) * np.exp(-t / 0.045)
    body = np.sin(2 * np.pi * np.cumsum(185 + 90 * np.exp(-t / 0.01)) / SR) * np.exp(-t / 0.05) * 0.5
    return fades(x / np.abs(x).max() * 0.8 + body, 0.0005, 0.008) * vel

def crash(vel=1.0, dec=0.9, seed=0):
    n = int(dec * 4 * SR); t = np.arange(n) / SR; r = np.random.default_rng(400 + seed)
    out = np.stack([hp(r.standard_normal(n), 3800, 3) for _ in range(2)], 1)
    out += 0.4 * np.stack([bp(r.standard_normal(n), 5500, 9500) for _ in range(2)], 1)
    return fades(out / np.abs(out).max() * (0.75 * np.exp(-t / dec) + 0.25 * np.exp(-t / (dec * 2.4)))[:, None], 0.001, 0.2) * vel

def pad_chord(notes, dur, seed, detune=14, voices=7, att=0.10, rel=0.45):
    n = int((dur + rel) * SR); r = np.random.default_rng(seed); out = np.zeros((n, 2))
    for j, m in enumerate(notes):
        g = 0.8 if j == 0 else 1.0
        for o in np.linspace(-1, 1, voices):
            s = saw_blep(mtof(m) * 2 ** (o * detune / 1200), n, r.random())
            a = 1.0 if abs(o) < 1e-9 else 0.72; l, rr = pan(o * 0.9)
            out[:, 0] += s * a * g * l; out[:, 1] += s * a * g * rr
    out /= np.sqrt(len(notes) * voices)
    env = np.ones(n); na, nr = int(att * SR), int(rel * SR)
    env[:na] = np.sin(np.linspace(0, np.pi / 2, na)) ** 2; env[-nr:] = np.cos(np.linspace(0, np.pi / 2, nr)) ** 2
    return out * env[:, None]

def pluck(m, dur=0.75, bright=1.0, tau=0.24, vel=1.0, seed=0):
    """Additive pluck: each harmonic has its own decay, upper ones die first (no filter needed, no aliasing)."""
    n = int(dur * SR); t = np.arange(n) / SR; r = np.random.default_rng(500 + seed); out = np.zeros((n, 2))
    for ch, cents in ((0, -4.0), (1, 4.0)):
        f = mtof(m) * 2 ** (cents / 1200); K = int(max(1, min(26, (SR * 0.42) // f)))
        k = np.arange(1, K + 1)[:, None]
        amp = 1.0 / k ** (1.9 - 0.85 * bright)
        dec = np.exp(-t[None, :] / tau * (1 + 0.6 * (k - 1)))
        out[:, ch] = (amp * dec * np.sin(2 * np.pi * f * k * t[None, :] + r.random((K, 1)) * 6.283)).sum(0)
    return fades(out * (1 - np.exp(-t / 0.0015))[:, None], 0.0005, 0.02) * vel

def bell(m, dur=1.6, vel=1.0, dec=0.55, seed=0):
    n = int(dur * SR); t = np.arange(n) / SR; f = mtof(m); out = np.zeros(n)
    for ratio, a, d in ((1, 1.0, 1.0), (2.0, 0.42, 0.62), (3.0, 0.2, 0.42), (4.18, 0.14, 0.26), (5.43, 0.08, 0.2)):
        if f * ratio < SR * 0.45: out += a * np.exp(-t / (dec * d)) * np.sin(2 * np.pi * f * ratio * t)
    return fades(out * (1 - np.exp(-t / 0.002)), 0.0005, 0.03) * vel

def bass(m, dur, vel=1.0, seed=0):
    n = int(dur * SR); t = np.arange(n) / SR; f = mtof(m)
    sub = np.sin(2 * np.pi * f * t)
    sw = saw_blep(f, n, 0.25)
    mid = lp(sw, 320, 2) + lp(sw, 1100, 2) * np.exp(-t / 0.055) * 0.9
    env = (1 - np.exp(-t / 0.003)) * (0.7 + 0.3 * np.exp(-t / 0.08))
    x = np.tanh(1.4 * (0.95 * sub + 0.55 * mid) * env) / np.tanh(1.4)
    return fades(x, 0.001, 0.03) * vel

def blip(m, vel=1.0, dec=0.07):
    """Small UI pluck: a sine that chirps up a little."""
    n = int(dec * 7 * SR); t = np.arange(n) / SR; f = mtof(m) * (1 + 0.12 * np.exp(-t / 0.012))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return fades((np.sin(ph) + 0.3 * np.sin(2 * ph)) * np.exp(-t / dec), 0.0008, 0.01) * vel

def tick(freq=3200, vel=1.0, dec=0.006):
    n = int(0.05 * SR); t = np.arange(n) / SR
    return fades(np.sin(2 * np.pi * freq * t) * np.exp(-t / dec), 0.0003, 0.004) * vel

def tok(vel=1.0):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return fades(np.sin(2 * np.pi * np.cumsum(520 + 500 * np.exp(-t / 0.006)) / SR) * np.exp(-t / 0.022), 0.0004, 0.01) * vel

def impact(size=1.0, seed=0):
    n = int(2.2 * SR); t = np.arange(n) / SR; r = np.random.default_rng(600 + seed)
    sub = np.sin(2 * np.pi * np.cumsum(40 + 46 * np.exp(-t / 0.07)) / SR) * np.exp(-t / (0.42 * size))
    thump = lp(r.standard_normal(n), 170, 2) * np.exp(-t / 0.10) * 0.8
    air = np.stack([bp(r.standard_normal(n), 500, 5000) for _ in range(2)], 1) * np.exp(-t / 0.16)[:, None] * 0.22
    return fades(stereo(np.tanh(1.5 * (sub + thump)) * 0.9) + air, 0.001, 0.2) * size

def whoosh(dur=0.7, lo=350, hi=4800, peak=0.55, seed=0, direction=0.0):
    """Air moving past. direction: -1 pans right-to-left, +1 left-to-right, 0 centred."""
    def fc(u):
        up = np.clip(u / peak, 0, 1); down = np.clip((u - peak) / (1 - peak), 0, 1)
        return lo * (hi / lo) ** (np.sin(np.pi / 2 * up) * (1 - 0.65 * down ** 0.8))
    amp = lambda u: np.where(u < peak, (u / peak) ** 2.2, (1 - (u - peak) / (1 - peak)) ** 1.6)
    x = shaped_noise(dur, fc, 1.7, amp, 700 + seed, width=0.7)
    if direction:
        u = np.arange(len(x)) / len(x); l, r = pan(direction * (2 * u - 1) * 0.85)
        mono = x.mean(1); x = 0.45 * x + 0.75 * np.stack([mono * l, mono * r], 1)
    return x

def riser(dur, seed=0, lo=500, hi=9500, trem=(0, 0), tone=None):
    """Build-up: noise sweeping up, optionally fluttering faster and faster, optionally with a rising tone."""
    fc = lambda u: lo * (hi / lo) ** (u ** 1.4)
    amp = lambda u: 0.04 + 0.96 * u ** 2.3
    x = shaped_noise(dur, fc, 1.5, amp, 800 + seed, width=0.9)
    n = len(x); u = np.arange(n) / n; t = u * dur
    if trem[1]:
        rate = trem[0] + (trem[1] - trem[0]) * u ** 1.5
        x *= (0.55 + 0.45 * np.sin(2 * np.pi * np.cumsum(rate) / SR))[:, None]
    if tone:
        f = mtof(tone[0]) * (mtof(tone[1]) / mtof(tone[0])) ** (u ** 1.6)
        ph = 2 * np.pi * np.cumsum(f) / SR
        tn = (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)) * u ** 2.0 * 0.5
        x += stereo(tn)
    return fades(x, 0.01, 0.012)

def downlifter(dur=1.4, seed=0, hi=7000, lo=260):
    fc = lambda u: hi * (lo / hi) ** (u ** 0.7); amp = lambda u: (1 - u) ** 2.2
    return shaped_noise(dur, fc, 1.6, amp, 900 + seed, width=1.0)

def sparkle(dur=0.9, count=14, seed=0, notes=(92, 94, 96, 99, 101, 104)):
    r = np.random.default_rng(1000 + seed); n = int((dur + 0.9) * SR); out = np.zeros((n, 2))
    for i in range(count):
        t0 = r.random() ** 1.3 * dur; m = notes[r.integers(len(notes))]
        s = bell(m, 0.8, vel=0.5 + 0.5 * r.random(), dec=0.16); l, rr = pan(r.uniform(-0.9, 0.9)); i0 = int(t0 * SR)
        out[i0:i0 + len(s), 0] += s * l; out[i0:i0 + len(s), 1] += s * rr
    return out / np.abs(out).max()

def make_ir(rt=(2.9, 2.5, 1.2), pre=0.022, length=3.4, seed=7):
    """Synthetic hall: band-split noise, each band with its own decay time (lows ring longest, highs die first)."""
    n = int(length * SR); r = np.random.default_rng(seed); t = np.arange(n) / SR; out = np.zeros((n, 2))
    for ch in range(2):
        w = r.standard_normal(n)
        acc = lp(w, 320, 4) * 10 ** (-3 * t / rt[0]) + bp(w, 320, 2600, 2) * 10 ** (-3 * t / rt[1]) + hp(w, 2600, 4) * 10 ** (-3 * t / rt[2])
        out[:, ch] = acc * (1 - np.exp(-t / 0.012))
    out = np.concatenate([np.zeros((int(pre * SR), 2)), out])
    return out / np.sqrt((out ** 2).sum(0).mean())

def reverb(x, ir):  return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
def pingpong(x, delay, fb=0.42, taps=6, damp=3200):
    mono = x.mean(1); d = int(delay * SR); out = np.zeros_like(x); cur = mono
    for k in range(1, taps + 1):
        cur = onepole(cur, damp) * fb
        if k * d < len(out): out[k * d:, (k + 1) % 2] += cur[:len(out) - k * d]
    return out

# ------------------------------------------------------------------ harmony (A-flat major)
PADV = {"Db": [49, 56, 60, 63, 65], "Eb": [51, 58, 63, 65, 67], "Fm": [53, 60, 63, 65, 68], "Ab": [56, 60, 63, 68, 70], "Ebsus": [51, 56, 58, 63, 68]}
BASS = {"Db": 37, "Eb": 39, "Fm": 41, "Ab": 32, "Ebsus": 39}
ARP = {"Db": [68, 72, 77, 75, 72, 80], "Eb": [70, 75, 79, 77, 75, 82], "Fm": [72, 77, 80, 79, 77, 84], "Ab": [75, 80, 84, 82, 80, 87], "Ebsus": [70, 75, 80, 77, 75, 82]}
BELL = {"Db": (77, 72), "Eb": (79, 75), "Fm": (80, 77), "Ab": (82, 75)}
CH = {1: "Db", 2: "Eb", 3: "Fm", 4: "Ebsus", 5: "Db", 6: "Eb", 7: "Fm", 8: "Ab", 9: "Db", 10: "Eb", 11: "Fm", 12: "Ab", 13: "Db", 14: "Eb", 15: "Fm", 16: "Ab"}
ARP_POS = [0, 3, 6, 8, 11, 14]; ARP_VEL = [1.0, 0.7, 0.85, 0.9, 0.7, 0.8]
DROP = T(B["drop"]); GAP = T(B["drop"] - 0.5)             # one eighth of silence before the drop

# ------------------------------------------------------------------ PAD
for bar in range(1, 15):
    M.add("pad", pad_chord(PADV[CH[bar]], 4 * BEAT - 0.02, seed=bar), BAR(bar))
M.add("pad", pad_chord(PADV["Fm"], 2 * BEAT - 0.05, seed=15, rel=0.25), BAR(15))
for b, c in ((B["close"][0], "Db"), (B["close"][1], "Eb")):          # two stabs: "Your campus." "Your events."
    M.add("pad", pad_chord(PADV[c] + [PADV[c][0] + 24], 0.30, seed=30 + int(b), att=0.006, rel=0.14, detune=18) * 1.25, T(b))
M.add("pad", pad_chord([44, 56, 60, 63, 68, 70, 75], 1.25, seed=61, att=0.008, rel=0.6, detune=18) * 1.3, T(B["close"][2]))   # "One Space." resolves home
cut = automation([(0, 950), (T(5), 1900), (T(9), 2700), (T(13), 1700), (GAP, 5600), (DROP, 7600), (T(29), 6600), (T(32.8), 6600), (T(33), 2300), (T(36.9), 6200),
                  (T(37), 7600), (T(49), 7600), (T(57), 9000), (T(58.9), 2400), (T(59), 8500), (T(61), 10000), (T(63), 6000), (DUR + 4, 2500)])
M["pad"] = hp(tv_lowpass(M["pad"], cut), 140)
vol = np.interp(np.arange(N + TAIL) / SR, [0, T(9), T(13), GAP - 0.03, GAP, DROP - 0.004, DROP, T(57), T(58.9), T(59), DUR + 4], [0.95, 0.9, 0.8, 1.0, 0.0, 0.0, 1.0, 1.0, 0.55, 1.0, 1.0])
M["pad"] *= vol[:, None]

# ------------------------------------------------------------------ ARP PLUCKS
def arp_bar(bar, bright, vel, positions=ARP_POS):
    for i, pos in enumerate(positions):
        j = ARP_POS.index(pos)
        M.add("pluck", pluck(ARP[CH[bar]][j], bright=bright, vel=vel * ARP_VEL[j], seed=bar * 10 + i), BAR(bar) + pos * S16)
for bar in range(1, 15):
    arp_bar(bar, bright=(0.5, 0.62, 0.75, 0.88)[bar - 1] if bar <= 4 else 1.0, vel=(0.8, 0.88, 0.9, 0.95)[bar - 1] if bar <= 4 else 1.0,
            positions=[0, 3, 6, 8, 11] if bar == 4 else ARP_POS)
arp_bar(15, 1.0, 0.9, positions=[0, 3, 6])
for bar in range(11, 15):                                            # octave shimmer on top for the run-in to the close
    for i, pos in enumerate(ARP_POS):
        M.add("pluck", pluck(ARP[CH[bar]][i] + 12, dur=0.5, bright=0.8, tau=0.16, vel=0.3 * ARP_VEL[i], seed=bar * 50 + i), BAR(bar) + pos * S16 + S16 * 2)
for i, m in enumerate([75, 80, 82, 84, 87, 92, 87, 92]):            # final upward run after "One Space."
    M.add("pluck", pluck(m, bright=1.0, vel=0.9 - 0.07 * i, tau=0.3, seed=900 + i), T(B["close"][2]) + i * S16)
def gate(name, t0, t1, fade=0.012):
    """Silence a bus between t0 and t1 with a short fade-out, so the gap before the drop is clean."""
    n = int(fade * SR); i0, i1 = int(t0 * SR), int(t1 * SR); g = np.ones(len(M[name]))
    g[i0 - n:i0] = np.linspace(1, 0, n); g[i0:i1] = 0; g[i1:i1 + 96] = np.linspace(0, 1, 96)
    M[name] *= g[:, None]
gate("pluck", GAP, DROP)

# ------------------------------------------------------------------ BELL TOP LINE (one rising note per bar: F, G, A-flat, B-flat)
for bar in range(5, 15):
    hi, lo = BELL[CH[bar]]
    if bar in (12,): hi = 84                                         # second time round it climbs to C
    M.add("bell", bell(hi, vel=1.0), BAR(bar)); M.add("bell", bell(lo, vel=0.55), BAR(bar) + 2 * BEAT)
    if bar >= 13: M.add("bell", bell(hi + 12, vel=0.4, dec=0.4), BAR(bar)); M.add("bell", bell(lo + 12, vel=0.25, dec=0.4), BAR(bar) + 2 * BEAT)
M.add("bell", bell(80, 2.2, vel=1.0, dec=0.8), T(B["close"][2])); M.add("bell", bell(87, 2.2, vel=0.7, dec=0.8), T(B["close"][2]))

# ------------------------------------------------------------------ BASS
for bar in range(5, 15):
    if bar == 9: continue                                             # breakdown under the count-up
    for pos, v in ((2, 1.0), (6, 0.92), (10, 1.0), (14, 0.92)):
        M.add("bass", bass(BASS[CH[bar]], S16 * 1.7, vel=v), BAR(bar) + pos * S16)
    if bar % 2 == 0 and bar < 14 and bar != 8:
        M.add("bass", bass(BASS[CH[bar + 1]], S16 * 0.9, vel=0.6), BAR(bar) + 15 * S16)
for pos in (2, 6): M.add("bass", bass(BASS["Fm"], S16 * 1.7), BAR(15) + pos * S16)
M.add("bass", bass(37, 0.30, vel=1.1), T(B["close"][0])); M.add("bass", bass(39, 0.30, vel=1.1), T(B["close"][1]))
n_l = int(1.7 * SR); t_l = np.arange(n_l) / SR
last = np.tanh(1.3 * (np.sin(2 * np.pi * mtof(32) * t_l) + 0.35 * np.sin(2 * np.pi * mtof(44) * t_l)) * np.exp(-t_l / 0.75)) * (1 - np.exp(-t_l / 0.004))
M.add("bass", fades(last, 0.001, 0.3) * 1.0, T(B["close"][2]))

# ------------------------------------------------------------------ DRUMS
kicks = []
for b in score["kicks"]["soft"]: M.add("kick", kick(0.5, soft=True), T(b))                                    # heartbeat under the hook
KR = score["kicks"]
for a, z in KR["ranges"]:
    for b in range(a, z + 1): kicks.append((T(b), 0.86 if b < 17 else 1.0))                       # beat enters with "club meetups."
for b in KR["hits"]: kicks.append((T(b), 1.08))
for t, v in kicks: M.add("kick", kick(v), t)
for b in range(18, 57, 2):
    if 33 <= b <= 36: continue
    M.add("clap", clap(1.0, seed=b), T(b))
for b in B["close"][:2]: M.add("clap", clap(1.0, seed=b), T(b))
hr = np.random.default_rng(42)
for bar in range(3, 15):
    full = bar >= 5
    for pos in range(16):
        t = BAR(bar) + pos * S16
        if t >= GAP and t < DROP: continue
        if bar == 4 and pos >= 12: continue
        lift = 1.25 if bar >= 13 else 0.6 if bar == 9 else 1.0
        if pos % 4 == 2:
            M.add("hat", hat((0.54 if full else 0.4) * lift, dec=0.07 if full else 0.03, seed=pos + bar * 16, tone=7400), t + 0.004 * (hr.random() - 0.5), p=0.2)
        else:
            v = (0.34 if pos % 2 == 0 else 0.2) * (1.0 if full else 0.55) * (0.85 + 0.3 * hr.random()) * lift
            M.add("hat", hat(v, dec=0.016, seed=pos + bar * 16), t + 0.003 * (hr.random() - 0.5), p=-0.15)
def roll(b0, b1, div, v0, v1, bright0=0.3, bright1=1.0, seed=0):
    n = int(round((b1 - b0) * div))
    for i in range(n):
        u = i / max(1, n - 1) if n > 1 else 1.0
        M.add("snare", snare(v0 + (v1 - v0) * u, seed=seed + i, bright=bright0 + (bright1 - bright0) * u), T(b0 + i / div), p=0.1 * np.sin(i))
roll(13, 15, 2, 0.28, 0.5, 0.2, 0.5, seed=1); roll(15, 16, 4, 0.5, 0.72, 0.5, 0.8, seed=20); roll(16, 16.5, 8, 0.72, 0.95, 0.8, 1.0, seed=40)   # build into the drop
roll(57, 58, 4, 0.4, 0.7, 0.4, 0.8, seed=60); roll(58, 59, 8, 0.7, 1.0, 0.8, 1.0, seed=80)                                                      # build into the close
for b in (40.5, 40.75, 48.5, 48.75, 28.5, 28.75, 36.5, 36.75): M.add("snare", snare(0.5 if b % 0.5 == 0 else 0.62, seed=int(b * 4)), T(b))               # small fills before scene changes
M.add("crash", crash(1.0, 1.0, seed=1), DROP); M.add("crash", crash(0.6, 0.7, seed=2), T(B["steps"]))
M.add("crash", crash(0.4, 0.6, seed=3), T(B["step3"])); M.add("crash", crash(0.5, 0.6, seed=5), T(37)); M.add("crash", crash(1.0, 1.3, seed=4), T(B["close"][2]))

# ------------------------------------------------------------------ SOUND DESIGN (each one tied to something on screen)
M.add("fx", impact(0.6, seed=1) * 0.8, 0.0)                                                        # first frame
M.add("fx", riser(T(B["rocketLaunch"]) - T(B["hookB"]), seed=1, lo=300, hi=3500, tone=(56, 68)) * 0.42, T(B["hookB"]))   # "Power up": charge
M.add("fx", whoosh(1.15, lo=220, hi=6500, peak=0.3, seed=1) * 0.95, T(B["rocketLaunch"]) - 0.06)   # launch
n_r = int(0.9 * SR); t_r = np.arange(n_r) / SR                                                     # rocket tone rising away
rk = np.sin(2 * np.pi * np.cumsum(mtof(56) * 2 ** (t_r / 0.9 * 2.0)) / SR) * np.exp(-t_r / 0.28) * (1 - np.exp(-t_r / 0.01))
M.add("fx", fades(rk, 0.002, 0.1) * 0.13, T(B["rocketLaunch"]), p=0.35)
for i, b in enumerate(B["types"]): M.add("ui", blip((67, 70, 75, 77)[i], vel=0.8), T(b), p=(-0.3, -0.1, 0.1, 0.3)[i])   # Fests, hackathons, workshops, club meetups.
M.add("fx", impact(0.45, seed=2) * 0.6, T(B["types"][3]))
for i, b in enumerate(B["tools"]): M.add("ui", blip((72, 70, 68)[i], vel=0.75, dec=0.05), T(b), p=(-0.3, 0.0, 0.3)[i])  # the three tools, stepping down
M.add("fx", riser(GAP - T(13), seed=2, lo=450, hi=10500, trem=(5, 19), tone=(63, 75)) * 0.62, T(13))  # juggling speeds up
M.add("fx", impact(1.0, seed=3) * 1.0, DROP); M.add("fx", downlifter(1.5, seed=1) * 0.36, DROP)    # one Space
for i, b in enumerate(B["rows"]):                                                                  # four features, four rising chimes
    m = (77, 79, 82, 84)[i]
    M.add("ui", bell(m, 1.0, vel=0.9, dec=0.3), T(b), p=-0.2); M.add("ui", bell(m + 12, 1.0, vel=0.35, dec=0.22), T(b) + 0.02, p=0.2)
M.add("fx", whoosh(0.75, seed=2, direction=-1) * 0.7, T(B["steps"]) - 0.30)                        # pan to the steps
M.add("ui", blip(75, vel=0.6, dec=0.045), T(B["goto"]) + 0.16)
c0, c1 = B["stat"], B["countEnd"]; nt = int(round((c1 - c0) * 8))                                  # number ticker, 0 -> 75
for i in range(nt):
    u = i / (nt - 1); M.add("ui", tick(2100 + 2300 * u, vel=0.34 + 0.5 * u), T(c0) + (T(c1) - T(c0)) * (1 - (1 - u) ** 0.5), p=0.5 * np.sin(i * 1.7))
M.add("fx", riser(T(37) - T(35), seed=7, lo=700, hi=9000) * 0.34, T(35))
M.add("ui", bell(87, 1.4, vel=0.95, dec=0.4), T(c1)); M.add("ui", bell(94, 1.2, vel=0.45, dec=0.3), T(c1) + 0.015)
M.add("fx", sparkle(0.35, 6, seed=1) * 0.3, T(c1))
for i, b in enumerate(B["names"]): M.add("ui", bell((75, 79, 82, 87)[i], 1.0, vel=0.8, dec=0.26), T(b), p=(-0.4, -0.13, 0.13, 0.4)[i])   # the four named institutions
for b in (B["step2"], B["step3"]):
    M.add("fx", whoosh(0.6, seed=int(b), direction=-1) * 0.6, T(b) - 0.27); M.add("ui", tok(0.6), T(b) - 0.02)   # keycap rolls 1 -> 2 -> 3
M.add("ui", blip(80, vel=0.55, dec=0.06), T(B["appIcon"])); M.add("fx", sparkle(0.3, 5, seed=2) * 0.22, T(B["appIcon"]))
M.add("ui", blip(75, vel=0.6, dec=0.045), T(B["requestPill"]) + 0.16)
for k in range(2): M.add("ui", bell(70, 0.9, vel=0.8, dec=0.2), T(B["notice"]) + k * 2 * S16, p=0.0)   # notice: a gentle double tap
M.add("fx", riser(T(B["close"][0]) - T(57), seed=3, lo=600, hi=11000, tone=(68, 80)) * 0.55, T(57))
M.add("fx", whoosh(0.85, seed=9, direction=-1) * 0.6, T(B["closeStart"]) - 0.05)
for b in B["close"][:2]: M.add("fx", impact(0.55, seed=int(b)) * 0.7, T(b))
M.add("fx", impact(1.25, seed=61) * 1.1, T(B["close"][2])); M.add("fx", downlifter(1.6, seed=2) * 0.3, T(B["close"][2]))
M.add("fx", sparkle(1.0, 18, seed=3) * 0.42, T(B["close"][2]) + 0.1)                               # the sparkle on "One Space."

# ------------------------------------------------------------------ MIX
duck = np.ones(N + TAIL)                                                                           # sidechain: everything breathes around the kick
L = int(0.34 * SR); tt = np.arange(L) / SR
for t, v in kicks:
    i = int(t * SR); sh = 1 - (1 - np.exp(-tt / 0.004)) * np.exp(-(tt / 0.115) ** 1.5)
    duck[i:i + L] = np.minimum(duck[i:i + L], sh[:len(duck[i:i + L])])
side = lambda depth: (1 - depth * (1 - duck))[:, None]
for name in ("kick", "clap", "hat", "snare", "crash", "bass", "pad", "pluck", "bell", "ui", "fx"): M.bus(name)
M["pad"] *= side(0.62); M["bass"] *= side(0.55); M["pluck"] *= side(0.3); M["bell"] *= side(0.2); M["fx"] *= side(0.25)

G = {"kick": -3.5, "clap": -7.5, "hat": -14.5, "snare": -10.0, "crash": -14.0, "bass": -7.5, "pad": -5.5, "pluck": -8.5, "bell": -12.0, "ui": -11.0, "fx": -7.0}
ir_hall = make_ir(); ir_room = make_ir(rt=(0.9, 0.8, 0.5), pre=0.008, length=1.2, seed=11)
send_hall = M["pad"] * dB(G["pad"]) * 0.30 + M["pluck"] * dB(G["pluck"]) * 0.65 + M["bell"] * dB(G["bell"]) * 0.9 + M["ui"] * dB(G["ui"]) * 0.7 \
          + M["fx"] * dB(G["fx"]) * 0.35 + M["clap"] * dB(G["clap"]) * 0.30 + M["snare"] * dB(G["snare"]) * 0.25 + M["crash"] * dB(G["crash"]) * 0.3
send_room = M["clap"] * dB(G["clap"]) * 0.6 + M["snare"] * dB(G["snare"]) * 0.5 + M["hat"] * dB(G["hat"]) * 0.25 + M["kick"] * 0.05
dly = pingpong(M["pluck"] * dB(G["pluck"]) + M["bell"] * dB(G["bell"]) * 0.6, 3 * S16, fb=0.44, taps=6)
wet = hp(lp(reverb(hp(send_hall + dly * 0.5, 220), ir_hall), 9500), 200) * 0.45 + hp(reverb(send_room, ir_room), 300) * 0.26
wet *= (1 - 0.35 * (1 - duck))[:, None]

mix = sum(M[k] * dB(G[k]) for k in G) + dly * 0.55 + wet
mix = hp(mix, 27, 2)
# keep the low end mono (phones and club systems both prefer it)
lo = lp(mix, 140, 4); mix = (mix - lo) + lo.mean(1, keepdims=True)
# gentle tilt: a touch of air
mix = mix + 0.20 * hp(mix, 4500, 1)

# ------------------------------------------------------------------ MASTER
def k_weight(x):
    x = signal.lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x, axis=0)
    return signal.lfilter([1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621], x, axis=0)
def lufs(x):
    """Integrated loudness, ITU-R BS.1770 (400 ms blocks, 75 % overlap, absolute and relative gates)."""
    y = k_weight(x); bl = int(0.4 * SR); hop = bl // 4
    z = np.array([(y[i:i + bl] ** 2).mean(0).sum() for i in range(0, len(y) - bl + 1, hop)])
    l = -0.691 + 10 * np.log10(z + 1e-12); z1 = z[l > -70]
    if not len(z1): return -99.0
    z2 = z1[(-0.691 + 10 * np.log10(z1)) > (-0.691 + 10 * np.log10(z1.mean()) - 10)]
    return -0.691 + 10 * np.log10(z2.mean())
def limiter(x, ceiling=dB(-1.6), look=0.004, release=0.09):
    """Look-ahead peak limiter: the gain is already down when the peak arrives, so nothing clips and nothing clicks."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    pk = np.abs(x).max(1); g = np.minimum(1.0, ceiling / np.maximum(pk, 1e-9)); w = int(look * SR) | 1
    g = minimum_filter1d(g, size=w, origin=-(w // 2))                 # hold the reduction ahead of each peak
    a = np.exp(-1 / (release * SR)); out = np.empty_like(g); cur = 1.0
    for i in range(len(g)):                                           # instant attack, smooth release
        cur = g[i] if g[i] < cur else a * cur + (1 - a) * g[i]; out[i] = cur
    out = minimum_filter1d(uniform_filter1d(out, size=w, origin=-(w // 2)), size=3)
    return x * np.minimum(out, g)[:, None], out

mix = mix[:N + SR]                                                    # keep a second of tail for the fade
end = np.ones(len(mix)); f0 = int((DUR - 0.55) * SR)
end[f0:N] = np.cos(np.linspace(0, np.pi / 2, N - f0)) ** 2; end[N:] = 0   # the last chord fades to exactly 30.000 s
mix = (mix * end[:, None])[:N]
TARGET = -14.0
mix *= dB(-3) / np.abs(mix).max()
for _ in range(4):                                                    # set loudness, then limit, repeat until both hold
    mix *= dB(TARGET - lufs(mix)); mix = np.tanh(mix * 0.9) / 0.9 if np.abs(mix).max() > 1.6 else mix
    lim, gr = limiter(mix)
    if abs(lufs(lim) - TARGET) < 0.1: break
    mix *= dB(TARGET - lufs(lim))
mix, gr = limiter(mix)

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "soundtrack.wav")
import wave
r = np.random.default_rng(1); dith = (r.random(mix.shape) - r.random(mix.shape)) / 32768.0          # TPDF dither to 16-bit
pcm = np.clip(np.round((mix + dith) * 32767), -32768, 32767).astype("<i2")
with wave.open(str(out), "wb") as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print(f"{out}  {len(mix)/SR:.3f}s  LUFS {lufs(mix):.2f}  peak {20*np.log10(np.abs(mix).max()):.2f} dBFS  max limiter reduction {-20*np.log10(gr.min()):.1f} dB")
if "--stems" in sys.argv:
    d = pathlib.Path(sys.argv[sys.argv.index("--stems") + 1]); d.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(d / "stems.npz", **{k: (M[k][:N] * dB(G[k])).astype(np.float32) for k in G}, wet=wet[:N].astype(np.float32), dly=(dly[:N] * 0.55).astype(np.float32), master=mix.astype(np.float32))
