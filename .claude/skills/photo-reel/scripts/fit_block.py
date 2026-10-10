#!/usr/bin/env python3
"""Find the smallest change that gets one caption block off a face.

The standard is the FACE, not the facial landmarks — type across a chin or a
jaw counts as overlapping, and a scrim that dims a face counts too. So this
clears an expanded face box (hair above, a little under the chin, a margin at
the sides) rather than the eyes/nose/mouth points that caption_placement.py
scores.

Search space is (dy, scale): shift the rail and, if shifting alone cannot fit,
shrink the type. Smaller type is cheap — viewers offer it themselves — but a shift
of a few tens of pixels is cheaper still, so cost prefers staying put and
staying full size, in that order.

A block usually spans two or three shots. The answer has to clear ALL of them,
because the rail cannot move mid-block without looking broken.

Usage:
  fit_block.py --frames plain/ --caps caption_boxes.json --tables tables.json \
               --model yunet.onnx --blocks 1,3,11,18 --current 18:-520
"""
import argparse
import glob
import json
import os
import re
import sys

import cv2

W, H = 1080, 1920
SAFE = {"x0": 70, "y0": 250, "x1": 887, "y1": 1500}

# Expansion of YuNet's box into the thing a viewer calls "my face". YuNet frames
# roughly brow-to-chin; hair and jaw sit outside it, and type touching either is
# what got flagged.
GROW_UP, GROW_DOWN, GROW_SIDE = 0.32, 0.06, 0.08
# Ignore anyone smaller than this: a diner in the background of a restaurant is
# not what the reel is about, and clearing them is impossible anyway.
MIN_FACE = 100


def load_frames(d):
    out = []
    for f in sorted(glob.glob(os.path.join(d, "t*.png"))):
        m = re.search(r"t([\d.]+)\.png$", f)
        if m:
            out.append((float(m.group(1)), f))
    return out


def faces_in(path, det):
    img = cv2.imread(path)
    if img is None:
        return []
    _, f = det.detect(img)
    if f is None:
        return []
    out = []
    for row in f:
        x, y, w, h = (float(v) for v in row[:4])
        if w < MIN_FACE:
            continue
        out.append((max(0.0, x - GROW_SIDE * w), max(0.0, y - GROW_UP * h),
                    min(W, x + w + GROW_SIDE * w), min(H, y + h + GROW_DOWN * h),
                    float(row[-1])))
    return out


def placed(cap, dy, s, base_dy):
    """The two ink rects after shifting by dy and scaling by s about the
    block's own top-left. caption_boxes.json is measured AS BUILT, so any offset
    already applied to this block is taken back out first."""
    ox, oy = SAFE["x0"] - 6, 1150.0          # the stage's own origin
    out = []
    for k in ("lead", "emph"):
        b = cap.get(k)
        if not b:
            continue
        x0, y0 = b["x"], b["y"] - base_dy    # un-shift to the authored position
        x1, y1 = b["r"], b["b"] - base_dy
        out.append((ox + (x0 - ox) * s, oy + dy + (y0 - oy) * s,
                    ox + (x1 - ox) * s, oy + dy + (y1 - oy) * s))
    return out


def overlaps(r, f):
    return not (r[2] <= f[0] or r[0] >= f[2] or r[3] <= f[1] or r[1] >= f[3])


def clears(rects, faces):
    return not any(overlaps(r, f) for r in rects for f in faces)


