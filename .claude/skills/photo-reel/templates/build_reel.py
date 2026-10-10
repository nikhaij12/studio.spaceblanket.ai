#!/usr/bin/env python3
"""Generate reel/index.html for the Paris reel.

Everything repetitive about the composition — 50 shot clips, their Ken Burns
travel, and the per-image grading blobs — is generated here so the timing table
below stays the single readable source of truth. Grading values are read from
grades.json, which build_grades.py writes after measuring every image.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
# The project folder is the one the studio names in its opening message: set it
# in REEL_PROJECT_DIR, pass it as argv[1], or run from inside it. The
# composition lives in that folder's reel/ subfolder.
PROJECT_DIR = (os.environ.get("REEL_PROJECT_DIR")
               or (sys.argv[1] if len(sys.argv) > 1 else os.getcwd()))
PROJ = os.path.join(PROJECT_DIR, "reel")

DURATION = 55.93
FPS = 30
# The reel ends on its own last line. The voiceover stops at 53.57 and the
# closing caption is held, gold, over a darkened frame until the final frame.
ACCENT_FROM = 50.93

# ── Shot table ────────────────────────────────────────────────────────────
# start = when the cross-dissolve BEGINS; the shot is fully up at start+fade,
# which is where the word it belongs to lands. "card" frames a landscape or
# film-still source as a postcard over a blurred copy of itself instead of
# cropping it to 9:16. "strip" stacks several landscape frames into one 9:16
# column — the only way three scope frames fit a vertical frame whole. "pos"
# overrides the 9:16 crop anchor.
SHOTS = [
    # start,  image,           fade, mode,   pos,            note
    (0.00,  "IMG_0319",      0.35, "fill", None,           "I'm a 25-year-old"),
    (1.15,  "IMG_4181",      0.22, "fill", None,           "AI software"),
    (1.88,  "DSC00677",      0.22, "fill", None,           "entrepreneur"),
    (2.76,  "IMG_3809",      0.22, "fill", None,           "living in"),
    (3.34,  "IMG_4201",      0.22, "fill", None,           "Dubai"),
    (4.19,  "IMG_4627",      0.22, "fill", None,           "and one day"),
    (5.29,  "IMG_7286",      0.22, "fill", None,           "craving"),
    (6.20,  "IMG_6500",      0.22, "fill", None,           "try living in"),
    (6.90,  "IMG_4931",      0.22, "fill", None,           "Paris (the wish)"),
    (8.30,  "IMG_4844",      0.22, "fill", None,           "for no logical reason"),
    (9.30,  "IMG_4845",      0.22, "fill", None,           "reason"),
    (11.10, "IMG_4865",      0.22, "fill", None,           "just my heart / guiding me"),
    (11.90, "IMG_4788",      0.22, "fill", None,           "April 30th 2026 / suitcases"),
    (15.10, "IMG_4840",      0.28, "fill", None,           "departure — music turns over"),
    (17.49, "IMG_6026",      0.28, "fill", None,           "Paris (the arrival)"),
    (18.60, "IMG_4987",      0.22, "fill", "65% 50%",      "oh boy"),
    (19.69, "IMG_6678",      0.22, "fill", None,           "more fun"),
    (20.70, "IMG_6271",      0.22, "fill", "62% 50%",      "became"),
    (21.68, "IMG_6490",      0.22, "fill", None,           "the city was"),
    (22.50, "IMG_4924",      0.22, "fill", None,           "exploding"),
    (23.20, "IMG_6345",      0.22, "fill", None,           "social life"),
    (24.03, "IMG_5445",      0.22, "fill", None,           "architecture"),
    (24.87, "IMG_4890",      0.22, "fill", None,           "beautiful"),
    (25.73, "IMG_5921",      0.22, "fill", None,           "unique"),
    (26.54, "IMG_6778",      0.14, "fill", None,           "food flurry 1"),
    (26.84, "IMG_5619",      0.10, "fill", None,           "food flurry 2"),
    (27.14, "IMG_6517",      0.10, "fill", None,           "food flurry 3"),
    (27.44, "IMG_6569",      0.10, "fill", None,           "food flurry 4"),
    (27.74, "IMG_6475",      0.10, "fill", None,           "food flurry 5"),
    (28.04, "IMG_4862",      0.22, "fill", None,           "also met my bro"),
    (29.15, "IMG_5210",      0.22, "fill", None,           "Nikita"),
    (30.60, "IMG_5809",      0.22, "fill", None,           "haven't seen for years"),
    (31.93, "IMG_5720",      0.22, "fill", None,           "my favorite"),
    (33.10, "IMG_6019",      0.22, "fill", None,           "activities / walking"),
    (34.30, "IMG_6287",      0.22, "fill", None,           "Bir-Hakeim"),
    # One held strip carries "the one from Inception movie with DiCaprio":
    # three frames of the same walk across Bir-Hakeim, so the place is
    # established and the actor is named in a single image. The close-up takes
    # the middle slot because the caption plate darkens the bottom third —
    # the best frame gets the one panel nothing sits on top of.
    (36.50, ("inception_wide", "inception_close", "inception_med"),
                             0.22, "strip", None,          "Inception — film strip"),
    (38.69, "IMG_6295",      0.22, "fill", "62% 50%",      "surreal"),
    (40.49, "inception_couple", 0.22, "card", None,        "this iconic place"),
    (41.64, "IMG_6610",      0.22, "card", None,           "daily"),
    (42.48, "IMG_5243",      0.22, "fill", "38% 50%",      "all that was happening"),
    (43.49, "IMG_5783",      0.22, "fill", None,           "while I was working"),
    (44.51, "IMG_5267",      0.22, "fill", None,           "six-day work weeks"),
    (45.54, "IMG_5253",      0.22, "fill", None,           "growing my business"),
    (46.74, "IMG_4934",      0.22, "fill", None,           "sometimes you don't need"),
    # Everything from here on moved up 0.27s with the slice taken out of the
    # pause before "Sometimes" — see build_audio.py.
    (48.04, "IMG_5822",      0.22, "fill", None,           "a vacation"),
    (49.37, "IMG_4881",      0.22, "fill", None,           "change a scenery"),
    (50.71, "IMG_4920",      0.22, "fill", None,           "and your life"),
    (52.68, "IMG_4876",      0.30, "fill", None,           "brighter — final hold"),
]

# ── Caption blocks ────────────────────────────────────────────────────────
# start, end, [(lead word, onset)…], (emphasis word, onset).
# Every onset is a word start from media/transcript.json, so the type lands on
# the syllable. Spellings follow script.md, not the transcript: whisper heard
# "brother Kita" for "bro Nikita" and "Bir Hakeem" for "Bir-Hakeim".
BLOCKS = [
    (0.00, 1.37, [("I'm", 0.07), ("a", 0.21)], ("25-year-old", 0.28)),
    (1.37, 2.98, [("AI", 1.37), ("software", 1.51)], ("entrepreneur", 2.10)),
    (2.98, 4.19, [("living", 2.98), ("in", 3.41)], ("Dubai", 3.56)),
    (4.19, 6.34, [("and", 4.19), ("one", 4.38), ("day", 4.61), ("I", 4.87), ("felt", 4.91), ("a", 5.21)], ("craving", 5.29)),
    (6.34, 8.49, [("try", 6.34), ("living", 6.55), ("in", 6.98)], ("Paris", 7.12)),
    (8.49, 10.03, [("for", 8.49), ("no", 8.59), ("logical", 8.71)], ("reason", 9.15)),
    (10.03, 11.90, [("just", 10.03), ("my", 10.32), ("heart", 10.48)], ("guiding me", 10.80)),
    (11.90, 14.10, [("on", 11.90), ("April", 12.04), ("30th", 12.40)], ("2026", 13.11)),
    (14.10, 15.60, [("I", 14.10), ("packed", 14.51), ("my", 14.60)], ("suitcases", 14.72)),
    (15.60, 16.97, [("for", 15.60), ("the", 15.86), ("next", 16.00)], ("6 weeks", 16.26)),
    (16.97, 18.43, [("I", 16.97), ("stayed", 17.42), ("in", 17.59)], ("Paris", 17.71)),
    (18.43, 20.32, [("oh", 18.43), ("boy,", 18.61), ("how", 19.06), ("much", 19.33)], ("more fun", 19.69)),
    (20.32, 21.68, [("my", 20.32), ("life", 20.50)], ("became", 20.86)),
    (21.68, 22.78, [("the", 21.68), ("city", 21.84), ("was", 22.05)], ("exploding", 22.35)),
    (22.78, 24.25, [("with", 22.78)], ("social life", 23.04)),
    (24.25, 25.74, [("architecture", 24.25), ("so", 24.96)], ("beautiful", 25.09)),
    (25.74, 26.54, [("and", 25.74)], ("unique", 25.95)),
    (26.54, 28.26, [("a", 26.54), ("ton", 26.59), ("of", 26.80), ("delicious", 26.94)], ("food", 27.59)),
    (28.26, 30.25, [("also", 28.26), ("met", 28.45), ("my", 28.66), ("bro", 28.80)], ("Nikita", 29.37)),
    (30.25, 32.25, [("haven't", 30.25), ("seen", 30.64), ("for", 30.92)], ("years", 31.13)),
    (32.25, 33.95, [("my", 32.25), ("favorite", 32.39)], ("activities", 32.95)),
    (33.95, 36.00, [("walking", 33.95), ("on", 34.36), ("the", 34.50)], ("Bir-Hakeim", 34.71)),
    (36.00, 37.32, [("the", 36.04), ("one", 36.24), ("from", 36.50)], ("Inception", 36.72)),
    (37.32, 38.58, [("movie", 37.32), ("with", 37.62)], ("DiCaprio", 37.88)),
    (38.58, 40.24, [("it", 38.58), ("was", 38.71)], ("surreal", 38.91)),
    (40.24, 42.48, [("this", 40.24), ("iconic", 40.71), ("place", 41.13)], ("daily", 41.86)),
    (42.48, 43.71, [("and", 42.48), ("all", 42.51), ("that", 42.70), ("was", 42.96)], ("happening", 43.14)),
    (43.71, 44.73, [("while", 43.71), ("I", 44.02), ("was", 44.07)], ("working", 44.35)),
    (44.73, 45.76, [("six-day", 44.73), ("work", 45.15)], ("weeks", 45.40)),
    # Holds until the next line actually starts, instead of clearing at 46.96
    # and leaving the rail empty over the pause.
    (45.76, 47.34, [("and", 45.76), ("growing", 45.95), ("my", 46.50)], ("business", 46.64)),
    # Re-timed off the audio rather than off the previous block's end: this
    # line used to appear 0.74s before the word was spoken, which is the gap
    # that read as a stall. Onsets measured in the cleaned take (sibilant at
    # 47.40, "you" 47.97, "don't" 48.05, "need" 48.35, "vacation" 48.74), each
    # given the same 0.06s lead so the type is legible as the word lands.
    (47.34, 49.00, [("sometimes", 47.34), ("you", 47.91), ("don't", 47.99), ("need", 48.29)], ("vacation", 48.68)),
    # "a scenery", the way it is said in the take — script.md line 27.
    (49.00, 50.93, [("just", 49.14), ("change", 49.59), ("a", 49.90)], ("scenery", 50.00)),
    (50.93, 51.84, [("and", 50.93), ("your", 51.03)], ("life", 51.17)),
    # Held to the final frame — this is the line the reel is for.
    (51.84, DURATION, [("all", 51.84), ("of", 51.93), ("a", 52.03), ("sudden", 52.13)], ("brighter", 52.90)),
]

# ── Caption rail position ─────────────────────────────────────────────────
# The rail lives in the lower third, where the plate darkens the frame and
# nothing important usually sits. A small set of positions, not a continuum: a
# per-block nudge reads as drift, a jump to a second fixed home reads as a
# decision, and the eye re-finds a place it has seen before.
#
# A block moves only when its default home lands on somebody's face. Per block:
# (vertical offset from the authored top, type scale). Watching the cut turned up
# four moments where the type touched a face; the standard is the whole
# FACE — a chin or a jaw counts, and so does a scrim dimming it — not the
# eyes-nose-mouth landmarks that caption_placement.py scores. The landmark
# standard was overruled explicitly, so do not go back to it. fit_block.py solves
# each block against the expanded face boxes in every shot it spans.
#
#   b1   the lead line sat on a jaw in the Dubai portrait. Nothing above works
#        (both shots have a face up there), so it drops below the chin instead —
#        95px is all the room there is before the bottom of the safe zone.
#   b3   "AND ONE DAY I FELT A" across a mouth in the car.
#   b11  both lines across a face in the boat shot.
#   b18  "Nikita" on Nikita's hair, and the scrim dimming both faces.
#
# Blocks that must move share a position rather than each taking its own
# optimum: the rail should read as having a small number of homes, not one per
# block. Movement is capped at 10-20% of frame height — a block that jumped to
# the top of the frame was rejected even though it cleared every face, because
# a caption that travels half the screen stops reading as the same caption.
#
# So the order to try is: down-and-smaller first, then a raise inside the cap,
# and only over open sky or a dark ceiling all the way up. On a tight portrait
# nothing clears, and the answer is to drop the block and shrink it until the
# second line still fits above y=1500 — letting the type graze the chin, which
# was explicitly allowed. The scale is arithmetic, not taste:
#     s <= (1500 - 1150 - dy) / H      H = that block's own full-size height
LOWERED = 95        # px, the one drop; the scale differs because the blocks do
RAISED = (-860, 0.92)
BLOCK_POS = {
    1: (LOWERED, 0.93),
    3: (LOWERED, 0.85),
    11: RAISED,
    18: RAISED,
}

# ── Ken Burns ─────────────────────────────────────────────────────────────
# A slow continuous drift per shot, alternating direction so consecutive shots
# never push the same way, with the travel scaled to the shot's length so the
# drift reads at one speed on a 0.3s flurry cut and on a 3.2s hold.
KB = [
    ({"s": 1.000, "x": 0, "y": 0}, {"s": 1.060, "x": -12, "y": 7}),
    ({"s": 1.060, "x": 9, "y": -5}, {"s": 1.000, "x": 0, "y": 0}),
    ({"s": 1.000, "x": 11, "y": 5}, {"s": 1.055, "x": -9, "y": -4}),
    ({"s": 1.050, "x": -6, "y": 5}, {"s": 1.000, "x": 4, "y": -4}),
    ({"s": 1.000, "x": 0, "y": 9}, {"s": 1.055, "x": 0, "y": -7}),
    ({"s": 1.055, "x": -8, "y": 0}, {"s": 1.000, "x": 6, "y": 4}),
]


def shot_id(i):
    return "shot%02d" % (i + 1)


def shot_images(img):
    """A shot's source images. Only "strip" carries more than one."""
    return list(img) if isinstance(img, (list, tuple)) else [img]


