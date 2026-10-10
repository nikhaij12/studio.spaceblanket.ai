#!/usr/bin/env python3
"""Find, to the sample, where one audio file sits inside another.

Needed whenever you want to rebuild a mixed/trimmed voiceover from the raw take
without shifting caption onsets that were tuned against the mix. Correlating two
independent phrases and checking they agree is the whole method - if they
disagree by more than a millisecond or two, the guess window was wrong.

Usage:
  align_takes.py NEEDLE.m4a HAYSTACK.m4a
  align_takes.py mix.m4a raw.m4a --guess 3.7 --window 0.5 --channel 1
"""
import argparse
import os
import subprocess
import sys

import numpy as np

SR = 48000


def pcm(path, ss, dur, ch):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", "%.5f" % max(0.0, ss), "-t", "%.5f" % dur,
         "-i", path, "-filter_complex",
         "[0:a]pan=mono|c0=c%d,aresample=%d" % (ch, SR), "-f", "f32le", "-"],
        capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def offset_at(needle, haystack, at, guess, window, nch, hch, seglen):
    a = pcm(needle, at, seglen, nch)
    b = pcm(haystack, at + guess - window, seglen + 2 * window, hch)
    if len(a) < SR // 10 or len(b) <= len(a):
        return None
    c = np.correlate(b - b.mean(), a - a.mean(), mode="valid")
    return guess - window + int(np.argmax(np.abs(c))) / SR


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("needle", help="the shorter/trimmed file")
    ap.add_argument("haystack", help="the longer/raw file")
    ap.add_argument("--guess", type=float, default=0.0)
    ap.add_argument("--window", type=float, default=5.0)
    ap.add_argument("--channel", type=int, default=0, help="channel in the needle")
    ap.add_argument("--haystack-channel", type=int, default=None)
    ap.add_argument("--at", type=float, action="append", default=[],
                    help="probe here (repeatable); default picks two spots")
    ap.add_argument("--seglen", type=float, default=1.5)
    a = ap.parse_args()
    hch = a.channel if a.haystack_channel is None else a.haystack_channel

    for p in (a.needle, a.haystack):
        if not os.path.exists(p):
            raise SystemExit("no such file: %s" % p)
    raw = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", a.needle], capture_output=True, text=True).stdout.strip()
    if not raw:
        raise SystemExit("ffprobe could not read a duration from %s" % a.needle)
    dur = float(raw)
    spots = a.at or [round(dur * 0.35, 2), round(dur * 0.75, 2)]

    got = []
    for at in spots:
        off = offset_at(a.needle, a.haystack, at, a.guess, a.window,
                        a.channel, hch, a.seglen)
        if off is None:
            print("  %6.2fs  (too short to correlate)" % at)
            continue
        got.append(off)
        print("  probe at %6.2fs -> offset %.5f s" % (at, off))

    if not got:
        raise SystemExit("nothing to correlate")
    spread = max(got) - min(got)
    print("\noffset %.5f s   (spread across probes %.1f ms)"
          % (sum(got) / len(got), spread * 1000))
    if spread > 0.005:
        print("Probes disagree by more than 5 ms. Widen --window, or the two"
              " files are not a straight trim of each other (a cut in between?).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