def in_safe(rects):
    return all(r[0] >= SAFE["x0"] - 8 and r[2] <= SAFE["x1"] + 1
               and r[1] >= SAFE["y0"] and r[3] <= SAFE["y1"] for r in rects)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--caps", default="caption_boxes.json")
    ap.add_argument("--model", required=True)
    ap.add_argument("--blocks", required=True)
    ap.add_argument("--current", default="", help="blk:dy already applied, comma-separated")
    ap.add_argument("--conf", type=float, default=0.5)
    ap.add_argument("--check", default="", help="blk:dy:scale to test, comma-separated")
    a = ap.parse_args()

    caps = {c["i"]: c for c in json.load(open(a.caps))}
    base = {}
    for tok in filter(None, a.current.split(",")):
        k, v = tok.split(":")
        base[int(k)] = float(v)
    want = [int(v) for v in a.blocks.split(",")]

    det = cv2.FaceDetectorYN.create(a.model, "", (W, H), a.conf, 0.3, 5000)
    det.setInputSize((W, H))
    frames = load_frames(a.frames)
    faces = {t: faces_in(p, det) for t, p in frames}

    check = {}
    for tok in filter(None, a.check.split(",")):
        k, dy, sc = tok.split(":")
        check[int(k)] = (float(dy), float(sc))

    for bi in want:
        c = caps[bi]
        bdy = base.get(bi, 0.0)
        ts = [t for t, _ in frames if c["start"] <= t < c["end"]]
        allf = [(t, f) for t in ts for f in faces[t]]
        print("\n== b%d  %s   (%.2f-%.2f, %d frames, %d faces >=%dpx)"
              % (bi, c["text"], c["start"], c["end"], len(ts), len(allf), MIN_FACE))
        for t, f in allf:
            print("     t=%5.2f  face x %4.0f..%4.0f  y %4.0f..%4.0f  conf %.2f"
                  % (t, f[0], f[2], f[1], f[3], f[4]))
        if not allf:
            print("     no face to clear")
            continue

        if bi in check:
            dy, sc = check[bi]
            bad = [(t, f) for t in ts for f in faces[t]
                   if any(overlaps(r, f) for r in placed(c, dy, sc, bdy))]
            r = placed(c, dy, sc, bdy)
            print("     CHECK dy %+d scale %.2f -> %s%s"
                  % (dy, sc, "CLEARS every face" if not bad else "HITS %d" % len(bad),
                     "" if in_safe(r) else "   BUT OUTSIDE THE SAFE ZONE"))
            for k, rr in zip(("lead", "emph"), r):
                print("        %-4s x %4.0f..%4.0f  y %4.0f..%4.0f" % (k, rr[0], rr[2], rr[1], rr[3]))
            for t, f in bad[:4]:
                print("        hit t=%5.2f face x %4.0f..%4.0f y %4.0f..%4.0f" % (t, f[0], f[2], f[1], f[3]))
            continue

        best = None
        for dyi in range(-900, 201, 5):
            for si in range(100, 57, -1):
                s = si / 100.0
                ok = True
                for t in ts:
                    r = placed(c, dyi, s, bdy)
                    if not in_safe(r) or not clears(r, faces[t]):
                        ok = False
                        break
                if not ok:
                    continue
                # Prefer full size, then a small move. 100px of travel is worth
                # about 3% of type size.
                cost = (1.0 - s) * 100 + abs(dyi - bdy) * 0.03
                if best is None or cost < best[0]:
                    best = (cost, dyi, s)
        opts = []
        for dyi in range(-900, 201, 5):
            for si in range(100, 57, -1):
                s = si / 100.0
                if all(in_safe(placed(c, dyi, s, bdy)) and clears(placed(c, dyi, s, bdy), faces[t])
                       for t in ts):
                    opts.append((dyi, s))
                    break
        if opts:
            print("     feasible: dy %+d..%+d; largest scale %.2f"
                  % (min(o[0] for o in opts), max(o[0] for o in opts),
                     max(o[1] for o in opts)))
            for dyi, s in opts:
                if dyi % 40 == 0:
                    print("        dy %+5d -> max scale %.2f" % (dyi, s))
        if best is None:
            print("     NO fit clears every frame at any (dy, scale)")
            continue
        _, dy, s = best
        r = placed(c, dy, s, bdy)
        print("     -> dy %+d  scale %.2f   (currently dy %+d, scale 1.00)" % (dy, s, bdy))
        for k, rr in zip(("lead", "emph"), r):
            print("        %-4s x %4.0f..%4.0f  y %4.0f..%4.0f" % (k, rr[0], rr[2], rr[1], rr[3]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
