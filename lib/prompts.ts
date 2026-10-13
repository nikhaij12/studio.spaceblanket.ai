// ---------------------------------------------------------------------------
// Prompts — the sentences the studio's buttons write.
//
// Every button in this app is a sentence aimed at the agent, never a call to
// an API the agent doesn't have; that is the whole control surface. The
// sentences live in their own module because a sentence can be tested and a
// click handler cannot, and because the skill folder a sentence names and the
// folder the studio lists back have to be the same folder.
// ---------------------------------------------------------------------------

export function saveStyle(name: string, project: string, video: string): string {
  return [
    `Study the existing video at ${project}/${video}; do not render another video.`,
    `Save its style as a reusable skill named "${name}".`,
    `Write it to the studio-wide .claude/skills/${styleSlug(name)}/SKILL.md (not inside the project), describing the look, the`,
    `pacing, the captions and the music in enough detail to rebuild it on`,
    `completely different material. Include any script you used and a one-line`,
    `frontmatter description. Verify that the SKILL.md exists before finishing.`,
  ].join(" ");
}

/** A fresh Claude session must not mistake a style save for a render request. */
export function frameStyleTurn(prompt: string, project: string): string {
  return [
    `This is a style-saving request, not a video-rendering request.`,
    `The project folder is ${project}. Read the video named below,`,
    `then write the reusable skill only in the studio-wide .claude/skills/ folder.`,
    `Do not render a new video.`,
    ``,
    prompt,
  ].join("\n");
}

export function useStyle(name: string): string {
  return `Use my saved "${name}" style for this. `;
}

/**
 * A style taken from a video someone admires, not one the studio made.
 *
 * The studying happens entirely on this machine: the agent pulls a few frames
 * out with ffmpeg and looks at them itself — the same machine that renders can
 * also watch. No external service, and explicitly no render: the video is a
 * reference, and the deliverable is the written-down look.
 */
export function styleFromVideo(name: string, file: string): string {
  return [
    `I added a reference video to this project's folder, at ${file} inside it.`,
    `Study its style entirely on this`,
    `machine, without any external service: use ffmpeg to extract a handful of`,
    `evenly spaced frames and look at the frames yourself. Describe the look in`,
    `simple terms — palette, framing, captions, pacing and cuts, motion, and`,
    `the mood of any music. Do not render a video.`,
    `Then save that as a reusable skill named "${name}": write`,
    `.claude/skills/${styleSlug(name)}/SKILL.md with a one-line frontmatter`,
    `description, detailed enough to rebuild the look on completely different`,
    `material.`,
  ].join(" ");
}

export function styleSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