def shot_layers(i, entry):
    """(css selector, image name) for every gradeable layer of a shot.

    build_grades measures through these, so a strip's cells get their own
    correction rather than inheriting one from whichever frame is listed first.
    """
    _s, img, _f, mode, _p, _n = entry
    sid = shot_id(i)
    if mode == "strip":
        return [("#%s-c%d" % (sid, j), n) for j, n in enumerate(img)]
    return [("#%s-img" % sid, img)]


def build_shots_html(grades):
    out = []
    for i, (start, img, fade, mode, pos, note) in enumerate(SHOTS):
        nxt = SHOTS[i + 1] if i + 1 < len(SHOTS) else None
        # The outgoing shot has to stay alive for the whole dissolve, so it
        # ends only once the incoming one is fully up.
        end = (nxt[0] + nxt[2]) if nxt else DURATION
        dur = round(end - start, 3)
        sid = shot_id(i)
        track = i % 2
        style = ' style="object-position:%s"' % pos if pos else ""
        if mode == "strip":
            # The Ken Burns target is the column, not the frames: the whole
            # strip drifts as one object so the panels stay locked together.
            cells = "".join(
                '\n            <img id="%s-c%d" class="strip-cell" src="media/%s.jpg" alt="" data-color-grading=\'%s\'>'
                % (sid, j, n, json.dumps(grades[n], separators=(",", ":")))
                for j, n in enumerate(img)
            )
            inner = ('\n          <div id="%s-img" class="shot-strip">%s\n          </div>'
                     % (sid, cells))
        elif mode == "card":
            g_fg = json.dumps(grades[img], separators=(",", ":"))
            g_bg = json.dumps(grades[img + "__bg"], separators=(",", ":"))
            inner = (
                '\n          <img class="shot-bg" src="media/%s.jpg" alt="" data-color-grading=\'%s\'>'
                '\n          <img id="%s-img" class="shot-fg" src="media/%s.jpg" alt="" data-color-grading=\'%s\'>'
                % (img, g_bg, sid, img, g_fg)
            )
        else:
            g_fg = json.dumps(grades[img], separators=(",", ":"))
            inner = (
                '\n          <img id="%s-img" class="shot-fill" src="media/%s.jpg" alt=""%s data-color-grading=\'%s\'>'
                % (sid, img, style, g_fg)
            )
        out.append(
            '      <!-- %02d @%.2f  %s — %s -->\n'
            '      <div id="%s" class="shot shot--%s clip" data-start="%.2f" data-duration="%.3f" data-track-index="%d">\n'
            '        <div id="%s-fade" class="shot-inner">%s\n        </div>\n'
            '      </div>\n' % (i + 1, start, img, note, sid, mode, start, dur, track, sid, inner)
        )
    return "\n".join(out)


