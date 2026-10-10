---
name: bounded-promo
description: A calm, white-page app promo — one blue accent on white, big sentence-case type, real product screenshots rising from the base, and a problem-then-relief arc cut on the beat.
---

# Bounded Promo

A vertical product ad that sells by being **correct rather than loud**. The page is
white, the type is large and calm, one blue does all the emphasis, and the product's
own screenshots do the proving. It opens on a problem the viewer already feels, names
what that problem costs, then hands over the product as the relief — and it never
raises its voice, because the thing being sold is certainty.

Built for Bounded (a day-counting app), but nothing here is about travel. It fits any
product whose promise is *you will stop guessing* — a tracker, a monitor, a
reconciliation tool, a compliance or health or money app. Give it a different product
and it works unchanged.

## When it fits, and when it doesn't

Use it when the product has a real interface worth showing and a specific,
nameable anxiety it removes. It needs at least two or three genuine screenshots —
the whole look leans on them, and invented UI will show.

Don't use it for something playful, physical, or lifestyle-led. The restraint reads
as confidence when the subject is precision, and as coldness when it isn't.

## The look

**Canvas** 1080×1920, 30fps.

**Palette** — four values, and one of them appears exactly once.

- canvas `#FFFFFF` — pure white, the whole way through, no gradients, no grey sections
- ink `#000000` — every headline
- accent `#0091FF` — numbers, eyebrows, chips, pills, bar fills, the one solid button
- muted `#5C6C7A` — sub-lines, body copy, the closing URL
- alarm `#dc2626` — **once**, on the single moment something goes wrong

Swap the accent for the product's own brand blue/green/orange and the system holds.
Keep the alarm red no matter what the brand colour is; it has to read as a warning,
not as decoration. The screenshots supply all the other colour in the piece, and they
earn it by being real.

**Type** — Inter throughout, bundled locally as a `@font-face` so a render never waits
on a font request.

- headlines: 76–84px, weight 700, tracking −0.025em, line-height ~1.08, **sentence
  case with a full stop**. Never all-caps, never a question mark in a headline except
  the hook. Break them onto two lines by putting each line in its own `<span>`.
- the hook numeral: 400px, weight 700
- eyebrows: 26–27px, weight 600, uppercase, tracking 0.09em
- body / sub-lines: 34–44px, weight 400–500, muted
- chips and pills: 30–36px, weight 600, accent

**Components** — three, and no more.

- **tinted card** — `rgba(accent, 0.04)` fill, 1.5px `rgba(accent, 0.2)` border, 14px
  radius, **never a shadow**
- **pill** — white fill, the same 1.5px accent border, 100px radius, accent text. Used
  for chips, rule names, checkmarks, export formats. White fill rather than a tint is
  deliberate: accent text on an 8% accent wash measures 2.95:1 and fails the contrast
  floor; on white it clears it.
- **bar** — 20px track at `rgba(accent, 0.08)`, accent fill, 6px radius, filled by
  tweening `scaleX` with `transform-origin: left`

The **only solid-filled element in the entire video** is the CTA button on the last
frame. That is what makes it read as the one thing to do.

**The safe column.** Everything composes into an 800px column at x 80–880, optical
centre x 480, with copy between y 240 and y 1520. On a phone the platform's action
rail starts around x 887 and the caption bar eats the base, so a full-width layout
loses its right edge. Screenshots may run past y 1520 off the bottom of the frame — an
image cropped by the frame edge reads as intentional, a cropped word never does.

**Screenshots** sit centred in that column at 530–600px wide, upright, uncropped at the
sides, rising from the base. Never tilt them, never put them in a mockup scene, never
lay text across the part of the screen that carries the proof. If a caption has to
overlap a screenshot, it goes over a dead area as a solid white card with an accent
border — not a translucent scrim.

## The pacing

Seven frames, about 36 seconds, every cut hard — no crossfades, because the piece is
a list of statements rather than a flow.

| # | Beat | Length | Job |
|---|------|--------|-----|
| 1 | The guess | 7 beats | The hook: a number that won't settle |
| 2 | The stake | 9 beats | What being wrong costs |
| 3 | The product | 7 beats | Name + first screenshot, the relief |
| 4 | Proof one | 9 beats | The core mechanic, with a screenshot |
| 5 | Proof two | 8 beats | Breadth / coverage, with a screenshot |
| 6 | Proof three | 7 beats | The two objections, pure type, a breath |
| 7 | The close | 11 beats | Rating, line, lockup, CTA |

**Cut on the beat.** Measure the bed's tempo, then make every frame a whole number of
beats and start the bed on an onset that also sits on the grid. At 97 bpm (beat
0.6186s) that grid is 4.33 / 5.57 / 4.33 / 5.57 / 4.95 / 4.33 / 6.80s. Re-derive the
numbers for whatever tempo the chosen track runs at — the *pattern* is what carries
over: short hook, long stake, short turn, long proofs, longest close.

**Motion doctrine — every frame does exactly one thing.**

- entrances are rise-and-fade: 24–110px of travel, `power3.out`, 0.5–0.9s
- staggers are 0.14–0.35s apart
- overshoot (`back.out`) is rationed to four moments in the whole video: the hook's
  settle, the chip row, the star draw, and the CTA
- **nothing loops, nothing pulses, nothing drifts while holding.** Each frame arrives,
  resolves, and goes completely still, so the cut always lands on a resolved image
- the last two seconds of the endcard are frozen, so the piece survives being looped

Two techniques worth keeping:

- **The flicker hook.** Stack the candidate numerals absolutely on top of each other,
  all at `opacity: 0`, and switch them with zero-duration `tl.set()` calls ~0.28s
  apart. Hard cuts, no interpolation — it reads as a mind flicking through guesses in
  a way a tween never does. It stays seek-safe because a set is deterministic.
- **The hand-off.** On the product frame, the lockup arrives at frame centre and then
  *lifts* to the top in the same continuous move that the screenshot rises from the
  base. One gesture, not two: the eye is handed from the name to the product.

## Captions

There are none, and that is a choice — there's no voiceover to caption. The headlines
**are** the captions: one sentence per frame, on screen long enough to read twice,
sized so they survive a muted autoplay in a feed. If a frame needs a second thought,
it goes in the muted sub-line under the headline, never as a third line of display type.

If the piece ever gains narration, caption it on the standard word-timed rail and drop
the headline sizes to ~64px so the two don't fight.

## Music

One bed, no narration, no SFX. The bed is the entire soundtrack, so it has to be
chosen on evidence rather than vibe:

- **Score candidate tracks for energy above 500 Hz, not for "mood".** A phone speaker
  reproduces almost nothing below 500 Hz, so a sub-heavy bed arrives as a rumble and
  the video sounds like it has no music at all. The track used here measures 31% of its
  energy above 500 Hz and 49% below 200 — the brightest window in the library. Anything
  at 80%+ sub-bass is disqualified however good it sounds on laptop speakers.
- **Pick the window, not just the track.** Compare five-second sections across the
  whole file; a track that opens on a quiet build will drain the first seconds of a
  36-second ad. Start on a section whose opening is already full.
- **Start on a beat.** Find an onset that also lands on the tempo grid, so the video
  opens on a downbeat.
- −16 LUFS integrated, −1.5 dBTP ceiling. 0.6s fade in so the downbeat still hits;
  2.5s fade out across the endcard hold, so the CTA ends in silence.

**Never re-render for an audio change.** The render is silent; the bed is muxed on
afterwards with `-c:v copy`, which takes about a second. Commit the mix as a script
(see `scripts/mix_bed.py` in the source project) so the bed can be rebuilt or swapped
without touching the video.

## The script

Verbatim from the Bounded cut. Every claim came from the product's own site — that
discipline matters more than the wording, because an ad this calm has no room for a
sentence it can't back.

1. **The guess** — eyebrow: `DAYS IN THE SCHENGEN AREA · THIS YEAR` · numeral flickers
   `61 → 84 → 72 → 95 → 78` then snaps to `?` · kicker: **You're guessing.**
2. **The stake** — headline: **Guess wrong / and you overstay.** · three bars:
   `Schengen area 88/90`, `Tax residency 179/183`, `Substantial Presence 168/183` ·
   the first turns red and ticks to `91/90` · sub: *That's a visa. Or a whole tax year.*
3. **The product** — lockup: **Bounded** · claim: **Counts them for you.** ·
   sub: *Automatically. In the background.*
4. **Proof one** — headline: **Every crossing, / logged to the day.** · chips:
   `Countries` `US states` `Cities` · card: *Rebuild years of past trips from your
   photos — **on the phone, never uploaded.***
5. **Proof two** — headline: **100+ rules, / already built in.** · pills:
   `US Substantial Presence` `UK Statutory Residence` · sub: *+95 more, ready to
   switch on.*
6. **Proof three** — headline: **Private by design.** · card one, eyebrow `YOUR DATA`:
   **It never leaves the phone.** *Your travel history is processed on your iPhone.
   There is no account to make and nothing to upload.* + chips `On-device`
   `No account` `No server access` `You stay in control` · card two, eyebrow
   `YOUR PROOF`: **One tap, and it's evidence.** *Export a report formatted for tax
   authorities and visa applications, whenever someone asks you to prove it.* + pill
   `PDF · CSV · trip ranges`
7. **The close** — `4.8` + five stars + *35,000+ travelers* · **Know where / you
   stand.** · lockup · CTA **Download on the App Store** · `bounded.app`

**The shape to reuse**, with any product dropped in:

1. a number the viewer can't answer about themselves
2. the limits they're near, one of them going red
3. the product, named, doing that job
4. how it works — screenshot
5. how much it covers — screenshot
6. the two objections, answered flat
7. rating, one-line promise, one button

Frames 1 and 2 are the whole trick: **the ad is two-thirds over before it mentions the
product**, and by then the viewer wants it. Don't shorten them to get to the demo
sooner.

## Build notes

Modular HyperFrames — a thin `index.html` declaring seven sub-composition slots on
track 1 plus a full-duration white ground clip on track 0, and one file per frame under
`compositions/frames/`.

Things that will bite:

- Paint the white ground on **its own full-duration clip**, not on `#root`. A fill on
  the composition root alone can be dropped by frame compositing and the video renders
  black.
- In a sub-composition, `<style>` and `<script>` go **inside** `<template>` and the
  root is styled by `#root`, never by a class. Both mistakes produce the identical
  symptom: unstyled text in the top-left corner of the render.
- Never pair a CSS `transform` with a GSAP tween on the same property. Set bar fills to
  `scaleX: 0` with `tl.set(..., 0)` on the timeline instead of in CSS.
- Mark a deliberately bottom-cropped screenshot `data-layout-allow-overflow`.
- Run `npx hyperframes check` and inspect the snapshot contact sheet **before**
  rendering. On this build the sheet is what caught a chip row wrapping to two lines,
  a tagline running across a phone's bezel, and an endcard opening on `0.0`. None of
  those failed a gate; all three were obvious on sight.
