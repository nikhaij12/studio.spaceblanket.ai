// The event vocabulary the UI renders. The engine translates whatever Claude Code
// emits into these; the browser never sees raw agent JSON.

export type StudioEventKind =
  | "status"
  | "thinking"
  | "text"
  | "tool"
  | "tool_result"
  | "video"
  | "error"
  | "done";

export type StudioEvent = {
  // Stable identity. Streamed blocks keep one seq and grow in place, so the
  // client upserts on this rather than appending every delta.
  seq: number;
  at: number;
  kind: StudioEventKind;
  // Short label for the row (tool name, status word).
  label?: string;
  // The body: narration, reasoning, or a one-line tool summary.
  body?: string;
  // Set on "video": path relative to the project, served via /api/media.
  path?: string;
};

export type MaterialKind = "photo" | "audio" | "video" | "text" | "other";

export type Material = {
  // Path relative to the project root — also the /api/media key.
  rel: string;
  name: string;
  kind: MaterialKind;
  bytes: number;
};

export type SessionState = {
  running: boolean;
  // Set once Claude Code reports a resumable session.
  sessionId: string | null;
  mode: "live" | "replay";
  events: StudioEvent[];
  video: string | null;
};
