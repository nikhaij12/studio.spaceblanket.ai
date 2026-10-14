import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildArgs, dropSession, getSession } from "@/lib/session";

// A real folder, because sessions resolve their project path.
let project: string;

beforeEach(() => {
  project = fs.mkdtempSync(path.join(os.tmpdir(), "reel-session-"));
});

afterEach(async () => {
  await dropSession(project);
  fs.rmSync(project, { recursive: true, force: true });
});

describe("dropSession", () => {
  it("forgets the session for a deleted project", async () => {
    const before = getSession(project);
    expect(getSession(project)).toBe(before);

    await dropSession(project);
    expect(getSession(project)).not.toBe(before);
  });

  it("does nothing for a path with no session", async () => {
    await expect(
      dropSession(path.join(project, "never-opened")),
    ).resolves.toBeUndefined();
  });
});

describe("Claude Code invocation", () => {
  it("omits the optional subagent flag on older CLIs", () => {
    expect(buildArgs("make a video", null, false)).not.toContain("--forward-subagent-text");
  });

  it("retains subagent streaming on compatible CLIs", () => {
    expect(buildArgs("make a video", null, true)).toContain("--forward-subagent-text");
  });
});
