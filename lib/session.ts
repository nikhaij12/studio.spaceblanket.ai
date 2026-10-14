import { spawn, type ChildProcessByStdio } from "child_process";
import fs from "fs";
import path from "path";
import type { Readable } from "stream";
import type { StudioEvent, StudioEventKind } from "./types";
import { defaultVideo, newestRenderSince } from "./materials";
import { snapshotRender } from "./versions";

// ---------------------------------------------------------------------------
// Session — owns one Claude Code run and fans its output out to every connected
// browser.
//
// The process must outlive the HTTP request that started it (a render takes
// minutes), so sessions live in module state and the SSE route subscribes to
// them rather than owning them.
// ---------------------------------------------------------------------------

const MAX_EVENTS = 4000;
// Streamed text arrives many times a second. Coalesce re-broadcasts of a
// growing block to this interval; the final state is always flushed on stop.
const FLUSH_MS = 60;

export class StudioSession {
  /** cwd for Claude Code — this app's folder, so its skills and CLAUDE.md load. */
  readonly studioRoot: string;
  /** Folder holding the materials and the render. Moves when it is renamed. */
  projectRoot: string;
  /**
   * Set when the folder was renamed under a live agent session. The agent was
   * told the old path in its opening turn and would keep writing there, so the
   * next message has to mention the move. Cleared once it has been said.
   */
  moved: boolean = false;

  events: StudioEvent[] = [];
  sessionId: string | null = null;
  mode: "live" | "replay" = "live";
  video: string | null = null;

  private proc: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private subscribers = new Set<(e: StudioEvent) => void>();
  private seq = 0;
  private stdoutTail = "";
  private recordPath: string | null = null;
  private replayTimers: NodeJS.Timeout[] = [];

  // Streaming-block bookkeeping: content_block index -> the event it feeds.
  // `event` stays null until the block actually has content, so blocks that
  // never produce text (thinking arrives empty when the model omits its raw
  // chain of thought) never become a blank row.
  private messageOrdinal = 0;
  private blocks = new Map<
    string,
    { kind: StudioEventKind; label?: string; event: StudioEvent | null; json: string }
  >();
  private pendingFlush = new Map<string, NodeJS.Timeout>();

  constructor(studioRoot: string, projectRoot: string) {
    this.studioRoot = path.resolve(studioRoot);
    this.projectRoot = path.resolve(projectRoot);
    this.video = defaultVideo(this.projectRoot);
  }

  get running(): boolean {
    return this.proc !== null || this.replayTimers.length > 0;
  }


