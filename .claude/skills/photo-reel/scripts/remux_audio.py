#!/usr/bin/env python3
"""Rebuild a reel's audio and swap it into the existing render. No re-render.

A HyperFrames render's audio is a plain unity sum of its <audio> elements --
verified on a delivered master at r=0.99886, zero lag, gain within 0.06 dB. So
any audio-only change (new bed, new level, new music, a re-cut voiceover) is a
remux rather than a render: 13 minutes becomes about 40 seconds, and the video
stream is copied bit-identically instead of being re-encoded, so nothing
degrades across revision rounds.

  # check the assumption holds for THIS composition, change nothing
  remux_audio.py reel/index.html reel/out/reel.mp4 --validate

  # rebuild the audio from the current media and swap it in
  remux_audio.py reel/index.html reel/out/reel.mp4

  # cut a short comparison clip instead of the whole reel
  remux_audio.py reel/index.html reel/out/reel.mp4 --clip 12 --out ab.mp4

Always run --validate first on a composition you have not remuxed before. If the
correlation does not come back above 0.99 at zero lag, something in the page is
not a plain sum (scripted volume, a filter, an effect) and you must render.
"""
import argparse
import os
import re
import subprocess
import sys

try:
    import numpy as np
except ImportError:
    sys.exit("needs numpy")

SR = 48000
# The renderer's AAC encoder delays the mix by one frame of priming samples.
# Reproduce it or every remuxed file sits ~21 ms early against the master.
PRIMING = 1024


def run(args, quiet=True):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        sys.stderr.write(r.stderr[-3000:])
        raise SystemExit("ffmpeg failed: %s" % " ".join(args[:10]))
    return r.stderr


def pcm(path, dur=None, af=None):
    c = ["ffmpeg", "-v", "error"] + (["-t", "%.5f" % dur] if dur else []) + \
        ["-i", path] + (["-af", af] if af else []) + \
        ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(c, capture_output=True).stdout,
                         dtype=np.float32).astype(np.float64)


def loudness(path):
    e = run(["ffmpeg", "-nostats", "-i", path, "-filter_complex",
             "ebur128=peak=true", "-f", "null", "/dev/null"])
    t = e[e.rfind("Summary"):]
    i = re.search(r"I:\s*(-?[\d.]+) LUFS", t)
    tp = re.findall(r"Peak:\s*(-?[\d.]+) dBFS", t)
    return (float(i.group(1)) if i else None), (float(tp[-1]) if tp else None)


def probe(path, *entries, stream=None):
    c = ["ffprobe", "-v", "error"]
    if stream:
        c += ["-select_streams", stream]
    c += ["-show_entries", ",".join(entries), "-of", "csv=p=0", path]
    return subprocess.run(c, capture_output=True, text=True).stdout.strip()


def parse_audio(html_path):
    """Read the <audio> elements out of the composition, in document order."""
    html = open(html_path, encoding="utf-8").read()
    base = os.path.dirname(os.path.abspath(html_path))
    out = []
    for tag in re.findall(r"<audio\b[^>]*>", html):
        def attr(name, default=None):
            m = re.search(r'%s\s*=\s*"([^"]*)"' % name, tag)
            return m.group(1) if m else default
        src = attr("src")
        if not src:
            continue
        vol = float(attr("data-volume", "1") or 1)
        if abs(vol - 1.0) > 1e-9:
            # The skill's rule zero is that every element plays at unity and all
            # levels are baked into the files. If that is not true here, the
            # renderer's own probe-pass bug is in play and this tool's model of
            # the mix is wrong.
            sys.exit("%s has data-volume=%s; levels must be baked into the file"
                     % (src, vol))
        out.append(dict(src=os.path.join(base, src),
                        start=float(attr("data-start", "0") or 0)))
    if not out:
        sys.exit("no <audio> elements found in %s" % html_path)
    return out


def video_frames_and_fps(render):
    n = probe(render, "stream=nb_read_frames", stream="v:0")
    if not n or n == "N/A":
        n = subprocess.run(["ffprobe", "-v", "error", "-count_frames",
                            "-select_streams", "v:0", "-show_entries",
                            "stream=nb_read_frames", "-of", "csv=p=0", render],
                           capture_output=True, text=True).stdout.strip()
    rate = probe(render, "stream=r_frame_rate", stream="v:0").split(",")[0]
    num, den = (rate.split("/") + ["1"])[:2]
    return int(n), float(num) / float(den)


def build_mix(elements, dest, duration):
    """Sum the elements at their composition starts, exactly as the renderer does."""
    ins, parts, labels = [], [], []
    fmt = "aformat=sample_rates=%d:channel_layouts=stereo" % SR
    for i, el in enumerate(elements):
        ins += ["-i", el["src"]]
        lab = "[a%d]" % i
        d = fmt + (",adelay=delays=%.4f|%.4f" % (el["start"] * 1000,
                                                 el["start"] * 1000)
                   if el["start"] > 0 else "")
        parts.append("[%d:a]%s%s" % (i, d, lab))
        labels.append(lab)
    parts.append("%samix=inputs=%d:duration=longest:normalize=0[s]"
                 % ("".join(labels), len(labels)))
    parts.append("[s]adelay=delays=%dS:all=1,atrim=0:%.6f,asetpts=N/SR/TB[o]"
                 % (PRIMING, duration))
    run(["ffmpeg", "-v", "error"] + ins +
        ["-filter_complex", ";".join(parts), "-map", "[o]",
         "-c:a", "pcm_f32le", "-y", dest])


