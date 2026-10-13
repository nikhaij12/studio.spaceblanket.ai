import { NextResponse } from "next/server";
import path from "path";
import {
  createProject,
  deleteProject,
  listProjects,
  projectsRoot,
  renameProject,
  resolveProject,
} from "@/lib/projects";
import { dropSession, moveSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Every reel this studio has made, newest first. */
export async function GET() {
  return NextResponse.json({ projects: listProjects() });
}

/** Start a project only when the first file or message is submitted. */
export async function POST(req: Request) {
  let name: string | undefined;
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name === "string") name = body.name;
  } catch {
    // No body is fine — the name is optional.
  }

  try {
    return NextResponse.json({ slug: createProject(name) });
  } catch {
    return NextResponse.json({ error: "Could not make the project folder." }, { status: 500 });
  }
}

/** Rename a project and keep its live agent session attached. */
export async function PATCH(req: Request) {
  const slug = new URL(req.url).searchParams.get("p");
  const before = slug ? resolveProject(slug) : null;
  if (!slug || !before) {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }

  let name = "";
  try {
    const body = (await req.json()) as { name?: unknown };
    if (typeof body.name === "string") name = body.name;
  } catch {
    // Falls through to the empty-name check.
  }
  if (!name.trim()) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }

  let next: string | null;
  try {
    next = renameProject(slug, name);
  } catch {
    return NextResponse.json({ error: "Could not rename the folder." }, { status: 500 });
  }
  if (!next) {
    return NextResponse.json({ error: "That name has no letters in it." }, { status: 400 });
  }

  moveSession(before, path.join(projectsRoot(), next));
  return NextResponse.json({ slug: next });
}

/** Delete the project's live session before removing its folder. */
export async function DELETE(req: Request) {
  const slug = new URL(req.url).searchParams.get("p");
  const full = slug ? resolveProject(slug) : null;
  if (!slug || !full) {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }

  await dropSession(full);
  if (!deleteProject(slug)) {
    return NextResponse.json({ error: "Could not delete the folder." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
