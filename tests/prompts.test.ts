import { describe, expect, it } from "vitest";
import { saveStyle, styleFromVideo, styleSlug, useStyle } from "@/lib/prompts";

describe("styleSlug", () => {
  it("turns a name into a skill folder name", () => {
    expect(styleSlug("My Cool Look!")).toBe("my-cool-look");
    expect(styleSlug("  Paris  ")).toBe("paris");
  });
});

describe("saveStyle", () => {
  it("names the skill and the folder the studio will list", () => {
    const prompt = saveStyle("Paris Nights");
    expect(prompt).toContain('"Paris Nights"');
    expect(prompt).toContain(".claude/skills/paris-nights/SKILL.md");
  });
});

describe("useStyle", () => {
  it("asks for the style by name", () => {
    expect(useStyle("paris")).toContain('"paris"');
  });
});

describe("styleFromVideo", () => {
  const prompt = styleFromVideo("Neon Fast", "footage/reference.mp4");

  it("points at the uploaded reference video", () => {
    expect(prompt).toContain("footage/reference.mp4");
  });

  it("asks for a local frame analysis", () => {
    expect(prompt.toLowerCase()).toContain("ffmpeg");
    expect(prompt.toLowerCase()).toContain("frames");
  });

  it("forbids external services in so many words", () => {
    expect(prompt.toLowerCase()).toContain("without any external service");
  });

  it("writes the skill folder the studio will list", () => {
    expect(prompt).toContain('"Neon Fast"');
    expect(prompt).toContain(".claude/skills/neon-fast/SKILL.md");
  });

  it("does not ask for a render", () => {
    expect(prompt.toLowerCase()).toContain("do not render");
  });
});
