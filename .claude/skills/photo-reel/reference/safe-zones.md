# Safe zones and caption placement

Two separate problems that both look like "the caption is in the wrong place".

- **Platform reserves** — the phone's own UI sits on top of the video. Type under
  it is not wrong, it is *invisible*. Fixed geometry, same on every frame.
- **Content collisions** — type across somebody's face. Depends on the photo, so
  it has to be measured shot by shot.

Fix the reserves once, in the layout. Fix the collisions per block.

## The reserves, in pixels, for a 1080x1920 master

Measured off two independent 1080x1920 Reels overlay templates that agree on the
shape. **The safe area is an L, not a rectangle** — the right-hand action rail
only starts partway down the frame, so the usable width changes with height.
That is the thing every "keep 10% margins" article gets wrong.

| Edge | Instagram Reels | YouTube Shorts | TikTok |
|---|---|---|---|
| Top | 250 | ~120 | 130 |
| Bottom | 420 | 300–380 | 250 |
| Left | 70 | 60 | 60 |
| Right, above the rail | 55 | 96 | 60 |
| Right, below the rail (rail top ≈ y 860) | **193** | 120 | 60 |

What lives in each: top = the Reels header, clock and battery. Right rail =
like / comment / share / more / the spinning audio disc. Bottom = username,
caption, audio title, progress bar.

Taking the strictest of the three, a caption anywhere in the lower half must fit:

```
x: 70 .. 887      y: 250 .. 1500
```

On this format the rail is the binding constraint, and it binds on the **lead
line**, not the emphasis word — the tracked upper-case line is the long one.
Before the cap, four blocks ran past x=887; "entrepreneur" reached 991, a
Like button's width into the rail.

Apply it as the fit width, not as a crop: `SAFE_WIDTH = 823` (= 887 − 64 left
margin), and let the auto-fit scale the offending lines down. The cost on this
reel was a 14% type reduction on two lines out of thirty-four.

### Watch the fitter's fixed pixels

Scaling a line by `maxWidth / measuredWidth` is wrong whenever any part of the
width does not scale with font-size — letter-spacing, a flex `gap`, an ink
allowance. Shrink a tracked line that way and it still overruns.

Split the fixed part out and solve for the size:

```js
fixed  = Σ (chars × tracking) + (n-1) × gap
glyphs = measured(baseSize) - fixed
size   = baseSize × (maxWidth - fixed) / glyphs
```

`SOMETIMES YOU DON'T NEED` is 24 characters at 9px tracking plus three 16px
gaps — 264px that never shrinks. The ratio method left it 19px into the rail.

## The standard: the whole face, and the scrim too

Learned the hard way, on the second pass of the Paris reel. Watching the cut
turned up four moments. In the reviewer's words: "the first line of the caption is
overlapping with my face", and for the raised block, "this vignette is covering
both my face and his face a little bit, so it's not ideal".

So the bar is:

- **The face, not the features.** Type touching a chin or a jaw counts. Landmark
  scoring (below) called three of those four acceptable, and I agreed with it
  from the previews. Both of us were wrong.
- **The scrim counts as overlap.** A soft gradient dimming someone's cheek is a
  defect even though no type is on them.
- **Smaller type is a legitimate tool.** He offered it unprompted: "it's not a
  problem if you make the text a little bit smaller somewhere, and it will help
  us to not overlap with important things." Do not treat the authored size as
  fixed.

The practical consequence: two fixed slots are not enough. A caption often has
to go *above the subject's head*, which on a 9:16 portrait means y≈290 — far
higher than a "raise it a bit" slot — and at 90-ish per cent size so it clears
sideways too. `scripts/fit_block.py` searches (dy, scale) continuously against
expanded face boxes and reports the feasible range per block.

Pick **one** raised position and **one** raised scale for the whole reel, taken
from the tightest block's constraint, rather than each block's own optimum. Two
homes for the rail reads as a decision; five reads as drift.

## But cap the travel: 10-20% of frame height

The other half of the same conversation, one round later. He watched the fixed
cut and rejected one of the raises on sight: "you're showing the caption on the
very top part of the screen, while before captions were quite low, and it's
unacceptable. The movement of the captions should not be half the screen. It
might be like 10% of the screen, maybe 20% max."

So a clean face-clearance solution can still be the wrong answer. −860 on a
1920 master is 45% of the frame; past roughly 20% (≈380px) the caption stops
reading as the same caption moving and starts reading as a different element
appearing somewhere else. Clearance is a constraint, not the objective.

The order to try, cheapest first:

1. **Down and smaller**, accepting chin contact — see below.
2. **Up**, but only within ~20% of frame height.
3. **Up to the top of the frame** — only when the shot actually supports it:
   sky, trees, a dark ceiling. Two blocks in this reel kept −860 and were
   accepted on view, because there is open sky up there. The car portrait had a
   black roof and was still rejected, so "the pixels up there are empty" is
   not sufficient — the jump itself is the cost.

### When nothing clears, take the chin

