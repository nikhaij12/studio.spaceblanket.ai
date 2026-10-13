import { NextResponse } from "next/server";
import path from "path";
import { getSession, studioRoot } from "@/lib/session";
import { projectFromRequest } from "@/lib/projects";
import { frameStyleTurn } from "@/lib/prompts";

export const dynamic = "force-dynamic";

/**
 * Kick off a turn. The first call states the job; later calls are the chat
 * feedback loop and resume the same agent session.
 */
export async function POST(req: Request) {
  const root = projectFromRequest(req);
  if (!root) {
    return NextResponse.json({ error: "No such project." }, { status: 404 });
  }
  const session = getSession(root);

  let payload: { prompt?: unknown; record?: unknown; about?: unknown; task?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required." }, { status: 400 });
  }
  if (session.running) {
    return NextResponse.json({ error: "A run is already in progress." }, { status: 409 });
  }

  const record = payload.record === true ? defaultRecordName() : null;
  const about = typeof payload.about === "string" ? payload.about : null;
  const savingStyle = payload.task === "save-style";

  const first = session.sessionId === null;
  let framed = first
    ? savingStyle ? frameStyleTurn(prompt, projectPath(root)) : frameFirstTurn(prompt, root)
    : prompt;
  // The folder was renamed since the agent was told where it is. Say so once,
  // or it writes the next render into a path that no longer exists.
  if (!first && session.moved) {
    framed = `The project folder is now ${projectPath(root)}. Use it from here on.\n\n${framed}`;
    session.moved = false;
  }
  // Picking a past version in the rail is how you say "this one" — the agent is
  // told which cut is meant rather than being left to guess it is the newest.
  if (about && !savingStyle) framed = `${framed}\n\nI mean the cut at ${about}, not the newest one.`;
  // The panel shows what the operator asked, not the plumbing wrapped around it.
  session.start(framed, { record, shown: prompt });

  return NextResponse.json({ ok: true, record });
}

/** Cancel the current run. */
export async function DELETE(req: Request) {
  const root = projectFromRequest(req);
  if (root) getSession(root).stop();
  return NextResponse.json({ ok: true });
}

/**
 * The opening turn has to say where the materials are and where the video goes.
 *
 * It names the hyperframes skill rather than one workflow, because that skill is
 * the router: it reads the request and picks captions, motion graphics,
 * music-to-video, a slideshow or whatever else fits. Naming a workflow here
 * would make the studio a machine for one kind of video, which it isn't.
 *
 * The path is relative to this app, which is Claude Code's cwd.
 */
/** The project folder as the agent should refer to it: relative to its cwd. */
function projectPath(root: string): string {
  const rel = path.relative(studioRoot(), root);
  return rel && !rel.startsWith("..") ? rel : root;
}

function frameFirstTurn(prompt: string, root: string): string {
  const project = projectPath(root);
  return [
    `Use the hyperframes skill. The project folder is ${project} —`,
    `everything they gave you is in it.`,
    `Write the finished video into that folder's out/ as an .mp4.`,
    // The shared track library is a sibling of projects/, which CLAUDE.md's
    // "never touch anything above this folder" would otherwise put out of
    // reach — so name it here, or a user who filled music/ is told there is
    // none.
    `Licensed music beds live in the shared music/ library at the top of this`,
    `folder; read from it, never write to it.`,
    ``,
    prompt,
  ].join("\n");
}

function defaultRecordName(): string {
  // Local time is what a person reads off the filename when clearing out
  // scratch files, so this is deliberately not UTC.
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const clock = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `${stamp}_studio_run_${clock}.jsonl`;
}
