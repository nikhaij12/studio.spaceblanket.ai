import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getSession } from "@/lib/session";
import { projectFromRequest } from "@/lib/projects";

export const dynamic = "force-dynamic";

/** List the recordings available to replay. */
export async function GET(req: Request) {
  const root = projectFromRequest(req);
  if (!root) return NextResponse.json({ files: [] });
  let files: string[] = [];
  try {
    files = fs
      .readdirSync(root)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();
  } catch {
    files = [];
  }
  return NextResponse.json({ files });
}

/** Replay a recorded run instead of spending a live one. */
export async function POST(req: Request) {
  const root = projectFromRequest(req);
  if (!root) {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }
  const session = getSession(root);
  let payload: { file?: unknown; speed?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const file = typeof payload.file === "string" ? payload.file : "";
  if (!file) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  // The recording name comes from the browser — keep it to a bare filename in
  // the project folder so it can't be used to read elsewhere on disk.
  if (file !== path.basename(file) || !file.endsWith(".jsonl")) {
    return NextResponse.json({ error: "Invalid recording name." }, { status: 400 });
  }
  if (session.running) {
    return NextResponse.json({ error: "A run is already in progress." }, { status: 409 });
  }

  const speed = typeof payload.speed === "number" && payload.speed > 0 ? payload.speed : 3;
  session.replay(file, speed);
  return NextResponse.json({ ok: true });
}
