#!/usr/bin/env python3
"""Find where the caption rail lands on a face, and where it leaves the safe zone.

Two independent checks against the delivered render:

  faces   For every shot, detect faces in the frame and intersect them with the
          caption ink box that is up at that moment. A face under the 200px
          emphasis word is the thing a viewer sees as "captions on my face".
  zones   Intersect the same ink boxes with the platform UI reserves. On a Reel
          the right-hand action rail is the one that bites: it is a column, so
          a long lead line runs under Like/Comment/Share even though the rail
          starts well below the top of the frame.

Faces come off the RENDER, not the source photos, so the crop, the Ken Burns
drift and the shot mode are all already applied — no transform maths to get
wrong. Detection is Haar (frontal + profile + upper body); it is generous, so
every hit is written out as a crop for a human/vision pass rather than trusted
blind.

Usage:
  safe_zones.py --video ../reel/out/paris_reel.mp4 --tables tables.json \
                --caps caption_boxes.json --out ../../../tmp/2026-07-28_safezones
"""
import argparse
import json
import os
import subprocess
import sys

import cv2
import numpy as np

W, H = 1080, 1920

# ── Platform reserves, in frame pixels for a 1080x1920 master ──────────────
# Measured off two independent 1080x1920 Reels overlay templates that agree on
# the shape: the safe area is an L, because the action rail only starts partway
# down the frame. Numbers are the stricter of the two templates.
#   Instagram Reels   top 250, bottom 420, left 70, right 55 above the rail,
#                     right 193 below it (rail top at y=860)
#   YouTube Shorts    bottom ~300 (progress bar + title), right ~120
#   TikTok            top 130, bottom 250, left/right 60
RESERVES = [
    # name,                      x0,   y0,   x1,   y1
    ("IG top chrome",             0,    0, 1080,  250),
    ("IG action rail",          887,  860, 1080, 1500),
    ("IG bottom (caption/audio)", 0, 1500, 1080, 1920),
    ("YT bottom (title/progress)", 0, 1620, 1080, 1920),
    ("YT right rail",           960,  900, 1080, 1620),
]
# The union of what must stay clear, expressed as the strictest single box a
# caption may occupy anywhere below the rail's top edge.
SAFE = {"x0": 70, "y0": 250, "x1": 887, "y1": 1500}


def frame_at(video, t):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", "%.3f" % t, "-i", video,
         "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
        capture_output=True).stdout
    if len(raw) != W * H * 3:
        return None
    return np.frombuffer(raw, np.uint8).reshape(H, W, 3)


def detectors(model, conf=0.5):
    """YuNet. OpenCV 5 dropped the Haar cascades from the Python wheel, which is
    no loss — YuNet finds profiles and small faces that Haar misses, and returns
    a confidence instead of a vote count."""
    if not os.path.exists(model):
        raise SystemExit(
            "no YuNet model at %s\n  fetch: curl -L -o %s https://github.com/"
            "opencv/opencv_zoo/raw/main/models/face_detection_yunet/"
            "face_detection_yunet_2023mar.onnx" % (model, model))
    d = cv2.FaceDetectorYN.create(model, "", (W, H), conf, 0.3, 5000)
    d.setInputSize((W, H))
    return d


def find_faces(img, det, minsize=40):
    """A face box plus, for the ones that matter, the head above it: the crown
    and hair sit outside YuNet's box, and a caption through someone's forehead
    reads exactly as badly as one through their mouth."""
    _, faces = det.detect(img)
    out = []
    if faces is None:
        return out
    for f in faces:
        x, y, w, h = (int(round(v)) for v in f[:4])
        if w < minsize or h < minsize:
            continue
        conf = float(f[-1])
        # Grow to a head box: YuNet frames eyes-to-chin.
        hx = max(0, x - int(w * 0.18))
        hy = max(0, y - int(h * 0.45))
        hr = min(W, x + w + int(w * 0.18))
        hb = min(H, y + h + int(h * 0.22))
        out.append((hx, hy, hr - hx, hb - hy, "yunet %.2f" % conf))
    return merge(out)


def merge(boxes, iou_min=0.3):
    """Three cascades over one face produce three near-identical boxes."""
    kept = []
    for b in sorted(boxes, key=lambda b: -b[2] * b[3]):
        if not any(iou(b, k) > iou_min for k in kept):
            kept.append(b)
    return kept