A tight portrait has no clean position. The face fills the middle, the top is a
half-screen jump, and below the chin there is not enough room for two lines
before y=1500. That is not a solvable geometry problem, and the answer that came
back was to relax the constraint rather than move the caption further:

"you can make the caption maybe a little bit smaller and display it on the lower
part of the screen, just a little bit below my face, maybe even touching my chin
a little bit. That's fine."

On this reel that meant the same +95 drop b1 takes, at 0.85 instead of 0.93 —
the scale falls out of the arithmetic, not out of taste. The block top is fixed
at 1150+dy and the bottom must clear 1500, so the scale is whatever fits:
`s ≤ (1500 − 1150 − dy) / H`, where H is that block's own full-size height
(299px here — it differs per block, because the fitter has already shrunk any
line that hit the width cap).

Check the contrast when you do this: cream type on lit skin is the worst case in
the whole reel. It measured 3.18:1 at the brightest pixel under the line — over
AA-large, but only because the bottom plate is ~0.38 opaque at that height.
Dropping further would land the type on the beard and read better, but each 45px
of extra drop costs about 15% of type size. Not worth it.

The plate is 1020px tall, anchored to the bottom, and ramps
`0 → 0.10 → 0.34 → 0.50 → 0.60` at `0 / 12 / 26 / 58 / 100%`. So it starts at
y=900, is worth ~0.36 at y=1250 and ~0.50 by y=1490. Anything above y≈1000 is
effectively unprotected, which is the whole reason a raised block needs its own
scrim and a lowered one does not.

## Detecting the faces

Run the detector on frames with **the caption rail hidden**. On the delivered
render a face the caption already covers can go undetected — exactly the face
worth finding. Sample only at times when a shot is fully up; a dissolve frame is
a blend of two photos and hides faces in both.

`scripts/fit_block.py` is the tool that matters. It clears the **expanded face
box** — YuNet frames roughly brow-to-chin, so it grows the box 32% up for hair
and forehead, 6% down past the chin, 8% each side (`GROW_UP`, `GROW_DOWN`,
`GROW_SIDE`), ignores anyone under `MIN_FACE = 100`px, and searches (dy, scale)
against every shot the block spans. It reports the feasible dy range and the
largest scale at each dy, so you can see what the block costs before choosing.

`scripts/caption_placement.py` is the earlier tool and scores facial
**landmarks** — eyes, nose tip, mouth corners — rather than boxes. Its reasoning
was that a box fires on every close-up and would move a third of the reel, while
landmarks catch only the shots where type actually crosses a face. **That
reasoning was overruled**, and it is kept only for a first-pass shortlist. Do
not use its verdict. On this reel it cleared three of the four moments that were
then flagged.

### Two homes, but find them by search

A per-block nudge reads as drift; a second fixed home reads as a decision. But
do not *guess* where the second home is — solve for it.

A mid-height slot is a trap: on vertical portraits it lands at face height, so
it was the worst option in almost every row. And a modest raise is usually not
enough either — to clear a head you generally have to go all the way above it,
which is exactly the move the travel cap forbids. That is not a contradiction,
it is the real trade: on a tight portrait, *raising* is not on the menu at all,
and the block goes down instead.

On this reel the answer was dy −860 (caption at y 290–565) at 92% scale, shared
by two blocks. Two others went the other way and took the same +95 drop — one
because nothing above it worked (both its shots had a face up there), one
because the raise that did work was rejected as too big a jump.

### Down is the first option, not the last

Test it before anything else. The bottom of the safe zone is y=1500 and the
authored rail bottom is 1449, so there are only ~50px of free travel — but each
1% of scale buys another ~3px, so 95px down at 85% fits comfortably. Two of the
four moved blocks on this reel ended there, and it is the least disruptive move
available: the caption stays where the eye expects it, the bottom plate is
already dark underneath, and no travelling scrim is needed.

## A raised caption needs its scrim to travel with it

The bottom plate is anchored to the bottom of the frame. Lift a caption out of
it and cream type lands on whatever is up there — over bright sky this measured
**1.7:1**, against 4.4:1 at home. Unreadable.

Give raised blocks their own scrim, and mind all five of these:

1. **Make it a sibling of the block, not a child.** A child is cut off with its
   block at `block.end` — and the photo underneath usually runs on past that
   cut, so the scrim vanishing in one frame lifted the whole frame **19%
   brighter**. As a sibling it can outlive the type and fade over ~0.4s. After
   the fix the largest single-frame step was 4%.
2. **Ride it in on the first word.** The block turns visible at `block.start`
   but its words fade in one at a time after that; on the block's own opacity
   the scrim appears first, as a dark band over an empty frame.
3. **Check the radii cover the end of the longest line.** Gradient percentages
   are relative to the scrim's box, and at 58% horizontal the last word of
   "ALSO MET MY BRO" sat at 63% of the radius and still measured 2.8:1. At 76%
   it measures 7.4:1.
