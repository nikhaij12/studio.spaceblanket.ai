import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Contact-sheet thumbnails.
//
// The photos are camera originals — 158 MB across 73 files, up to 5712x4284.
// Handing those to the browser to draw a 62px tile means it decodes every one
// at full resolution, which pinned scroll frames at 500 ms and worse. Resize
// once, cache on disk, and the panel scrolls at frame rate.
//
// The cache lives in the OS temp directory on purpose: it is derived data, it
// must never land in the vault or in git, and losing it costs one resize.
// ---------------------------------------------------------------------------

const CACHE = path.join(os.tmpdir(), "reel-studio-thumbs");

/** Widths the client may ask for. An open size parameter is a resize-bomb. */
const ALLOWED = new Set([200, 400]);

export function isAllowedWidth(n: number): boolean {
  return ALLOWED.has(n);
}

/**
 * Path to a cached JPEG thumbnail of `full` at `width`, generating it if
 * needed. Returns null if the image can't be read or resized, so the caller
 * can fall back to serving the original.
 */
export async function thumbnailFor(full: string, width: number): Promise<string | null> {
  if (!isAllowedWidth(width)) return null;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(full);
  } catch {
    return null;
  }

  // Key on path, size and mtime, so editing a photo invalidates its thumbnail
  // without anyone having to clear the cache.
  const key = crypto
    .createHash("sha1")
    .update(`${full}|${stat.size}|${stat.mtimeMs}|${width}`)
    .digest("hex");
  const out = path.join(CACHE, `${key}.jpg`);

  if (fs.existsSync(out)) return out;

  try {
    fs.mkdirSync(CACHE, { recursive: true });
    const sharp = (await import("sharp")).default;
    // Write to a unique temp name first: two requests for the same new photo
    // arrive together, and a half-written JPEG served to the browser is worse
    // than a slow one.
    const partial = `${out}.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
    await sharp(full, { failOn: "none" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toFile(partial);
    fs.renameSync(partial, out);
    return out;
  } catch {
    return null;
  }
}
