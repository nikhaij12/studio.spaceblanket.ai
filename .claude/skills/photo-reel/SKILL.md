---
name: photo-reel
description: Build a cinematic vertical photo-montage reel — dozens of photos stitched to a voiceover, with music beds, word-timed captions, Ken Burns motion, and a held takeaway line at the end. Rendered with HyperFrames. Use when someone hands over a folder of photos plus a voice recording and wants an Instagram Reel / Short cut from them, or asks to edit or re-time an existing one.
---

# Photo Reel — the photo-montage format

A folder of photos, one voice recording, a couple of licensed tracks →
a 9:16 reel where every photo lands on the word it belongs to. Built as HTML and
rendered to MP4 with **HyperFrames**.

The format, fixed:

- **9:16, 1080x1920, 30 fps**, 45-60 s, 40-50 shots at roughly 0.8-1.4 s each.
- **Ken Burns on every shot**, alternating direction, cross-dissolved.
- **Two-line captions** — tracked upper-case lead plus one handwritten emphasis
  word — with every word timed to its syllable.
- **Two music beds** that hand over at the story's turn, ducked under the voice.
- **A held closing line**, gold, over a darkened frame. No summary card.

## Do this in order

Order is not cosmetic — the caption onsets depend on the finished audio, and the
music beds depend on the finished voiceover.

### 1. Take stock

Everything they gave you — photos, voice takes, a script, notes — is inside the
project folder the studio names in its opening message, and that folder is the
only place to work. It holds the notes, the script and the build scripts; its
`reel/` holds the composition; and the reel's `media/` holds working copies of
the photos and audio. The licensed tracks are the one thing kept outside it, in
the studio's shared `music/` folder.

Read `script.md` if there is one — **spellings follow the script, not the
transcript.** Whisper will hear "brother Kita" for "bro Nikita".

### 2. Audio first, and measure before you filter

```bash
python3 scripts/voice_probe.py rec1.m4a
```

Read all four sections before choosing a filter. The probe will tell you if the
take is a multichannel file with one live channel (the one-ear bug), if it has
been gained into clipping, where every pause is, and what the voice's tonal
balance actually looks like.

Then clean it:

```bash
python3 scripts/voice_clean.py rec1.m4a reel/media/vo.m4a \
  --channel 1 --offset 3.695 --length 54.2 --target-lufs -16.7
```

Full detail, the winning chain, the two stages that lose, and the ffmpeg traps:
**`reference/audio.md`**. Read it before touching audio — several of those
findings cost an hour each.

### 3. Build the shot table

Lay the photos against the voiceover, one row per shot, in a generator script.
Never hand-edit the HTML. Shot modes (`fill` / `card` / `strip`), exact strip
geometry, Ken Burns edge-leak maths, and the HyperFrames clip contract:
**`reference/composition.md`**. Start from `templates/build_reel.py`.

### 4. Grade the images

```bash
python3 build_grades.py    # measures each image once, writes grades.json
```

Measurements cache per image, so swapping one photo costs one probe.

### 5. Time the captions off the audio

Word onsets come from the RMS envelope, **not** from the transcript — whisper
drifts by tenths of a second. A block holds until the next block starts; ending
one early leaves the rail empty and reads as a stall.

### 5b. Place the captions — safe zones, then faces

Two different problems that both look like bad placement. Full detail:
**`reference/safe-zones.md`**.

```bash
python3 scripts/dump_tables.py                               # shots + blocks
node scripts/probe_caps.mjs                                  # what the ink occupies
node scripts/shoot_frames.mjs --hide-captions \              # clean plates
  --times-file times.json --out plain/
python3 scripts/fit_block.py --frames plain/ --model yunet.onnx \
  --caps caption_boxes.json --blocks 1,3,11,18
```

- **The phone's UI is fixed geometry** — the safe area is an *L*, because the
  right-hand action rail only starts partway down the frame. Cap the fit width
  at `x = 887` and it is solved for every frame at once.