4. **Inscribe the gradient in its own box.** `radial-gradient(50% 50% at 50%
   50%, … , transparent 100%)` fades to nothing exactly at the edge. Anything
   larger is clipped by the element, and a straight clip across a soft gradient
   is a visible rectangle — in the sky it looked like a grey card. The first
   attempt used `72% 60%` with the last stop at 92%, which put the zero crossing
   outside the box on all four sides.
5. **Size the box to the measured ink, not to a constant.** One fixed box is
   either too small for a six-word lead line or too big for "Nikita" — and too
   big is not free: the first version reached far enough right to dim a face
   standing beside the type, which is exactly what was flagged. Measure the
   inner wrapper's `getBoundingClientRect` after it is in the DOM — the per-block
   scale is then already baked into the number — and pad it proportionally:
   `0.55 x` the ink width across, `0.45 x` the ink height down, floored at 200
   and 120px. The padding is what decides where along the falloff the last letter
   sits. Too little and the ink sits at 80% of the radius with almost no scrim
   under it; too much and the ellipse reaches a face standing beside the type.

A block that moves **down** needs none of this — the bottom plate is already
there and gets denser toward the frame edge. Gate the scrim on `dy < 0`.

### Measuring it honestly

Three different baselines, and picking the wrong one gives nonsense:

- Legibility: `--hide-text` — the type hidden, the scrim kept. Measuring with
  the type visible measures the type, and a p90 that comes back at exactly the
  cream's luminance is the giveaway.
- Scrim spill onto a face: `--hide-halo` — hides only the travelling scrim and
  keeps the bottom plate. Comparing against `--hide-captions` removes the plate
  too and blames the scrim for 35% of dimming that was always there.
- Face detection: `--hide-captions` — everything off, so a face the caption
  covers is still found.

## The backward-seek trap

**Seek times must be ascending.** Seeking a GSAP timeline backwards does not
re-hide the clips that played in between: every earlier shot stays at opacity 1
and the last one in DOM order wins. The frame then shows the *wrong photo* while
the DOM and the captions both look correct — which is what makes it dangerous.
It cost an hour of chasing a regression that did not exist.

`shoot_frames.mjs` and `preview_slots.mjs` now sort their times. Anything else
that drives the timeline must too.

## Order of work

```bash
python3 dump_tables.py                       # SHOTS + BLOCKS out of the generator
node probe_caps.mjs                          # what the ink actually occupies
node shoot_frames.mjs --hide-captions \      # clean plates for detection
  --times-file times.json --out plain/
python3 fit_block.py --frames plain/ --caps caption_boxes.json \
  --model yunet.onnx --blocks 1,3,11,18 --current "18:-520"
```

Then decide, edit `BLOCK_POS` in the generator, rebuild, and **shoot the real
thing** — do not judge from `preview_slots.mjs` once a block already carries a
baked offset and a scaled inner wrapper. Its `--cases` dy is a *stage margin*
that stacks on the baked `top`, and its scale composes with the wrapper's, so
both numbers have to be back-computed and it is easy to preview a position you
are not actually shipping. Regenerating the composition takes under a second:

```bash
python3 build_reel.py && node shoot_frames.mjs --times "5.24,6.10" --out try/
```

`fit_block.py` has the same stacking problem and solves it explicitly —
`--current 18:-520` tells it what is already applied so it can un-shift
`caption_boxes.json` back to the authored position before re-placing. Pass it
whenever a block you are re-fitting has a non-zero entry in `BLOCK_POS`, or
every number it prints is wrong by that offset.

Its scale is also **relative to as-built**: `caption_boxes.json` is measured off
the live DOM, so a block already at 0.92 that reports "scale 1.00" means "keep
0.92". Convert before writing it into `BLOCK_POS`.

YuNet model (OpenCV 5 dropped the Haar cascades from the Python wheel; no loss,
YuNet finds profiles and small faces Haar misses and returns landmarks):

```bash
curl -L -o yunet.onnx https://github.com/opencv/opencv_zoo/raw/main/models/\
face_detection_yunet/face_detection_yunet_2023mar.onnx
```

OpenCV needs its own venv — `pip install` into the system python fails with
PEP 668 `externally-managed-environment`.

## Verify against the delivered mp4, not the composition

The last check is always frames pulled out of the finished file with `ffmpeg
-ss`, stacked side by side, and looked at. Every regression in this reel that
survived to a render survived because the composition was checked and the
render was not.

Re-run `probe_caps.mjs` after any position change and assert the union of every
block against the safe box in one line — `left 64 right 887 top 290 bottom 1499`
is what a clean reel prints. It is a two-second check that catches a block
pushed past y=1500 by a scale that was a hundredth too large.

## Screenshots vs the render

Puppeteer screenshots are geometrically identical to the rendered frame and are
fine for detection, measurement and preview. They differ in level — the browser
screenshots full-range sRGB, the h264 is limited-range — so a bright frame shows
mean |Δ| ≈ 19/255 and a dark one ≈ 3. That is a range difference, not a
compositing one. Never judge *colour* from them; geometry and contrast ratios
are safe.
