// Measure what the caption rail actually occupies, per block, in frame pixels.
//
// The stage box (#caption-stage) is a container, not the ink: a two-word lead
// line fills a third of it and "DiCaprio" in 200px Caveat overruns what the
// stage nominally reserves. Safe-zone work has to be done against the union of
// the word rects, measured after the entry animation has finished, not against
// the container. getBoundingClientRect is exact here; screenshots out of this
// browser are not (will-change layers get dropped from the composite).
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

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const HTML = path.resolve(arg("--file", "reel/index.html"));
const TABLES = path.resolve(arg("--tables", "tables.json"));
const OUTJSON = path.resolve(arg("--out", "caption_boxes.json"));
const FILE = "file://" + encodeURI(HTML);

const browser = await puppeteer.launch({ headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(FILE, { waitUntil: "domcontentloaded", timeout: 120000 });

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  ready = await page.evaluate(() => !!(window.__timelines && window.__timelines.main));
  if (!ready) await new Promise(r => setTimeout(r, 500));
}
if (!ready) throw new Error("timeline never registered");
await page.evaluate(() => Promise.all(
  [...document.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }))));
await page.evaluate(() => document.fonts.ready);

// BLOCKS lives inside the composition's IIFE, so it is not reachable from the
// page. build_reel.py is the source of truth anyway — dump_tables.py writes it.
const blocks = JSON.parse(fs.readFileSync(TABLES, "utf8")).blocks.map((b, i) => ({
  i,
  start: b.start,
  end: b.end,
  // Settle time: after the last word's entry, but still inside the block.
  at: Math.min(
    Math.max(b.emph_at, ...b.lead.map(w => w[1])) + 0.40,
    b.end - 0.05,
  ),
  text: b.lead.map(w => w[0]).join(" ") + " / " + b.emph,
}));

const out = [];
for (const b of blocks) {
  await page.evaluate((t) => {
    const tl = window.__timelines.main;
    tl.pause(); tl.time(t, false); tl.render(t, true, true);
  }, b.at);

  const m = await page.evaluate((bi) => {
    const el = document.getElementById("b" + bi);
    const words = [...el.querySelectorAll(".word")];
    const rects = words.map((w) => {
      const r = w.getBoundingClientRect();
      const cs = getComputedStyle(w);
      // The emphasis span carries an ink allowance as padding-right; it is
      // real drawn ink for a script face, so it stays in the box.
      return {
        t: w.textContent,
        emph: w.className.includes("emphasis"),
        x: r.x, y: r.y, r: r.right, b: r.bottom,
        pad: parseFloat(cs.paddingRight) || 0,
        op: +getComputedStyle(w).opacity,
      };
    });
    const live = rects.filter((r) => r.op > 0.02);
    if (!live.length) return null;
    const lead = live.filter((r) => !r.emph);
    const emph = live.filter((r) => r.emph);
    const box = (rs) => rs.length ? {
      x: Math.min(...rs.map(r => r.x)), y: Math.min(...rs.map(r => r.y)),
      r: Math.max(...rs.map(r => r.r)), b: Math.max(...rs.map(r => r.b)),
    } : null;
    return { all: box(live), lead: box(lead), emph: box(emph), n: live.length };
  }, b.i);

  out.push({ ...b, ...m });
}

const f = (v) => (v === undefined || v === null ? "  -  " : v.toFixed(0).padStart(5));
console.log("idx  at     lead x..r  y..b        emph x..r  y..b        union  x..r     y..b      text");
for (const o of out) {
  if (!o.all) { console.log(String(o.i).padStart(3), "no live words"); continue; }
  console.log(
    String(o.i).padStart(3),
    o.at.toFixed(2).padStart(6),
    o.lead ? `${f(o.lead.x)}..${f(o.lead.r)} ${f(o.lead.y)}..${f(o.lead.b)}` : " (none)                ",
    o.emph ? `${f(o.emph.x)}..${f(o.emph.r)} ${f(o.emph.y)}..${f(o.emph.b)}` : " (none)                ",
    ` ${f(o.all.x)}..${f(o.all.r)} ${f(o.all.y)}..${f(o.all.b)}`,
    " ", o.text,
  );
}

const worst = out.filter(o => o.all);
console.log("\nunion extremes: left %s  right %s  top %s  bottom %s",
  Math.min(...worst.map(o => o.all.x)).toFixed(0),
  Math.max(...worst.map(o => o.all.r)).toFixed(0),
  Math.min(...worst.map(o => o.all.y)).toFixed(0),
  Math.max(...worst.map(o => o.all.b)).toFixed(0));

const json = out.map(o => ({ i: o.i, at: o.at, start: o.start, end: o.end, text: o.text, box: o.all, lead: o.lead, emph: o.emph }));
fs.writeFileSync(OUTJSON, JSON.stringify(json, null, 1));
console.log("wrote", OUTJSON);

await browser.close();
