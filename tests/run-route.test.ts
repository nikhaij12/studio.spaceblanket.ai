import { describe, expect, it } from "vitest";
import { frameStyleTurn } from "@/lib/prompts";

describe("style-saving first turn", () => {
  it("points Claude at the existing project without requesting a render", () => {
    const framed = frameStyleTurn("Save the look in .claude/skills/example/SKILL.md", "projects/example");
    expect(framed).toContain("style-saving request");
    expect(framed).toContain("projects/example");
    expect(framed).toContain("Do not render a new video");
    expect(framed).not.toContain("Use the hyperframes skill");
  });
});
