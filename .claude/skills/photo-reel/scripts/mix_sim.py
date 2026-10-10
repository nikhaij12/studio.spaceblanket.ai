#!/usr/bin/env python3
"""Sum a composition's <audio> elements offline and measure the result.

A render costs ten-plus minutes; this costs seconds and answers the same
questions - is the voice centred, is anything clipping, did the balance move,
does the bed duck where it should. The renderer mixes these files at unity, so
reading the elements straight out of index.html and summing them with the same
starts and durations is the same signal.

Usage:
  mix_sim.py path/to/index.html
  mix_sim.py path/to/index.html --out mixsim.wav --compare old_render.mp4
  mix_sim.py path/to/index.html --probe 3,1 --probe 20,1 --probe 47.5,1
"""
import argparse
import os
import re
import subprocess
import sys


def ffe(args):
    return subprocess.run(["ffmpeg"] + args, capture_output=True, text=True).stderr


def mean(path, ss, dur, ch=None):
    pre = "pan=mono|c0=c%d," % ch if ch is not None else ""
    err = ffe(["-ss", "%.4f" % ss, "-t", "%.4f" % dur, "-i", path,
               "-filter_complex", "[0:a]%svolumedetect" % pre, "-f", "null", "-"])
    m = re.search(r"mean_volume: (-?[\d.]+)", err)
    return float(m.group(1)) if m else float("nan")


def loudness(path):
    err = ffe(["-i", path, "-filter_complex",
               "[0:a]loudnorm=print_format=summary", "-f", "null", "-"])
    out = {}
    for k, lab in (("Input Integrated", "LUFS"), ("Input True Peak", "dBTP"),
                   ("Input LRA", "LU")):
        m = re.search(re.escape(k) + r":\s*(-?[\d.]+)", err)
        if m:
            out[lab] = float(m.group(1))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--out", default=None)
    ap.add_argument("--compare", default=None, help="a previous render to A/B against")
    ap.add_argument("--probe", action="append", default=[], metavar="START,DUR")
    a = ap.parse_args()

    root = os.path.dirname(os.path.abspath(a.html))
    src = open(a.html).read()
    dur_m = re.search(r'data-composition-id[^>]*?data-duration="([\d.]+)"', src) \
        or re.search(r'data-duration="([\d.]+)"[^>]*?data-composition-id', src)
    total = float(dur_m.group(1)) if dur_m else None

    els = []
    for tag in re.findall(r"<audio\b[^>]*>", src):
        get = lambda k: (re.search(r'%s="([^"]*)"' % k, tag) or [None, None])[1]
        f = get("src")
        if not f:
            continue
        els.append((get("id") or "?", os.path.join(root, f),
                    float(get("data-start") or 0), float(get("data-duration") or 0),
                    float(get("data-volume") or 1)))
    if not els:
        raise SystemExit("no <audio> elements found in %s" % a.html)

    print("== elements ==")
    for i, (eid, f, st, d, vol) in enumerate(els):
        ok = "" if os.path.exists(f) else "   MISSING"
        end = st + d
        warn = ""
        if total and end > total + 1e-6:
            warn = "   runs %.3fs past the composition" % (end - total)
        print("  %-6s %-22s %7.2f +%6.2f -> %7.2f  vol %g%s%s"
              % (eid, os.path.basename(f), st, d, end, vol, ok, warn))
    if total:
        print("  composition duration %.3f" % total)
    scripted = [e for e in els if e[4] != 1]
    if scripted:
        print("  NOTE: data-volume != 1 on %s. Bake levels into the files instead"
              % ", ".join(e[0] for e in scripted))

    out = a.out or os.path.join(root, "mixsim.wav")
    args = ["-v", "error"]
    for _, f, _, _, _ in els:
        args += ["-i", f]
    legs, tags = [], ""
    for i, (_, _, st, d, vol) in enumerate(els):
        legs.append("[%d:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                    "atrim=0:%.4f,asetpts=N/SR/TB,volume=%g,adelay=%d|%d[a%d]"
                    % (i, d, vol, round(st * 1000), round(st * 1000), i))
        tags += "[a%d]" % i
    tail = "%samix=inputs=%d:normalize=0:duration=longest" % (tags, len(els))
    if total:
        tail += ",atrim=0:%.4f" % total
    legs.append(tail + "[o]")
    args += ["-filter_complex", ";".join(legs), "-map", "[o]",
             "-c:a", "pcm_s24le", "-y", out]
    subprocess.run(["ffmpeg"] + args, check=True)

    span = total or max(st + d for _, _, st, d, _ in els)
    print("\n== mix ==  %s" % out)
    l, r = mean(out, 0, span, 0), mean(out, 0, span, 1)
    print("  L %.1f  R %.1f dB%s"
          % (l, r, "   <-- OFF CENTRE" if abs(l - r) > 1.0 else ""))
    ld = loudness(out)
    print("  %.1f LUFS   %.1f dBTP   %.1f LU"
          % (ld.get("LUFS", 0), ld.get("dBTP", 0), ld.get("LU", 0)))
    if ld.get("dBTP", -99) > 0:
        print("  CLIPPING - pull a level down before rendering.")

    if a.compare:
        cl, cr = mean(a.compare, 0, span, 0), mean(a.compare, 0, span, 1)
        cd = loudness(a.compare)
        print("\n== compare: %s ==" % os.path.basename(a.compare))
        print("  L %.1f  R %.1f dB   %.1f LUFS   %.1f dBTP"
              % (cl, cr, cd.get("LUFS", 0), cd.get("dBTP", 0)))

    if a.probe:
        print("\n== probes ==")
        for p in a.probe:
            ss, d = (float(x) for x in p.split(","))
            line = "  %7.2f +%.2f   %6.1f dB" % (ss, d, mean(out, ss, d))
            if a.compare:
                line += "   |  was %6.1f dB" % mean(a.compare, ss, d)
            print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
