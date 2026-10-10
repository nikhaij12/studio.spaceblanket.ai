#!/usr/bin/env python3
"""Decide where each caption block should sit so it never lands on a face.

The rail's default home is the lower third. That is right for most shots and
wrong for the handful where the subject is low in frame — a 200px handwritten
word straight across someone's mouth. This picks, per block, the lowest slot
that clears every face under it, so the rail stays put unless it has to move.

  1. Sample the composition with the caption rail HIDDEN, only at times when a
     shot is fully up (a dissolve frame is a blend and hides faces from the
     detector).
  2. Detect faces with YuNet, and keep its five landmarks — both eyes, the nose
     tip, both mouth corners.
  3. Score each candidate slot on the LANDMARKS, not on the face box. This is
     the whole trick. A face box says "type touches this person" and fires on
     every close-up, because a portrait that fills the frame leaves nowhere for
     a caption to go. Landmarks say "type crosses this person's eyes / nose /
     mouth", which is the thing that actually reads as a mistake. Type over a
     jaw, a chin or a shoulder is ordinary editorial and stays put.
  4. Take the lowest slot that scores clean, so movement stays rare.

Usage:
  caption_placement.py --frames <dir> --tables tables.json --caps caption_boxes.json
"""
import argparse
import glob
import json
import os
import re
import sys

import cv2

W, H = 1080, 1920

# Candidate rail positions, as an offset from the authored top (1150).
# Three, not a continuum: discrete homes read as a decision, a per-block nudge
# reads as drift. Values put the rail in the lower third, just under centre,
# and just over centre.
SLOTS = [("low", 0), ("mid", -250), ("high", -520)]

# Keep-clear ring around each landmark, as a fraction of the face's width. Type
# that stops just short of an eye still reads as crowding it.
PAD = 0.14
# Platform reserves the rail must stay inside wherever it goes.
SAFE_TOP, SAFE_BOT = 250, 1500


def load_frames(d):
    out = []
    for f in sorted(glob.glob(os.path.join(d, "t*.png"))):
        m = re.search(r"t([\d.]+)\.png$", f)
        if m:
            out.append((float(m.group(1)), f))
    return out


def faces_in(path, det, minsize):
    """(box, landmarks, score). YuNet returns 4 box values, then five x/y pairs
    — right eye, left eye, nose tip, right mouth corner, left mouth corner —
    then the confidence."""
    img = cv2.imread(path)
    if img is None:
        return []
    _, f = det.detect(img)
    if f is None:
        return []
    out = []
    for row in f:
        if row[2] < minsize or row[3] < minsize:
            continue
        box = tuple(float(v) for v in row[:4])
        marks = [(float(row[4 + 2 * i]), float(row[5 + 2 * i])) for i in range(5)]
        out.append((box, marks, float(row[-1])))
    return out


def rects(cap, dy):
    """The two ink rectangles — short tracked lead line, big handwritten word —
    shifted by dy. Scoring the union instead would condemn the empty corner
    between them."""
    out = []
    for k in ("lead", "emph"):
        b = cap.get(k)
        if b:
            out.append((b["x"], b["y"] + dy, b["r"], b["b"] + dy))
    return out