def cover_scale(x, y):
    """Smallest scale at which a cover-cropped fill still hides both edges.

    A drift of x px off centre exposes x px of background on one side unless
    the image is scaled up by twice that fraction. Scaling the travel by `k`
    can push an endpoint under that floor — a 1.000 endpoint with any x at all
    already sits under it — so the pair gets lifted to clear it.
    """
    return max(1.0 + 2 * abs(x) / 1080.0, 1.0 + 2 * abs(y) / 1920.0) + 0.004


def build_shots_js():
    rows = []
    for i, (start, img, fade, mode, pos, note) in enumerate(SHOTS):
        nxt = SHOTS[i + 1] if i + 1 < len(SHOTS) else None
        end = nxt[0] if nxt else DURATION
        dur = round(end - start, 3)
        f, t = KB[i % len(KB)]
        # Long holds get proportionally less travel than the table's base move,
        # short cuts get more, so the perceived drift speed stays constant.
        k = min(1.9, max(0.45, (dur / 1.1) ** 0.5))
        def scaled(a, b, key):
            return round(a[key] + (b[key] - a[key]) * k, 3)
        s_from, s_to = f["s"], round(f["s"] + (t["s"] - f["s"]) * k, 4)
        x_from, y_from = f["x"], f["y"]
        x_to, y_to = scaled(f, t, "x"), scaled(f, t, "y")
        # A strip fills the frame exactly like a cover crop does, so it needs
        # the same guarantee that its drift never uncovers an edge.
        if mode in ("fill", "strip"):
            # Lift both ends by the same amount so the move keeps its travel.
            lift = max(0.0,
                       cover_scale(x_from, y_from) - s_from,
                       cover_scale(x_to, y_to) - s_to)
            s_from, s_to = round(s_from + lift, 4), round(s_to + lift, 4)
        cells = ""
        if mode == "strip":
            cells = ", cells: [%s]" % ", ".join(
                '"%s-c%d"' % (shot_id(i), j) for j in range(len(img))
            )
        rows.append(
            '          { id: "%s-img", fade: "%s-fade", start: %.2f, dur: %.3f, fadeIn: %.2f, out: %s%s,\n'
            '            from: { s: %.4f, x: %.1f, y: %.1f }, to: { s: %.4f, x: %.1f, y: %.1f } },'
            % (
                shot_id(i), shot_id(i), start, dur, fade,
                ("%.2f" % nxt[0]) if nxt else "null", cells,
                s_from, x_from, y_from, s_to, x_to, y_to,
            )
        )
    return "\n".join(rows)


