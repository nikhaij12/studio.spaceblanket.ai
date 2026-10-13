import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/media/[...rel]/route";

let projects: string;

beforeEach(() => {
  projects = fs.mkdtempSync(path.join(os.tmpdir(), "studio-media-"));
  process.env.REEL_PROJECTS = projects;
  fs.mkdirSync(path.join(projects, "sample", "out"), { recursive: true });
  fs.writeFileSync(path.join(projects, "sample", "out", "final.mp4"), "video bytes");
});

afterEach(() => {
  delete process.env.REEL_PROJECTS;
  fs.rmSync(projects, { recursive: true, force: true });
});

function request(download: boolean): Promise<Response> {
  const suffix = download ? "&download=1" : "";
  const req = new Request(`http://studio.local/api/media/out/final.mp4?p=sample${suffix}`);
  return GET(req, { params: Promise.resolve({ rel: ["out", "final.mp4"] }) });
}

describe("GET /api/media", () => {
  it("streams the video for playback", async () => {
    const res = await request(false);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(await res.text()).toBe("video bytes");
  });

  it("offers an attachment when downloading", async () => {
    const res = await request(true);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain("final.mp4");
    expect(await res.text()).toBe("video bytes");
  });
});
