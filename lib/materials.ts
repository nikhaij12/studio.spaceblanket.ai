import fs from "fs";
import path from "path";
import type { Material, MaterialKind } from "./types";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "__pycache__",
  ".claude",
]);

/**
 * Directories the pipeline writes into, not directories you put materials in.
 * A build derives a card and a punch crop of every photo, so walking them turns
 * 73 real photos into 260 near-identical tiles. Materials means the source you
 * supplied; renders live in the right panel and are found separately.
 */
const DERIVED_DIRS = new Set(["out", "reel", "build", "versions"]);

const EXT_KIND: Record<string, MaterialKind> = {
  ".jpg": "photo",
  ".jpeg": "photo",
  ".png": "photo",
  ".webp": "photo",
  ".heic": "photo",
  ".gif": "photo",
  ".m4a": "audio",
  ".mp3": "audio",
  ".wav": "audio",
  ".aac": "audio",
  ".flac": "audio",
  ".mp4": "video",
  ".mov": "video",
  ".md": "text",
  ".txt": "text",
  ".json": "text",
};

function classify(name: string): MaterialKind {
  return EXT_KIND[path.extname(name).toLowerCase()] ?? "other";
}

/**
 * Resolve a project-relative path, refusing anything that escapes the root.
 * Every path the browser supplies goes through here before it touches the disk —
 * `rel` is untrusted input, so `..`, absolute paths, and symlinks out of the
 * project must all be rejected rather than normalized.
 */
export function resolveInProject(projectRoot: string, rel: string): string | null {
  const root = fs.realpathSync(path.resolve(projectRoot));
  const target = path.resolve(root, rel);
  // Check the lexical path first so a missing file still gets validated.
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  let real: string;
  try {
    real = fs.realpathSync(target);
  } catch {
    return null;
  }
  if (real !== root && !real.startsWith(root + path.sep)) return null;
  return real;
}

/**
 * Walk the project and list everything the left panel should show. Depth-limited
 * and count-capped so pointing this at a big folder can't hang the request.
 */
export function scanMaterials(projectRoot: string, limit = 600): Material[] {
  const root = path.resolve(projectRoot);
  const out: Material[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > 4 || out.length >= limit) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (depth === 0 && DERIVED_DIRS.has(entry.name)) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const kind = classify(entry.name);
      if (kind === "other") continue;
      let bytes = 0;
      try {
        bytes = fs.statSync(full).size;
      } catch {
        continue;
      }
      out.push({
        rel: path.relative(root, full),
        name: entry.name,
        kind,
        bytes,
      });
    }
  };

  walk(root, 0);

  // Photos first (they carry the visual weight of the panel), then by name.
  const order: MaterialKind[] = ["photo", "audio", "text", "video", "other"];
  out.sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      a.name.localeCompare(b.name),
  );
  return out;
}

/**
 * Where a finished video lands. `out/` is the convention this app's CLAUDE.md
 * states; `reel/out` is where the older photo-reel projects put theirs.
 *
 * It has to be a named folder rather than "any .mp4 in the project": a build
 * leaves dozens of per-attempt renders around, and dropped footage is an .mp4
 * too. Both would otherwise show up as finished cuts.
 */
const OUT_DIRS = [["out"], ["reel", "out"]];

/** Every finished render in the project, newest first. */
function renderEntries(projectRoot: string): { rel: string; mtime: number }[] {
  const root = path.resolve(projectRoot);
  const found: { rel: string; mtime: number }[] = [];

  for (const parts of OUT_DIRS) {
    const dir = path.join(root, ...parts);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (path.extname(entry.name).toLowerCase() !== ".mp4") continue;
      const full = path.join(dir, entry.name);
      try {
        found.push({
          rel: path.relative(root, full),
          mtime: fs.statSync(full).mtimeMs,
        });
      } catch {
        // Unreadable file — skip it.
      }
    }
  }

  found.sort((a, b) => b.mtime - a.mtime);
  return found;
}

export function listRenders(projectRoot: string): string[] {
  return renderEntries(projectRoot).map((f) => f.rel);
}

/**
 * The newest render written since `since`, or null if this run produced none.
 *
 * This has to be "did the run write one", not "is there a newer file than the
 * one on screen". The latter meant every finished turn dragged the panel onto
 * whatever the newest file in reel/out happened to be — including an old
 * experiment the operator had deliberately switched away from.
 */
export function newestRenderSince(projectRoot: string, since: number): string | null {
  const fresh = renderEntries(projectRoot).filter((f) => f.mtime > since);
  return fresh[0]?.rel ?? null;
}

/** Which render the right panel plays on open: the newest one. */
export function defaultVideo(projectRoot: string): string | null {
  return listRenders(projectRoot)[0] ?? null;
}
