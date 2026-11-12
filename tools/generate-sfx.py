#!/usr/bin/env python3
"""Build SlideyBoard's soft arcade SFX using only the Python standard library.

Rounded mallet bodies, quiet contact transients and filtered air replace the old
grit/rattle layers. Fixed seeds make the mono 44.1 kHz PCM assets reproducible.
Muted electronic pulses and tonal cuts give interactions an abstract character.
"""
from __future__ import annotations

import array
import math
from pathlib import Path
import random
import sys
import wave

SR = 44100
ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'sfx'
TAU = 2 * math.pi


def frames(milliseconds):
    return round(SR * milliseconds / 1000)


def silence(duration):
    return [0.0] * frames(duration)


def mix(destination, source, delay=0, gain=1.0):
    offset = frames(delay)
    for i, value in enumerate(source[:max(0, len(destination) - offset)]):
        destination[offset + i] += value * gain


def lowpass(samples, cutoff):
    coefficient = 1 - math.exp(-TAU * cutoff / SR)
    out = []
    state = 0.0
    for value in samples:
        state += coefficient * (value - state)
        out.append(state)
    return out


def taper(samples, release=18):
    """Cosine edges avoid clicks without erasing the contact transient."""
    out = samples[:]
    attack = min(frames(1.5), len(out))
    end = min(frames(release), len(out))
    for i in range(attack):
        out[i] *= 0.5 - 0.5 * math.cos(math.pi * i / (attack - 1))
    for i in range(end):
        out[-1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / (end - 1))
    return out


def mallet(frequency, duration, decay=65, warmth=0.18):
    """Damped modes: a warm fundamental and rapidly vanishing overtones."""
    out = silence(duration)
    modes = ((1.0, 1.0, 1.0), (2.76, warmth, 0.48),
             (5.4, warmth * 0.24, 0.23))
    for i in range(len(out)):
        t = i / SR
        attack = 1 - math.exp(-t / 0.0018)
        out[i] = attack * sum(
            gain * math.sin(TAU * frequency * ratio * t)
            * math.exp(-t / (decay * scale / 1000))
            for ratio, gain, scale in modes
        )
    return taper(out)


def rounded_hit(frequency, duration, decay=40, bend=0.35):
    """A small pitch-settling body, with no square waves or hard clipping."""
    out = silence(duration)
    phase = 0.0
    for i in range(len(out)):
        t = i / SR
        phase += TAU * frequency * (1 + bend * math.exp(-t / 0.012)) / SR
        envelope = (1 - math.exp(-t / 0.0015)) * math.exp(-t / (decay / 1000))
        out[i] = math.sin(phase) * envelope
    return taper(out)


def air(rng, duration, cutoff=1600, attack=0.15):
    """Smooth, band-limited movement; no granular crackle or sharp hiss."""
    noise = [rng.uniform(-1, 1) for _ in range(frames(duration))]
    filtered = lowpass(lowpass(noise, cutoff), cutoff)
    bass = lowpass(filtered, 240)
    out = []
    for i, (value, low) in enumerate(zip(filtered, bass)):
        position = i / (len(filtered) - 1)
        if position < attack:
            envelope = math.sin(math.pi * position / (2 * attack)) ** 2
        else:
            envelope = math.cos(math.pi * (position - attack) / (2 * (1 - attack))) ** 2
        out.append((value - low) * envelope)
    return taper(out)


def contact(rng, duration=22):
    return air(rng, duration, cutoff=2400, attack=0.06)


def make_click(rng):
    out = silence(85)
    mix(out, mallet(740, 85, decay=15, warmth=0.1), gain=0.34)
    mix(out, rounded_hit(360, 70, decay=12), gain=0.25)
    mix(out, contact(rng, 14), gain=0.13)
    return out


def glide(start, end, duration, attack=12, decay=75, overtone=0.08):
    """A smooth sine glide with a quiet octave, free of friction/noise layers."""
    out = silence(duration)
    phase = 0.0
    for i in range(len(out)):
        t = i / SR
        p = i / (len(out) - 1)
        bend = 1 - (1 - p) ** 3
        frequency = start * (end / start) ** bend
        phase += TAU * frequency / SR
        envelope = (1 - math.exp(-t / (attack / 1000))) * math.exp(-t / (decay / 1000))
        out[i] = (math.sin(phase) + overtone * math.sin(2 * phase)) * envelope
    return taper(out, release=30)


def make_drag(rng):
    # Hollow digital "tok": a soft FM transient dissolves into a muted body.
    # Finish before the 90 ms retrigger interval, including playback-rate variation.
    out = silence(70)
    for i in range(len(out)):
        t = i / SR
        attack = (1 - math.exp(-t / 0.0018)) ** 2
        modulation = 1.6 * math.exp(-t / 0.006) * math.sin(TAU * 437 * t)
        shell = math.sin(TAU * 310 * t + modulation) * math.exp(-t / 0.011)
        body = 0.45 * math.sin(TAU * 155 * t) * math.exp(-t / 0.016)
        out[i] = 0.34 * attack * (shell + body)
    return taper(out, release=24)


def make_trim(rng):
    # A quick downward "zip" separates edge cuts from landings and rewards.
    out = silence(145)
    mix(out, glide(1480, 440, 125, attack=2, decay=25, overtone=0.14), gain=0.47)
    mix(out, mallet(880, 100, decay=15, warmth=0.06), gain=0.12)
    return out


