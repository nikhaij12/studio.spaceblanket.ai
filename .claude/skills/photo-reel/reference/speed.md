# Making the loop fast

The verdict after a round that took 45 minutes: "you're taking like 45 minutes
to do some simple rendering. Why is that?" That was right, and almost none of it
was rendering. Read this before starting a revision round.

The same round, after applying everything below: **50 seconds.**

## Where the time actually goes

Ranked by what it cost on the Paris reel, worst first:

| Cost | What | Fix |
|---|---|---|
| ~35 min | A multi-agent audit workflow | Only run one when it is asked for (`ultracode`), and never for a level tweak |
| ~13 min | A full HyperFrames re-render | **Do not re-render for an audio change.** Remux — see below |
| ~2 min | Review copy at `-preset medium` | `-preset veryfast`, 6 s, same usable quality |
| ~1 min/bed | Re-measuring the duck after a level change | It cannot have changed. Skip it |
| seconds each | `ebur128` / `astats` passes | Each decodes the whole file. Batch them |

## The big one: never re-render for an audio change

**The HyperFrames render's audio is a plain unity sum of its `<audio>`
elements.** Verified on the delivered master: reconstructing the mix from the
media files and correlating against the render gives **r = 0.99886 at zero lag,
gain within 0.06 dB**.

So any audio-only change — new bed, new level, new music, a re-cut voiceover —
is a **remux**, not a render. Copy the video stream untouched and replace the
audio track:

```bash
python3 scripts/remux_audio.py reel/index.html reel/out/reel.mp4
```

13 minutes becomes about 40 seconds, and the video is *bit-identical* rather
than re-encoded, so nothing degrades across rounds.

**Prove it before you trust it.** `remux_audio.py --validate` reconstructs the
*current* mix from the *current* media and correlates it against the existing
render first. If that check does not come back above r=0.99 at zero lag,
something about the composition is not a plain sum and you must render.

Two details that will bite:

- **The AAC priming offset.** The render's audio is delayed by 1024 samples
  (21.33 ms) relative to a naive sum. Reproduce it with
  `adelay=delays=1024S:all=1` or every clip you cut will be out of sync with the
  master by a frame.
- **Trim to `frames/fps`, not to the composition's declared duration**, and do
  not pass `-shortest`. See the trap in `reference/audio.md`.

## Comparison clips, not full renders

When they are choosing between options, cut short clips from the existing master
with the audio re-summed. Same remux trick, plus a trim.

- **5 seconds** answers "which track / which segment" — a piece of music
  announces itself immediately.
- **12 seconds** answers "do the music and voice coexist" — that only becomes
  audible across a phrase boundary, where the bed has to sit still under a
  sentence and then breathe in the gap after it.
- Re-encode these at `-crf 20 -preset veryfast`. The subject is the audio; the
  master's 16 Mbps would be 170 MB of files to move for no reason.
- **Verify the right bed landed in the right clip** with a confusion matrix, not
  a single correlation. Correlating a clip against its *bed* has no power — the
  bed is 15-20 LU down, so the mix's envelope is dominated by the voice.
  Reconstruct the expected sum for every option, correlate every clip against
  every reconstruction, and require the diagonal to win. Project the voice out
  and the margin goes from ~0.01 to ~0.95.

## Do not measure what cannot have changed

The single dumbest cost in the loop was re-rendering each bed twice to
re-measure ducking after only its **level** changed. `sidechaincompress` derives
its gain from the sidechain key, and the key is the untouched voiceover, so the
gain trajectory is bit-identical at any music gain.

Before adding a verification pass, ask what input it depends on and whether that
input moved. Write the reasoning into the script as a comment so the next round
does not re-add it.

## Delivery

The send limit is **30 MiB**. A 56 s 1080x1920 master at high quality is ~108
MiB and will be rejected.

```bash
ffmpeg -v error -i master.mp4 -c:v libx264 -crf 28 -preset veryfast \
  -pix_fmt yuv420p -c:a copy -movflags +faststart -y review.mp4
```

`-c:a copy` matters: the audio stays **bit-identical** to the master, which is
the whole point when the audio is what is being reviewed. ~11 MiB, 6 seconds.
Always say that the sent file is a review copy, and keep the master to hand.

## Keep the recipe

The Dubai bed's build recipe was never committed, and recovering it cost a full
session of reverse-engineering — RMS-envelope cross-correlation to find the
source offset (8.00 s), then dividing the shipped bed by the EQ'd source to
recover the gain envelope.

**Every generated asset gets a committed script that regenerates it.** The Paris
reel's is `build/build_beds.py`. Back up the original as `.old` on first write
and never overwrite that backup on a later pass, or the only copy of the
original becomes a copy of your own previous attempt.

## Long jobs

Run genuinely long things (a real render) in the background and get notified,
rather than blocking. Never poll with `sleep`.
