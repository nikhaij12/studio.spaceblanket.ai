#!/usr/bin/env python3
"""Rebuild both music beds on the coexistence chain and remux the finished reel.

Dubai gets Bad Life from 0:00.5 (the version that was picked). Paris keeps Inspector
Bernard from 0:53 but is rebuilt, because it still carried the old chain: a
three-bell EQ summing to a two-octave scoop, and a ratio-4 duck with no depth
limit that made the bed an inverted copy of the syllable envelope.

Both beds now get the same treatment:
  - duck depth CAPPED via sidechaincompress mix (max duck = 20*log10(1-mix));
    mix=0.28 is a hard -2.85 dB floor, so the bed holds still instead of
    breathing in anti-sync with the voice and getting welded to it.
  - key band-limited to 200-4000 Hz so breaths and plosives cannot trigger a dip
  - one shallow wide bell at 2 kHz instead of the old three
  - stereotools=slev 1.35 (free: mono sum is unchanged)

Two things differ per track, because the tracks differ:
  - Bad Life is 77% sub, so it gets a 110 Hz highpass and an -8 dB shelf.
  - Inspector Bernard is 45% sub with 29% above 500 Hz, so it only needs 70 Hz
    and -6 dB. Sweeping it, that lands both beds at a similar balance (5.5% vs
    9.2% sub) without thinning a track that has legitimate low-mid content.

Level: both beds are normalised to the SAME integrated loudness, which is what
"almost the same volume between the first part and the second part" asks for.
-35.8 LUFS is 0.9 dB below the -34.9 of the approved clip, i.e. the 10% quieter
asked for on top of it.

The Paris bed keeps its original fades and its end bloom -- the bed lifts 3.5 dB
once the last word lands. That happens after the voice has stopped, so it does
not reintroduce the co-modulation the capped duck removed.

No video re-render. The render's audio was verified to be a plain unity sum of
its <audio> elements, so the video stream is copied untouched and only the audio
is rebuilt. STEP 1 proves that end-to-end by reassembling the CURRENT mix from
the current media and correlating it against the shipped master before anything
is changed.
"""
import os
import re
import shutil
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
# The project folder is the one the studio names in its opening message: set it
# in REEL_PROJECT_DIR, pass it as argv[1], or run from inside it.
PROJ = os.path.abspath(os.environ.get("REEL_PROJECT_DIR")
                       or (sys.argv[1] if len(sys.argv) > 1 else os.getcwd()))
MEDIA = os.path.join(PROJ, "reel", "media")
OUTDIR = os.path.join(PROJ, "reel", "out")
MASTER = os.path.join(OUTDIR, "paris_reel.mp4")
# The licensed tracks live in the studio's shared music/ folder, one level above
# projects/. Point REEL_MUSIC_DIR somewhere else if yours are kept elsewhere.
MUSIC = (os.environ.get("REEL_MUSIC_DIR")
         or os.path.join(os.path.dirname(os.path.dirname(PROJ)), "music"))
VO = os.path.join(MEDIA, "vo_mix.m4a")
WORK = os.path.join(HERE, "final")
SR = 48000
PRIMING = 1024
# The composition declares 55.93, but the render is 1678 frames at 30 fps =
# 55.93333. Trimming the audio to 55.93 and muxing with -shortest costs the
# final video frame, so the audio is cut to the video's real length instead.
FRAMES = 1678
DURATION = FRAMES / 30.0

# The composition's audio layout, read off reel/index.html.
BED_DUBAI_AT, BED_DUBAI_LEN = 0.00, 15.915
BED_PARIS_AT, BED_PARIS_LEN = 15.10, 40.83
SFX = [("sfx_whoosh.m4a", 6.90), ("sfx_swell.m4a", 15.20), ("sfx_swell.m4a", 50.50)]

# Paris bed internals, carried over from build/build_audio.py (SHIFT = 0.27).
LIFT_AT = 38.23
FADE_AT = 39.63

TARGET_I = -35.8            # both beds, same loudness
PHONE = "highpass=f=500:poles=2,highpass=f=500:poles=2,lowpass=f=9000"
DUCK = ("sidechaincompress=threshold=0.020000:ratio=6:attack=40:release=2000"
        ":knee=6:detection=rms:link=maximum:makeup=1:level_sc=1:mix=%g")

