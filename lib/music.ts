import fs from "fs";
import path from "path";

const TRACK_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac"]);
const TEXT_EXT = new Set([".py", ".sh", ".md", ".json", ".js", ".ts", ".txt", ".html"]);

// Enough to cover a project's scripts and notes without ever reading a render.
const MAX_FILE = 512 * 1024;
const MAX_TOTAL = 8 * 1024 * 1024;

/**
 * A bed, named and sized like the file it is. The panel shows the filename with
 * its extension rather than a prettified title, because the point of that shelf
 * is now that these are files somebody put there.
 */
export type Track = { name: string; bytes: number };

/** The shared track library: `music/` inside this app. */
export function musicLibrary(): string {
  return path.resolve(process.cwd(), "music");
}

/**
 * Which licensed tracks this project's bed was scored from.
 *
 * The beds come from the shared `music/` library — one folder for every video,
 * so the tracks are deliberately NOT copied into the project. A scan of the
 * project folder therefore finds no music at all and the panel would claim a
 * scored video has none. So go the other way: list the library, then look for
 * each track's filename in the project's own text. The build scripts name the
 * file they mix, which makes them the record of what was used.
 *
 * A reel can be scored from more than one track and usually is — the Paris reel
 * runs a Dubai section and a Paris section with a different bed under each. An
 * earlier version of this narrowed matches to the ones whose line also named the
 * project, on the theory that a build script's spec table lists other videos'
 * beds; that theory was wrong here and it silently hid a track that really is in
 * the cut. Every referenced track counts.
 */
export function musicUsed(library: string, projectRoot: string): Track[] {
  let names: string[];
  try {
    names = fs
      .readdirSync(library)
      .filter((f) => TRACK_EXT.has(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
  if (names.length === 0) return [];

  const text = projectText(projectRoot);
  const used: Track[] = [];
  for (const name of names) {
    if (!text.includes(name)) continue;
    let bytes = 0;
    try {
      bytes = fs.statSync(path.join(library, name)).size;
    } catch {
      // Listed but unreadable — still a track that is in the cut.
    }
    used.push({ name, bytes });
  }
  return used.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every readable line of text in the project, size-capped. */
function projectText(projectRoot: string): string {
  const parts: string[] = [];
  let total = 0;

  const walk = (dir: string, depth: number) => {
    if (depth > 3 || total >= MAX_TOTAL) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (total >= MAX_TOTAL) return;
      // `versions/` holds a clone of every past build, so walking it reads the
      // same scripts N times over and finds nothing a live one doesn't.
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (depth === 0 && entry.name === "versions") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        if (fs.statSync(full).size > MAX_FILE) continue;
        const body = fs.readFileSync(full, "utf8");
        total += body.length;
        parts.push(body);
      } catch {
        // Unreadable or not valid UTF-8 — nothing to match against.
      }
    }
  };

  walk(projectRoot, 0);
  return parts.join("\n");
}
