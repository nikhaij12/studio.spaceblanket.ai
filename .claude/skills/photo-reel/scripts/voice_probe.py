#!/usr/bin/env python3
"""Audit a voiceover take before touching a single filter.

Answers, in one run, the four things that decide the whole audio pass:

  channels  Which channels actually carry signal. Phone and camera takes are
            routinely 4-channel with three of them digitally silent, which is
            what makes a voice come out of one ear in a browser.
  loudness  Integrated LUFS and true peak. A take already over 0 dBTP has been
            gained into clipping and you should go back to the raw file.
  gaps      Every pause, by start/end/length. This is how you find the one that
            drags, and where it is safe to splice.
  spectrum  Band levels for a speech slice against a room-tone slice, so the EQ
            answers a measurement instead of a hunch.

Usage:
  voice_probe.py TAKE.m4a
  voice_probe.py TAKE.m4a --speech 46.3,0.8 --room 57.6,0.7
  voice_probe.py TAKE.m4a --channel 1 --gap-threshold -33 --min-gap 0.2

With no --speech/--room the loudest and quietest windows found in the gap scan
are used, which is usually right.
"""
import argparse
import re
import subprocess
import sys

SR = 48000
BANDS = [(20, 60), (60, 90), (90, 130), (130, 200), (200, 300), (300, 450),
         (450, 700), (700, 1100), (1100, 1700), (1700, 2600), (2600, 4000),
         (4000, 6000), (6000, 9000), (9000, 13000), (13000, 20000)]


def ff(args):
    """ffmpeg, keeping stderr. Never pass -v error: volumedetect, silencedetect
    and astats all print at info level and vanish if you quiet them."""
    return subprocess.run(["ffmpeg"] + args, capture_output=True, text=True).stderr


def probe(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=channels,channel_layout,sample_rate,duration,codec_name",
         "-of", "default=nw=1", path], capture_output=True, text=True).stdout
    return dict(l.split("=", 1) for l in out.strip().splitlines() if "=" in l)


def level(path, ch=None, ss=None, dur=None):
    pre = "pan=mono|c0=c%d," % ch if ch is not None else ""
    args = []
    if ss is not None:
        args += ["-ss", "%.4f" % ss]
    if dur is not None:
        args += ["-t", "%.4f" % dur]
    err = ff(args + ["-i", path, "-filter_complex",
                     "[0:a]%svolumedetect" % pre, "-f", "null", "-"])
    m = re.search(r"mean_volume: (-?[\d.]+)", err)
    p = re.search(r"max_volume: (-?[\d.]+)", err)
    return (float(m.group(1)) if m else None, float(p.group(1)) if p else None)


def envelope(path, ch):
    """RMS per ~10-20 ms window. silencedetect keys off peak and misses real
    pauses whenever the room floor is high; RMS separates speech from gap.

    `ametadata=...:file=-` writes to STDOUT, not stderr like the other
    measurement filters.
    """
    r = subprocess.run(
        ["ffmpeg", "-i", path, "-filter_complex",
         "[0:a]pan=mono|c0=c%d,astats=metadata=1:reset=1,"
         "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-" % ch,
         "-f", "null", "-"], capture_output=True, text=True)
    env, t = [], None
    for ln in (r.stdout + r.stderr).splitlines():
        m = re.match(r"frame:\d+\s+pts:\d+\s+pts_time:([\d.]+)", ln)
        if m:
            t = float(m.group(1))
        m = re.search(r"RMS_level=(-?[\d.]+|-inf)", ln)
        if m and t is not None:
            env.append((t, -120.0 if m.group(1) == "-inf" else float(m.group(1))))
    return env


def find_gaps(env, thresh, mingap):
    gaps, run = [], None
    for t, db in env:
        if db < thresh:
            run = t if run is None else run
        else:
            if run is not None and t - run >= mingap:
                gaps.append((run, t))
            run = None
    if run is not None and env[-1][0] - run >= mingap:
        gaps.append((run, env[-1][0]))
    return gaps


