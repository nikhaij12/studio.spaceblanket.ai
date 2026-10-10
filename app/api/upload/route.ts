import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { projectFromRequest } from "@/lib/projects";
import { scanMaterials } from "@/lib/materials";

export const dynamic = "force-dynamic";

// Everything a video can be made out of. Footage matters as much as photos —
// this studio is not a slideshow machine, and a panel that refuses an .mp4 says
// it is one.
const KINDS: { kind: Kind; ext: Set<string>; home: string }[] = [
  { kind: "photo", ext: new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"]), home: "pictures" },
  { kind: "audio", ext: new Set([".m4a", ".mp3", ".wav", ".aac", ".flac"]), home: "audio" },
  { kind: "video", ext: new Set([".mp4", ".mov", ".m4v", ".webm"]), home: "footage" },
  { kind: "text", ext: new Set([".md", ".txt", ".json", ".srt", ".vtt"]), home: "" },
];

type Kind = "photo" | "audio" | "video" | "text";

// A camera original runs 5-8 MB, a voice take a few tens, a phone clip a few
// hundred. The ceiling is a memory limit, not a policy: the upload is buffered
// whole before it is written.
const MAX_BYTES = 500 * 1024 * 1024;

/**
 * Take files the browser dropped and put them in the project folder.
 *
 * The left panel is a place you put things — which means the dropping has to
 * actually land somewhere the pipeline will read, not just animate. Photos go to
 * whichever folder already holds the photos and audio next to the take that is
 * already there, so a dropped file arrives where its kind lives rather than in a
 * new directory of this app's invention.
 */
export async function POST(request: Request) {
  const root = projectFromRequest(request);
  if (!root) {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Nothing to add." }, { status: 400 });
  }

  const added: string[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    // basename, so a browser that hands over a relative path (a dropped folder
    // does) cannot steer the write out of the folder it names.
    const name = path.basename(file.name).replace(/^\.+/, "").trim();
    const ext = path.extname(name).toLowerCase();
    const kind = KINDS.find((k) => k.ext.has(ext))?.kind ?? null;

    if (!name || !kind || file.size === 0 || file.size > MAX_BYTES) {
      rejected.push(file.name);
      continue;
    }

    const dir = landingDir(root, kind);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const target = freeName(dir, name);
      fs.writeFileSync(target, Buffer.from(await file.arrayBuffer()));
      added.push(path.relative(root, target));
    } catch {
      rejected.push(file.name);
    }
  }

  // The fresh list travels back with the answer rather than being fetched
  // again. The client used to reload state afterwards, and that reload went
  // through a closure over "the current project" — which is null when this same
  // drop is what created the project, so the files landed on disk and the panel
  // stayed empty until you switched away and back. Answering with the truth
  // removes the round trip and the whole class of bug with it.
  return NextResponse.json({ added, rejected, materials: scanMaterials(root) });
}

/** The folder that already holds most of this kind, else a sensible default. */
function landingDir(root: string, kind: Kind): string {
  const counts = new Map<string, number>();
  for (const m of scanMaterials(root)) {
    if (m.kind !== kind) continue;
    const dir = path.dirname(m.rel);
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }

  let best: string | null = null;
  let most = 0;
  for (const [dir, count] of counts) {
    if (count > most) {
      best = dir;
      most = count;
    }
  }
  if (best !== null) return path.join(root, best);
  return path.join(root, KINDS.find((k) => k.kind === kind)?.home ?? "");
}

/** Never overwrite: `rec1.m4a` next to a `rec1.m4a` becomes `rec1-2.m4a`. */
function freeName(dir: string, name: string): string {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = path.join(dir, name);
  for (let n = 2; fs.existsSync(candidate); n += 1) {
    candidate = path.join(dir, `${stem}-${n}${ext}`);
  }
  return candidate;
}
