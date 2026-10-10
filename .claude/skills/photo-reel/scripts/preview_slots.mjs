// Shoot one caption block at every candidate slot, so the choice is made by
// looking rather than by trusting a score.
//
// The detector says "no landmark under type". It cannot say whether the frame
// reads well — whether the word now covers the Eiffel Tower instead of a face,
// or floats in the middle of a photo with nothing under it. That judgement
// needs eyes on the frame, which is what this produces.
//
// Usage: preview_slots.mjs --cases "0:0.80,3:4.46,18:29.42" --slots "0,-250,-520"
// Puppeteer is not a dependency of the reel project — it arrives via the npx
// cache that hyperframes populates. Try a normal resolve first, then that
// cache, and say so plainly if neither works.
async function loadPuppeteer() {
  try {
    return (await import("puppeteer")).default;
  } catch {}
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const cache = path.join(os.homedir(), ".npm/_npx");
  const rel = "node_modules/puppeteer/lib/puppeteer/puppeteer.js";
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache) : [];
  for (const d of dirs) {
    const p = path.join(cache, d, rel);
    if (fs.existsSync(p)) return (await import("file://" + p)).default;
  }
  throw new Error(
    "puppeteer not found. Install it (npm i -D puppeteer) or run any " +
    "hyperframes command once to populate the npx cache.");
}
const puppeteer = await loadPuppeteer();
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

const FILE = path.resolve(get("--file", "reel/index.html"));
const OUT = get("--out", "slots");
// Ascending, for the same reason as shoot_frames.mjs: a backward seek leaves
// every shot that already played visible, and the frame shows the wrong photo.
// block:time[:dy[:scale]] — with dy given, --slots is ignored for that case.
const CASES = get("--cases").split(",").map((s) => {
  const [b, t, dy, sc] = s.split(":");
  return { b: +b, t: +t, dy: dy === undefined ? null : +dy, s: sc === undefined ? 1 : +sc };
}).sort((a, b) => a.t - b.t);
const SLOTS = get("--slots", "0,-250,-520").split(",").map(Number);

fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto("file://" + encodeURI(FILE), { waitUntil: "domcontentloaded", timeout: 120000 });

let ready = false;
for (let i = 0; i < 80 && !ready; i++) {
  ready = await page.evaluate(() => !!(window.__timelines && window.__timelines.main));
  if (!ready) await new Promise((r) => setTimeout(r, 500));
}
if (!ready) throw new Error("timeline never registered");
await page.evaluate(() => Promise.all(
  [...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))));
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "*{will-change:auto !important}" });

for (const c of CASES) {
  for (const dy of (c.dy === null ? SLOTS : [c.dy])) {
    await page.evaluate((t) => {
      const tl = window.__timelines.main;
      tl.pause(); tl.time(t, false); tl.render(t, true, true);
    }, c.t);
    // Applied after the seek: the timeline's own render would overwrite it.
    // A wrapper offset, not a transform on the block — GSAP animates the
    // block's own transform for the entry, and the two would fight.
    await page.evaluate(({ dy, bi, sc }) => {
      document.getElementById("caption-stage").style.marginTop = dy + "px";
      // Scale about the block's own top-left. GSAP only touches this element's
      // opacity, so its transform is free.
      const el = document.getElementById("b" + bi);
      el.style.transformOrigin = "0% 0%";
      el.style.transform = sc === 1 ? "" : "scale(" + sc + ")";
    }, { dy, bi: c.b, sc: c.s });
    await new Promise((r) => setTimeout(r, 60));
    await page.screenshot({
      path: path.join(OUT, `b${String(c.b).padStart(2, "0")}_dy${dy < 0 ? "m" : "p"}${String(Math.abs(dy)).padStart(4, "0")}_s${Math.round(c.s * 100)}_t${c.t.toFixed(2)}.png`),
    });
  }
}
console.log(`wrote ${CASES.length * SLOTS.length} previews to ${OUT}`);
await browser.close();
