import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { listRenders } from "./materials";

// ---------------------------------------------------------------------------
// Versions — every cut the project has produced, and the materials each was
// built from.
//
// A reel is never right the first time: you render, watch it, change the music,
// render again. Those renders already accumulate in `reel/out`, so the list of
// versions needs no new bookkeeping — the folder is the history.
//
// What DID need building is keeping each version's inputs. The composition, the
// build scripts and the audio stems are overwritten by the next render, so
// without a snapshot "go back to v2 but with the other track" means rebuilding
// v2 from memory. On APFS a clone costs no disk and no measurable time (40 MB in
// 3 ms), so every render keeps a full copy of what made it.
// ---------------------------------------------------------------------------

export type Version = {
  /** Path relative to the project — the /api/media key. */
  rel: string;
  /** What the rail prints: v1, v2, v3… oldest first. */
  label: string;
  name: string;
  at: number;
  bytes: number;
  /** What was asked for the run that produced it, when it is known. */
  asked: string | null;
  /** Whether this version's build materials were kept. */
  kept: boolean;
};

const VERSIONS_DIR = "versions";

/**
 * Not worth keeping in a snapshot: output, installs, and the snapshots
 * themselves — without which every version would contain every earlier one.
 */
const NOT_INPUT = new Set([VERSIONS_DIR, "out", "renders", "snapshots", "node_modules", ".next", ".git"]);

/** Every render in the project, oldest first, with what is known about each. */
export function listVersions(projectRoot: string): Version[] {
  const root = path.resolve(projectRoot);
  const found: Version[] = [];

  for (const rel of listRenders(root)) {
    const full = path.join(root, rel);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    const name = path.basename(rel);
    const stem = path.basename(name, path.extname(name));
    found.push({
      rel,
      label: "",
      name,
      at: stat.mtimeMs,
      bytes: stat.size,
      asked: readAsked(root, stem),
      kept: fs.existsSync(path.join(root, VERSIONS_DIR, stem)),
    });
  }

  // Numbered in the order they were made, so v3 is always the third cut and
  // stays the third cut when a fourth arrives.
  found.sort((a, b) => a.at - b.at);
  found.forEach((v, i) => {
    v.label = `v${i + 1}`;
  });
  return found;
}

/**
 * Keep everything this render was built from, beside the render.
 *
 * Clones rather than copies: the composition folder carries a derived card and
 * punch crop of every photo, so a real copy would add ~76 MB per version and
 * take seconds. `cp -c` makes the whole tree copy-on-write, which is instant and
 * free until something is edited. A filesystem without clonefile falls back to a
 * plain copy rather than keeping nothing.
 */
export function snapshotRender(
  projectRoot: string,
  renderRel: string,
  asked: string | null,
): void {
  const root = path.resolve(projectRoot);
  const stem = path.basename(renderRel, path.extname(renderRel));
  const dest = path.join(root, VERSIONS_DIR, stem);
  if (fs.existsSync(dest)) return;

  try {
    fs.mkdirSync(dest, { recursive: true });

    // Everything in the project except output and installs. Which folders a
    // build uses is the agent's business and differs per kind of video, so the
    // snapshot takes the whole thing rather than a list this app maintains.
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (NOT_INPUT.has(entry.name)) continue;
      const src = path.join(root, entry.name);
      const to = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        clone(src, to);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        fs.copyFileSync(src, to, fs.constants.COPYFILE_FICLONE);
      } catch {
        // One unreadable file is not a reason to lose the rest.
      }
    }

    // A cloned folder may carry its own output inside it — `reel/out` holds
    // every other cut, and a snapshot must never contain those.
    for (const name of NOT_INPUT) {
      for (const dir of fs.readdirSync(dest, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        fs.rmSync(path.join(dest, dir.name, name), { recursive: true, force: true });
      }
    }

    fs.writeFileSync(
      path.join(dest, "about.json"),
      JSON.stringify({ render: renderRel, at: Date.now(), asked }, null, 2),
    );
  } catch {
    // Snapshotting is a courtesy to your future self, never the thing that
    // fails a finished render. The reel is already on disk.
  }
}

/** Copy-on-write clone of a directory tree, falling back to a real copy. */
function clone(src: string, dest: string): void {
  try {
    execFileSync("cp", ["-c", "-R", src, dest], { stdio: "ignore" });
    return;
  } catch {
    // No clonefile on this filesystem.
  }
  fs.cpSync(src, dest, { recursive: true });
}

function readAsked(root: string, stem: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(root, VERSIONS_DIR, stem, "about.json"), "utf8");
    const parsed = JSON.parse(raw) as { asked?: unknown };
    return typeof parsed.asked === "string" && parsed.asked.trim() ? parsed.asked : null;
  } catch {
    return null;
  }
}
