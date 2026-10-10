// Screenshot the composition at arbitrary times, optionally with the caption
// rail hidden.
//
// Why hide it: face detection has to run on what is UNDER the captions. Running
// it on the delivered render means a face that the caption already covers can be
// missed entirely — exactly the face worth finding. Hiding the rail also makes
// this a preview tool: move the rail, shoot the same times, look.
//
// probe_layout.mjs warns that screenshots out of this browser are unreliable —
// that is about `will-change` compositing on the ANIMATED layers. --verify
// checks this run's frames against the delivered render before they are trusted.
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
const get = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const has = (k) => args.includes(k);

const FILE = path.resolve(get("--file", "reel/index.html"));
const OUT = get("--out", "frames");
const TIMES = get("--times", "");
const HIDE = has("--hide-captions");
// Hides the type but keeps its scrim, so the background a caption is read
// against can be measured for contrast. Hiding all of #captions would take
// the scrim with it and flatter the result.
const HIDE_TEXT = has("--hide-text");
// Hides ONLY the raised blocks' travelling scrim, keeping the bottom plate
// that has always been there. The baseline for "how much does the scrim dim
// this face" — comparing against --hide-captions measures the plate too.
const HIDE_HALO = has("--hide-halo");

fs.mkdirSync(OUT, { recursive: true });
// MUST be ascending. Seeking a GSAP timeline backwards does not re-hide the
// clips that played in between: every earlier shot stays at opacity 1 and the
// last one in DOM order wins, so a frame shot after a backward seek shows the
// wrong photo while the DOM and the captions both look correct. Sorting costs
// nothing here — the output is one file per time, so order never mattered.
const times = (TIMES
  ? TIMES.split(",").map(Number)
  : JSON.parse(fs.readFileSync(get("--times-file"), "utf8"))
).slice().sort((a, b) => a - b);

const browser = await puppeteer.launch({ headless: "new", args: ["--force-device-scale-factor=1"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto("file://" + encodeURI(FILE).replace(/#/g, "%23"), { waitUntil: "domcontentloaded", timeout: 120000 });

let ready = false;
for (let i = 0; i < 80 && !ready; i++) {
  ready = await page.evaluate(() => !!(window.__timelines && window.__timelines.main));
  if (!ready) await new Promise((r) => setTimeout(r, 500));
}
if (!ready) throw new Error("timeline never registered");
await page.evaluate(() => Promise.all(
  [...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))));
await page.evaluate(() => document.fonts.ready);

if (HIDE) {
  await page.addStyleTag({ content: "#captions{display:none !important}" });
}
if (HIDE_TEXT) {
  await page.addStyleTag({ content: ".caption-line{visibility:hidden !important}" });
}
if (HIDE_HALO) {
  await page.addStyleTag({ content: ".cap-halo{display:none !important}" });
}
// `will-change` promotes these to their own layers, which is what makes a
// screenshot diverge from the render. Dropping the hint costs nothing here:
// nothing is animating between the seek and the shot.
await page.addStyleTag({ content: "*{will-change:auto !important}" });

for (const t of times) {
  await page.evaluate((t) => {
    const tl = window.__timelines.main;
    tl.pause(); tl.time(t, false); tl.render(t, true, true);
  }, t);
  await new Promise((r) => setTimeout(r, 45));
  const f = path.join(OUT, `t${t.toFixed(2).padStart(6, "0")}.png`);
  await page.screenshot({ path: f, captureBeyondViewport: false });
}
console.log(`wrote ${times.length} frames to ${OUT}`);
await browser.close();
