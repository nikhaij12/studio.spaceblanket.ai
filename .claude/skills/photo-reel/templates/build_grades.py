#!/usr/bin/env python3
"""Derive per-image color grading for every shot in the Paris reel.

Grade B — the one approved on the opener — is a shared cinematic layer
(warm-daylight preset, cool shadows, warm highlights, vignette, grain) plus a
small per-image correction that pulls each frame partway toward the group mean,
so the reel looks standardised without flattening dusk into daylight.

The five opener images already carry hand-tuned corrections that were approved.
Rather than invent a second formula for the other 45, this fits a straight line
per parameter through those five (measurement -> correction) pairs and applies
it to the rest. The new frames therefore inherit the approved look by
construction instead of merely resembling it.
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
# Same convention as build_reel.py: the project folder comes from the
# environment or argv, and the composition lives in its reel/ subfolder.
PROJECT_DIR = (os.environ.get("REEL_PROJECT_DIR")
               or (sys.argv[1] if len(sys.argv) > 1 else os.getcwd()))
PROJ = os.path.join(PROJECT_DIR, "reel")
sys.path.insert(0, ROOT)
from build_reel import SHOTS, shot_images, shot_layers  # noqa: E402

# The approved opener corrections, keyed by image.
APPROVED = {
    "IMG_0319":  dict(exposure=-0.02, contrast=0.09, temperature=0.16, tint=-0.02, saturation=0.03, blacks=0.02, whites=0.00),
    "IMG_4181":  dict(exposure=0.03,  contrast=0.14, temperature=0.22, tint=0.00,  saturation=0.16, blacks=0.05, whites=-0.04),
    "DSC00677":  dict(exposure=0.10,  contrast=0.05, temperature=0.24, tint=0.01,  saturation=0.10, blacks=0.08, whites=-0.08),
    "IMG_3809":  dict(exposure=0.02,  contrast=0.08, temperature=0.19, tint=0.00,  saturation=0.13, blacks=0.08, whites=0.00),
    "IMG_4201":  dict(exposure=0.12,  contrast=0.06, temperature=0.12, tint=-0.01, saturation=0.09, blacks=0.02, whites=0.06),
}

# param -> (predictor, clamp lo, clamp hi)
# Clamps are deliberately tighter than the fit would allow on its own: a night
# frame measured against a daylight mean wants a huge exposure lift, and night
# is supposed to stay night.
MODEL = {
    "exposure":    ("yAvg",   -0.10, 0.14),
    "contrast":    ("yRange",  0.02, 0.20),
    "blacks":      ("yLow",   -0.02, 0.12),
    "whites":      ("yHigh",  -0.12, 0.10),
    "temperature": ("warmth",  0.06, 0.26),
    "tint":        ("warmth", -0.04, 0.04),
    "saturation":  ("satAvg", -0.02, 0.22),
}

SHARED = {
    "preset": "warm-daylight",
    "intensity": 0.7,
    "details": {
        "vignette": 0.34,
        "vignetteMidpoint": 0.5,
        "vignetteRoundness": 0,
        "vignetteFeather": 0.7,
        "grain": 0.12,
        "grainSize": 0.3,
        "grainRoughness": 0.5,
    },
    "colorSpace": "rec709",
    "wheels": {
        "shadows": {"hue": 205, "amount": 0.07, "level": 0},
        "midtones": {"hue": 0, "amount": 0, "level": 0},
        "highlights": {"hue": 35, "amount": 0.06, "level": 0},
    },
}
FIXED_ADJUST = {"highlights": -0.06, "shadows": 0.08, "vibrance": 0.10}


def features(m):
    return {
        "yAvg": m["yAvg"],
        "yLow": m["yLow"],
        "yHigh": m["yHigh"],
        "yRange": m["yHigh"] - m["yLow"],
        "warmth": m["vAvg"] - m["uAvg"],
        "satAvg": m["satAvg"],
    }


def fit(xs, ys):
    """Ordinary least squares for y = a + b*x."""
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    b = (sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den) if den > 1e-9 else 0.0
    return my - b * mx, b


def analyze_all():
    """Measure every image once, and only the ones not measured before.

    The cache is keyed by image, so swapping a shot's source costs one probe
    instead of re-measuring all fifty.
    """
    cache = os.path.join(ROOT, "measurements.json")
    out = {}
    if os.path.exists(cache):
        with open(cache) as f:
            out = json.load(f)
    todo = [(sel, img)
            for i, e in enumerate(SHOTS)
            for sel, img in shot_layers(i, e)
            if img not in out]
    for sel, img in todo:
        r = subprocess.run(
            ["npx", "hyperframes", "media-treatment", "--selector", sel, "--analyze", "--json"],
            cwd=PROJ, capture_output=True, text=True,
        )
        data = json.loads(r.stdout[r.stdout.index("{"):])
        out[img] = data["measured"]
        print("  %-18s yAvg=%6.1f  yLow=%3d yHigh=%3d  u=%6.1f v=%6.1f  sat=%5.1f"
              % (img, data["measured"]["yAvg"], data["measured"]["yLow"],
                 data["measured"]["yHigh"], data["measured"]["uAvg"],
                 data["measured"]["vAvg"], data["measured"]["satAvg"]))
    if todo:
        with open(cache, "w") as f:
            json.dump(out, f, indent=1)
    return out


def main():
    meas = analyze_all()
    feats = {k: features(v) for k, v in meas.items()}

    models = {}
    for param, (pred, lo, hi) in MODEL.items():
        xs = [feats[k][pred] for k in APPROVED]
        ys = [APPROVED[k][param] for k in APPROVED]
        models[param] = fit(xs, ys)
        a, b = models[param]
        print("%-12s = %+.4f %+.6f * %s" % (param, a, b, pred))

    def grade_for(img):
        if img in APPROVED:
            adj = dict(APPROVED[img])
        else:
            adj = {}
            for param, (pred, lo, hi) in MODEL.items():
                a, b = models[param]
                adj[param] = round(min(hi, max(lo, a + b * feats[img][pred])), 3)
        full = dict(FIXED_ADJUST)
        full.update(adj)
        g = json.loads(json.dumps(SHARED))
        g["adjust"] = full
        return g

    grades = {}
    for _s, entry_img, _f, mode, _p, _n in SHOTS:
        # A strip has one grade per panel, so three frames of the same scene
        # are corrected to each other rather than to whichever is listed first.
        for img in shot_images(entry_img):
            grades[img] = grade_for(img)
        if mode == "card":
            # The blurred backdrop is the same frame defocused and pushed down
            # so it reads as depth rather than as a second picture.
            full = grades[entry_img]["adjust"]
            bg = json.loads(json.dumps(grades[entry_img]))
            bg["adjust"] = dict(full)
            bg["adjust"]["exposure"] = round(full["exposure"] - 0.45, 3)
            bg["adjust"]["saturation"] = round(full["saturation"] - 0.25, 3)
            bg["effects"] = {"blur": 0.92}
            bg["details"] = dict(SHARED["details"])
            bg["details"]["grain"] = 0
            bg["details"]["vignette"] = 0.62
            grades[entry_img + "__bg"] = bg

    with open(os.path.join(ROOT, "grades.json"), "w") as f:
        json.dump(grades, f, indent=1)
    print("wrote grades for", len(grades), "layers")


if __name__ == "__main__":
    main()