  subscribe(fn: (e: StudioEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /** Append a new event and broadcast it. */
  emit(kind: StudioEventKind, label?: string, body?: string, p?: string): StudioEvent {
    const event: StudioEvent = {
      seq: this.seq++,
      at: Date.now(),
      kind,
      label,
      body,
      path: p,
    };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    if (kind === "video" && p) this.video = p;
    this.broadcast(event);
    return event;
  }

  private broadcast(event: StudioEvent) {
    if (this.recordPath) {
      try {
        fs.appendFileSync(this.recordPath, JSON.stringify(event) + "\n");
      } catch {
        // A failed recording must never take the live run down with it.
      }
    }
    for (const fn of this.subscribers) {
      try {
        fn(event);
      } catch {
        // A dead subscriber shouldn't break the others.
      }
    }
  }

  /** Re-broadcast a block that grew, at most once per FLUSH_MS unless final. */
  private touch(key: string, event: StudioEvent, final: boolean) {
    const existing = this.pendingFlush.get(key);
    if (final) {
      if (existing) {
        clearTimeout(existing);
        this.pendingFlush.delete(key);
      }
      this.broadcast(event);
      return;
    }
    if (existing) return;
    const timer = setTimeout(() => {
      this.pendingFlush.delete(key);
      this.broadcast(event);
    }, FLUSH_MS);
    this.pendingFlush.set(key, timer);
  }

  // -- live run ------------------------------------------------------------

  /**
   * Start (or continue) a run. Follow-up turns resume the same Claude Code
   * session so the agent keeps the context of everything it already built.
   */
  start(prompt: string, opts: { record?: string | null; shown?: string; forwardSubagentText?: boolean } = {}) {
    if (this.running) {
      this.emit("error", "busy", "A run is already in progress.");
      return;
    }
    this.mode = "live";
    this.recordPath = opts.record
      ? path.resolve(this.projectRoot, opts.record)
      : null;
    this.blocks.clear();

    const args = buildArgs(prompt, this.sessionId, opts.forwardSubagentText === true);
    // Anything in reel/out newer than this is something this run made.
    const startedAt = Date.now();
    this.emit("status", "asked", opts.shown ?? prompt);

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn("claude", args, {
        cwd: this.studioRoot,
        env: {
          ...process.env,
          // A HyperFrames render can run far past the default background-task
          // grace period; 0 disables the ceiling so the run isn't cut off.
          CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: "0",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      this.emit("error", "spawn", String(err));
      return;
    }
    this.proc = child;
    this.stdoutTail = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.onStdout(chunk));

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      const text = chunk.trim();
      if (text) this.emit("error", "stderr", text.slice(0, 2000));
    });

    child.on("error", (err) => {
      this.emit("error", "spawn", err.message);
      this.proc = null;
    });

    child.on("close", (code) => {
      this.proc = null;
      // Only announce a render this run actually wrote — see newestRenderSince.
      const found = newestRenderSince(this.projectRoot, startedAt);
      if (found && found !== this.video) {
        // Keep what built it before the next run overwrites the composition.
        snapshotRender(this.projectRoot, found, opts.shown ?? null);
        this.emit("video", "render", found, found);
      }
      if (code === 0) {
        this.emit("done", "done", "Finished.");
      } else {
        this.emit("done", "stopped", `Claude Code exited with code ${code}.`);
      }
    });
  }

  stop() {
    for (const t of this.replayTimers) clearTimeout(t);
    this.replayTimers = [];
    for (const t of this.pendingFlush.values()) clearTimeout(t);
    this.pendingFlush.clear();
    if (this.proc) {
      this.proc.kill("SIGTERM");
      this.proc = null;
      this.emit("status", "stopped", "Run cancelled.");
    }
  }

  /**
   * Stop, and resolve only once the run's process has actually exited.
   *
   * stop() alone is enough for the Stop button — the panel doesn't care when
   * the OS is finished. Deleting a project does: its folder is removed the
   * moment this returns, and a render dying slowly can write files after the
   * rm, leaving a half-resurrected "deleted" folder. A process that shrugs
   * off the SIGTERM gets two seconds, then a SIGKILL.
   */
  halt(): Promise<void> {
    const child = this.proc;
    this.stop();
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Already gone, which is the outcome being waited for.
        }
        resolve();
      }, 2000);
      child.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private onStdout(chunk: string) {
    // Claude Code emits one JSON object per line, but a chunk boundary can fall
    // mid-line — hold the partial tail until its newline arrives.
    this.stdoutTail += chunk;
    const lines = this.stdoutTail.split("\n");
    this.stdoutTail = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj: unknown;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        // Not JSON — surface it rather than dropping it silently.
        this.emit("text", undefined, trimmed.slice(0, 4000));
        continue;
      }
      this.translate(obj);
    }
  }

  /**
   * Map one Claude Code stream-json line onto studio events.
   *
   * With --include-partial-messages the interesting content arrives as
   * `stream_event` deltas, which is what makes the panel feel live. The
   * complete `assistant` messages that follow are deliberately ignored — they
   * would duplicate everything already streamed. Unknown shapes are skipped, so
   * a change to the wire format degrades this panel instead of breaking a run.
   */
  private translate(obj: unknown) {
    if (typeof obj !== "object" || obj === null) return;
    const o = obj as Record<string, any>;

    if (typeof o.session_id === "string" && !this.sessionId) {
      this.sessionId = o.session_id;
    }

    if (o.type === "system") {
      if (o.subtype === "init") {
        // The engine coming up is not news. It used to print "Session up, 54
        // tools available", which is a sentence about the machine addressed to
        // nobody in the room.
      } else if (o.subtype === "api_retry") {
        this.emit(
          "status",
          "retry",
          `Retrying (attempt ${o.attempt ?? "?"} of ${o.max_retries ?? "?"}).`,
        );
      }
      return;
    }

    if (o.type === "stream_event") {
      this.onStreamEvent(o.event, o.parent_tool_use_id ?? null);
      return;
    }

    if (o.type === "user") {
      // Tool results come back on the user turn; they are not streamed.
      const blocks = o.message?.content;
      if (!Array.isArray(blocks)) return;
      for (const block of blocks) {
        if (block?.type !== "tool_result") continue;
        const body = flattenResult(block.content);
        if (body) this.emit("tool_result", block.is_error ? "error" : "result", body);
      }
      return;
    }

    if (o.type === "result") {
      if (o.is_error) {
        this.emit("error", "result", String(o.result ?? o.subtype ?? "failed"));
      }
      return;
    }
  }

  private onStreamEvent(event: any, parentToolUseId: string | null) {
    if (!event || typeof event !== "object") return;
    // Subagent output shares block indices with the parent, so namespace by it.
    const scope = parentToolUseId ? `sub:${parentToolUseId}` : "main";

    switch (event.type) {
      case "message_start":
        this.messageOrdinal += 1;
        return;

      case "content_block_start": {
        const key = this.blockKey(scope, event.index);
        const cb = event.content_block ?? {};
        if (cb.type === "text") {
          this.blocks.set(key, { kind: "text", event: null, json: "" });
        } else if (cb.type === "thinking") {
          this.blocks.set(key, { kind: "thinking", event: null, json: "" });
        } else if (cb.type === "tool_use") {
          // A tool call is worth showing the moment it starts — the name alone
          // already tells the viewer what is happening.
          const label = String(cb.name ?? "tool");
          this.blocks.set(key, {
            kind: "tool",
            label,
            event: this.emit("tool", label, ""),
            json: "",
          });
        }
        return;
      }

      case "content_block_delta": {
        const key = this.blockKey(scope, event.index);
        const slot = this.blocks.get(key);
        if (!slot) return;
        const d = event.delta ?? {};
        const chunk =
          d.type === "text_delta" && typeof d.text === "string"
            ? d.text
            : d.type === "thinking_delta" && typeof d.thinking === "string"
              ? d.thinking
              : null;

        if (chunk !== null) {
          if (!slot.event) {
            // Only real content earns a row. A block whose first deltas are
            // whitespace still has nothing to show — reasoning blocks in
            // particular open with blank fragments and would leave an empty
            // THINKING line sitting in the panel forever.
            if (chunk.trim() === "") return;
            slot.event = this.emit(slot.kind, slot.label, chunk);
          } else {
            slot.event.body = (slot.event.body ?? "") + chunk;
            this.touch(key, slot.event, false);
          }
        } else if (d.type === "input_json_delta" && typeof d.partial_json === "string") {
          // Tool arguments arrive as JSON fragments; hold them until the block
          // closes, then summarize the parsed object.
          slot.json += d.partial_json;
        }
        return;
      }

      case "content_block_stop": {
        const key = this.blockKey(scope, event.index);
        const slot = this.blocks.get(key);
        if (!slot) return;
        this.blocks.delete(key);
        // A block that produced nothing (omitted reasoning) leaves no trace.
        if (!slot.event) return;
        if (slot.event.kind === "tool" && slot.json) {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(slot.json);
          } catch {
            parsed = slot.json;
          }
          slot.event.body = summarizeToolInput(parsed);
        }
        this.touch(key, slot.event, true);
        return;
      }

      default:
        return;
    }
  }

  private blockKey(scope: string, index: unknown): string {
    return `${scope}:${this.messageOrdinal}:${index}`;
  }

  // -- replay --------------------------------------------------------------

  /**
   * Re-emit a recorded run with its original pacing (compressed), so a demo can
   * be shown on camera without depending on a live render finishing.
   */
  replay(file: string, speed = 3) {
    if (this.running) {
      this.emit("error", "busy", "Stop the current run before replaying.");
      return;
    }
    const full = path.resolve(this.projectRoot, file);
    let raw: string;
    try {
      raw = fs.readFileSync(full, "utf8");
    } catch (err) {
      this.emit("error", "replay", `Cannot read ${file}: ${String(err)}`);
      return;
    }
    const recorded: StudioEvent[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        recorded.push(JSON.parse(trimmed));
      } catch {
        // Skip a corrupt line rather than abandoning the whole replay.
      }
    }
    if (recorded.length === 0) {
      this.emit("error", "replay", "Recording is empty.");
      return;
    }

    this.mode = "replay";
    this.recordPath = null;

    // Keep the recorded seq numbers. A block that grew during the live run was
    // recorded as several frames sharing one seq; re-emitting them under fresh
    // seqs would turn one growing row into several duplicates. Advance the
    // counter past the recording so later live events can't collide.
    const maxSeq = recorded.reduce((m, e) => Math.max(m, e.seq), -1);
    this.seq = Math.max(this.seq, maxSeq + 1);

    const t0 = recorded[0].at;
    for (const event of recorded) {
      const delay = Math.max(0, (event.at - t0) / speed);
      const timer = setTimeout(() => {
        this.replayFrame(event);
        this.replayTimers = this.replayTimers.filter((t) => t !== timer);
      }, delay);
      this.replayTimers.push(timer);
    }
  }

  /** Re-emit one recorded frame under its original seq, upserting the log. */
  private replayFrame(frame: StudioEvent) {
    const event: StudioEvent = { ...frame, at: Date.now() };
    const at = this.events.findIndex((e) => e.seq === event.seq);
    if (at === -1) {
      this.events.push(event);
      if (this.events.length > MAX_EVENTS) this.events.shift();
    } else {
      this.events[at] = event;
    }
    if (event.kind === "video" && event.path) this.video = event.path;
    this.broadcast(event);
  }
}

