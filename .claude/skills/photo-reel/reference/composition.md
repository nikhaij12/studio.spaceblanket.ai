# The composition: generator, shot modes, captions

## Generate the HTML, never hand-edit it

`index.html` for a 50-shot reel is ~80 KB of repetitive clip divs, Ken Burns
tweens and per-image grading blobs. Hand-editing it is how timing drifts.

Write a **generator** — `build_reel.py` — whose top is a readable timing table
and whose bottom emits the file. Then the table is the single source of truth
and a re-time is a one-line edit. `templates/build_reel.py` is a working one to
copy.

Shape:

```python
DURATION = 55.93
FPS = 30

SHOTS = [
    # start, image, fade, mode, pos, note
    (0.00,  "IMG_0319", 0.30, "fill", None,      "opening"),
    (36.50, ("a","b","c"), 0.22, "strip", None,  "three frames as one column"),
    (40.49, "still",   0.22, "card", None,       "landscape framed as a postcard"),
]

BLOCKS = [
    # start, end, [(lead word, onset)...], (emphasis word, onset)
    (0.00, 1.37, [("I'm", 0.07), ("a", 0.21)], ("25-year-old", 0.28)),
]
```

Assert the invariants at the bottom of `main()` so a bad edit fails loudly:
the last block must reach `DURATION`, no shot may start after it, audio
elements must not run past it.

## HyperFrames contract — the parts that bite

- Root element carries `data-composition-id`, `data-start`, `data-duration`,
  `data-fps`, `data-width`, `data-height`.
- Timed elements need `class="clip"` plus `data-start`, `data-duration`,
  `data-track-index`.
- **Clips on the same track must not overlap.** Cross-dissolves therefore
  alternate track indices — odd shots on one, even on the other.
- The timeline is built paused and registered on `window.__timelines["main"]`.

Three traps:

1. **The framework owns a clip's own visibility.** Never tween opacity on the
   clip div — the runtime will fight you. Put a `.shot-inner` wrapper inside the
   clip and dissolve that.
2. **Anything that needs a layout box before the runtime would reveal it must
   not be a clip.** The caption rail and any full-frame scrim are plain
   elements that ramp once, not clips.
3. **Google Fonts via `<link>` works but warns.** Fine for a personal reel.

## Shot modes

- **`fill`** — cover-crop to 9:16. `pos` overrides the crop anchor
  (`"62% 50%"`) when the subject is off-centre.
- **`card`** — a landscape or film still framed as a postcard over a blurred,
  darkened copy of itself. Use when cropping to 9:16 would destroy the frame.
- **`strip`** — several landscape frames stacked into one 9:16 column. The only
  way three scope frames fit a vertical frame *whole*.

### Strip geometry must be exact

Three cells at 632 px plus two 12 px seams is exactly 1920. Then the only
background that shows is the two hairlines.

```css
.shot-strip { display: flex; flex-direction: column; gap: 12px;
              width: 1080px; height: 1920px; }
.shot .strip-cell { position: static; transform: none;
                    flex: 0 0 632px; width: 1080px; height: 632px;
                    object-fit: cover; }
```

`.shot .strip-cell` (specificity 0,2,0) is needed to beat `.shot img` (0,1,1),
which absolutely centres every image — a flex cell has to sit in the flow.

Two things that make a strip read as a designed collage rather than a graphic:

- **Ken Burns targets the column, not the cells**, so the panels stay locked
  together and drift as one object.
- **Panels arrive staggered** (~0.11 s apart, from `scale 1.075` settling to
  exactly `1.0`, which is cover for the cell and never under it), so the collage
  assembles itself on the line.

Put the strongest frame in the **middle** slot: the caption plate darkens the
bottom third, so the middle is the one panel nothing sits on top of.

## Ken Burns without edge leaks

A cover-cropped fill drifting `x` px off centre exposes `x` px of background
unless it is scaled up to compensate:

```python
def cover_scale(x, y):
    return max(1 + 2 * abs(x) / WIDTH, 1 + 2 * abs(y) / HEIGHT)
```

Compute the lift needed at **both** endpoints, take the max, and add it to both
so the move keeps its travel. Strips need this exactly as much as fills do.
Alternate drift direction shot to shot so consecutive shots never push the same
way, and scale travel to shot length so the drift reads at one speed on a 0.3 s
flurry cut and a 3.2 s hold.

## Captions

Two lines: a tracked upper-case lead, and one handwritten emphasis word. Each
word gets its own onset so the type lands on the syllable.

**Onsets come from the audio, not from a transcript.** Whisper timestamps drift
by several tenths and will place a line before the word. Measure the real
onsets from an RMS envelope (`voice_probe.py` prints the gap map; syllable
boundaries are the dips between them) and give every word the same small lead
(~0.06 s) so the type is legible as the word lands.

**A block holds until the next block starts.** Ending a block early leaves the
rail empty and reads as a stall — this is the single most common complaint. If a
line ends mid-pause, extend its `end` to the next line's real start rather than
clearing at the previous line's nominal end.

### The closing line

Do **not** build a separate summary or takeaway card. The reel finishes on the
same caption rail it has run on the whole way through; what changes is that the
picture sinks under a scrim and the type turns gold.

- One `#finale` scrim (a radial gradient, `z-index` between shots and captions)
  ramping 0 to 1 over ~2 s, **arriving with the last sentence** rather than on a
  cut — so the picture sinks under the line instead of the line landing on a
  shot that suddenly looks different.
- The last two blocks render in an accent colour, used exactly **once** in the
  whole reel.
- **Skip the last block's hide tween** so the line holds to the literal final
  frame.
- **Never fade to black.** The frame the platform parks on and the frame the
  loop cuts from should be the takeaway.

## Per-image grading

`build_grades.py` measures every image once (cached in `measurements.json`,
keyed by image, so swapping one source costs one probe instead of re-measuring
fifty) and writes a correction per layer into `grades.json`.

A strip gets **one grade per panel**, so three frames of the same scene are
corrected to each other rather than all inheriting whichever is listed first. A
card gets a second, separate grade for its blurred background copy.

`signalstats` prints `YAVG=` (not `YAVG:`), and only at info level — so again,
no `-v error` while measuring.
