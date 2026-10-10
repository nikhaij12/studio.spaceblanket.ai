import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Styles — the looks you have saved and can ask for again.
//
// A style is a Claude Code skill. That is not a metaphor: saving one writes a
// folder with a SKILL.md into `.claude/skills/`, exactly like the workflows
// that ship with this app, and the agent finds it the same way. Which means
// nothing here has to teach the agent anything — the studio only has to show
// you which ones exist, because a saved look you cannot remember the name of
// is a saved look you will never use again.
//
// The ones that came with the app are known by name. Anything else in that
// folder is something you saved, which needs no marker, no registry and no
// cooperation from the agent that wrote it.
// ---------------------------------------------------------------------------

const BUNDLED = new Set([
  "embedded-captions",
  "faceless-explainer",
  "figma",
  "general-video",
  "hyperframes",
  "hyperframes-animation",
  "hyperframes-cli",
  "hyperframes-core",
  "hyperframes-creative",
  "hyperframes-keyframes",
  "hyperframes-registry",
  "media-use",
  "motion-graphics",
  "music-to-video",
  "photo-reel",
  "pr-to-video",
  "product-launch-video",
  "remotion-to-hyperframes",
  "slideshow",
  "talking-head-recut",
]);

export type Style = {
  /** The skill's folder name — what the agent is asked for. */
  name: string;
  /** What the chip prints. */
  title: string;
  /** The skill's own one-line description, when it wrote one. */
  says: string | null;
};

export function skillsRoot(): string {
  return path.resolve(process.cwd(), ".claude", "skills");
}

/** Every style you have saved, alphabetically. */
export function listStyles(): Style[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(skillsRoot(), { withFileTypes: true });
  } catch {
    return [];
  }

  const out: Style[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (BUNDLED.has(entry.name)) continue;
    const skill = path.join(skillsRoot(), entry.name, "SKILL.md");
    if (!fs.existsSync(skill)) continue;
    out.push({
      name: entry.name,
      title: entry.name.replace(/[_-]+/g, " ").trim(),
      says: describe(skill),
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * The skill's own description line, for the chip's tooltip. Read from the
 * frontmatter rather than the body — only the first bytes are touched, because
 * a style's SKILL.md can be long.
 */
function describe(file: string): string | null {
  let head: string;
  try {
    head = fs.readFileSync(file, "utf8").slice(0, 4000);
  } catch {
    return null;
  }
  const match = /^description:\s*(?:>-?\s*\n\s*)?["']?(.+?)["']?\s*$/m.exec(head);
  const line = match?.[1]?.trim();
  return line && line !== ">" ? line : null;
}
