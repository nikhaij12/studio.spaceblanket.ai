#!/usr/bin/env python3
"""Clean a voiceover take: fix the channel layout, EQ it, expand it, level it.

The chain here is the one that won on measurement for a close-mic phone take
(see reference/audio.md). Two stages an editor would reach for are deliberately
absent, and they should stay absent unless a probe says otherwise:

  no denoiser   afftdn cost 1-4 dB of SNR on a ~29 dB SNR source. Its spectral
                splatter measures louder than the hiss it removes. The expander
                does the audible work - silence between words - for free.
  no compressor Phone takes arrive pre-levelled (LRA under 4 LU). There is
                nothing to even out, and any makeup gain lifts room tone
                one-for-one. Add one only for a genuinely uneven take, and put
                it BEFORE the expander so the expander still sees the final
                floor.

Order matters more than the numbers: the expander runs LAST (before the air
lift and limiter), because an expander placed ahead of any makeup gain closes
on a floor that later gets lifted right back up.

Usage:
  voice_clean.py RAW.m4a OUT.m4a --channel 1 --offset 3.695 --length 54.2
  voice_clean.py RAW.m4a OUT.m4a --channel 1 --cut 47.25,47.49
  voice_clean.py RAW.m4a OUT.m4a --channel 1 --target-lufs -16.7 --gain 21

--cut START,END removes a slice (times measured in the TRIMMED take, i.e. after
--offset) and crossfades the seam. It prints the resulting shift so the
composition's shot and caption times after that point can be moved up by it.
"""
import argparse
import os
import re
import subprocess
import sys


def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit("ffmpeg failed")
    return r.stderr


def voice_chain(ch, gain, hp, expander):
    return ",".join([
        # Take the one live channel. Everything downstream is mono until the
        # dual-mono fan-out at the end.
        "pan=mono|c0=c%d" % ch,
        # Into a working range where the expander's absolute threshold means
        # something. Leave headroom for the EQ lifts.
        "volume=%gdB" % gain,
        # Rumble and handling. Nothing musical lives below this on a voice.
        "highpass=f=%g:poles=2" % hp,
        # Un-boom: close-mic proximity piles up 90-450 Hz.
        "equalizer=f=190:width_type=q:w=0.9:g=-3.5",
        # Boxiness - the part of "roominess" that is tone rather than tail.
        "equalizer=f=430:width_type=q:w=1.1:g=-2.0",
        # Fill the 700-1700 scoop. Intelligibility lives here.
        "equalizer=f=2300:width_type=q:w=0.75:g=4.0",
        # Pre-tame sibilance so the de-esser can stay gentle enough to leave
        # the consonants intact.
        "equalizer=f=5200:width_type=q:w=1.5:g=-3.0",
        "deesser=i=0.35:m=0.5:f=0.35",
        # Downward expander, last: this is what makes the pauses go quiet.
        expander,
        # Air, after the expander so it lifts voice rather than what was just
        # pushed down.
        "equalizer=f=10500:width_type=q:w=0.7:g=1.5",
        "alimiter=limit=0.891:attack=5:release=50",
        "aresample=48000",
        # Dual mono, BEFORE loudnorm: R128 sums channel energies, so fanning a
        # mono stream to two channels afterwards lands 3 dB over target.
        "pan=stereo|c0=c0|c1=c0",
    ])


