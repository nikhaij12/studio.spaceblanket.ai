import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject, deleteProject, listProjects } from "@/lib/projects";

// Every test gets its own projects root, so nothing here can touch a real reel.
let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "reel-projects-"));
  process.env.REEL_PROJECTS = root;
});

afterEach(() => {
  delete process.env.REEL_PROJECTS;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("deleteProject", () => {
  it("removes the project folder", () => {
    const slug = createProject("doomed");
    expect(fs.existsSync(path.join(root, slug))).toBe(true);

    expect(deleteProject(slug)).toBe(true);
    expect(fs.existsSync(path.join(root, slug))).toBe(false);
  });

  it("removes everything inside the folder", () => {
    const slug = createProject("full");
    const nested = path.join(root, slug, "out");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "reel.mp4"), "not really a video");

    expect(deleteProject(slug)).toBe(true);
    expect(fs.existsSync(path.join(root, slug))).toBe(false);
  });

  it("drops the project from the listing", () => {
    const keep = createProject("keeper");
    const drop = createProject("dropped");

    deleteProject(drop);
    const slugs = listProjects().map((p) => p.slug);
    expect(slugs).toContain(keep);
    expect(slugs).not.toContain(drop);
  });

  it("refuses a slug that is not a project", () => {
    expect(deleteProject("never-existed")).toBe(false);
  });

  it("refuses a slug that tries to walk out of the root", () => {
    // A sibling of the projects root, which a traversal would reach.
    const sibling = fs.mkdtempSync(path.join(os.tmpdir(), "reel-sibling-"));
    try {
      const name = path.basename(sibling);
      expect(deleteProject(`../${name}`)).toBe(false);
      expect(deleteProject("..")).toBe(false);
      expect(fs.existsSync(sibling)).toBe(true);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });
});