def make_fall(rng):
    # Cushioned digital "thock": dense contact, low weight, and a quick settle.
    # Short, inharmonic modes avoid a ringing note or a bouncy pitch sweep.
    out = silence(115)
    for i in range(len(out)):
        t = i / SR
        attack = (1 - math.exp(-t / 0.0012)) ** 2
        weight = 0.7 * math.sin(TAU * 128 * t) * math.exp(-t / 0.019)
        shell = 0.32 * math.sin(TAU * 327 * t) * math.exp(-t / 0.009)
        edge = 0.15 * math.sin(TAU * 713 * t) * math.exp(-t / 0.004)
        out[i] = attack * (weight + shell + edge)
    return taper(out, release=25)


def make_clear(rng):
    out = silence(380)
    # Compact, consonant reward with a gentle upward contour.
    for delay, frequency, gain in ((0, 659.25, 0.43), (48, 830.61, 0.36),
                                   (96, 987.77, 0.32)):
        mix(out, mallet(frequency, 380 - delay, decay=55, warmth=0.08), delay, gain)
    mix(out, rounded_hit(290, 100, decay=20), gain=0.22)
    mix(out, contact(rng), gain=0.13)
    return out


def make_totem_spawn(rng):
    out = silence(320)
    mix(out, rounded_hit(165, 220, decay=43, bend=0.2), gain=0.52)
    mix(out, mallet(392, 320, decay=70, warmth=0.16), gain=0.34)
    mix(out, mallet(587.33, 260, decay=55, warmth=0.08), 60, 0.18)
    mix(out, contact(rng, 24), gain=0.18)
    return out


def make_totem_clear(rng):
    out = silence(340)
    mix(out, rounded_hit(240, 160, decay=32), gain=0.35)
    mix(out, mallet(783.99, 340, decay=70, warmth=0.12), gain=0.4)
    mix(out, mallet(1174.66, 298, decay=55, warmth=0.06), 42, 0.24)
    mix(out, air(rng, 100, cutoff=1900, attack=0.08), gain=0.22)
    return out


def make_god_clear(rng):
    out = silence(920)
    mix(out, rounded_hit(130, 300, decay=60, bend=0.2), gain=0.44)
    mix(out, air(rng, 280, cutoff=1800, attack=0.12), gain=0.38)
    for delay, frequency, gain in ((0, 523.25, 0.34), (65, 659.25, 0.32),
                                   (130, 783.99, 0.30), (205, 1046.5, 0.28)):
        mix(out, mallet(frequency, 920 - delay, decay=115, warmth=0.08), delay, gain)
        # One quiet reflection gives the special reward some space.
        mix(out, mallet(frequency, 920 - delay - 85, decay=100, warmth=0.04),
            delay + 85, gain * 0.13)
    return out


def make_fail(rng):
    out = silence(680)
    # Subdued descending wooden notes rather than a buzzer or rattling crash.
    mix(out, mallet(293.66, 490, decay=90, warmth=0.1), gain=0.43)
    mix(out, mallet(220, 550, decay=110, warmth=0.1), 130, 0.36)
    mix(out, rounded_hit(110, 360, decay=66, bend=0.12), gain=0.3)
    mix(out, contact(rng, 30), gain=0.12)
    return out


# Peak ceilings preserve the quieter interaction / louder reward hierarchy.
# Do not RMS-normalize sparse transients: that amplifies their noise floors.
CUES = {
    'click': (make_click, 11, 0.38),
    'drag': (make_drag, 23, 0.20),
    'trim': (make_trim, 29, 0.42),
    'fall': (make_fall, 41, 0.56),
    'clear': (make_clear, 67, 0.57),
    'totem-spawn': (make_totem_spawn, 89, 0.55),
    'totem-clear': (make_totem_clear, 107, 0.57),
    'god-clear': (make_god_clear, 163, 0.68),
    'fail': (make_fail, 199, 0.49),
}


def master(samples, ceiling):
    samples = lowpass(samples, 6500)
    # Remove DC/subsonic movement without saturating or compressing the body.
    sub = lowpass(samples, 35)
    samples = taper([value - low for value, low in zip(samples, sub)], release=28)
    peak = max(abs(value) for value in samples)
    gain = min(1.4, ceiling / max(peak, 1e-9))
    return [value * gain for value in samples]


def write_wav(path, samples):
    assert samples and all(math.isfinite(value) for value in samples)
    peak = max(abs(value) for value in samples)
    rms = math.sqrt(sum(value * value for value in samples) / len(samples))
    assert 0.01 < peak < 0.7, f'{path.name}: silent or over-level cue'
    assert samples[0] == samples[-1] == 0, f'{path.name}: abrupt edge'
    pcm = array.array('h', (round(value * 32767) for value in samples))
    if sys.byteorder != 'little':
        pcm.byteswap()
    with wave.open(str(path), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SR)
        output.writeframes(pcm.tobytes())
    # Verify the encoded asset as well as the floating-point source.
    with wave.open(str(path), 'rb') as encoded:
        assert (encoded.getnchannels(), encoded.getsampwidth(), encoded.getframerate()) == (1, 2, SR)
        assert encoded.getnframes() == len(samples)
        assert encoded.readframes(len(samples)) == pcm.tobytes()
    print(f'{path.name:18} {1000 * len(samples) / SR:6.1f} ms  peak {peak:.3f}  rms {rms:.3f}')


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, (make, seed, ceiling) in CUES.items():
        write_wav(ROOT / f'{name}.wav', master(make(random.Random(seed)), ceiling))


if __name__ == '__main__':
    main()