def landmark_hits(face, cap, dy):
    """How many of the five landmarks the caption ink covers, and how big the
    face is relative to the frame (a 400px head matters more than a 95px one)."""
    (fx, fy, fw, fh), marks, _ = face
    pad = PAD * fw
    n = 0
    for (mx, my) in marks:
        for (x0, y0, x1, y1) in rects(cap, dy):
            if x0 - pad <= mx <= x1 + pad and y0 - pad <= my <= y1 + pad:
                n += 1
                break
    return n, fw / float(W)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", required=True)
    ap.add_argument("--tables", default="tables.json")
    ap.add_argument("--caps", default="caption_boxes.json")
    ap.add_argument("--model", required=True)
    ap.add_argument("--conf", type=float, default=0.55)
    ap.add_argument("--min-face", type=int, default=90,
                    help="ignore faces smaller than this; a 60px head in a "
                         "restaurant background is not what the reel is about")
    ap.add_argument("--slots", default=None,
                    help="comma-separated dy offsets to score. Pass '0' to "
                         "audit a composition as built, whose measured boxes "
                         "already carry each block's offset.")
    ap.add_argument("--json", default=None)
    a = ap.parse_args()

    caps = json.load(open(a.caps))
    slots = SLOTS if not a.slots else [
        ("as-built" if v == "0" else "dy" + v, int(v)) for v in a.slots.split(",")]
    frames = load_frames(a.frames)
    if not frames:
        raise SystemExit("no frames in " + a.frames)
    det = cv2.FaceDetectorYN.create(a.model, "", (W, H), a.conf, 0.3, 5000)
    det.setInputSize((W, H))

    detected = {t: faces_in(p, det, a.min_face) for t, p in frames}
    print("sampled %d frames, %d carry a face >= %dpx"
          % (len(frames), sum(1 for v in detected.values() if v), a.min_face))

    rows, out = [], []
    for c in caps:
        box, ts = c["box"], [t for t, _ in frames if c["start"] <= t < c["end"]]
        scored = []
        for name, dy in slots:
            if box["y"] + dy < SAFE_TOP or box["b"] + dy > SAFE_BOT:
                scored.append((name, dy, None, None, None))
                continue
            # Cost is landmarks-covered weighted by how much of the frame that
            # face occupies, summed over the faces in the worst single frame.
            worst, at, who = 0.0, None, None
            for t in ts:
                tot, big = 0.0, None
                for f in detected[t]:
                    n, rel = landmark_hits(f, c, dy)
                    if n:
                        tot += n * rel
                        if big is None or rel > big[1]:
                            big = (n, rel)
                if tot > worst:
                    worst, at, who = tot, t, big
            scored.append((name, dy, worst, at, who))
        ok = [s for s in scored if s[2] is not None and s[2] <= 0.0]
        pick = ok[0] if ok else min(
            (s for s in scored if s[2] is not None), key=lambda s: s[2])
        out.append({"block": c["i"], "text": c["text"], "slot": pick[0],
                    "dy": pick[1], "cost": round(pick[2], 3), "at": pick[3],
                    "clean": pick[2] <= 0.0,
                    "scores": {s[0]: (None if s[2] is None else round(s[2], 3)) for s in scored}})
        rows.append((c, scored, pick))

    print("\n     cost = landmarks covered, weighted by face size. 0 = no eye,"
          " nose or mouth under type.")
    names = [n for n, _ in slots]
    print("blk  text                             " + "".join(n[:6].rjust(7) for n in names)
          + "  ->slot     at    worst face")
    for c, scored, pick in rows:
        g = {s[0]: s[2] for s in scored}
        fm = lambda v: "   --  " if v is None else ("   .   " if v == 0 else "%7.2f" % v)
        who = "" if not pick[4] else "%d marks, %.0f%% of frame wide" % (pick[4][0], pick[4][1] * 100)
        flag = "" if pick[2] <= 0 else "  <-- unavoidable"
        print("%3d  %-32s%s  %-8s %6s  %s%s"
              % (c["i"], c["text"][:32], "".join(fm(g[n]) for n in names),
                 pick[0], "%5.2f" % pick[3] if pick[3] else "  -  ", who, flag))

    moved = [o for o in out if o["dy"]]
    print("\n%d of %d blocks move: %s" % (len(moved), len(out),
          ", ".join("b%d->%s" % (o["block"], o["slot"]) for o in moved) or "none"))
    stuck = [o for o in out if not o["clean"]]
    if stuck:
        print("%d have no clean slot at all (the subject fills the frame): %s"
              % (len(stuck), ", ".join("b%d" % o["block"] for o in stuck)))
    if a.json:
        json.dump(out, open(a.json, "w"), indent=1)
        print("wrote", a.json)
    return 0


if __name__ == "__main__":
    sys.exit(main())