// ---------------------------------------------------------------------------
// Claude Code invocation. Isolated so the flags are in one place.
// ---------------------------------------------------------------------------

// dontAsk denies anything not listed here, so this allowlist is the whole
// permission surface. Bash is unscoped because the reel pipeline shells out to
// python, ffmpeg and the HyperFrames renderer — see README for the tradeoff.
//
// WebFetch and WebSearch are here because "make a video about this page" is one
// of the things the studio offers: a link is a material, and without them the
// only way to read one is a bash curl, which is a worse tool for the job with a
// wider surface.
const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "WebFetch",
  "WebSearch",
  "Skill",
  "Task",
  "TodoWrite",
].join(",");

export function buildArgs(prompt: string, sessionId: string | null, forwardSubagentText: boolean): string[] {
  const args = [
    "-p",
    prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    // Unattended: the UI is the only operator, so nothing may block on a TTY
    // approval prompt. Without these the process hangs forever on first use.
    "--permission-mode",
    "dontAsk",
    "--allowedTools",
    ALLOWED_TOOLS,
  ];
  // Optional observability: Claude Code versions before 2.1.211 reject this
  // flag and fail the entire run before doing any work.
  if (forwardSubagentText) args.push("--forward-subagent-text");
  // Note: --bare is deliberately NOT passed. It skips loading project skills,
  // and this app's skills are the whole pipeline.
  if (sessionId) args.push("--resume", sessionId);
  return args;
}

