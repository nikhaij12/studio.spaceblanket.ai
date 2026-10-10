import { NextResponse } from "next/server";
import path from "path";
import { getSession } from "@/lib/session";
import { scanMaterials } from "@/lib/materials";
import { musicLibrary, musicUsed } from "@/lib/music";
import { readLinks } from "@/lib/links";
import { projectFromRequest } from "@/lib/projects";
import { listVersions } from "@/lib/versions";

export const dynamic = "force-dynamic";

const EMPTY = {
  running: false,
  sessionId: null,
  mode: "live" as const,
  events: [],
  video: null,
};

/** Everything the page needs on load: the materials, the log so far, the video. */
export async function GET(req: Request) {
  const root = projectFromRequest(req);

  // No project is the normal opening state, not an error: the studio starts on
  // a new reel, and its folder is made when the first file or message arrives.
  if (!root) {
    return NextResponse.json({
      project: null,
      materials: [],
      music: [],
      links: [],
      versions: [],
      state: EMPTY,
    });
  }

  const session = getSession(root);
  return NextResponse.json({
    project: root,
    projectName: path.basename(root),
    materials: scanMaterials(root),
    // The bed is scored from the shared library outside the project, so it has
    // to be found separately from the files that actually live in the folder.
    music: musicUsed(musicLibrary(), root),
    links: readLinks(root),
    versions: listVersions(root),
    state: {
      running: session.running,
      sessionId: session.sessionId,
      mode: session.mode,
      events: session.events,
      video: session.video,
    },
  });
}