def validate(elements, render, duration, tmp):
    recon = os.path.join(tmp, "_recon.wav")
    build_mix(elements, recon, duration)
    a, b = pcm(render, duration), pcm(recon, duration)
    n = min(len(a), len(b))
    a, b = a[:n] - a[:n].mean(), b[:n] - b[:n].mean()
    r = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-20))
    w = min(n, SR * 6)
    lag = int(np.argmax(np.abs(np.correlate(a[:w], b[:w], "full")))) - (w - 1)
    g = 20 * np.log10(np.linalg.norm(a) / (np.linalg.norm(b) + 1e-20))
    os.remove(recon)
    print("  reconstruction vs render: r = %.5f, lag = %d samples, gain %+.2f dB"
          % (r, lag, g))
    return r > 0.99 and abs(lag) <= 2


def main():
    p = argparse.ArgumentParser()
    p.add_argument("html")
    p.add_argument("render", help="the existing render to take video from")
    p.add_argument("--out", help="default: overwrite the render in place")
    p.add_argument("--clip", type=float, help="cut only the first N seconds")
    p.add_argument("--validate", action="store_true",
                   help="only check that the mix reproduces the render")
    p.add_argument("--crf", type=int, default=None,
                   help="re-encode video at this CRF instead of copying "
                        "(use for short comparison clips)")
    a = p.parse_args()

    elements = parse_audio(a.html)
    frames, fps = video_frames_and_fps(a.render)
    # The render's true length, not the duration the HTML declares -- they
    # disagree, and trimming to the declared value costs the last frame.
    full = frames / fps
    duration = min(a.clip, full) if a.clip else full
    tmp = os.path.dirname(os.path.abspath(a.out or a.render))

    print("%d audio elements, render is %d frames @ %g fps = %.5f s"
          % (len(elements), frames, fps, full))
    for el in elements:
        print("   %7.2f  %s" % (el["start"], os.path.basename(el["src"])))

    print("\nvalidating that the render's audio is a plain unity sum")
    ok = validate(elements, a.render, full, tmp)
    if not ok:
        print("\n  MISMATCH -- this composition is not a plain sum of its")
        print("  elements. Do not remux; render it properly.")
        raise SystemExit(1)
    print("  OK")
    if a.validate:
        return

    dest = a.out or a.render
    mix = os.path.join(tmp, "_mix.wav")
    print("\nbuilding the new mix")
    build_mix(elements, mix, duration)
    i, tp = loudness(mix)
    print("  %.1f LUFS, true peak %.1f dBTP" % (i, tp))
    if tp > -0.3:
        raise SystemExit("mix is too hot -- fix the levels before muxing")

    # Writing over the input needs a temp file; ffmpeg cannot read and write the
    # same path.
    stage = dest + ".remux.mp4"
    vargs = (["-c:v", "libx264", "-crf", str(a.crf), "-preset", "veryfast",
              "-pix_fmt", "yuv420p"] if a.crf else ["-c:v", "copy"])
    print("rem" + ("encoding" if a.crf else "uxing") + " video")
    run(["ffmpeg", "-v", "error"] +
        (["-t", "%.6f" % duration] if a.clip else []) +
        ["-i", a.render, "-i", mix, "-map", "0:v:0", "-map", "1:a:0"] + vargs +
        ["-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-y", stage])
    os.remove(mix)

    if not a.crf:
        def vmd5(path):
            return subprocess.run(
                ["ffmpeg", "-v", "error", "-i", path, "-map", "0:v:0",
                 "-f", "md5", "-"], capture_output=True, text=True).stdout.strip()
        same = vmd5(stage) == vmd5(a.render)
        print("  video stream bit-identical: %s" % same)
        if not same and not a.clip:
            os.remove(stage)
            raise SystemExit("video changed during a stream copy -- stop")

    # Keep the ORIGINAL as .old, and never clobber an existing one: on a second
    # pass that would replace the only copy of the original with the previous
    # attempt.
    if dest == a.render and not os.path.exists(dest + ".old"):
        os.rename(dest, dest + ".old")
        print("  original kept as %s.old" % os.path.basename(dest))
    elif dest == a.render:
        os.remove(dest)
    os.replace(stage, dest)

    fi, ftp = loudness(dest)
    nf, _ = video_frames_and_fps(dest)
    print("\n%s\n  %.3f s, %d frames, %.1f LUFS, %.1f dBTP, %.1f MB"
          % (dest, float(probe(dest, "format=duration")), nf, fi, ftp,
             os.path.getsize(dest) / 1e6))


if __name__ == "__main__":
    main()
