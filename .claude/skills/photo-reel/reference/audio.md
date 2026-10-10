# Audio for a photo reel

Three tracks: the voiceover, one or two music beds, and a couple of SFX. All of
them get their levels and fades **baked into the files**. Nothing is scripted in
the page.

## Rule zero: no scripted volume

Every `<audio>` element plays at `data-volume="1"` with no GSAP volume tween.

A bed asked for at `data-volume="0.10"` came back **20-30 dB down in patches**
of a full render while an identical audio-only probe was clean. The renderer
runs a probe pass that re-reads element volume, and the two disagree. So the
renderer only ever mixes files that are already at the right level: fades,
ducking, and blooms all live inside the `.m4a`.

## Step 1 - probe before you filter

```bash
python3 scripts/voice_probe.py take.m4a
```

It reports channels, loudness, every gap, and a speech-vs-room spectrum. Read
all four before choosing a single filter.

### The one-ear trap

Phone and camera takes are frequently **4-channel** with signal in exactly one
channel and digital silence in the other three. Browsers fold multichannel to
stereo by pairing channels to sides, so a voice living in front-right comes out
of the right speaker and nothing else. A real reel shipped this way measured
**L -38.7 dB / R -21.1 dB**.

The fix is not a pan. Take the one live channel to mono and fan it to dual-mono
stereo — and do that **before** loudnorm, because R128 sums channel energies and
a mono stream fanned out afterwards lands **3 dB over target**.

Check it survived the encode:

```bash
ffmpeg -i vo.m4a -filter_complex "[0:a]pan=mono|c0=0.5*c0-0.5*c1,volumedetect" -f null -
```

The difference signal's **mean** should be ~65 dB below the peak. Its *max* can
read much higher (-19 dB is normal) — that is AAC quantisation on a transient,
not an imaging problem. Judge by the mean.

### Work from the raw take, not the previous mix

If true peak is at or above 0 dBTP the file has been gained into clipping.
Rebuild from the original and use `scripts/align_takes.py` to find where the old
mix started inside it, so caption onsets tuned against the mix still line up:

```bash
python3 scripts/align_takes.py old_mix.m4a raw.m4a --guess 3.7 --window 0.5 --channel 1
```

Two independent phrases must agree to a millisecond or two.

## Step 2 - clean it

```bash
python3 scripts/voice_clean.py raw.m4a media/vo.m4a --channel 1 \
  --offset 3.695 --length 54.2 --target-lufs -16.7
```

The chain, and why each part is there — every one of these answered a
measurement on a close-mic phone take:

| Stage | Why |
|---|---|
| `pan=mono\|c0=cN` | only one channel carries signal |
| `volume=21dB` | into a range where the expander's absolute threshold means something; leaves headroom for the EQ lifts |
| `highpass=75` | the 20-60 Hz band measured **1.5 dB of SNR** — pure rumble |
| `-3.5 dB @ 190` | 90-450 Hz sat within 2.6 dB of the peak: proximity boom |
| `-2.0 dB @ 430` | boxiness, the part of "roominess" that is tone not tail |
| `+4.0 dB @ 2300` | 700-1700 Hz measured 19-21 dB down — intelligibility lives here |
| `-3.0 dB @ 5200` | 4-6 kHz ran hotter than 2.6-4 kHz: sibilance |
| `deesser` | what's left of the ess after the static cut |
| `agate` (expander) | drops room tone in the gaps ~20 dB. **This is the "noise cleanup" people actually hear.** |
| `+1.5 dB @ 10500` | air, after the expander so it lifts voice not floor |
| `alimiter` | peak safety |
| `pan=stereo` then two-pass `loudnorm` | centre, then level |

### Two stages that lose, and should stay out

- **Denoiser (`afftdn`)** — cost **1-4 dB of SNR** on a ~29 dB SNR source. Its
  spectral splatter measures louder than the hiss it removes. Every variant
  tested (nr 8/16/18, nf -42/-52/-60, tracking on and off) came out behind the
  chain without it.
- **Compressor** — a phone take arrives at LRA 3.6, already even. There is
  nothing to level, and **any makeup gain lifts room tone one-for-one**. Adding
  one cost 3.4 dB of noise floor for no audible gain.

