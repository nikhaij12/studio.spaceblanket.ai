import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Links — the material that isn't a file.
//
// A video is often made *about* something that lives on the web: the product
// page it advertises, the article it explains, the design it is built from. A
// panel that only takes files says that kind of source doesn't exist, and the
// person ends up pasting the URL into the chat box where it scrolls away.
//
// They are kept in a plain `links.md` at the top of the project, one per line,
// because the agent reads the project folder anyway and a markdown list needs
// no parser, no schema and no explaining. Editing it by hand works.
// ---------------------------------------------------------------------------

const FILE = "links.md";

/** Every link on this project, in the order they were added. */
export function readLinks(projectRoot: string): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(path.resolve(projectRoot), FILE), "utf8");
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    // Tolerate the file having been edited into a bullet list by hand.
    const url = line.replace(/^\s*[-*]\s*/, "").trim();
    if (url && isLink(url) && !out.includes(url)) out.push(url);
  }
  return out;
}

/**
 * Add a link, returning the new list — or null if it isn't one.
 *
 * Only http and https: everything else a browser will hand over (javascript:,
 * file:, data:) is either useless to the agent or something it should never be
 * handed at all.
 */
export function addLink(projectRoot: string, url: string): string[] | null {
  const clean = normalize(url);
  if (!clean) return null;

  const root = path.resolve(projectRoot);
  const links = readLinks(root);
  if (!links.includes(clean)) links.push(clean);

  fs.writeFileSync(path.join(root, FILE), `${links.join("\n")}\n`, "utf8");
  return links;
}

/** Drop a link by its exact text, returning the new list. */
export function removeLink(projectRoot: string, url: string): string[] {
  const root = path.resolve(projectRoot);
  const links = readLinks(root).filter((l) => l !== url);
  fs.writeFileSync(path.join(root, FILE), links.length ? `${links.join("\n")}\n` : "", "utf8");
  return links;
}

function isLink(value: string): boolean {
  return normalize(value) === value;
}

/**
 * A pasted address as a URL, or null. "bounded.app" is what a person types and
 * is not a URL until it has a scheme, so one is assumed rather than refused.
 */
function normalize(value: string): string | null {
  const text = value.trim();
  if (!text || text.length > 2000) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.includes(".")) return null;
  return url.toString();
}
