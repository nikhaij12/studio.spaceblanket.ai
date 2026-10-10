import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DELETE } from "@/app/api/projects/route";
import { createProject } from "@/lib/projects";
import { getSession } from "@/lib/session";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "reel-route-"));
  process.env.REEL_PROJECTS = root;
});

afterEach(() => {
  delete process.env.REEL_PROJECTS;
  fs.rmSync(root, { recursive: true, force: true });
});

function del(slug: string): Promise<Response> {
  const url = `http://studio.local/api/projects?p=${encodeURIComponent(slug)}`;
  return DELETE(new Request(url, { method: "DELETE" }));
}

describe("DELETE /api/projects", () => {
  it("deletes the named project", async () => {
    const slug = createProject("goner");
    const res = await del(slug);

    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(root, slug))).toBe(false);
  });

  it("drops the project's live session with it", async () => {
    const slug = createProject("busy");
    const before = getSession(path.join(root, slug));

    await del(slug);
    // A recreated folder under the same name must not inherit the old agent.
    fs.mkdirSync(path.join(root, slug));
    expect(getSession(path.join(root, slug))).not.toBe(before);
  });

  it("404s for a project that is not there", async () => {
    const res = await del("nothing-here");
    expect(res.status).toBe(404);
  });

  it("404s for a traversal instead of reaching outside the root", async () => {
    const sibling = fs.mkdtempSync(path.join(os.tmpdir(), "reel-outside-"));
    try {
      const res = await del(`../${path.basename(sibling)}`);
      expect(res.status).toBe(404);
      expect(fs.existsSync(sibling)).toBe(true);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it("404s when no project is named", async () => {
    const res = await DELETE(
      new Request("http://studio.local/api/projects", { method: "DELETE" }),
    );
    expect(res.status).toBe(404);
  });
});