Add a compressor only for a genuinely uneven take, and put it **before** the
expander, never after — an expander ahead of makeup gain closes on a floor that
gets lifted straight back up. That ordering mistake cost 4.6 dB of SNR on the
first attempt.

### Tuning the expander safely

The expander is the one aggressive stage, so verify it is not eating quiet
speech. Measure low-level-but-real speech (word tails, unstressed syllables,
onsets) with the expander in and out: they should read **identical**. On a take
whose quietest syllable sits at -31 dB, a -37.7 dB threshold cleared it with
room to spare and still pulled the gaps from -53 to -73 dBFS.

If quiet speech does move, raise `range` (less reduction) before lowering
`threshold`.

### Hum

50/60 Hz mains hum shows up in room tone as a strong narrow spike. Check its
**absolute** level before reacting: at -62 dBFS against speech at -17 it is 45 dB
down and inaudible, and notching it costs more than it saves because the
harmonics sit on top of the voice fundamental. Leave it.

## Step 3 - the music beds

> The chain below **replaced** an earlier one (a three-bell carve at 300/1600/
> 3200 plus `threshold=0.06:ratio=4:attack=20:release=400`). The verdict on
> that one was that the music and the voice were "at battle with each other".
> Do not reintroduce it. What follows is what fixed it, measured.

### Why beds sound "at battle", and it is not frequency

The instinct is that bed and voice overlap in frequency and need separating with
EQ. That is a small part of it. The dominant fault is **co-modulation**:

- Speech's loudness rises and falls at the **syllable rate, 4-5 Hz**.
- A ratio-driven ducker makes the bed's level an **inverted copy** of that.
- Human sensitivity to amplitude modulation **peaks over 2-10 Hz**, with a
  detection threshold near **0.5 dB peak-to-trough** (Viemeister 1979).
- Gestalt **common fate** then does the damage: components that modulate
  together are heard as *one source*. A bed breathing in anti-sync with a voice
  is not heard behind it — it is perceptually welded to it.

The shipped-and-rejected bed measured **13.7 dB of swing, reversing direction
6.5 times a second** — about 24 dB past the threshold of noticing, at the worst
possible rate. Videos where music and speaker are both clearly audible are not
doing clever spectral tricks. **The music holds still.**

### The chain

1. **Cap the duck's DEPTH, never drive it with ratio.** ffmpeg has no range or
   hold control, but `mix` is exactly one: the filter computes
   `out = in*((1-mix) + mix*g)`, so the duck can never exceed `20*log10(1-mix)`
   however loud the voice gets. `mix=0.28` is a hard **-2.85 dB floor**. Pair it
   with a ratio high enough to saturate and a level-follower becomes what a
   broadcast ducker actually is: a fixed dip that is either in or out.

   ```
   sidechaincompress=threshold=0.02:ratio=6:attack=40:release=2000:knee=6
     :detection=rms:link=maximum:makeup=1:level_sc=1:mix=0.28
   ```

   Measured result: **2.44 dB of duck, 0.44 dB of movement in any 250 ms
   window** — at the threshold of being perceptible at all, down from 13.0.

2. **Band-limit the KEY** to 200-4000 Hz before it reaches the sidechain, so
   breaths and plosive thumps cannot trigger a dip:
   `highpass=f=200:poles=1,lowpass=f=4000:poles=1,apad`

3. **One shallow wide bell, not three.** `equalizer=f=2000:w=0.9:g=-2.5`, aimed
   at the 1-4 kHz region that carries 59% of speech intelligibility
   (ANSI/ASA S3.5 band importance). Plus a **low shelf** instead of a 300 Hz
   bell, and a little air: `bass=f=200:w=0.7:g=-5..-8`,
   `treble=f=6000:w=0.7:g=1.5`.

   **Always plot the COMPOSITE.** Bells overlap and sum. The three old bells
   summed to -5.19 dB at 1716 Hz and stayed >=3 dB down continuously from
   970 Hz to 4035 Hz — a two-octave trench through the region that tells the ear
   *which instrument is playing*. What survived was sub-bass and a little air,
   i.e. exactly the indistinct rumble that gets complained about.

4. **Widen with `stereotools=slev=1.35`.** This is free rather than a trade: a
   mono speaker reproduces `(L+R)/2 = M` and `slev` scales only `S`, so the mono
   sum is bit-identical (measured delta 7e-9). Stereo listeners gain, mono
   listeners lose nothing.

