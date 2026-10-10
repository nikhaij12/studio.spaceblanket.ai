#!/usr/bin/env python3
"""Tile one frame per shot into contact sheets, and flag dead frames.

This catches everything `hyperframes check` cannot see, because the checker
measures boxes and contrast, not pictures: a lost WebGL context rendering a
frame ungraded or black, a 9:16 crop that decapitates the subject, a postcard
frame at the wrong scale, a caption sitting on the one photo it is illegible
against.

Feed it the shot start times (one per shot) plus any extra beats worth a look -
the frame after a caption lands, the closing hold, the last frame.

Usage:
  contact_sheet.py render.mp4 --starts 0,1.2,2.4,3.6 --duration 56
  contact_sheet.py render.mp4 --starts-from build_reel.py
  contact_sheet.py render.mp4 --starts 0,1.2 --extra 47.55:sometimes_lands
"""
import argparse
import os
import re
import subprocess
import sys


def luma_stats(png):
    """Mean and spread of a frame. ffmpeg's signalstats prints at info level, so
    never quiet it - but decoding to raw gray and measuring here is exact and
    needs no log scraping."""
    try:
        import numpy as np
    except ImportError:
        return None, None
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", png, "-pix_fmt", "gray",
                          "-f", "rawvideo", "-"], capture_output=True).stdout
    if not raw:
        return None, None
    a = np.frombuffer(raw, dtype="uint8")
    return float(a.mean()), float(a.std())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--starts", default=None, help="comma-separated shot starts")
    ap.add_argument("--starts-from", default=None,
                    help="a build script with a SHOTS list to read starts from")
    ap.add_argument("--extra", action="append", default=[], metavar="TIME:LABEL")
    ap.add_argument("--duration", type=float, default=None)
    ap.add_argument("--fade", type=float, default=0.22)
    ap.add_argument("--outdir", default="sheet")
    ap.add_argument("--cols", type=int, default=5)
    ap.add_argument("--per-sheet", type=int, default=25)
    ap.add_argument("--width", type=int, default=270)
    a = ap.parse_args()

    starts = []
    if a.starts:
        starts = [float(x) for x in a.starts.split(",") if x.strip()]
    elif a.starts_from:
        src = open(a.starts_from).read()
        block = re.search(r"SHOTS\s*=\s*\[(.*?)\n\]", src, re.S)
        if not block:
            raise SystemExit("no SHOTS list found in %s" % a.starts_from)
        starts = [float(m) for m in
                  re.findall(r"^\s*\(\s*([\d.]+)\s*,", block.group(1), re.M)]
    if not starts:
        raise SystemExit("give --starts or --starts-from")

    total = a.duration
    if total is None:
        total = float(subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", a.video], capture_output=True, text=True).stdout.strip())

    os.makedirs(a.outdir, exist_ok=True)
    for f in os.listdir(a.outdir):
        os.remove(os.path.join(a.outdir, f))

    stamps = []
    for i, s in enumerate(starts):
        end = starts[i + 1] if i + 1 < len(starts) else total
        # Sample just after the dissolve completes, so the frame is the shot
        # itself and not a blend of it with the one before.
        t = min(s + a.fade + 0.08, (s + end) / 2 + 0.05, end - 0.02)
        stamps.append((i, max(0.0, t), "shot%02d" % (i + 1)))
    for j, spec in enumerate(a.extra):
        t, _, label = spec.partition(":")
        stamps.append((len(starts) + j, float(t), label or "extra%d" % (j + 1)))

    h = int(round(a.width * 16 / 9))
    for i, t, label in stamps:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-ss", "%.3f" % t, "-i", a.video,
             "-frames:v", "1", "-vf", "scale=%d:%d" % (a.width, h), "-y",
             os.path.join(a.outdir, "%02d_%s.png" % (i + 1, label))], check=True)

    files = sorted(os.listdir(a.outdir))
    for page in range(0, len(files), a.per_sheet):
        chunk = files[page:page + a.per_sheet]
        args = ["ffmpeg", "-v", "error"]
        for f in chunk:
            args += ["-i", os.path.join(a.outdir, f)]
        n, c = len(chunk), a.cols
        layout = []
        for k in range(n):
            col, row = k % c, k // c
            layout.append("%s_%s" % (
                "0" if col == 0 else "+".join("w%d" % j for j in range(col)),
                "0" if row == 0 else "+".join("h%d" % (j * c) for j in range(row))))
        args += ["-filter_complex",
                 "".join("[%d:v]" % k for k in range(n))
                 + "xstack=inputs=%d:layout=%s" % (n, "|".join(layout)),
                 "-y", "contact_%d.png" % (page // a.per_sheet + 1)]
        subprocess.run(args, check=True)

    bad = []
    for f in files:
        m, s = luma_stats(os.path.join(a.outdir, f))
        if m is None:
            continue
        if m < 10 or s < 4:
            bad.append((f, round(m, 1), round(s, 1)))
    print("frames: %d  sheets: %d" % (len(files), (len(files) + a.per_sheet - 1) // a.per_sheet))
    print("black or flat frames:", bad if bad else "none")
    print(" ".join(files))
    return 0


if __name__ == "__main__":
    sys.exit(main())