BEDS = {
    "dubai": dict(track="Bad Life Instrumental by Jimmy Curtis.mp3", ss=0.511,
                  length=BED_DUBAI_LEN, hp=110, shelf=-8.0, key_ss=0.0),
    "paris": dict(track="Inspector Bernard by Louis Adrien.mp3", ss=53.0,
                  length=BED_PARIS_LEN, hp=70, shelf=-6.0, key_ss=BED_PARIS_AT),
}


def run(a):
    r = subprocess.run(a, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit("ffmpeg failed")
    return r.stderr


def pcm(p, dur=None, ss=None, af=None):
    c = ["ffmpeg", "-v", "error"]
    if ss:
        c += ["-ss", "%.5f" % ss]
    if dur:
        c += ["-t", "%.5f" % dur]
    c += ["-i", p]
    if af:
        c += ["-af", af]
    return np.frombuffer(subprocess.run(
        c + ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True).stdout, dtype=np.float32).astype(np.float64)


def meta(p, dur=None):
    c = ["ffmpeg", "-nostats"] + (["-t", "%.4f" % dur] if dur else []) + \
        ["-i", p, "-filter_complex", "ebur128=peak=true", "-f", "null", "/dev/null"]
    e = run(c)
    t = e[e.rfind("Summary"):]
    i = re.search(r"I:\s*(-?[\d.]+) LUFS", t)
    tp = re.findall(r"Peak:\s*(-?[\d.]+) dBFS", t)
    return (float(i.group(1)) if i else None), (float(tp[-1]) if tp else None)


def dur_of(p):
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
         "csv=p=0", p], capture_output=True, text=True).stdout.strip())


# ── assembly ────────────────────────────────────────────────────────────────
def assemble(bed_dubai, bed_paris, dest_audio):
    """Sum the composition's audio elements exactly as the renderer does."""
    ins, parts, labels = [], [], []
    ins += ["-i", VO]
    parts.append("[0:a]aformat=sample_rates=%d:channel_layouts=stereo[v]" % SR)
    labels.append("[v]")
    for n, (path, at) in enumerate([(bed_dubai, BED_DUBAI_AT),
                                    (bed_paris, BED_PARIS_AT)] +
                                   [(os.path.join(MEDIA, f), t) for f, t in SFX],
                                   start=1):
        ins += ["-i", path]
        lab = "[x%d]" % n
        d = ("aformat=sample_rates=%d:channel_layouts=stereo" % SR) + (
            ",adelay=delays=%.4f|%.4f" % (at * 1000, at * 1000) if at > 0 else "")
        parts.append("[%d:a]%s%s" % (n, d, lab))
        labels.append(lab)
    parts.append("%samix=inputs=%d:duration=longest:normalize=0[s]"
                 % ("".join(labels), len(labels)))
    parts.append("[s]adelay=delays=%dS:all=1,atrim=0:%.5f,asetpts=N/SR/TB[o]"
                 % (PRIMING, DURATION))
    run(["ffmpeg", "-v", "error"] + ins + ["-filter_complex", ";".join(parts),
        "-map", "[o]", "-c:a", "pcm_f32le", "-y", dest_audio])


def step1_validate():
    """Reassemble the CURRENT mix and check it against the shipped master."""
    print("STEP 1  validate the assembly against the shipped master")
    tmp = os.path.join(WORK, "recon_old.wav")
    assemble(os.path.join(MEDIA, "bed_dubai.m4a"),
             os.path.join(MEDIA, "bed_paris.m4a"), tmp)
    a = pcm(MASTER, DURATION)
    b = pcm(tmp, DURATION)
    n = min(len(a), len(b))
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    r = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-20))
    lag = int(np.argmax(np.abs(np.correlate(a[:SR * 6], b[:SR * 6], "full")))) - (SR * 6 - 1)
    g = 20 * np.log10(np.linalg.norm(a) / (np.linalg.norm(b) + 1e-20))
    print("   reconstruction vs master: r = %.5f, lag = %d samples, gain %+.2f dB"
          % (r, lag, g))
    if r < 0.99 or abs(lag) > 2:
        raise SystemExit("assembly does not reproduce the master -- stop")
    print("   OK: summing the elements reproduces the render, so no re-render "
          "is needed\n")
    os.remove(tmp)