5. **A bloom and a fade**, as `volume=...:eval=frame` plus `afade`, so the music
   comes back up once the last word lands and fades out on the final frame. This
   happens *after* the voice stops, so it cannot co-modulate with anything.

### Level

The bed sits **15-20 LU under the voice**; solve the gain to hit a target LUFS
rather than dialling a dB figure. **Multiple beds in one reel are normalised to
the same absolute LUFS**, which is what "same volume in both halves" means.

Be honest that this is a taste call. The literature (Torcoli et al., JAES
67(12):1003-1011, 2019) gives **10 LU as a MINIMUM and sets no upper bound**, and
found non-experts prefer *more* separation than experts, with an IQR of 5.7 LU.
Build two levels and let them pick. On the Paris reel it walked 15 -> 18 ->
20.4 LU over three rounds, each time by asking for a percentage.

Convert those percentages as **amplitude**: "30% quieter" = 0.7 = -3 dB,
"10% quieter" = -0.9 dB, "15% quieter" = -1.4 dB.

### Picking the music window

**Never score a window for having LOW energy in the voice band.** It is a
reasonable-sounding rule that produces beds which are 75-86% sub-bass — and a
phone speaker reproduces almost nothing below ~500 Hz, so the result is a rumble,
not music. Score for the opposite: energy **above** 500 Hz, tonality
(1 - spectral flatness), and warmth in 150-500 Hz.

If the comparison clips are short, the windows must differ **in the first 5
seconds** or the test tells you nothing — three slices of the same loop sound
identical however different second 12 is.

### The low end is per track, and its payoff is not what you would guess

Sub-heavy tracks need a real highpass, not just a shelf. Bad Life measured 79%
below 120 Hz (40-67% in 20-60 Hz alone); Inspector Bernard 45%. They got
`highpass=110 + shelf -8` and `highpass=70 + shelf -6` respectively, which put
both at 5-9% sub and 60-69% midrange.

**But do not oversell it.** Because the bed is loudness-normalised and
K-weighting already discounts bass, stripping the sub and renormalising buys only
**~1.2 dB** more audible bed on a phone, and the timbre above 500 Hz is unchanged
(ERB distance 0.06 dB). Its real payoff is **7-9 dB cleaner 60-120 Hz under the
voice on earbuds**, plus the bed stops spending its level budget on energy a
phone throws away.

Likewise, do not claim a highpass "clears the voice's fundamental" without
measuring. The Paris reel's voice has an F0 of **median 103 Hz**, 60% of voiced
frames in 90-120 Hz, and a properly-levelled bed is already ~18 dB below it there.

### Measuring a bed honestly

Render the bed **twice** — once at `mix=0.28`, once at `mix=0.0` (an exact
identity, `out = in*(1+0*g)`) — and divide. That cancels the music and leaves the
ducker's gain alone. Comparing against a bypassed copy instead measures the
filter chain's phase and reads it as ducking.

Then judge on the right statistic:

- **Max movement in 250 ms is misleading on its own.** A bed that dips once at
  the start of a sentence and releases in the gap after it is a ducker doing its
  job. On the Paris bed that read 1.92 dB and looked like a failure; only **0.8%
  of windows** exceeded 0.5 dB.
- **The number that matters is 2-10 Hz.** RMS of the gain's movement in that
  band: **0.029 dB (Dubai) / 0.038 dB (Paris)**, against a ~0.18 dB RMS threshold
  of audibility. Also report correlation of the gain with the voice envelope —
  that *is* co-modulation. It fell from -0.16/-0.26 to -0.01/-0.02.
- Measure **per band**, not broadband. A band-limited duck holds the mid at a
  near-constant offset while leaving the lows alone; measured broadband, the
  ratio wanders with the music's own spectral balance and that gets misread as
  pumping.
- Probe **well inside** each band. `acrossover` is 24 dB/oct, so a 12 dB/oct
  measurement filter sitting on the crossover frequency passes the neighbouring
  band and reports its ducking as bleed.

**Multiband ducking lost a head-to-head.** Splitting with `acrossover` and
ducking only 250-5000 Hz measured 0.8-1.6 dB of within-band movement against the
capped broadband duck's 0.44, and added a Linkwitz-Riley phase rotation for it.
Once the depth is capped there is nothing left for band-splitting to protect. The
band-limited *key* still matters and is kept.