def build_blocks_js():
    rows = []
    for i, (start, end, lead, emph) in enumerate(BLOCKS):
        l1 = ", ".join('{ t: %s, at: %.2f }' % (json.dumps(t), at) for t, at in lead)
        accent = ", accent: true" if start >= ACCENT_FROM else ""
        dy, scale = BLOCK_POS.get(i, (0, 1.0))
        pos = ("%s%s"
               % (", dy: %d" % dy if dy else "",
                  ", s: %.2f" % scale if scale != 1.0 else ""))
        rows.append(
            '          { start: %.2f, end: %.2f%s%s, line1: [%s], line2: { t: %s, at: %.2f } },'
            % (start, end, accent, pos, l1, json.dumps(emph[0]), emph[1])
        )
    return "\n".join(rows)


TEMPLATE = r'''<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1920">
    <title>Paris Reel</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
    <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Jost:wght@500&display=swap" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      html,
      body {
        width: 1080px;
        height: 1920px;
        margin: 0;
        overflow: hidden;
        background: #05070a;
        font-family: "Inter", sans-serif;
      }

      #root {
        position: relative;
        width: 1080px;
        height: 1920px;
        overflow: hidden;
        background: #05070a;
      }

      /* ── Photo shots ─────────────────────────────────────────────── */
      .shot {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }

      /* The dissolve is tweened on this wrapper, not on the clip div: the
         framework owns the clip's own visibility and would fight the tween. */
      .shot-inner {
        position: absolute;
        inset: 0;
        will-change: opacity;
      }

      .shot img {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        will-change: transform, opacity;
        backface-visibility: hidden;
      }

      .shot-fill {
        width: 1080px;
        height: 1920px;
        object-fit: cover;
      }

      /* Postcard framing for landscape sources and the film stills: cropping a
         16:9 frame to 9:16 throws away the shot, so it sits whole over a
         blown-up blurred copy of itself. */
      .shot-bg {
        width: 1080px;
        height: 1920px;
        object-fit: cover;
        transform: translate(-50%, -50%) scale(1.35);
      }

      .shot-fg {
        width: 1080px;
        height: auto;
        max-height: 1640px;
        object-fit: contain;
      }

      /* Film strip: three 1.92:1 frames stacked into the 9:16 frame. The
         column is exactly 3 x 632 + 2 x 12 = 1920, so it fills top to bottom
         and the two hairline gaps are the only background that shows. */
      .shot-strip {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 1080px;
        height: 1920px;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        gap: 12px;
        will-change: transform;
        backface-visibility: hidden;
      }

      /* Overrides `.shot img`, which centres every image absolutely — a cell
         has to sit in the flex flow instead. Needs the extra class to win. */
      .shot .strip-cell {
        position: static;
        top: auto;
        left: auto;
        transform: none;
        flex: 0 0 632px;
        display: block;
        width: 1080px;
        height: 632px;
        object-fit: cover;
      }

      /* ── Caption rail (editorial emphasis) ───────────────────────── */
      .caption-layer {
        position: absolute;
        inset: 0;
        z-index: 20;
        pointer-events: none;
      }

      /* Plate: a soft scrim so cream type stays readable over bright
         frames (white sky, marble, linen). Invisible on dark shots. */
      #caption-plate {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: 1020px;
        background: linear-gradient(
          to bottom,
          rgba(6, 8, 12, 0) 0%,
          rgba(6, 8, 12, 0.10) 12%,
          rgba(6, 8, 12, 0.34) 26%,
          rgba(6, 8, 12, 0.50) 58%,
          rgba(6, 8, 12, 0.60) 100%
        );
      }

      /* Width is the platform's, not a taste call: below y=860 an Instagram
         Reel stacks Like / Comment / Share / audio down the right edge, so
         anything past x=887 is under a button. 64 + 823 = 887 exactly. Type
         that would overrun is scaled down by fitSize rather than clipped. */
      #caption-stage {
        position: absolute;
        left: 64px;
        top: 1150px;
        width: 823px;
        height: 430px;
      }

      .caption-block {
        position: absolute;
        left: 0;
        /* Overridden per block: a block whose default home lands on somebody's
           face is lifted to the raised slot. See RAIL/BLOCK_SLOT. */
        top: 0;
        opacity: 0;
        transform-origin: 0% 0%;
        will-change: transform, opacity;
        backface-visibility: hidden;
      }

      /* Backing for a raised block. The bottom plate is anchored to the frame's
         bottom edge, so a lifted caption leaves it behind and lands on whatever
         is up there — over bright sky, cream type measured 1.7:1 against its
         background, which is unreadable. This travels with the block. Only
         raised blocks get one; at the default position the plate already does
         the work and a second scrim would change every frame. */
      /* Halos are siblings of the blocks, not children, and they sit in their
         own layer underneath. A child would be cut off with its block at
         block.end — and because the shot underneath usually runs on past that
         cut, a scrim vanishing in one frame lifted the whole frame 19% brighter.
         As a sibling it can outlive the type and fade. */
      #cap-halos {
        position: absolute;
        inset: 0;
      }

      /* Sized in JS to the block's own measured ink plus HALO_PAD, because a
         one-size box is either too small for "AND ONE DAY I FELT A" or too big
         for "Nikita" — and too big is not free: the first version reached far
         enough right to dim a face standing beside the type, which was
         flagged in review. The radii below are percentages of that fitted
         box, so they scale with the words instead of against them. */
      /* 50%/50% radii with the transparent stop at 100% inscribes the ellipse
         exactly in the box, so it fades to nothing before the edge. Anything
         larger is CLIPPED by the element, and the clip is a straight line
         across a soft gradient — a visible rectangle in the sky. The first
         version used 72%/60% with the last stop at 92%, which put the zero
         crossing outside the box on every side. */
      .cap-halo {
        position: absolute;
        opacity: 0;
        pointer-events: none;
        will-change: opacity;
        background: radial-gradient(
          50% 50% at 50% 50%,
          rgba(5, 7, 11, 0.74) 0%,
          rgba(5, 7, 11, 0.68) 50%,
          rgba(5, 7, 11, 0.38) 76%,
          rgba(5, 7, 11, 0) 100%
        );
      }

      /* Carries the per-block scale. Separate from .caption-block because GSAP
         owns that element's transform for the word entry. */
      .caption-inner {
        transform-origin: 0% 0%;
      }

      .caption-line {
        display: flex;
        align-items: baseline;
        gap: 14px;
        line-height: 1.1;
        white-space: nowrap;
        max-width: 823px;
        overflow: hidden;
      }

      .caption-line--emphasis {
        line-height: 1.16;
        /* Clearance for Caveat's ascenders, which run above its line box. */
        margin-top: 10px;
      }

      .word {
        display: inline-block;
        /* Never let flex shrink a word: it would silently squeeze the box and
           make scrollWidth report a false fit, clipping the glyphs instead. */
        flex: 0 0 auto;
        color: #f5f0d0;
        text-shadow:
          0 2px 12px rgba(0, 0, 0, 0.6),
          0 4px 24px rgba(0, 0, 0, 0.35);
        will-change: transform, opacity;
        backface-visibility: hidden;
      }

      /* Typography lives here and in the TYPE object below — the two must
         agree, because canvas measurement can't read CSS. */
      .word--normal {
        font-family: "Jost", sans-serif;
        font-size: 52px;
        font-weight: 500;
        font-style: normal;
        letter-spacing: 9px;
        padding-right: 0;
      }

      .word--emphasis {
        font-family: "Caveat", cursive;
        font-size: 200px;
        font-weight: 700;
        font-style: normal;
        line-height: 1.16;
        letter-spacing: 0;
        /* Ink allowance: script and italic faces draw past their advance
           width, and the line box clips overflow. Must equal TYPE.*.inkPad.
           Without it Caveat loses the last letter of every word — "Dubai"
           renders as "Dubaı". The layout checker does not catch this: it
           measures boxes, not ink. */
        padding-right: 44px;
      }

      /* ── The closing line ────────────────────────────────────────────
         No separate end card: the reel finishes on the same caption rail it
         has run on all the way through. What changes is that the picture
         sinks under a scrim and the type turns gold, so the last sentence is
         the one thing being read on the frame the loop parks on. */
      .word--accent.word--normal {
        color: #ffe1a6;
      }

      .word--accent.word--emphasis {
        color: #ffcf5f;
        text-shadow:
          0 3px 16px rgba(0, 0, 0, 0.7),
          0 0 46px rgba(255, 186, 84, 0.40);
      }

      /* Under the caption rail, over the photos. */
      #finale {
        position: absolute;
        inset: 0;
        z-index: 19;
        opacity: 0;
        background: radial-gradient(
          126% 80% at 50% 40%,
          rgba(4, 6, 9, 0.30) 0%,
          rgba(4, 6, 9, 0.58) 55%,
          rgba(4, 6, 9, 0.86) 100%
        );
      }

    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="__DURATION__" data-fps="__FPS__" data-width="1080" data-height="1920">
__SHOTS__
      <!-- Captions -->
      <!-- Not a clip: the rail spans the whole composition, and a clip has no
           layout box until the runtime shows it — which broke caption fitting. -->
      <!-- Closing scrim, above the shots and below the rail. Not a clip
           either: it is one element that ramps once, near the end. -->
      <div id="finale"></div>
      <div id="captions" class="caption-layer">
        <div id="caption-plate"></div>
        <div id="caption-stage" aria-hidden="true"></div>
      </div>

      <!-- Audio -->
      <!-- Every level and fade is baked into these files, and every element
           plays at data-volume 1 with no scripted volume. A bed asked for at
           0.10 through the element came back 20-30 dB down in patches of the
           full render while an identical audio-only probe was clean, so the
           scripted-volume path is avoided entirely: the renderer now only has
           to mix files that are already at the right level.
           vo_mix is written by build_audio.py: the count-in trimmed off, the
           one live channel of a 4-channel take laid into both sides of a real
           stereo file so the voice stops coming out of one ear, cleaned
           (rumble, boom, presence, de-ess, expander) and brought up to
           -16.7 LUFS from the -44 LUFS it was recorded at. The last word ends
           at 53.57.
           Both beds get the same two-stage treatment before they are written:
           a parametric carve at 300 / 1600 / 3200 Hz that empties the band the
           voice lives in, then a compressor keyed off the voiceover so the
           music steps down about 6 dB whenever the voice is actually
           speaking and blooms back up on its own once the last word lands. -->
      <audio id="vo" src="media/vo_mix.m4a" data-start="0" data-duration="53.93" data-track-index="10" data-volume="1"></audio>
      <!-- Dubai is scored with Beat of the Middle East from 0:08, Paris with
           Inspector Bernard from 53s into the track where its fuller section
           begins. They hand over on the tarmac shot, with a short dip between
           them so the Paris reveal gets a breath. -->
      <audio id="bgm1" src="media/bed_dubai.m4a" data-start="0" data-duration="15.90" data-track-index="11" data-volume="1"></audio>
      <audio id="bgm2" src="media/bed_paris.m4a" data-start="15.10" data-duration="40.83" data-track-index="12" data-volume="1"></audio>
      <!-- Three cues, on the three turns the story actually makes, not on
           every cut: at ~0.9s per shot a whoosh per transition would just
           fight the voiceover. The swell peaks 2.4s in, so each one starts
           2.4s before the frame it is meant to land on. -->
      <audio id="sfx1" src="media/sfx_whoosh.m4a" data-start="6.90" data-duration="0.57" data-track-index="13" data-volume="1"></audio>
      <audio id="sfx2" src="media/sfx_swell.m4a" data-start="15.20" data-duration="4.00" data-track-index="14" data-volume="1"></audio>
      <audio id="sfx3" src="media/sfx_swell.m4a" data-start="50.50" data-duration="4.00" data-track-index="15" data-volume="1"></audio>
    </div>

    <script>
      (function () {
        var DURATION = __DURATION__;

        /* ── Caption script: two-tier blocks, timed off media/transcript.json ──
           line1 = the quiet tracked lead-in (Jost), line2 = the emphasis word
           (Caveat) that slides in on its own word start.
           Every `at` below is a word onset straight from the transcript of the
           trimmed take, so the type lands on the syllable, not near it. */
        var BLOCKS = [
__BLOCKS__
        ];

        var SAFE_WIDTH = 823;
        var ENTRY_DUR = 0.1;
        var SLIDE_DUR = 0.2;

        /* ── Caption typography: the whole look, in one place ─────────────
           `tracking` is px and MUST match the CSS letter-spacing above —
           canvas measureText ignores letter-spacing, so tracking has to be
           added back by hand or a tracked line measures short and clips.
           `upper` uppercases in JS rather than via text-transform, for the
           same reason: CSS-cased text measures at its original width. */
        var TYPE = {
          lead: {
            family: "Jost",
            weight: "500",
            style: "normal",
            size: 52,
            tracking: 9,
            upper: true,
            inkPad: 0,
            gap: 16,
          },
          emph: {
            family: "Caveat",
            weight: "700",
            style: "normal",
            size: 200,
            tracking: 0,
            upper: false,
            inkPad: 44,
          },
        };

        function cased(cfg, s) {
          return cfg.upper ? s.toUpperCase() : s;
        }

        function fontSpec(cfg, size) {
          // The family MUST be quoted — `180px Playfair Display` is an invalid
          // font shorthand, so the assignment is silently dropped and every
          // measurement comes back at the 10px default. That false "it fits"
          // is what clipped the long emphasis words.
          return cfg.style + " " + cfg.weight + " " + size + 'px "' + cfg.family + '"';
        }

        var _fitCtx = document.createElement("canvas").getContext("2d");

        function measureWords(words, cfg, size, gap) {
          _fitCtx.font = fontSpec(cfg, size);
          var w = 0;
          words.forEach(function (t, i) {
            w += _fitCtx.measureText(t).width + t.length * cfg.tracking + (i ? gap : 0);
          });
          return w;
        }

        function fitSize(words, cfg, gap, maxWidth) {
          // Only the glyph advances scale with font-size. Letter-spacing and
          // the flex gap are fixed pixel amounts, so shrinking by the width
          // ratio undershoots and a long tracked line still overruns — which
          // is how "SOMETIMES YOU DON'T NEED" ended up 19px into the action
          // rail. Split the fixed part out and solve for the size.
          var fixed = 0;
          words.forEach(function (t, i) {
            fixed += t.length * cfg.tracking + (i ? gap : 0);
          });
          var total = measureWords(words, cfg, cfg.size, gap);
          if (total <= maxWidth) return cfg.size;
          var glyphs = total - fixed;
          var room = maxWidth - fixed;
          var floorSize = Math.floor(cfg.size * 0.45);
          if (room <= 0 || glyphs <= 0) return floorSize;
          return Math.max(floorSize, Math.floor(cfg.size * (room / glyphs)));
        }

        // Bleed around the measured ink, as a FRACTION of it. The ellipse is
        // inscribed in this box, so the padding is what decides where along the
        // falloff the last letter sits: too little and the ink sits out at 80%
        // of the radius with almost no scrim under it. Proportional, because a
        // six-word lead line and "Nikita" are not the same width.
        var HALO_PAD_X = 0.55;   // of ink width, min 200px
        var HALO_PAD_Y = 0.45;   // of ink height, min 120px

        function buildCaptions(tl) {
          var stage = document.getElementById("caption-stage");
          // Added first, so every halo paints under every block.
          var haloLayer = document.createElement("div");
          haloLayer.id = "cap-halos";
          stage.appendChild(haloLayer);

          BLOCKS.forEach(function (block, bi) {
            var el = document.createElement("div");
            el.className = "caption-block";
            el.id = "b" + bi;
            // Moved clear of a face. `top` and not a transform: GSAP owns this
            // element's transform for the word entry, and the two would
            // overwrite each other.
            if (block.dy) el.style.top = block.dy + "px";

            // The scale goes on an inner wrapper for the same reason — and it
            // has to be a transform rather than smaller font sizes, because
            // letter-spacing and the ink allowance are fixed pixels and would
            // not come down with the type.
            var inner = document.createElement("div");
            inner.className = "caption-inner";
            inner.id = "b" + bi + "in";
            if (block.s) {
              inner.style.transformOrigin = "0% 0%";
              inner.style.transform = "scale(" + block.s + ")";
            }

            var l1Words = block.line1.map(function (w) {
              return cased(TYPE.lead, w.t);
            });
            // The ink allowance eats into the usable width, so fit against
            // what is actually left for glyph advances.
            var l1Size = fitSize(l1Words, TYPE.lead, TYPE.lead.gap, SAFE_WIDTH - TYPE.lead.inkPad);

            var accent = block.accent ? " word--accent" : "";

            var l1 = document.createElement("div");
            l1.className = "caption-line";
            block.line1.forEach(function (w, wi) {
              var span = document.createElement("span");
              span.className = "word word--normal" + accent;
              span.id = "b" + bi + "w" + wi;
              span.textContent = cased(TYPE.lead, w.t);
              span.style.fontSize = l1Size + "px";
              l1.appendChild(span);
            });
            inner.appendChild(l1);

            var l2Size = fitSize(
              [cased(TYPE.emph, block.line2.t)],
              TYPE.emph,
              0,
              SAFE_WIDTH - TYPE.emph.inkPad,
            );

            var l2 = document.createElement("div");
            l2.className = "caption-line caption-line--emphasis";
            l2.id = "b" + bi + "L2";
            // The emphasis line slides in from a full canvas width to the
            // left; that off-canvas start is the animation, not a mislayout.
            l2.setAttribute("data-layout-allow-overflow", "");
            var espan = document.createElement("span");
            espan.className = "word word--emphasis" + accent;
            espan.textContent = cased(TYPE.emph, block.line2.t);
            espan.style.fontSize = l2Size + "px";
            l2.appendChild(espan);
            inner.appendChild(l2);
            el.appendChild(inner);
            stage.appendChild(el);

            // Sized after it is in the DOM, from what the type actually
            // occupies on screen — scale included, which is why the inner
            // wrapper is measured and not the block.
            if (block.dy < 0) {
              var ir = inner.getBoundingClientRect();
              var sr = stage.getBoundingClientRect();
              var px = Math.max(200, ir.width * HALO_PAD_X);
              var py = Math.max(120, ir.height * HALO_PAD_Y);
              var halo = document.createElement("div");
              halo.className = "cap-halo";
              halo.id = "b" + bi + "halo";
              halo.style.left = (ir.left - sr.left - px) + "px";
              halo.style.top = (ir.top - sr.top - py) + "px";
              halo.style.width = (ir.width + 2 * px) + "px";
              halo.style.height = (ir.height + 2 * py) + "px";
              haloLayer.appendChild(halo);
            }
          });

          BLOCKS.forEach(function (block, bi) {
            var el = document.getElementById("b" + bi);
            tl.set(el, { opacity: 1 }, block.start);

            // The block turns visible at block.start, but its words fade in one
            // at a time afterwards. Left on the block's own opacity the halo
            // would appear first, as a dark band over an empty frame, so it
            // rides the first word in — and rides out on its own after the type
            // is cut, because the photo underneath is usually still on screen.
            var halo = document.getElementById("b" + bi + "halo");
            if (halo) {
              var firstAt = block.line1.length ? block.line1[0].at : block.line2.at;
              tl.set(halo, { opacity: 0 }, block.start);
              tl.to(halo, { opacity: 1, duration: 0.32, ease: "power1.out" },
                    Math.max(block.start, firstAt - 0.14));
              tl.to(halo, { opacity: 0, duration: 0.40, ease: "power1.inOut" },
                    block.end);
            }

            block.line1.forEach(function (w, wi) {
              var wordEl = document.getElementById("b" + bi + "w" + wi);
              tl.set(wordEl, { opacity: 0, scale: 1.12, transformOrigin: "0% 100%" }, block.start);
              tl.to(wordEl, { opacity: 1, scale: 1, duration: ENTRY_DUR, ease: "power2.out" }, w.at);
            });

            var l2El = document.getElementById("b" + bi + "L2");
            tl.set(l2El, { opacity: 0, x: -1080 }, block.start);
            tl.to(
              l2El,
              { opacity: 1, x: 0, duration: SLIDE_DUR, ease: "power2.out" },
              block.line2.at,
            );

            // The last block runs to the end of the composition, so it never
            // gets hidden — the reel finishes with its own closing line up.
            if (block.end < DURATION - 1e-3) {
              tl.set(el, { opacity: 0 }, block.end);
            }
          });
        }

        /* ── Shots: Ken Burns drift plus the cross-dissolve.
           Each dissolve *completes* on the word it belongs to, so the incoming
           clip starts `fadeIn` early and the outgoing one holds until then. */
        var SHOTS = [
__SHOTJS__
        ];

        function buildShots(tl) {
          SHOTS.forEach(function (shot, i) {
            var img = "#" + shot.id;
            var fade = "#" + shot.fade;

            tl.fromTo(
              img,
              {
                scale: shot.from.s,
                xPercent: -50,
                yPercent: -50,
                x: shot.from.x,
                y: shot.from.y,
              },
              {
                scale: shot.to.s,
                x: shot.to.x,
                y: shot.to.y,
                duration: shot.dur,
                ease: "none",
              },
              shot.start,
            );

            tl.fromTo(
              fade,
              { opacity: 0 },
              { opacity: 1, duration: shot.fadeIn, ease: "power1.inOut" },
              shot.start,
            );

            // A strip's panels arrive one after another instead of all at
            // once, so the collage assembles itself on the line rather than
            // appearing as a finished graphic. They settle at scale 1, which
            // is exactly cover for the cell — never under it.
            if (shot.cells) {
              shot.cells.forEach(function (cid, j) {
                tl.fromTo(
                  "#" + cid,
                  { opacity: 0, scale: 1.075 },
                  { opacity: 1, scale: 1, duration: 0.55, ease: "power2.out" },
                  shot.start + j * 0.11,
                );
              });
            }

            if (shot.out !== null) {
              var nextFade = SHOTS[i + 1].fadeIn;
              tl.to(fade, { opacity: 0, duration: nextFade, ease: "power1.inOut" }, shot.out);
            }
          });
        }

        /* ── The closing line ─────────────────────────────────────────────
           One ramp, arriving with the last sentence rather than on a cut, so
           the picture sinks under the line instead of the line landing on a
           shot that suddenly looks different. Nothing fades to black: a
           fade-out would leave the takeaway nearly gone on the frame
           Instagram parks on. Audio needs no scripting either — the music's
           own fade is baked into the file. */
        function buildFinale(tl) {
          tl.set("#finale", { opacity: 0 }, 0);
          tl.to("#finale", { opacity: 1, duration: 2.10, ease: "power1.inOut" }, __ACCENT_FROM__);
        }

        // Both faces must be actually loaded before captions are measured —
        // fonts.ready alone can settle before a lazily-requested face is in.
        var fontsReady = document.fonts
          ? Promise.all([
              document.fonts.load(fontSpec(TYPE.lead, TYPE.lead.size)),
              document.fonts.load(fontSpec(TYPE.emph, TYPE.emph.size)),
            ]).then(function () {
              return document.fonts.ready;
            })
          : Promise.resolve();

        fontsReady.then(function () {
          var tl = gsap.timeline({ paused: true });
          buildShots(tl);
          buildCaptions(tl);
          buildFinale(tl);
          tl.to({}, { duration: DURATION }, 0);
          tl.render(0, true, true);

          window.__timelines = window.__timelines || {};
          window.__timelines["main"] = tl;
        });
      })();
    </script>
  </body>
</html>
'''


