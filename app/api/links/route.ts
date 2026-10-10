import { NextResponse } from "next/server";
import { projectFromRequest } from "@/lib/projects";
import { addLink, removeLink } from "@/lib/links";

export const dynamic = "force-dynamic";

/** Put a link on the project. */
export async function POST(req: Request) {
  const root = projectFromRequest(req);
  if (!root) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const url = await urlFrom(req);
  if (!url) return NextResponse.json({ error: "A link is required." }, { status: 400 });

  const links = addLink(root, url);
  if (!links) {
    return NextResponse.json({ error: "That doesn't look like a link." }, { status: 400 });
  }
  return NextResponse.json({ links });
}

/** Take one off again. */
export async function DELETE(req: Request) {
  const root = projectFromRequest(req);
  if (!root) return NextResponse.json({ error: "No such project." }, { status: 404 });

  const url = await urlFrom(req);
  if (!url) return NextResponse.json({ error: "A link is required." }, { status: 400 });

  return NextResponse.json({ links: removeLink(root, url) });
}

async function urlFrom(req: Request): Promise<string> {
  try {
    const body = (await req.json()) as { url?: unknown };
    return typeof body.url === "string" ? body.url : "";
  } catch {
    return "";
  }
}