### Rebuilding

Because the duck is keyed off the voice, **a new voiceover means a new bed.**
If you cut the voice, every bed-local time after the cut moves up by the same
amount, and the bed's `atrim` length shrinks by it.

But **changing a bed's LEVEL does not require re-measuring the duck.**
`sidechaincompress` derives its gain from the key, and the key is the untouched
voice, so the gain trajectory is bit-identical at any music gain. Skipping that
re-measurement removed two full renders per bed from the loop.

A bed that ends before a voice cut does not need rebuilding as long as the new
voice matches the old integrated loudness — match `--target-lufs` to the old
value and the ducking still lines up.

## Step 4 - simulate the mix before rendering

```bash
python3 scripts/mix_sim.py reel/index.html --compare reel/out/previous.mp4 \
  --probe 3,1 --probe 20,1 --probe 47.5,1
```

It reads the `<audio>` elements straight out of the composition, sums them with
the same starts and durations, and reports L/R balance, LUFS, true peak, and any
element that runs past the composition end. Seconds instead of a twelve-minute
render, and it has caught every audio mistake so far.

Target roughly **-16 to -17 LUFS integrated** and keep true peak under -1 dBTP.
Instagram normalises anyway, so matching the balance the client already approved
matters more than hitting a number.

## Cutting a pause

Find it with the probe's gap map, then:

```bash
python3 scripts/voice_clean.py raw.m4a media/vo.m4a --channel 1 \
  --offset 3.695 --length 54.2 --cut 47.25,47.49
```

It crossfades the seam (30 ms hides a room-level step without smearing a breath)
and prints the shift to apply to everything after that point.

Choosing the slice: keep the breath. A breath before a new sentence reads as
delivery; cutting it out entirely reads as a jump. Splice in the dead air on
either side of it. Verify the seam afterwards — the RMS through the splice
should descend smoothly with no spike.

**Usually the pause is not the real problem.** A caption firing before the word
is spoken reads as a much longer stall than the silence actually is. Fix the
caption timing first, then trim the pause to taste.

## ffmpeg traps that cost real time

- **`-v error` suppresses `volumedetect`, `silencedetect` and `astats` output.**
  They print at info level. Never quiet ffmpeg when you are measuring.
- **`silencedetect` keys off peak**, so a room with a high floor never trips it
  and you conclude there are no pauses. Use an RMS envelope instead.
- **`acompressor`'s `makeup` is a linear multiplier (1..64), not dB.** `makeup=0`
  is invalid and the filter graph fails to build.
- **`highpass`/`lowpass` `poles` only accepts 1 or 2.** `p=4` errors out.
- **`-ss` before `-i` on an mp3** can land short; prefer decoding to wav first
  when sample accuracy matters.
- **`sidechaincompress` silently TRUNCATES its output** when the key is shorter
  than the main input. Put `apad` on the key, and assert the rendered bed's
  duration afterwards — it fails quietly, not loudly.
- **`sidechaincompress`'s `threshold` is LINEAR amplitude, not dB.** 0.02 is
  about -34 dBFS. Its `release` is divided by 4 internally, so `release=2000`
  is a ~500 ms time constant. Ratios above ~6 are nearly inert.
- **`adynamicequalizer` has no sidechain input** — single input only. It cannot
  be used for frequency-selective ducking against a voice.
- **`acrossover` is magnitude-flat but allpass in phase** (Linkwitz-Riley), so a
  time-domain null test against a bypassed copy is *supposed* to fail. Use
  `mix=0` on the compressor as the identity reference instead.
- **`acrossover`'s `gain` option was renamed `gains` in ffmpeg 8.x.**
- **`-shortest` on a mux will drop the final video frame** if the audio was
  trimmed to the composition's declared duration rather than the render's real
  one. A 1678-frame render is 55.9333 s, not the 55.93 the HTML declares. Cut
  audio to `frames/fps` and drop `-shortest`.
- **zsh does not word-split unquoted variables.** `set -- $b` in a loop needs
  `set -- ${=b}`.
- **`cat -A` does not exist on macOS.** To reveal invisible characters (screenshot
  filenames contain U+202F narrow no-break space, which breaks globs) use a
  Python `repr()` loop.