def main():
    grades_path = os.path.join(ROOT, "grades.json")
    if os.path.exists(grades_path):
        with open(grades_path) as f:
            grades = json.load(f)
    else:
        # First pass: no grading yet, so the analyzer has something to measure.
        grades = {}
    for start, img, fade, mode, pos, note in SHOTS:
        for name in shot_images(img):
            grades.setdefault(name, {})
        if mode == "card":
            grades.setdefault(img + "__bg", {})

    html = (
        TEMPLATE.replace("__DURATION__", "%.2f" % DURATION)
        .replace("__FPS__", str(FPS))
        .replace("__SHOTS__", build_shots_html(grades))
        .replace("__BLOCKS__", build_blocks_js())
        .replace("__SHOTJS__", build_shots_js())
        .replace("__ACCENT_FROM__", "%.2f" % ACCENT_FROM)
    )
    out = os.path.join(PROJ, "index.html")
    with open(out, "w") as f:
        f.write(html)
    print("wrote", out, len(html), "bytes,", len(SHOTS), "shots,", len(BLOCKS), "caption blocks")

    # Sanity: shots must be monotonic and same-track neighbours must not overlap.
    for i in range(len(SHOTS) - 1):
        assert SHOTS[i + 1][0] > SHOTS[i][0], "shot %d out of order" % i
    for i in range(len(SHOTS) - 2):
        end_i = SHOTS[i + 1][0] + SHOTS[i + 1][2]
        assert SHOTS[i + 2][0] >= end_i - 1e-6, (
            "track collision: shot %d ends %.3f, shot %d starts %.3f" % (i + 1, end_i, i + 3, SHOTS[i + 2][0])
        )
    for i in range(len(BLOCKS) - 1):
        assert BLOCKS[i][1] <= BLOCKS[i + 1][0] + 1e-6, "caption block %d overlaps the next" % i
    # The closing line has to still be up on the last frame, and the scrim has
    # to arrive with it rather than over some earlier block.
    assert BLOCKS[-1][1] >= DURATION - 1e-6, "the closing line is hidden before the reel ends"
    assert any(b[0] >= ACCENT_FROM for b in BLOCKS), "the accent starts after the last block"
    print("timing checks passed")


if __name__ == "__main__":
    main()