def iou(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ix = max(0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0, min(ay1, by1) - max(ay0, by0))
    inter = ix * iy
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union else 0.0


def overlap(box, x0, y0, x1, y1):
    """Fraction of `box` (an x/y/r/b dict) inside the rectangle."""
    ix = max(0.0, min(box["r"], x1) - max(box["x"], x0))
    iy = max(0.0, min(box["b"], y1) - max(box["y"], y0))
    area = (box["r"] - box["x"]) * (box["b"] - box["y"])
    return (ix * iy) / area if area else 0.0


def block_at(caps, t):
    for c in caps:
        if c["start"] <= t < c["end"]:
            return c
    return caps[-1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--tables", default="tables.json")
    ap.add_argument("--caps", default="caption_boxes.json")
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-face", type=int, default=40)
    ap.add_argument("--model", default="yunet.onnx",
                    help="YuNet ONNX (opencv_zoo face_detection_yunet_2023mar)")
    ap.add_argument("--conf", type=float, default=0.5)
    a = ap.parse_args()

    tables = json.load(open(a.tables))
    caps = json.load(open(a.caps))
    os.makedirs(a.out, exist_ok=True)
    dets = detectors(a.model, a.conf)

    print("== zone check: caption ink vs platform reserves ==")
    bad = []
    for c in caps:
        box = c["box"]
        hits = [(n, overlap(box, *r)) for n, *r in
                [(n, x0, y0, x1, y1) for n, x0, y0, x1, y1 in RESERVES]]
        hits = [(n, f) for n, f in hits if f > 0.001]
        if hits:
            bad.append((c, hits))
    if not bad:
        print("  clean — no caption ink in any reserved band")
    for c, hits in bad:
        over = max(0, box_r(c) - SAFE["x1"])
        print("  b%-2d %-34s right edge %4.0f  (%+4.0f past %d)   %s"
              % (c["i"], c["text"][:34], box_r(c), over, SAFE["x1"],
                 ", ".join("%s %.0f%%" % (n, f * 100) for n, f in hits)))

    print("\n== face check: caption ink vs detected faces, per shot ==")
    rows = []
    for s in tables["shots"]:
        # Two samples: just after the dissolve completes, and mid-hold, because
        # Ken Burns moves the face across the frame during the shot.
        span = max(0.05, s["out"] - s["up"])
        for tag, t in (("up", s["up"] + 0.05), ("mid", s["up"] + span * 0.55)):
            t = min(t, tables["duration"] - 0.05)
            img = frame_at(a.video, t)
            if img is None:
                print("  shot %2d %s: no frame at %.2f" % (s["i"], tag, t))
                continue
            faces = find_faces(img, dets, a.min_face)
            c = block_at(caps, t)
            lead, emph = c.get("lead"), c.get("emph")
            for (x, y, w, h, src) in faces:
                fb = {"x": x, "y": y, "r": x + w, "b": y + h}
                oe = overlap(fb, emph["x"], emph["y"], emph["r"], emph["b"]) if emph else 0
                ol = overlap(fb, lead["x"], lead["y"], lead["r"], lead["b"]) if lead else 0
                if max(oe, ol) < 0.02:
                    continue
                rows.append(dict(shot=s["i"], img=s["img"], note=s["note"], t=round(t, 2),
                                 tag=tag, face=[x, y, w, h], src=src, block=c["i"],
                                 text=c["text"], emph_frac=round(oe, 3), lead_frac=round(ol, 3)))
                stamp = draw(img, faces, c)
                cv2.imwrite(os.path.join(a.out, "hit_s%02d_%s_t%05.2f.png"
                                         % (s["i"], tag, t)), stamp)

    if not rows:
        print("  no face/caption intersections detected")
    for r in sorted(rows, key=lambda r: -max(r["emph_frac"], r["lead_frac"])):
        print("  shot %2d %-16s t=%5.2f  face %-22s  b%-2d %-26s  emph %3.0f%% lead %3.0f%%"
              % (r["shot"], str(r["img"])[:16], r["t"], str(r["face"]), r["block"],
                 r["text"][:26], r["emph_frac"] * 100, r["lead_frac"] * 100))

    json.dump({"zone_violations": [
        {"block": c["i"], "text": c["text"], "right": box_r(c),
         "past_safe": max(0, box_r(c) - SAFE["x1"]),
         "reserves": [{"name": n, "frac": f} for n, f in hits]} for c, hits in bad],
        "face_hits": rows}, open(os.path.join(a.out, "safe_zone_report.json"), "w"), indent=1)
    print("\nwrote", os.path.join(a.out, "safe_zone_report.json"))
    return 0


def box_r(c):
    return c["box"]["r"]


def draw(img, faces, c):
    """Annotated frame: faces in red, caption ink in cyan, reserves in yellow."""
    out = img.copy()
    for n, x0, y0, x1, y1 in RESERVES:
        cv2.rectangle(out, (x0, y0), (x1 - 1, y1 - 1), (0, 200, 255), 2)
    for k, col in (("lead", (255, 255, 0)), ("emph", (255, 200, 0))):
        b = c.get(k)
        if b:
            cv2.rectangle(out, (int(b["x"]), int(b["y"])), (int(b["r"]), int(b["b"])), col, 3)
    for (x, y, w, h, src) in faces:
        cv2.rectangle(out, (x, y), (x + w, y + h), (0, 0, 255), 4)
        cv2.putText(out, src, (x, max(20, y - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
    return out


if __name__ == "__main__":
    sys.exit(main())
