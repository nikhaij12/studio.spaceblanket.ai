import fs from "fs";
import path from "path";
import { listRenders } from "./materials";

// ---------------------------------------------------------------------------
// Projects — one folder per reel, all of them inside the app.
//
// The studio used to operate on a single folder named by an env var, which made
// "start a new reel" a thing you did by restarting the server with a different
// environment. Projects live here instead, under the app itself, so the only
// tool needed to make a second reel is the interface.
//
// A project is just a directory. There is no database and no index file: the
// folder listing IS the list, which means a project someone copies in by hand
// shows up, and one they delete is gone, with nothing left to reconcile.
// ---------------------------------------------------------------------------

export type ProjectSummary = {
  slug: string;
  /** What the picker prints — the slug with its date prefix taken off. */
  name: string;
  /** Creation time, for ordering the picker. */
  at: number;
  photos: number;
  versions: number;
  /** A photo from the project, so a card is recognisable at a glance. */
  poster: string | null;
};

const PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"]);

/** Where every project folder lives. Inside the app, by design. */
export function projectsRoot(): string {
  return process.env.REEL_PROJECTS ?? path.resolve(process.cwd(), "projects");
}

/**
 * A slug is a single path segment of safe characters. Every project id arriving
 * from the browser goes through here before it is joined to a path — this is the
 * only thing standing between a query parameter and the rest of the disk.
 */
export function isSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(value) && !value.includes("..");
}

/** Absolute path of a project, or null if the slug is bad or not a directory. */
export function resolveProject(slug: string): string | null {
  if (!isSlug(slug)) return null;
  const full = path.join(projectsRoot(), slug);
  try {
    if (!fs.statSync(full).isDirectory()) return null;
  } catch {
    return null;
  }
  return full;
}

/**
 * Which project a request is about, or null if it names one that isn't there.
 *
 * `?p=<slug>` is how every route learns its folder. `REEL_PROJECT` still works
 * as a fallback for pointing the studio at a folder outside the app, which is
 * how it ran before projects existed.
 */
export function projectFromRequest(req: Request): string | null {
  const slug = new URL(req.url).searchParams.get("p");
  if (slug) return resolveProject(slug);
  return process.env.REEL_PROJECT ?? null;
}

/** Every project, newest first. */
export function listProjects(): ProjectSummary[] {
  const root = projectsRoot();
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const out: ProjectSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const full = path.join(root, entry.name);
    let at = 0;
    try {
      const stat = fs.statSync(full);
      at = stat.birthtimeMs || stat.mtimeMs;
    } catch {
      continue;
    }
    const { count, poster } = surveyPhotos(full);
    out.push({
      slug: entry.name,
      name: displayName(entry.name),
      at,
      photos: count,
      versions: countRenders(full),
      poster,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Make a project folder and return its slug.
 *
 * Called the moment the first file lands or the first message is sent, never
 * when the app is merely opened — otherwise every idle visit leaves an empty
 * dated folder behind and the picker fills with projects nobody made.
 */
export function createProject(name?: string): string {
  const root = projectsRoot();
  fs.mkdirSync(root, { recursive: true });

  const stem = `${today()}_${slugify(name ?? "") || "reel"}`;
  let slug = stem;
  for (let n = 2; fs.existsSync(path.join(root, slug)); n += 1) {
    slug = `${stem}-${n}`;
  }
  fs.mkdirSync(path.join(root, slug));
  return slug;
}

/**
 * Give a project a new name, returning its new slug.
 *
 * The folder itself is renamed rather than a display name being stored beside
 * it, because the folder IS the project here — it is what you open in Finder
 * and what you copy to another machine, and a project called "reel" on disk
 * while the app calls it something else is two names for one thing.
 *
 * The date prefix is kept: it is what orders the folder on disk, and it is not
 * the part anyone is renaming.
 */
export function renameProject(slug: string, name: string): string | null {
  const from = resolveProject(slug);
  if (!from) return null;

  const stem = slugify(name);
  if (!stem) return null;

  const root = projectsRoot();
  const prefix = /^(\d{4}-\d{2}-\d{2})[_-]/.exec(slug)?.[1] ?? today();
  const wanted = `${prefix}_${stem}`;
  if (wanted === slug) return slug;

  let next = wanted;
  for (let n = 2; fs.existsSync(path.join(root, next)); n += 1) {
    next = `${wanted}-${n}`;
  }

  fs.renameSync(from, path.join(root, next));
  return next;
}

/**
 * Delete a project, for good.
 *
 * resolveProject is the whole guard: a traversal, a bad name or a folder that
 * isn't there never reaches the rm. What does reach it is removed with
 * everything in it — the folder IS the project, so deleting one is exactly
 * deleting the other, with nothing left behind to reconcile.
 */
export function deleteProject(slug: string): boolean {
  const full = resolveProject(slug);
  if (!full) return false;
  try {
    fs.rmSync(full, { recursive: true, force: true });
  } catch {
    return false;
  }
  return true;
}

/** The date prefix is for sorting on disk; a person reads the rest. */
function displayName(slug: string): string {
  const bare = slug.replace(/^\d{4}-\d{2}-\d{2}[_-]?/, "");
  return (bare || slug).replace(/[_-]+/g, " ").trim();
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function today(): string {
  // Local date, not UTC: the folder name is read by the person who made it, and
  // an evening in Dubai is not yesterday just because London says so.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * How many photos the project holds and one to show on its card. Depth- and
 * count-capped: this runs once per project on every listing, so it must stay
 * cheap even pointed at a folder of thousands.
 */
function surveyPhotos(root: string): { count: number; poster: string | null } {
  let count = 0;
  let poster: string | null = null;

  const walk = (dir: string, depth: number) => {
    if (depth > 3 || count >= 400) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= 400) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Same rule as the materials panel: derived folders hold the pipeline's
        // own copies of the photos, and counting those reports a project four
        // times the size it is.
        if (["out", "reel", "build", "versions", "node_modules"].includes(entry.name)) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!PHOTO_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      count += 1;
      if (!poster) poster = path.relative(root, full);
    }
  };

  walk(root, 0);
  return { count, poster };
}

function countRenders(root: string): number {
  return listRenders(root).length;
}
