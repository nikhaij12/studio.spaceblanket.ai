#!/usr/bin/env python3
"""Export build_reel.py's SHOTS and BLOCKS as JSON.

The tables are Python tuples inside the generator, and both the DOM probe
(Node) and the safe-zone analysis need them. Rather than re-declare them in two
more places, export the ones that are already the source of truth.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_reel as B  # noqa: E402

shots = []
for i, (start, img, fade, mode, pos, note) in enumerate(B.SHOTS):
    nxt = B.SHOTS[i + 1][0] if i + 1 < len(B.SHOTS) else B.DURATION
    shots.append({
        "i": i,
        "start": start,
        # A shot is fully up only after its dissolve completes, and it holds
        # until the next dissolve begins.
        "up": round(start + fade, 3),
        "out": round(nxt, 3),
        "img": img if isinstance(img, str) else list(img),
        "mode": mode,
        "pos": pos,
        "note": note,
    })

blocks = [{
    "i": i,
    "start": s,
    "end": e,
    "lead": [list(w) for w in lead],
    "emph": emph[0],
    "emph_at": emph[1],
} for i, (s, e, lead, emph) in enumerate(B.BLOCKS)]

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tables.json")
with open(out, "w") as f:
    json.dump({"duration": B.DURATION, "fps": B.FPS, "shots": shots, "blocks": blocks}, f, indent=1)
print("wrote", out, len(shots), "shots,", len(blocks), "blocks")