/**
 * Shorten the paths in a line meant for the panel. A run is full of absolute
 * paths through the home directory; studio-relative reads better, wraps less,
 * and keeps the home directory out of a screen recording.
 */
function tidyPaths(text: string): string {
  const studio = studioRoot();
  let out = text.split(studio + path.sep).join("");
  out = out.split(studio).join(".");
  const home = process.env.HOME;
  if (home) out = out.split(home).join("~");
  return out;
}

function summarizeToolInput(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return tidyPaths(input.slice(0, 300));
  if (typeof input !== "object") return String(input);
  const o = input as Record<string, unknown>;
  // Show the field that says what the call is actually doing. The row already
  // carries the tool's name, so the field name would just be noise.
  for (const key of [
    "command",
    "file_path",
    "pattern",
    "path",
    "prompt",
    "description",
    "skill",
  ]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return tidyPaths(v.slice(0, 300));
  }
  return JSON.stringify(o).slice(0, 300);
}

function flattenResult(content: unknown): string {
  if (typeof content === "string") return tidyPaths(content.slice(0, 600));
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && (block as any).type === "text") {
      parts.push(String((block as any).text));
    }
  }
  return tidyPaths(parts.join("\n").slice(0, 600));
}

// ---------------------------------------------------------------------------
// Registry. Next.js reloads modules in dev, so the map hangs off globalThis to
// keep a running render from being orphaned by a hot reload.
// ---------------------------------------------------------------------------