# ── beds ────────────────────────────────────────────────────────────────────
def bed_graph(spec, gain, mix, paris):
    pre = ["aformat=sample_rates=%d:channel_layouts=stereo" % SR,
           "highpass=f=%d:poles=2" % spec["hp"],
           "bass=frequency=200:width_type=q:width=0.7:gain=%g" % spec["shelf"],
           "treble=frequency=6000:width_type=q:width=0.7:gain=1.5",
           "equalizer=f=2000:width_type=q:w=0.9:g=-2.5",
           "stereotools=slev=1.35",
           "volume=%.4fdB" % gain]
    L = spec["length"]
    if paris:
        # Original tail behaviour preserved: the bed blooms 3.5 dB once the last
        # word lands, then fades on the final frame. Scripted volume in the page
        # itself triggers a renderer probe pass that drops the bed 20-30 dB in
        # patches, so it is baked in here.
        tail = ("volume='if(lt(t,%.5f),1,if(lt(t,%.5f),1+(t-%.5f)*0.496,1.496))'"
                ":eval=frame,afade=t=in:st=0.30:d=1.0,afade=t=out:st=%.5f:d=1.20"
                % (LIFT_AT, LIFT_AT + 1.0, LIFT_AT, FADE_AT))
    else:
        tail = "afade=t=in:st=0:d=0.15,afade=t=out:st=%.3f:d=0.415" % (L - 0.415)
    return ";".join([
        "[0:a]%s[m]" % ",".join(pre),
        "[1:a]aformat=sample_rates=%d:channel_layouts=stereo,"
        "highpass=f=200:poles=1,lowpass=f=4000:poles=1,apad[k]" % SR,
        "[m][k]%s[d]" % (DUCK % mix),
        "[d]atrim=0:%.5f,asetpts=N/SR/TB,%s[out]" % (L, tail)])


def render_bed(spec, gain, mix, dest, paris):
    a = ["ffmpeg", "-v", "error",
         "-ss", "%.5f" % spec["ss"], "-t", "%.5f" % (spec["length"] + 2),
         "-i", os.path.join(MUSIC, spec["track"])]
    if spec["key_ss"]:
        a += ["-ss", "%.5f" % spec["key_ss"]]
    a += ["-t", "%.5f" % (spec["length"] + 2), "-i", VO,
          "-filter_complex", bed_graph(spec, gain, mix, paris), "-map", "[out]"]
    a += (["-c:a", "pcm_f32le"] if dest.endswith(".wav")
          else ["-c:a", "aac", "-b:a", "192k"])
    run(a + ["-y", dest])
    d = dur_of(dest)
    if abs(d - spec["length"]) > 0.05:
        raise SystemExit("truncated %s: %.3f != %.3f" % (dest, d, spec["length"]))


def duck_movement(spec, gain, paris):
    """Max gain movement inside any 250 ms window, per band.

    Measured only while the voice is actually speaking. The Paris bed outlives
    the voiceover by ~2 s, and when the key goes silent the ducker releases all
    the way back to unity -- a single 2.4 dB ramp that a naive max-over-the-
    whole-bed reads as 1.8 dB of "pumping". That release is the bed coming back
    up at the end of the story, which is wanted, and it happens under no speech
    at all, so it cannot co-modulate with anything. The number that matters is
    how much the bed moves WHILE the voice is talking.
    """
    a_p, b_p = os.path.join(WORK, "_a.wav"), os.path.join(WORK, "_b.wav")
    render_bed(spec, gain, 0.28, a_p, paris)
    render_bed(spec, gain, 0.0, b_p, paris)      # mix=0 is an exact identity
    # last speech is at 53.93 on the composition timeline
    end = min(spec["length"] - 0.6, 53.93 - spec["key_ss"])
    worst, depth = 0.0, 0.0
    for lo, hi in ((None, 150), (400, 3000), (7000, None)):
        af = ",".join(([("highpass=f=%g:poles=2" % lo)] if lo else [])
                      + ([("lowpass=f=%g:poles=2" % hi)] if hi else [])) or None
        a, b = pcm(a_p, spec["length"], af=af), pcm(b_p, spec["length"], af=af)
        n = min(len(a), len(b))
        w = int(0.05 * SR)
        m = n // w
        ea = np.sqrt((a[:m * w].reshape(m, w) ** 2).mean(axis=1) + 1e-20)
        eb = np.sqrt((b[:m * w].reshape(m, w) ** 2).mean(axis=1) + 1e-20)
        g = 20 * np.log10(ea / eb)[6:int(end / 0.05)]
        worst = max(worst, max(float(g[i:i + 5].max() - g[i:i + 5].min())
                               for i in range(len(g) - 5)))
        depth = max(depth, float(-g.mean()))
    for p in (a_p, b_p):
        os.remove(p)
    return depth, worst