- **Faces are per shot,** and the standard is the whole **face box** — a chin or
  a jaw counts. `fit_block.py` searches position *and* scale against every shot
  a block spans; a block cannot move mid-block, so the answer must clear all of
  them.
- **Smallest move that works, and never more than ~20% of frame height.** Try
  down-and-smaller first; go to the top of the frame only over sky or a dark
  ceiling, and even then expect the jump to be felt.
- **Then look at the frames** — from the rebuilt composition, and again from the
  delivered mp4. A scorer that says "clears" has not seen the shot.

### 6. Build the beds against the finished voice

Each bed carries its EQ, its sidechain duck keyed off the voiceover, its bloom
and its fade **baked in**. A new voiceover means a new bed.

The single thing that makes a bed sit *with* the voice rather than fight it is
that **its depth is capped, not proportional** — `sidechaincompress` with
`mix=0.28` gives a hard -2.85 dB floor, so the bed stops tracking the 4-5 Hz
syllable envelope and stops being perceptually fused with the voice. The full
chain, the levels, how to pick a music window, and how to measure a bed
honestly: **`reference/audio.md`**. Read it — the earlier chain in there was
rejected in exactly these words: "at battle with each other".

### 7. Simulate the mix — before you render

```bash
python3 scripts/mix_sim.py reel/index.html --compare reel/out/previous.mp4
```

Seconds instead of twelve minutes, and it has caught every audio mistake so far.

### 8. Check, render, verify

**If nothing but the audio changed, do not render at all — remux.** See step 8b.

```bash
cd reel && npx hyperframes@latest upgrade --project . --check   # probe the pin
npx hyperframes check                                           # must be 0 errors
npm run render -- --quality high                                # ~13 min at 56s
```

Every one of these runs **from `reel/`**, not the project root — `check` looks
for `index.html` in the working directory and otherwise tells you to `init` a
new composition, which is not the problem it sounds like. It takes ~2 min.

The render writes to `reel/renders/reel_<timestamp>.mp4`. **Copying it to
`out/` is manual** — do not report a render as delivered until you have copied
it and re-probed the copy.

Then verify what actually shipped, not what you intended:

```bash
python3 scripts/contact_sheet.py reel/out/reel.mp4 --starts-from build_reel.py \
  --extra 47.55:caption_lands --extra 55.88:final_frame
python3 scripts/frames.py reel/out/reel.mp4 -t 47.20 -t 47.45 -t 47.90 \
  --crop 0,1150,1080,700 -o caption_check.png
```

The contact sheet flags black or flat frames numerically. `hyperframes check`
measures boxes and contrast — it cannot see a lost WebGL context or a decapitated
crop.

### 8b. Revisions: remux, do not re-render

The render's audio is a **plain unity sum of its `<audio>` elements** (verified
r=0.99886 at zero lag). So a new bed, a new level, new music or a re-cut
voiceover is a stream copy, not a render:

```bash
python3 scripts/remux_audio.py reel/index.html reel/out/reel.mp4 --validate
python3 scripts/remux_audio.py reel/index.html reel/out/reel.mp4
```

**13 minutes becomes ~40 seconds**, and the video comes out bit-identical rather
than re-encoded, so nothing degrades across rounds. Run `--validate` first on any
composition you have not remuxed before; if it does not clear r=0.99 at zero lag,
something in the page is not a plain sum and you must render.

`--clip 5` / `--clip 12` cuts comparison clips the same way, for when they are
choosing between options.

**Everything else about keeping the loop fast — what the 45 minutes actually
went on, what not to re-measure, and how to deliver under the 30 MiB limit — is
in `reference/speed.md`. Read it before starting a revision round.**

## Rules that are not negotiable

- **No scripted volume.** Every `<audio>` plays at `data-volume="1"`. A bed asked
  for at 0.10 came back 20-30 dB down in patches of a full render. Bake levels
  into the files.
- **No summary card at the end.** The reel finishes on the speaker's own
  subtitles. The frame sinks under a scrim, the last line turns gold, and it
  holds to the final frame. The verdict on the alternative was "cringe".