def bands(path, ch, ss, dur):
    try:
        import numpy as np
    except ImportError:
        return None
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", "%.4f" % ss, "-t", "%.4f" % dur, "-i", path,
         "-filter_complex", "[0:a]pan=mono|c0=c%d,aresample=%d" % (ch, SR),
         "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    if len(x) < 512:
        return None
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return [10 * np.log10(X[(f >= lo) & (f < hi)].sum() + 1e-30) for lo, hi in BANDS]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("take")
    ap.add_argument("--channel", type=int, default=None,
                    help="which channel to analyse (default: the loudest)")
    ap.add_argument("--gap-threshold", type=float, default=None,
                    help="dB below which a window counts as a gap "
                         "(default: 14 dB under the take's median window)")
    ap.add_argument("--min-gap", type=float, default=0.20)
    ap.add_argument("--speech", default=None, metavar="START,DUR")
    ap.add_argument("--room", default=None, metavar="START,DUR")
    a = ap.parse_args()

    info = probe(a.take)
    nch = int(info.get("channels", 1))
    print("== file ==")
    print("  %s  %s ch (%s)  %s Hz  %.3fs"
          % (info.get("codec_name"), nch, info.get("channel_layout"),
             info.get("sample_rate"), float(info.get("duration", 0))))

    print("\n== channels ==")
    means = []
    for c in range(nch):
        m, p = level(a.take, ch=c)
        means.append(m if m is not None else -999)
        flag = "  <-- SILENT" if m is not None and m < -80 else ""
        print("  ch%d  mean %7.1f  peak %7.1f dB%s" % (c, m, p, flag))
    live = [c for c, m in enumerate(means) if m > -80]
    ch = a.channel if a.channel is not None else (
        max(range(nch), key=lambda c: means[c]) if means else 0)
    if nch > 1 and len(live) == 1:
        print("  ONE LIVE CHANNEL in a %d-channel file. Browsers map channels to"
              " sides, so this plays out of one ear." % nch)
        print("  Fix: take ch%d to mono, then fan it to dual-mono stereo." % live[0])
    print("  analysing ch%d" % ch)

    print("\n== loudness ==")
    err = ff(["-i", a.take, "-filter_complex",
              "[0:a]pan=mono|c0=c%d,loudnorm=print_format=summary" % ch,
              "-f", "null", "-"])
    for k in ("Input Integrated", "Input True Peak", "Input LRA"):
        m = re.search(re.escape(k) + r":\s*(-?[\d.]+)", err)
        if m:
            print("  %-18s %s" % (k, m.group(1)))
    tp = re.search(r"Input True Peak:\s*(-?[\d.]+)", err)
    if tp and float(tp.group(1)) > -0.1:
        print("  ABOVE 0 dBTP - this take is clipped. Rebuild from the raw file.")
    lra = re.search(r"Input LRA:\s*(-?[\d.]+)", err)
    if lra and float(lra.group(1)) < 5:
        print("  LRA under 5 LU - already even. A compressor will only lift the"
              " noise floor; skip it.")

    env = envelope(a.take, ch)
    if not env:
        print("\n== gaps ==\n  could not read an RMS envelope from this file")
        return 1
    levels = sorted(d for _, d in env)
    # A fixed threshold only fits a take that happens to be at the level you
    # tuned it on. Sitting it 14 dB under the median window tracks the take.
    thresh = a.gap_threshold
    if thresh is None:
        thresh = round(levels[len(levels) // 2] - 14.0, 1)
    print("\n== gaps (below %.1f dB for %.2fs+) ==" % (thresh, a.min_gap))
    gaps = find_gaps(env, thresh, a.min_gap)
    for s, e in gaps:
        print("  %7.3f -> %7.3f   %.3fs" % (s, e, e - s))
    if gaps:
        lo, hi = max(gaps, key=lambda g: g[1] - g[0])
        print("  longest: %.3f-%.3f (%.3fs)" % (lo, hi, hi - lo))
    else:
        print("  none. Lower --gap-threshold, or the room floor is close to"
              " the speech level.")
    print("  %d gaps, quietest window %.1f dB, loudest %.1f dB"
          % (len(gaps), levels[0], levels[-1]))

    sp = a.speech.split(",") if a.speech else None
    rm = a.room.split(",") if a.room else None
    if sp is None and env:
        t = max(env, key=lambda r: r[1])[0]
        sp = (max(0.0, t - 0.4), 0.8)
    else:
        sp = (float(sp[0]), float(sp[1]))
    if rm is None and gaps:
        lo, hi = max(gaps, key=lambda g: g[1] - g[0])
        rm = (lo + 0.05, max(0.15, min(0.7, hi - lo - 0.1)))
    elif rm:
        rm = (float(rm[0]), float(rm[1]))

    if rm:
        s = bands(a.take, ch, *sp)
        n = bands(a.take, ch, *rm)
        if s and n:
            print("\n== spectrum: speech %.2f+%.2f vs room %.2f+%.2f =="
                  % (sp[0], sp[1], rm[0], rm[1]))
            ref = max(s)
            print("  band            speech    room     SNR")
            for (lo, hi), sv, nv in zip(BANDS, s, n):
                print("  %5d-%-5d  %8.1f %7.1f %7.1f"
                      % (lo, hi, sv - ref, nv - ref, sv - nv))
            print("\n  Read it like this: bands with SNR under ~5 dB are noise"
                  " only (high-pass them off).")
            print("  A 90-450 Hz plateau near the peak with 700-1700 Hz far below"
                  " means boomy and scooped -")
            print("  cut the low-mids, lift 2-3 kHz. 4-6 kHz above 2.6-4 kHz means"
                  " sibilance; de-ess.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
