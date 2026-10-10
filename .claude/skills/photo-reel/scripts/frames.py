#!/usr/bin/env python3
"""Pull a few frames side by side, for reading captions at a specific moment.

The contact sheet answers "does every shot render". This answers "does this
line land on the right frame" - which is the check you run after re-timing a
caption, and the only way to confirm a fix without watching 56 seconds.

Crop to the caption band when you want the type big enough to read: on a
1080x1920 reel the rail sits low, so --crop 0,1150,1080,700 is a good default.

Usage:
  frames.py render.mp4 -t 47.20 -t 47.45 -t 47.90 -o check.png
  frames.py render.mp4 -t 47.2 -t 47.5 --crop 0,1150,1080,700 -o caption.png
"""
import argparse
import os
import subprocess
import sys
import tempfile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("-t", "--time", action="append", type=float, required=True)
    ap.add_argument("-o", "--out", default="frames.png")
    ap.add_argument("--crop", default=None, metavar="X,Y,W,H")
    ap.add_argument("--width", type=int, default=300)
    ap.add_argument("--rows", type=int, default=1)
    a = ap.parse_args()

    vf = []
    if a.crop:
        x, y, w, h = (int(v) for v in a.crop.split(","))
        vf.append("crop=%d:%d:%d:%d" % (w, h, x, y))
        ar = h / w
    else:
        ar = 16 / 9
    vf.append("scale=%d:%d" % (a.width, int(round(a.width * ar))))

    tmp = tempfile.mkdtemp()
    paths = []
    for i, t in enumerate(a.time):
        p = os.path.join(tmp, "%02d.png" % i)
        subprocess.run(["ffmpeg", "-v", "error", "-ss", "%.3f" % t, "-i", a.video,
                        "-frames:v", "1", "-vf", ",".join(vf), "-y", p], check=True)
        paths.append(p)

    n = len(paths)
    cols = (n + a.rows - 1) // a.rows
    args = ["ffmpeg", "-v", "error"]
    for p in paths:
        args += ["-i", p]
    if n == 1:
        subprocess.run(["cp", paths[0], a.out], check=True)
    else:
        layout = []
        for k in range(n):
            col, row = k % cols, k // cols
            layout.append("%s_%s" % (
                "0" if col == 0 else "+".join("w%d" % j for j in range(col)),
                "0" if row == 0 else "+".join("h%d" % (j * cols) for j in range(row))))
        args += ["-filter_complex",
                 "".join("[%d:v]" % k for k in range(n))
                 + "xstack=inputs=%d:layout=%s" % (n, "|".join(layout)),
                 "-y", a.out]
        subprocess.run(args, check=True)
    print("wrote %s  (%s)" % (a.out, ", ".join("%.2fs" % t for t in a.time)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