- **Never fade to black.** The frame the platform parks on should be the takeaway.
- **Never tween opacity on a clip div** — the framework owns clip visibility. Use
  an inner wrapper.
- **The accent colour appears exactly once** in the whole reel, on the last line.
- **No caption ink outside `x 70..887`, `y 250..1500`.** Below y≈860 the right
  edge is the Like / Comment / Share rail; the bottom 420px is the username and
  audio strip. Type there is not badly placed, it is covered up.
- **A raised caption carries its own scrim**, as a sibling of the block so it can
  outlive the cut. The bottom plate does not travel with it, and cream type on
  bright sky measures 1.7:1.
- **A block never travels more than ~20% of frame height** (≈380px on 1920).
  Further than that it stops reading as the same caption moving. On a tight
  portrait, drop it and shrink it and let it graze the chin instead.
- **Seek times ascending, always.** Seeking a GSAP timeline backwards leaves
  every shot that already played at opacity 1, so a probe frame shows the wrong
  photo while the DOM and captions look correct.
- **A music bed's duck depth is capped, never driven by ratio.** `mix=0.28` on
  `sidechaincompress`. A bed that tracks the syllable envelope gets perceptually
  welded to the voice — that is what "at battle" was.
- **Never score a music window for having low energy in the voice band.** It
  produces 75-86% sub-bass beds, and a phone reproduces almost nothing below
  500 Hz. Score for energy *above* 500 Hz.
- **Never re-render for an audio-only change**, and never re-encode the video of
  a file you are only re-levelling.
- **Every generated asset gets a committed script that regenerates it.** An
  uncommitted bed recipe cost a whole session to reverse-engineer.

## Verifying honestly

- **A render is not done because a process exited.** Chrome recycles page
  processes mid-render; watching the wrong PID once produced a "finished" report
  while `out/` still held the previous cut. Watch the `npm run render` PID, and
  confirm by probing the output file's duration and size.
- **An empty render log is not a failure** — `| tail` buffers the whole pipeline
  until it ends.
- **Measure the delivered file**, not the intermediate: L/R balance, LUFS, true
  peak, speech levels at several points, and the tail.
- **A dropout sweep at ~21 ms windows will cry wolf** — inter-syllable silences
  read as dropouts. Locate each low window by timestamp and explain it before
  reporting a problem. Passing a larger `reset=` to `astats` does *not* coarsen
  the window.

## When they ask for changes

They describe the *symptom*, in their own words, usually by voice. Read for
intent:

| What they say | What it usually is |
|---|---|
| "sounds only in one ear" | a multichannel take with one live channel |
| "clean it up like my editor does" | high-pass, de-boom, presence lift, de-ess, expander — and *not* a denoiser or compressor |
| "the caption shows before I speak" | the block start was aligned to the previous block's end, not to the word |
| "there's a gap / it feels weird" | usually caption timing, not the silence itself |
| "use these visuals instead" | check whether they are landscape — that is what `card` and `strip` modes are for |
| "the caption is on my face" | one block, not the layout — move it, smallest move first: down-and-smaller, then up, and only over sky/ceiling all the way up (with a scrim) |
| "the caption jumped to the top" | the move was too big — cap travel at 10-20% of frame height |
| "it overlaps important content" | clear the whole face box, not the landmarks; a chin counts |
| "it's hidden behind the buttons" | the action rail — cap the fit width, do not move the rail |
| "the music is at battle with the voice" | co-modulation, not frequency — cap the duck depth (`mix=0.28`) |
| "the music overlaps the voice / it's a rumble" | a sub-heavy bed a phone cannot reproduce as music, and/or an EQ scoop through 1-4 kHz |
| "make it 30% quieter" | amplitude, so -3 dB. 15% = -1.4 dB, 10% = -0.9 dB |
| "the music should be the same in both parts" | normalise both beds to the same absolute LUFS, not to the same LU-under-voice |
| "why is this taking so long" | you re-rendered for an audio change, or ran an audit nobody asked for — `reference/speed.md` |

Fix the cause, not the symptom, and say which one it was.