def build_bed(name, dest):
    spec = BEDS[name]
    paris = name == "paris"
    probe = os.path.join(WORK, "_p.wav")
    render_bed(spec, -20.0, 0.28, probe, paris)
    gain = -20.0 + (TARGET_I - meta(probe)[0])
    os.remove(probe)
    render_bed(spec, gain, 0.28, dest, paris)
    i, tp = meta(dest)
    depth, move = duck_movement(spec, gain, paris)
    tot = (pcm(dest, spec["length"]) ** 2).mean()
    sh = lambda af: 100 * (pcm(dest, spec["length"], af=af) ** 2).mean() / tot
    print("   %-6s %-38s I %.1f LUFS  peak %.1f  duck %.2f dB  move %.2f/250ms"
          % (name, spec["track"][:38], i, tp, depth, move))
    print("          sub %.1f%%  body %.1f%%  mid %.1f%%  ident %.1f%%"
          % (sh("lowpass=f=120"), sh("highpass=f=120,lowpass=f=300"),
             sh("highpass=f=300,lowpass=f=3500"),
             sh("highpass=f=250,lowpass=f=800")))
    return dict(name=name, I=i, peak=tp, duck=depth, move=move, gain=gain)


def main():
    os.makedirs(WORK, exist_ok=True)
    step1_validate()

    print("STEP 2  build both beds on the coexistence chain, matched loudness")
    new_dubai = os.path.join(WORK, "bed_dubai.m4a")
    new_paris = os.path.join(WORK, "bed_paris.m4a")
    rows = [build_bed("dubai", new_dubai), build_bed("paris", new_paris)]
    print("   loudness match between the two halves: %.2f dB apart\n"
          % abs(rows[0]["I"] - rows[1]["I"]))

    print("STEP 3  assemble and mux")
    mixwav = os.path.join(WORK, "mix.wav")
    assemble(new_dubai, new_paris, mixwav)
    i, tp = meta(mixwav)
    print("   full mix: %.1f LUFS, true peak %.1f dBTP" % (i, tp))
    if tp > -0.3:
        raise SystemExit("mix is too hot")

    dest = os.path.join(WORK, "paris_reel.mp4")
    run(["ffmpeg", "-v", "error", "-i", MASTER, "-i", mixwav,
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-y", dest])

    # video must be bit-identical to the master, audio must not be
    def vhash(p):
        return subprocess.run(
            ["ffmpeg", "-v", "error", "-i", p, "-map", "0:v:0", "-f", "md5", "-"],
            capture_output=True, text=True).stdout.strip()
    print("   video stream unchanged: %s" % (vhash(dest) == vhash(MASTER)))
    fi, ftp = meta(dest)
    nf = subprocess.run(["ffprobe", "-v", "error", "-count_frames",
                         "-select_streams", "v:0", "-show_entries",
                         "stream=nb_read_frames", "-of", "csv=p=0", dest],
                        capture_output=True, text=True).stdout.strip()
    print("   final: %.3f s, %s frames, %.1f LUFS, %.1f dBTP, %.1f MB"
          % (dur_of(dest), nf, fi, ftp, os.path.getsize(dest) / 1e6))

    print("\nSTEP 4  install into the project")
    for src, name in ((new_dubai, "bed_dubai.m4a"), (new_paris, "bed_paris.m4a")):
        tgt = os.path.join(MEDIA, name)
        shutil.copy2(tgt, tgt + ".old")
        shutil.copy2(src, tgt)
        print("   %s  (previous kept as %s.old)" % (name, name))
    shutil.copy2(MASTER, MASTER + ".old")
    shutil.copy2(dest, MASTER)
    print("   out/paris_reel.mp4  (previous kept as paris_reel.mp4.old)")


if __name__ == "__main__":
    main()
