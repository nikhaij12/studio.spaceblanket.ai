import fs from "fs";
import path from "path";
import { projectFromRequest } from "@/lib/projects";
import { resolveInProject } from "@/lib/materials";
import { isAllowedWidth, thumbnailFor } from "@/lib/thumbs";

export const dynamic = "force-dynamic";

const RESIZABLE = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic"]);

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

/**
 * Serve a file out of the project folder. Range requests are honoured so the
 * right-hand video can be scrubbed.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ rel: string[] }> },
) {
  const { rel } = await ctx.params;
  const requested = rel.map(decodeURIComponent).join("/");

  const root = projectFromRequest(req);
  if (!root) return new Response("Not found", { status: 404 });

  // `requested` is untrusted; resolveInProject rejects anything escaping the root.
  const full = resolveInProject(root, requested);
  if (!full) return new Response("Not found", { status: 404 });

  let stat: fs.Stats;
  try {
    stat = fs.statSync(full);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!stat.isFile()) return new Response("Not found", { status: 404 });

  const ext = path.extname(full).toLowerCase();
  let type = TYPES[ext] ?? "application/octet-stream";
  const download = new URL(req.url).searchParams.get("download") === "1";
  const disposition = download
    ? `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(full))}`
    : null;

  // `?t=<width>` asks for a contact-sheet thumbnail instead of the original.
  // Only a fixed set of widths is honoured — an open parameter is a resize bomb.
  const wanted = Number(new URL(req.url).searchParams.get("t"));
  if (wanted && isAllowedWidth(wanted) && RESIZABLE.has(ext)) {
    const thumb = await thumbnailFor(full, wanted);
    if (thumb) {
      const body = fs.readFileSync(thumb);
      return new Response(body as unknown as BodyInit, {
        headers: {
          "Content-Type": "image/jpeg",
          "Content-Length": String(body.byteLength),
          // Keyed on size and mtime, so a cached copy is never a stale copy.
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    }
    // Resize failed — fall through and serve the original rather than nothing.
  }

  const range = req.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const hasStart = match[1] !== "";
      const hasEnd = match[2] !== "";
      let start = hasStart ? Number(match[1]) : 0;
      let end = hasEnd ? Number(match[2]) : stat.size - 1;
      // A suffix range ("bytes=-500") means the last N bytes.
      if (!hasStart && hasEnd) {
        start = Math.max(0, stat.size - Number(match[2]));
        end = stat.size - 1;
      }
      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start <= end &&
        start < stat.size
      ) {
        end = Math.min(end, stat.size - 1);
        const node = fs.createReadStream(full, { start, end });
        return new Response(fileStream(node, req), {
          status: 206,
          headers: {
            "Content-Type": type,
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache",
            ...(disposition ? { "Content-Disposition": disposition } : {}),
          },
        });
      }
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${stat.size}` },
      });
    }
  }

  const node = fs.createReadStream(full);
  return new Response(fileStream(node, req), {
    headers: {
      "Content-Type": type,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
      ...(disposition ? { "Content-Disposition": disposition } : {}),
    },
  });
}

/**
 * A file as a web stream, whose controller we own.
 *
 * `Readable.toWeb` cannot be used here. The reel panel cancels range requests
 * constantly — every seek and every switch between cuts abandons one mid-flight
 * — and when it does, that adapter goes on enqueueing into a controller the
 * runtime has already closed. The ERR_INVALID_STATE it throws comes from inside
 * the adapter, where no try/catch of ours can reach it, and it surfaces as an
 * uncaughtException: the kind of thing that takes the dev server down in the
 * middle of a fifteen-minute render.
 *
 * Wiring the events by hand costs twenty lines and makes every enqueue ours to
 * guard. `pause`/`resume` around `desiredSize` keeps backpressure, which matters
 * when the file is a 113 MB render.
 */
function fileStream(node: fs.ReadStream, req: Request): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const give = (fn: () => void) => {
        try {
          fn();
        } catch {
          // The consumer is gone. Stop reading rather than throw per chunk.
          node.destroy();
        }
      };

      node.on("data", (chunk) => {
        give(() => {
          controller.enqueue(new Uint8Array(chunk as Buffer));
          if ((controller.desiredSize ?? 1) <= 0) node.pause();
        });
      });
      node.once("end", () => give(() => controller.close()));
      node.once("error", (err) => give(() => controller.error(err)));

      if (req.signal.aborted) node.destroy();
      else req.signal.addEventListener("abort", () => node.destroy(), { once: true });
    },
    pull() {
      node.resume();
    },
    cancel() {
      node.destroy();
    },
  });
}