def measure(path, chain, target_i, target_tp):
    """First pass of a two-pass loudnorm. Single-pass drifts on short files."""
    err = run(["ffmpeg", "-i", path, "-filter_complex",
               "[0:a]%s,loudnorm=I=%s:TP=%s:print_format=json"
               % (chain, target_i, target_tp), "-f", "null", "-"])
    keys = ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset")
    got = {}
    for k in keys:
        m = re.search(r'"%s"\s*:\s*"(-?[\d.inf]+)"' % k, err)
        if not m:
            raise SystemExit("loudnorm did not report %s" % k)
        got[k] = m.group(1)
    return got


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("out")
    ap.add_argument("--channel", type=int, default=0)
    ap.add_argument("--offset", type=float, default=0.0,
                    help="seconds into the raw file where the take starts")
    ap.add_argument("--length", type=float, default=None)
    ap.add_argument("--cut", default=None, metavar="START,END",
                    help="remove this slice (times in the trimmed take)")
    ap.add_argument("--xfade", type=float, default=0.030)
    ap.add_argument("--gain", type=float, default=21.0)
    ap.add_argument("--highpass", type=float, default=75.0)
    ap.add_argument("--target-lufs", type=float, default=-16.7)
    ap.add_argument("--target-tp", type=float, default=-1.5)
    ap.add_argument("--expander",
                    default="agate=threshold=0.013:ratio=2.5:attack=8"
                            ":release=120:range=0.10")
    ap.add_argument("--keep-wav", action="store_true")
    a = ap.parse_args()

    trim = "atrim=%.5f" % a.offset
    if a.length:
        trim += ":%.5f" % (a.offset + a.length)
    trim += ",asetpts=N/SR/TB"
    chain = "%s,%s" % (trim, voice_chain(a.channel, a.gain, a.highpass, a.expander))

    m = measure(a.raw, chain, a.target_lufs, a.target_tp)
    print("measured  I=%s LUFS  TP=%s dBTP  LRA=%s"
          % (m["input_i"], m["input_tp"], m["input_lra"]))
    norm = ("loudnorm=I=%s:TP=%s:measured_I=%s:measured_TP=%s:measured_LRA=%s"
            ":measured_thresh=%s:offset=%s:linear=true"
            % (a.target_lufs, a.target_tp, m["input_i"], m["input_tp"],
               m["input_lra"], m["input_thresh"], m["target_offset"]))

    stem = os.path.splitext(a.out)[0]
    wav = stem + "_clean.wav"
    run(["ffmpeg", "-v", "error", "-i", a.raw, "-filter_complex",
         "[0:a]%s,%s[o]" % (chain, norm), "-map", "[o]",
         "-c:a", "pcm_f32le", "-y", wav])

    src, shift = wav, 0.0
    if a.cut:
        c0, c1 = (float(x) for x in a.cut.split(","))
        shift = round(c1 - c0 + a.xfade, 5)
        cutwav = stem + "_cut.wav"
        # Crossfaded, not butt-spliced: the two edges usually sit at different
        # room levels and a few tens of ms hides the step without smearing.
        run(["ffmpeg", "-v", "error", "-i", wav, "-filter_complex",
             "[0:a]asplit=2[a][b];"
             "[a]atrim=0:%.5f,asetpts=N/SR/TB[x];"
             "[b]atrim=%.5f,asetpts=N/SR/TB[y];"
             "[x][y]acrossfade=d=%.4f:c1=tri:c2=tri[o]" % (c0, c1, a.xfade),
             "-map", "[o]", "-c:a", "pcm_f32le", "-y", cutwav])
        src = cutwav
        print("cut %.3f-%.3f -> SHIFT EVERYTHING AFTER %.3fs UP BY %.3fs"
              % (c0, c1, c1, shift))

    run(["ffmpeg", "-v", "error", "-i", src, "-c:a", "aac", "-b:a", "192k",
         "-y", a.out])
    if not a.keep_wav:
        for f in (wav, stem + "_cut.wav"):
            if os.path.exists(f) and f != src:
                os.remove(f)

    err = run(["ffmpeg", "-i", a.out, "-filter_complex",
               "[0:a]loudnorm=print_format=summary", "-f", "null", "-"])
    got = {k: re.search(re.escape(k) + r":\s*(-?[\d.]+)", err) for k in
           ("Input Integrated", "Input True Peak", "Input LRA")}
    print("wrote %s" % a.out)
    for k, v in got.items():
        if v:
            print("  %-18s %s" % (k, v.group(1)))
    lr = []
    for c in (0, 1):
        e = run(["ffmpeg", "-i", a.out, "-filter_complex",
                 "[0:a]pan=mono|c0=c%d,volumedetect" % c, "-f", "null", "-"])
        lr.append(float(re.search(r"mean_volume: (-?[\d.]+)", e).group(1)))
    print("  L %.1f  R %.1f dB%s"
          % (lr[0], lr[1], "  <-- NOT CENTRED" if abs(lr[0] - lr[1]) > 0.5 else ""))
    if shift:
        print("  duration shift: %.5f" % shift)
    return 0


if __name__ == "__main__":
    sys.exit(main())