const store = globalThis as unknown as {
  __reelStudioSessions?: Map<string, StudioSession>;
};
store.__reelStudioSessions ??= new Map();

/**
 * This app's own folder — Claude Code's cwd.
 *
 * Which makes the studio self-contained: the agent reads this folder's
 * CLAUDE.md and this folder's `.claude/skills`, and nothing above it. Zip the
 * folder, hand it to somebody, and their agent behaves the same as yours.
 */
export function studioRoot(): string {
  return path.resolve(process.cwd());
}

/**
 * The session for a project, made on first use.
 *
 * Sessions have always been keyed by folder — one live agent per project, each
 * outliving the request that started it — so several reels can be open in
 * several tabs and each keeps its own run.
 */
/**
 * Follow a renamed project folder, keeping its live agent.
 *
 * Sessions are keyed by absolute path, so a rename would otherwise orphan the
 * running agent and lose the conversation — the next message would start over
 * as a stranger. Re-keying keeps the thread.
 *
 * Fields are written here rather than through a method on the session, and that
 * is not a style choice. The map lives on `globalThis` so a hot reload cannot
 * orphan a running render, which means it can hold instances built from an
 * EARLIER version of this module — instances whose prototype has no method that
 * was added since. Calling one throws mid-rename. Setting a property does not.
 * Under `next dev`, which is how this app always runs, that is a live hazard.
 *
 * The new key is set before the old one is dropped, so a throw anywhere in here
 * cannot leave the session in neither.
 */
export function moveSession(from: string, to: string): void {
  const map = store.__reelStudioSessions!;
  const was = path.resolve(from);
  const now = path.resolve(to);
  const session = map.get(was);
  if (!session || was === now) return;

  session.projectRoot = now;
  // The agent was told the old path in its opening turn; the next message has
  // to correct it. No live agent, nothing to correct.
  if (session.sessionId) session.moved = true;

  map.set(now, session);
  map.delete(was);
}

/**
 * Forget a project's session — its folder is being deleted, and a live agent
 * left running would keep rendering into a folder that no longer exists, then
 * haunt any new project recreated under the same name.
 *
 * The map entry goes first, so a project recreated under the same name mid-
 * teardown gets a fresh session rather than this dying one. halt() is awaited
 * so the caller can rm the folder knowing the process is actually gone — but
 * an instance from before halt() existed may still be in the map after a hot
 * reload (see moveSession), so its absence falls back to stop(), which every
 * vintage has. The guard is for a dying process, which must not keep the
 * folder alive.
 */
export async function dropSession(root: string): Promise<void> {
  const map = store.__reelStudioSessions!;
  const key = path.resolve(root);
  const session = map.get(key);
  if (!session) return;
  map.delete(key);
  try {
    if (typeof session.halt === "function") await session.halt();
    else session.stop();
  } catch {
    // However the stop went, the session is still forgotten.
  }
}

export function getSession(project: string): StudioSession {
  const resolved = path.resolve(project);
  const map = store.__reelStudioSessions!;
  let session = map.get(resolved);
  if (!session) {
    session = new StudioSession(studioRoot(), resolved);
    map.set(resolved, session);
  }
  return session;
}
