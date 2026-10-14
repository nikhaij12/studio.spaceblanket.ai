"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "@/lib/music";
import { saveStyle, styleFromVideo, styleSlug, useStyle } from "@/lib/prompts";
import type { ProjectSummary } from "@/lib/projects";
import type { Style } from "@/lib/styles";
import type { Version } from "@/lib/versions";
import type { Material, StudioEvent } from "@/lib/types";

// Who is speaking, in the reader's terms — not the engine's.
const WHO: Record<string, string> = {
  status: "studio",
  thinking: "thinking",
  text: "claude",
  tool: "tool",
  video: "reel",
  error: "error",
  done: "done",
};

// What the panel does not show.
//
// `tool_result` is the noisiest thing the engine emits and the least legible.
// `tool` went the same way: bash, Read, Glob and the rest are the machinery of
// making a video, not the making of it, and a person who has never opened a
// terminal reads a wall of them as errors. What is left is the agent's own
// sentences — which is what a person watching over your shoulder would say.
//
// Hiding them is only honest if something says work is still happening, so the
// stream ends in a spinner for as long as the run does. See <Working>.
const HIDDEN_KINDS = new Set(["tool_result", "tool"]);

// Slots in the collapsed contact sheet before it has been measured. The real
// number is whatever fits in the space left over once Audio has taken its share
// — see useSheetCapacity.
const PHOTO_TILES = 24;
const SHEET_GAP = 6;

// Nothing suggests what to type. Examples lived here briefly and were cut: an
// empty box says "anything" and a pair of examples quietly narrows it to two
// things. What it can do belongs on its own page, read once — the working
// screen stays a box.

export default function Page() {
  // null is a reel that has been started but not yet put anywhere: the studio
  // opens on one, and its folder is made by the first drop or the first message.
  const [project, setProject] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  // Which past cut the next message is about, when it isn't the newest one.
  const [about, setAbout] = useState<string | null>(null);

  const [materials, setMaterials] = useState<Material[]>([]);
  const [music, setMusic] = useState<Track[]>([]);
  const [links, setLinks] = useState<string[]>([]);
  // The link box is open, and what is in it.
  const [linking, setLinking] = useState<string | null>(null);
  // The looks you have saved, and the name box for saving another.
  const [styles, setStyles] = useState<Style[]>([]);
  const [stylesExpanded, setStylesExpanded] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  // A reference video picked for a new style, waiting on its name.
  const [styleVideo, setStyleVideo] = useState<File | null>(null);
  const [styleName, setStyleName] = useState("");
  const [events, setEvents] = useState<StudioEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<"live" | "replay">("live");
  const [video, setVideo] = useState<string | null>(null);
  const [videoRev, setVideoRev] = useState(0);
  const [notice, setNotice] = useState("");
  const [allPhotos, setAllPhotos] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const streamRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const pinnedRef = useRef(true);
  // What is on screen, readable outside a state updater.
  const videoRef = useRef<string | null>(null);
  // Which state request is the current one, so a slow early answer cannot
  // overwrite a fast later one.
  const loadSeq = useRef(0);
  const pendingStyleRef = useRef<{ name: string; slug: string; previousUpdatedAt: number } | null>(null);

  const shelfRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLDivElement | null>(null);
  const capacity = useSheetCapacity(shelfRef, sheetRef, audioRef, materials);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const styleFileRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  // An upload in flight: how many files, and how much of them has gone.
  const [adding, setAdding] = useState<{ files: number; pct: number } | null>(null);
  // dragenter/dragleave fire for every child the pointer crosses, so the state
  // has to count depth rather than trust the last event.
  const dragDepth = useRef(0);

  // -- initial load --------------------------------------------------------

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (!res.ok) return;
    const data = await res.json();
    setProjects(data.projects ?? []);
  }, []);

  const loadStyles = useCallback(async (): Promise<Style[] | null> => {
    try {
      const res = await fetch("/api/styles", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      const found: Style[] = data.styles ?? [];
      setStyles(found);
      return found;
    } catch {
      return null;
    }
  }, []);

  /**
   * Claude writes a saved style just before its process exits. Refresh a few
   * times after that exit so a style is never missed if the filesystem and the
   * final event arrive in the opposite order.
   */
  const refreshStylesAfterRun = useCallback(() => {
    const check = async (final = false) => {
      const found = await loadStyles();
      const pending = pendingStyleRef.current;
      if (!pending) return;
      const saved = found?.find((style) => style.name === pending.slug);
      if (saved && saved.updatedAt > pending.previousUpdatedAt) {
        pendingStyleRef.current = null;
        setNotice(`Saved "${pending.name}". It is now in Your styles.`);
      } else if (final) {
        pendingStyleRef.current = null;
        setNotice(`"${pending.name}" was not saved. Check the Instructions panel for the Claude error, then try again.`);
      }
    };
    void check();
    for (const delay of [400, 1_200, 2_500]) {
      window.setTimeout(() => void check(delay === 2_500), delay);
    }
  }, [loadStyles]);

  /**
   * Load everything about a project.
   *
   * `slug` may be passed explicitly, and callers that just created a project
   * must: `project` is state, so a function created in this render still sees
   * the old value — which was null — and would quietly load nothing.
   */
  const loadState = useCallback(
    async (slug?: string) => {
    const which = slug ?? project;
    if (!which) return;
    const mine = (loadSeq.current += 1);
    const res = await fetch(`/api/state?p=${encodeURIComponent(which)}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    // A slower earlier request must not overwrite a newer answer.
    if (mine !== loadSeq.current) return;
    const cuts: Version[] = data.versions ?? [];
    setMaterials(data.materials);
    setMusic(data.music ?? []);
    setLinks(data.links ?? []);
    setVersions(cuts);
    setEvents(data.state.events);
    setRunning(data.state.running);
    setMode(data.state.mode);

    // Opening a project adopts whichever render the server picked, and that is
    // not always the newest one in the rail. Say so now rather than letting the
    // rail highlight v2 while the next message is silently about v4.
    if (videoRef.current === null && data.state.video) {
      const newest = cuts[cuts.length - 1]?.rel;
      setAbout(data.state.video === newest ? null : data.state.video);
    }
    // Don't yank the panel off a render that a finished run announced.
    setVideo((current) => current ?? data.state.video);
    },
    [project],
  );

  useEffect(() => {
    videoRef.current = video;
  }, [video]);

  useEffect(() => {
    void loadProjects();
    void loadStyles();
  }, [loadProjects, loadStyles]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  /**
   * The folder to write into, made now if it doesn't exist yet.
   *
   * Everything that puts something on disk goes through here, which is what lets
   * the app open on a new reel without creating one: the project becomes real at
   * the first drop or the first message, and never merely because a tab is open.
   */
  const ensureProject = useCallback(async (): Promise<string | null> => {
    if (project) return project;
    const res = await fetch("/api/projects", { method: "POST" });
    if (!res.ok) {
      setNotice("Could not start a new reel. Check the terminal running the app.");
      return null;
    }
    const { slug } = await res.json();
    setProject(slug);
    void loadProjects();
    return slug as string;
  }, [project, loadProjects]);

  /** Open a different reel: everything on screen belongs to the old one. */
  const openProject = useCallback((slug: string | null) => {
    setProject(slug);
    setMaterials([]);
    setMusic([]);
    setLinks([]);
    setLinking(null);
    setVersions([]);
    setEvents([]);
    setVideo(null);
    setAbout(null);
    setRunning(false);
    setNotice("");
    setAllPhotos(false);
  }, []);

  /**
   * Adopt a renamed project. The folder moved on disk, so its slug changed and
   * every URL on the page has to be built from the new one — but nothing about
   * what is on screen changed, so none of it is cleared.
   */
  const renameProject = useCallback(
    async (name: string) => {
      if (!project) return;
      const res = await fetch(`/api/projects?p=${encodeURIComponent(project)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slug) {
        setNotice(data.error ?? "That name could not be used.");
        return;
      }
      setProject(data.slug);
      void loadProjects();
    },
    [project, loadProjects],
  );

  // -- live event feed -----------------------------------------------------

  useEffect(() => {
    if (!project) return;
    const source = new EventSource(`/api/events?p=${encodeURIComponent(project)}`);

    source.onmessage = (msg) => {
      let event: StudioEvent;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }

      // Streamed blocks keep their seq and grow, so upsert instead of append.
      setEvents((prev) => {
        const at = prev.findIndex((e) => e.seq === event.seq);
        if (at === -1) return [...prev, event];
        const next = prev.slice();
        next[at] = event;
        return next;
      });

      if (event.kind === "status" && event.label === "asked") setRunning(true);
      if (event.kind === "done") {
        setRunning(false);
        // A finished turn may have added materials, a render, or a style.
        void loadState();
        refreshStylesAfterRun();
      }
      if (event.kind === "video" && event.path) {
        setVideo(event.path);
        setVideoRev((n) => n + 1);
        // A fresh cut is now the one in front of you, so there is nothing older
        // being pointed at any more.
        setAbout(null);
      }
    };

    return () => source.close();
  }, [loadState, project, refreshStylesAfterRun]);

  // Follow the tail unless the user has scrolled up to read something.
  useEffect(() => {
    const el = streamRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [events]);

  const onScroll = () => {
    const el = streamRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  // -- actions -------------------------------------------------------------

  /** Say something to the agent. The composer is one caller; Save this style is another. */
  const ask = useCallback(
    async (text: string, options: { task?: "save-style"; projectSlug?: string } = {}) => {
      const said = text.trim();
      if (!said || running || busy) return false;
      setBusy(true);
      setNotice("");
      try {
        const slug = options.projectSlug ?? await ensureProject();
        if (!slug) return false;
        const res = await fetch(`/api/run?p=${encodeURIComponent(slug)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: said, about, task: options.task }),
        });
        if (res.ok) {
          setAbout(null);
          setMode("live");
          return true;
        }
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? "The build did not start. Check the terminal running the app.");
        return false;
      } catch {
        setNotice("Could not reach the studio. Check the terminal running the app.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [about, busy, ensureProject, running],
  );

  // The box empties only once the message is away, so a refused send doesn't
  // take the sentence with it.
  const send = async () => {
    if (await ask(prompt)) setPrompt("");
  };

  /** Put a sentence in the box and leave the cursor at the end of it. */
  const say = (text: string) => {
    setPrompt(text);
    const box = boxRef.current;
    if (!box) return;
    box.focus();
    requestAnimationFrame(() => box.setSelectionRange(text.length, text.length));
  };

  const stop = async () => {
    if (!project) return;
    await fetch(`/api/run?p=${encodeURIComponent(project)}`, { method: "DELETE" });
    setRunning(false);
  };

  // -- putting things in ---------------------------------------------------

  const add = useCallback(
    async (list: FileList | File[] | null): Promise<Answer | null> => {
      if (!list || list.length === 0) return null;
      const files = Array.from(list);
      const body = new FormData();
      for (const file of files) body.append("files", file);

      // Dropping sixty camera originals is a real wait, and a wait with nothing
      // moving reads as nothing happening. XHR is used instead of fetch for one
      // reason: it reports upload progress, and fetch still cannot.
      setAdding({ files: files.length, pct: 0 });
      setNotice("");
      try {
        const slug = await ensureProject();
        if (!slug) return null;
        const { ok, data } = await postProgress(
          `/api/upload?p=${encodeURIComponent(slug)}`,
          body,
          (pct) => setAdding((was) => (was ? { ...was, pct } : was)),
        );
        if (!ok) {
          setNotice(data.error ?? "Those files could not be added.");
        } else if (data.rejected?.length) {
          setNotice(
            `Added ${data.added?.length ?? 0}. Skipped ${data.rejected.length} — photos, video, audio and notes only.`,
          );
        }
        // Straight from the answer: the panel fills the moment the files land,
        // and it does so even when this drop is what created the project.
        if (data.materials) setMaterials(data.materials);
        // The rest of the panel — music, links, cuts — still comes from state,
        // named explicitly because `slug` may be newer than this closure knows.
        await loadState(slug);
        // The answer travels back so a caller can see where its files landed —
        // the style-from-video flow needs the path to talk about the upload.
        return ok ? { ...data, projectSlug: slug } : null;
      } catch {
        setNotice("Those files could not be added.");
        return null;
      } finally {
        setAdding(null);
      }
    },
    [loadState, ensureProject],
  );

  /**
   * A style from a video you admire rather than one this studio made: the
   * reference lands in the project like any other clip, then the agent is
   * asked to study a few frames of it locally and write the look down as a
   * skill — see styleFromVideo in lib/prompts.
   */
  const addStyleFromVideo = useCallback(
    async (file: File, name: string) => {
      const data = await add([file]);
      const rel = data?.added?.[0];
      if (!rel) return; // add() already said what went wrong
      const slug = styleSlug(name);
      if (!slug) {
        setNotice("Give this style a name using letters or numbers.");
        return;
      }
      pendingStyleRef.current = {
        name,
        slug,
        previousUpdatedAt: styles.find((style) => style.name === slug)?.updatedAt ?? 0,
      };
      // The chip is disabled during a run, but a run can begin while the
      // upload is in flight — and then the video is in the pile with nothing
      // saying why no style appeared.
      const blockedByRun = running || busy;
      if (!(await ask(styleFromVideo(name, rel), { task: "save-style", projectSlug: data.projectSlug }))) {
        pendingStyleRef.current = null;
        if (blockedByRun) {
          setNotice(`The video is in. Ask again for the "${name}" style once the current run finishes.`);
        }
      } else {
        setNotice(`Saving "${name}" from the reference video…`);
      }
    },
    [add, ask, busy, running, styles],
  );

  const saveCurrentStyle = async () => {
    const name = naming?.trim() ?? "";
    if (!name || !project || !video) return;
    const slug = styleSlug(name);
    if (!slug) {
      setNotice("Give this style a name using letters or numbers.");
      return;
    }
    pendingStyleRef.current = {
      name,
      slug,
      previousUpdatedAt: styles.find((style) => style.name === slug)?.updatedAt ?? 0,
    };
    const ok = await ask(saveStyle(name, `projects/${project}`, video), { task: "save-style" });
    if (!ok) {
      pendingStyleRef.current = null;
      return;
    }
    setNaming(null);
    setNotice(`Saving "${name}" from the current video…`);
  };

  /**
   * Delete a reel, for good. The server removes the folder and forgets its
   * agent; if it was the one on screen, the studio opens on a fresh reel —
   * there is nothing left to look at.
   */
  const dropProject = useCallback(
    async (slug: string) => {
      const res = await fetch(`/api/projects?p=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice(data.error ?? "That reel could not be deleted.");
        return;
      }
      if (slug === project) openProject(null);
      void loadProjects();
    },
    [project, openProject, loadProjects],
  );

  /**
   * Put a link on the project.
   *
   * A video is often made *about* something on the web — the product page it
   * advertises, the article it explains — and a panel that only takes files
   * says that kind of source doesn't exist. It lands in the project's own
   * `links.md`, which the agent reads along with everything else.
   */
  const addLink = useCallback(
    async (url: string) => {
      const text = url.trim();
      if (!text) return;
      setNotice("");
      const slug = await ensureProject();
      if (!slug) return;
      const res = await fetch(`/api/links?p=${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(data.error ?? "That link could not be added.");
        return;
      }
      setLinks(data.links ?? []);
    },
    [ensureProject],
  );

  const dropLink = useCallback(
    async (url: string) => {
      if (!project) return;
      const res = await fetch(`/api/links?p=${encodeURIComponent(project)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setLinks(data.links ?? []);
    },
    [project],
  );

  const onDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void add(e.dataTransfer.files);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void send();
    }
  };

  // -- grouping ------------------------------------------------------------

  const photos = useMemo(() => materials.filter((m) => m.kind === "photo"), [materials]);
  const voices = useMemo(() => materials.filter((m) => m.kind === "audio"), [materials]);
  // Notes are not shown. A script or a transcript is something the agent reads,
  // not something you look at while making a video — the shelf was clutter.
  const clips = useMemo(() => materials.filter((m) => m.kind === "video"), [materials]);
  const shown = useMemo(() => events.filter((e) => !HIDDEN_KINDS.has(e.kind)), [events]);

  // One slot is spent on the "+N" tile whenever there is an overflow at all.
  const fits = photos.length <= capacity;
  const tiles = allPhotos || fits ? photos : photos.slice(0, capacity - 1);
  const rest = photos.length - tiles.length;

  const aboutLabel = useMemo(
    () => versions.find((v) => v.rel === about)?.label ?? null,
    [versions, about],
  );

  // When the current turn was asked for, so the spinner can say how long it has
  // been going. Read off the event rather than kept in state, so a reload in
  // the middle of a fifteen-minute render still shows the true elapsed time.
  const askedAt = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const e = events[i];
      if (e.kind === "status" && e.label === "asked") return e.at;
    }
    return null;
  }, [events]);

  const visibleStyles = stylesExpanded ? styles : styles.slice(0, 3);
  const hiddenStyleCount = Math.max(0, styles.length - 3);

  // Only a machine that is doing something has a state worth printing. "Idle" is
  // the word for "nothing is happening", which the whole still page already says.
  const state = mode === "replay" ? "replaying" : "building";
  const stateLabel = mode === "replay" ? "Replaying" : "Building";

  return (
    <>
      <div className="ambient" aria-hidden />
      <div className="grain" aria-hidden />
      <FlowGradients />
      <div className="shell">
        {/* The Spaceblanket lockup is the header's anchor. */}
        <header className="topline">
          <div className="logo">
            <Image
              className="brand-mark"
              src="/spaceblanket-mark.png"
              alt="Spaceblanket"
              width={44}
              height={44}
              priority
            />
            <h1 className="mark" data-live={running}>
              Studio by Spaceblanket.ai
            </h1>
          </div>
          <Switcher
            current={project}
            projects={projects}
            onOpen={openProject}
            onRenamed={renameProject}
            onDelete={dropProject}
          />
          {running && (
            <div className="state" data-state={state}>
              <i className="led" aria-hidden />
              {stateLabel}
            </div>
          )}
          {/* The one page of documentation, at the quietest volume the header
              has. You read it once, before you start. */}
          <Link className="manual" href="/docs">
            What it can do
          </Link>
        </header>

        <main className="stage">
          {/* -------------------------------- the materials -------------------------------- */}
          {/* The panel is the drop target, not a strip inside it: you throw your
              photos at the pile, and the pile is the whole left-hand side. */}
          <section
            className="slab bin"
            data-over={dragging}
            onDragEnter={onDragEnter}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <div className="slab-head">
              <h2>Materials</h2>
            </div>
            <div className="scroll" ref={shelfRef}>
              {photos.length === 0 &&
                clips.length === 0 &&
                voices.length === 0 &&
                music.length === 0 &&
                links.length === 0 && (
                <div className="void">
                  <p className="empty">
                    Drop your photos, clips, voice takes and music here. Or paste a link.
                  </p>
                </div>
              )}

              {photos.length > 0 && (
                <section className="shelf">
                  <div className="shelf-head">
                    <PhotoIcon />
                    <span className="what">Photos</span>
                  </div>
                  <div className="sheet" ref={sheetRef}>
                    {tiles.map((m) => (
                      <img
                        key={m.rel}
                        // ?t=200 serves a cached resize. The originals are
                        // camera-sized, and decoding those to paint a small
                        // tile is what made this panel stutter.
                        src={media(project, m.rel, "t=200")}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    ))}
                    {/* The overflow count is a tile, not a button under the
                        grid: it keeps the sheet rectangular and puts the number
                        where the photos it stands for would have been. */}
                    {(rest > 0 || allPhotos) && (
                      <button className="tile-more" onClick={() => setAllPhotos((v) => !v)}>
                        {allPhotos ? "Less" : `+${rest}`}
                      </button>
                    )}
                  </div>
                </section>
              )}

              {/* Everything that isn't a photo, measured as one block: the
                  contact sheet above takes whatever height is left, so what is
                  under it has to be one thing to measure. */}
              <div className="rest" ref={audioRef}>
              {links.length > 0 && (
                <section className="shelf">
                  <div className="shelf-head">
                    <ChainIcon />
                    <span className="what">Links</span>
                  </div>
                  <ul className="tracks">
                    {links.map((url) => (
                      <li key={url}>
                        <span className="chip-ico">
                          <ChainIcon />
                        </span>
                        <a className="file" href={url} target="_blank" rel="noreferrer">
                          <span className="fname">{host(url)}</span>
                          <span className="fmeta">{trail(url)}</span>
                        </a>
                        {/* A link is the one material you can put here by
                            mistyping it, so it is the one you can take off. */}
                        <button
                          className="unlink"
                          onClick={() => void dropLink(url)}
                          aria-label={`Remove ${host(url)}`}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {clips.length > 0 && (
                <section className="shelf">
                  <div className="shelf-head">
                    <FilmIcon />
                    <span className="what">Clips</span>
                  </div>
                  <ul className="tracks">
                    {clips.map((m) => (
                      <li key={m.rel}>
                        <span className="chip-ico">
                          <FilmIcon />
                        </span>
                        <span className="file">
                          <span className="fname">{m.name}</span>
                          <span className="fmeta">Footage · {size(m.bytes)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(voices.length > 0 || music.length > 0) && (
                <section className="shelf">
                  <div className="shelf-head">
                    <AudioIcon />
                    <span className="what">Audio</span>
                  </div>
                  {/* Files, drawn as files: the real name with its real
                      extension, its size, and an icon that says which of the
                      two things it is. The panel is a place you put files, so
                      what is in it has to look like what you put there. */}
                  <ul className="tracks">
                    {voices.map((m) => (
                      <li key={m.rel}>
                        <span className="chip-ico">
                          <MicIcon />
                        </span>
                        <span className="file">
                          <span className="fname">{m.name}</span>
                          <span className="fmeta">Voice · {size(m.bytes)}</span>
                        </span>
                      </li>
                    ))}
                    {music.map((track) => (
                      <li key={track.name}>
                        <span className="chip-ico">
                          <NoteIcon />
                        </span>
                        <span className="file">
                          <span className="fname">{track.name}</span>
                          <span className="fmeta">Music · {size(track.bytes)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              </div>
            </div>

            {/* The other half of the affordance: dragging is invisible until you
                try it, so there is a button that does the same thing. */}
            <div className="dock">
              {/* An upload takes over the dock rather than dimming a button in
                  it. Sixty camera originals is a real wait, and the panel has
                  to be visibly busy for it. */}
              {adding ? (
                <div className="adding">
                  <div className="adding-say">
                    <span>
                      Adding {adding.files} file{adding.files === 1 ? "" : "s"}
                    </span>
                    <span className="adding-pct">{Math.round(adding.pct * 100)}%</span>
                  </div>
                  <div className="adding-rail">
                    <div className="adding-fill" style={{ transform: `scaleX(${adding.pct})` }} />
                  </div>
                </div>
              ) : linking === null ? (
                <>
                  <button className="pick" onClick={() => fileRef.current?.click()}>
                    <PlusIcon />
                    Add files
                  </button>
                  <button className="pick ghost" onClick={() => setLinking("")}>
                    <ChainIcon />
                    Add link
                  </button>
                </>
              ) : (
                <input
                  className="link-box"
                  autoFocus
                  value={linking}
                  placeholder="Paste a link — a product page, an article"
                  onChange={(e) => setLinking(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const url = linking;
                      setLinking(null);
                      void addLink(url);
                    }
                    if (e.key === "Escape") setLinking(null);
                  }}
                  onBlur={() => setLinking(null)}
                />
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,audio/*,video/*,.md,.txt,.srt,.vtt"
                hidden
                onChange={(e) => {
                  void add(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="veil" aria-hidden>
              <div className="veil-say">
                <DropIcon />
                Drop to add
              </div>
            </div>
          </section>

          <Flow id="flow-a" />

          {/* -------------------------------- the build -------------------------------- */}
          <section className="slab">
            <div className="slab-head">
              <h2>Instructions</h2>
            </div>
            <div className="scroll" ref={streamRef} onScroll={onScroll}>
              {shown.length === 0 ? (
                <div className="void">
                  <p className="empty">Say what video you want. Watch it get made.</p>
                </div>
              ) : (
                <div className="stream">
                  {shown.map((e) => (
                    <div key={e.seq} className={`step ${e.kind}`}>
                      <div className="who">{e.label ?? WHO[e.kind] ?? e.kind}</div>
                      <div className="said">{e.body ?? ""}</div>
                    </div>
                  ))}
                  {running && <Working since={askedAt} />}
                </div>
              )}
            </div>

            <div className="composer">
              {/* The looks you have saved. A style you cannot remember the name
                  of is a style you will never use again, so the names live here,
                  next to the box where you would say one — along with the one
                  way to mint a style before you have made anything: hand over a
                  video whose look you want kept. */}
              <div className="styles">
                {styles.length > 0 && <span className="styles-what">Your styles</span>}
                {visibleStyles.map((s) => (
                  <button
                    key={s.name}
                    title={s.says ?? `Use the ${s.title} style`}
                    onClick={() => say(useStyle(s.name))}
                  >
                    {s.title}
                  </button>
                ))}
                {hiddenStyleCount > 0 && (
                  <button
                    className="styles-more"
                    aria-expanded={stylesExpanded}
                    onClick={() => setStylesExpanded((open) => !open)}
                  >
                    {stylesExpanded ? "Show less" : `+${hiddenStyleCount} more`}
                  </button>
                )}
                {styleVideo === null ? (
                  <button
                    className="style-add"
                    disabled={running || busy}
                    title="Pick a video whose look you want to keep as a style"
                    onClick={() => styleFileRef.current?.click()}
                  >
                    <PlusIcon />
                    New style from a video
                  </button>
                ) : (
                  <form
                    className="style-name-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = styleName.trim();
                      const file = styleVideo;
                      if (!name || !file) return;
                      setStyleVideo(null);
                      void addStyleFromVideo(file, name);
                    }}
                  >
                    <input
                      className="keep-box"
                      autoFocus
                      aria-label="Name the style from this video"
                      value={styleName}
                      placeholder="Name this style"
                      onChange={(e) => setStyleName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setStyleVideo(null);
                      }}
                    />
                    <button type="submit" disabled={!styleName.trim()}>Save</button>
                    <button type="button" onClick={() => setStyleVideo(null)}>Cancel</button>
                  </form>
                )}
                <input
                  ref={styleFileRef}
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      setStyleVideo(file);
                      setStyleName("");
                    }
                    e.target.value = "";
                  }}
                />
              </div>

              {/* Picking an older cut in the rail is how you point at it. Saying
                  so here, where the message is written, keeps it from being a
                  hidden change of meaning — and it can be taken back. */}
              {aboutLabel && (
                <div className="about">
                  About {aboutLabel}
                  <button onClick={() => setAbout(null)} aria-label="Talk about the newest cut">
                    ×
                  </button>
                </div>
              )}
              <textarea
                ref={boxRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Say what video you want made, or what to change about it."
                disabled={running}
              />
              {notice && <p className="notice">{notice}</p>}
              <div className="controls">
                <button
                  className="go"
                  onClick={send}
                  disabled={running || busy || !prompt.trim()}
                >
                  Build
                </button>
                <button onClick={stop} disabled={!running}>
                  Stop
                </button>
              </div>
            </div>
          </section>

          <Flow id="flow-b" />

          {/* -------------------------------- the reel -------------------------------- */}
          <section className="slab">
            <div className="slab-head">
              <h2>The video</h2>
              {video && (
                <div className="video-actions">
                  <a
                    className="keep"
                    href={media(project, video, "download=1")}
                    download={video.split("/").pop() ?? "studio-video.mp4"}
                  >
                    Download video
                  </a>
                  <button className="keep" disabled={running || busy} onClick={() => setNaming("")}>
                    Save this style
                  </button>
                </div>
              )}
            </div>
            {video && naming !== null && (
              <form
                className="save-style-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveCurrentStyle();
                }}
              >
                <input
                  className="keep-box"
                  autoFocus
                  aria-label="Name the current video's style"
                  value={naming}
                  placeholder="Name this style"
                  onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setNaming(null);
                  }}
                />
                <button type="submit" disabled={!naming.trim() || running || busy}>Save style</button>
                <button type="button" onClick={() => setNaming(null)}>Cancel</button>
              </form>
            )}
            <div className="lighttable">
              {video ? (
                <Reel
                  key={`${video}?${videoRev}`}
                  src={media(project, video, `v=${videoRev}`)}
                />
              ) : (
                <p className="placeholder">
                  The finished video plays here the moment it is rendered.
                </p>
              )}
            </div>

            {/* Every cut this reel has been, oldest first. A reel is never right
                the first time, so the earlier ones are kept and are how you say
                "that one" to the agent. */}
            {versions.length > 1 && (
              <div className="takes">
                {versions.map((v) => (
                  <button
                    key={v.rel}
                    className="take"
                    data-on={v.rel === video}
                    title={v.asked ?? v.name}
                    onClick={() => {
                      setVideo(v.rel);
                      setVideoRev((n) => n + 1);
                      // Nothing to say about the newest cut — it is the one the
                      // agent would assume anyway.
                      setAbout(v.rel === versions[versions.length - 1]?.rel ? null : v.rel);
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}

/**
 * Proof that something is happening.
 *
 * The panel used to prove it by printing every tool call, which is proof a
 * programmer can read and nobody else. With those hidden, a render is minutes
 * of an unchanging screen — so the stream ends in a spinner and a clock for as
 * long as the run lasts. The clock matters more than the spinner: "working" for
 * four minutes is patience, "working" with no idea how long is worry.
 */
function Working({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const seconds = since === null ? null : Math.max(0, Math.round((now - since) / 1000));

  return (
    <div className="working">
      <i className="spinner" aria-hidden />
      <span className="working-say">Working</span>
      {seconds !== null && <span className="working-clock">{clock(seconds)}</span>}
    </div>
  );
}

/**
 * POST a body and report how much of it has gone.
 *
 * `fetch` still has no upload progress — the request body is a black box until
 * the response arrives — so this one call is XHR. Everything else in the app is
 * fetch, and should stay that way.
 */
type Answer = {
  error?: string;
  added?: string[];
  rejected?: string[];
  materials?: Material[];
  projectSlug?: string;
};

function postProgress(
  url: string,
  body: FormData,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; data: Answer }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      let data: Answer = {};
      try {
        data = JSON.parse(xhr.responseText) as Answer;
      } catch {
        // A non-JSON body is a failure with no message; the status still tells.
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 400, data });
    };
    xhr.onerror = () => reject(new Error("upload failed"));
    xhr.send(body);
  });
}

/** Elapsed time, in the shape a person reads off a stopwatch. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Which reel you are working on, and the way to another one.
 *
 * It sits in the header rather than on a screen of its own because the studio
 * has exactly one job and putting a gallery in front of it would mean choosing
 * before you can start. Opening the app puts you in a new reel; the past ones
 * are one click away, which is the right ratio for a tool you use to make the
 * next thing rather than to browse the last ones.
 */
function Switcher({
  current,
  projects,
  onOpen,
  onRenamed,
  onDelete,
}: {
  current: string | null;
  projects: ProjectSummary[];
  onOpen: (slug: string | null) => void;
  onRenamed: (name: string) => void;
  onDelete: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  // The reel whose delete button has been pressed once. Deleting is the one
  // thing in this menu with no undo, so it takes a second click — on a button
  // that has turned red and says what it is about to do.
  const [axing, setAxing] = useState<string | null>(null);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setNaming(null);
      setAxing(null);
    }
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const here = projects.find((p) => p.slug === current);
  const label = here?.name ?? "New reel";
  const others = projects.filter((p) => p.slug !== current);

  return (
    <div className="switcher" ref={box}>
      <button className="here" onClick={() => setOpen((v) => !v)} data-open={open}>
        <span className="here-name">{label}</span>
        <Caret />
      </button>

      {open && (
        <div className="reels">
          {current !== null &&
            (naming === null ? (
              <>
                <button className="reel-rename" onClick={() => setNaming(label)}>
                  <PenIcon />
                  Rename
                </button>
                <button
                  className="reel-rename reel-axe"
                  data-sure={axing === current || undefined}
                  onClick={() => {
                    if (axing === current) {
                      setAxing(null);
                      setOpen(false);
                      onDelete(current);
                    } else {
                      setAxing(current);
                    }
                  }}
                >
                  <BinIcon />
                  {axing === current ? "Really delete this reel?" : "Delete"}
                </button>
              </>
            ) : (
              /* The name in a box, where the old one was. Enter keeps it,
                 Escape leaves it alone — the two keys anyone already tries. */
              <input
                className="reel-name-box"
                autoFocus
                value={naming}
                placeholder="Name this reel"
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = naming.trim();
                    setNaming(null);
                    setOpen(false);
                    if (name && name !== label) onRenamed(name);
                  }
                  if (e.key === "Escape") setNaming(null);
                }}
                onBlur={() => setNaming(null)}
              />
            ))}

          {current !== null && (
            <button
              className="reel-new"
              onClick={() => {
                onOpen(null);
                setOpen(false);
              }}
            >
              <PlusIcon />
              New reel
            </button>
          )}

          {others.length === 0 ? (
            <p className="reels-empty">Reels you make are kept here.</p>
          ) : (
            <ul className="reel-list">
              {others.map((p) => (
                <li key={p.slug}>
                  <button
                    onClick={() => {
                      onOpen(p.slug);
                      setOpen(false);
                    }}
                  >
                    <span className="reel-poster">
                      {p.poster ? (
                        <img src={media(p.slug, p.poster, "t=200")} alt="" loading="lazy" />
                      ) : (
                        <PhotoIcon />
                      )}
                    </span>
                    <span className="reel-said">
                      <span className="reel-name">{p.name}</span>
                      <span className="reel-meta">{summary(p)}</span>
                    </span>
                  </button>
                  {/* The same two-click delete as above, in the corner of the
                      row it is about. */}
                  <button
                    className="reel-row-axe"
                    data-sure={axing === p.slug || undefined}
                    aria-label={
                      axing === p.slug ? `Really delete ${p.name}` : `Delete ${p.name}`
                    }
                    title={axing === p.slug ? "Click again to delete" : `Delete ${p.name}`}
                    onClick={() => {
                      if (axing === p.slug) {
                        setAxing(null);
                        onDelete(p.slug);
                      } else {
                        setAxing(p.slug);
                      }
                    }}
                  >
                    {axing === p.slug ? "Sure?" : <BinIcon />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** What a project card says about itself, in the terms of the work. */
function summary(p: ProjectSummary): string {
  const bits: string[] = [];
  if (p.photos) {
    const many = p.photos >= 400 ? "+" : "";
    bits.push(`${p.photos}${many} photo${p.photos === 1 && !many ? "" : "s"}`);
  }
  if (p.versions) bits.push(p.versions === 1 ? "1 cut" : `${p.versions} cuts`);
  return bits.join(" · ") || "empty";
}

function Caret() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor"
         strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6.5 8 10.5 12 6.5" />
    </svg>
  );
}

/**
 * The finished reel, with a transport built rather than borrowed.
 *
 * Chrome's native control bar cannot be used here: it prints the running time,
 * which is the single piece of chrome most explicitly cut from this page, and
 * its grey scrubber cuts across the bottom corners of the gradient frame. So the
 * frame gets a click target and one hairline of progress in the brand spectrum —
 * the same line that runs through the rest of the page, now measuring something.
 */
function Reel({ src }: { src: string }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const screen = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [full, setFull] = useState(false);

  const toggle = () => {
    const el = video.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  // The screen goes fullscreen, not the video: the gradient frame would letterbox
  // in colour, and the browser's own fullscreen chrome puts the running time back
  // on a page that deliberately has none. What expands is the black mat, the
  // picture, and this page's own transport.
  const expand = () => {
    const el = screen.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === screen.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = video.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const box = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - box.left) / box.width) * el.duration;
  };

  return (
    <div className="filmframe">
      <div className="screen" ref={screen} data-full={full}>
        <video
          ref={video}
          src={src}
          playsInline
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setProgress(el.duration ? el.currentTime / el.duration : 0);
          }}
        />
        <button
          className="transport-play"
          onClick={toggle}
          data-playing={playing}
          aria-label={playing ? "Pause" : "Play"}
        >
          <svg viewBox="0 0 44 44" width="44" height="44" aria-hidden>
            {playing ? (
              <g fill="currentColor">
                <rect x="15" y="13" width="5" height="18" rx="1.6" />
                <rect x="24" y="13" width="5" height="18" rx="1.6" />
              </g>
            ) : (
              <path d="M17 12.5 32 22 17 31.5Z" fill="currentColor" strokeLinejoin="round" strokeWidth="3" stroke="currentColor" />
            )}
          </svg>
        </button>
        <button
          className="expand"
          onClick={expand}
          aria-label={full ? "Leave full screen" : "Play full screen"}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {full ? (
              <path d="M5.8 1.5v4.3H1.5M10.2 14.5v-4.3h4.3" />
            ) : (
              <path d="M10 1.5h4.5V6M6 14.5H1.5V10" />
            )}
          </svg>
        </button>
        <div className="transport" onClick={seek}>
          <div className="played" style={{ transform: `scaleX(${progress})` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * How many tiles the contact sheet may show: as many whole rows as fit in the
 * height left over once the Audio shelf has taken its share.
 *
 * A fixed cap cannot satisfy both halves of what this panel owes. Too high and
 * Audio falls below the fold, which is the thing the owner most objected to; too
 * low and a tall window ends in a slab of dead space under the last row. So it
 * is measured.
 *
 * This cannot oscillate, because every input is a container the content does not
 * size: the scroller's height comes from the panel, the audio shelf's height
 * from its own three rows, and `scrollbar-gutter: stable` keeps the width fixed
 * whether or not a scrollbar is showing. Only the tile count reacts.
 */
function useSheetCapacity(
  scroller: React.RefObject<HTMLDivElement | null>,
  sheet: React.RefObject<HTMLDivElement | null>,
  audio: React.RefObject<HTMLElement | null>,
  deps: unknown,
): number {
  const [capacity, setCapacity] = useState(PHOTO_TILES);

  useEffect(() => {
    const box = scroller.current;
    if (!box) return;

    const measure = () => {
      const grid = sheet.current;
      if (!grid) return;
      const tile = grid.firstElementChild?.getBoundingClientRect().width ?? 0;
      if (tile < 1) return;

      const pitch = tile + SHEET_GAP;
      const columns = Math.max(1, Math.round((grid.clientWidth + SHEET_GAP) / pitch));

      // Everything in the panel that is not the sheet itself: the shelf's own
      // heading and padding, plus the whole audio shelf. Measured from the
      // elements — NOT from scrollHeight, which reports the box's height rather
      // than the content's whenever the content is the shorter of the two, and
      // so would hand back the dead space this is trying to fill.
      const sheetH = grid.getBoundingClientRect().height;
      const shelfH = grid.parentElement?.getBoundingClientRect().height ?? sheetH;
      const audioH = audio.current?.getBoundingClientRect().height ?? 0;
      const room = box.clientHeight - (shelfH - sheetH) - audioH - 2;
      const rows = Math.max(2, Math.floor((room + SHEET_GAP) / pitch));

      setCapacity((was) => (was === rows * columns ? was : rows * columns));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (audio.current) observer.observe(audio.current);
    return () => observer.disconnect();
  }, [scroller, sheet, audio, deps]);

  return capacity;
}

/**
 * One arrow in a gutter. The two of them are a single spectrum cut in half by
 * the panels between them: the first runs violet to magenta, the second picks up
 * at rose and finishes at gold, which is where the reel's own frame starts. It
 * is the one line on the page that says what this thing does.
 */
function Flow({ id }: { id: string }) {
  return (
    <div className="flow" aria-hidden>
      <svg viewBox="0 0 50 20" width="50" height="20">
        <path
          d="M1 10h45M36 2l10.6 8L36 18"
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** A restrained white signal carries between the three studio panels. */
function FlowGradients() {
  return (
    <svg width="0" height="0" aria-hidden style={{ position: "absolute" }}>
      <defs>
        <linearGradient id="flow-a" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.36" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="flow-b" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.36" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PlusIcon() {
  return (
    <Glyph>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </Glyph>
  );
}

function DropIcon() {
  return (
    <Glyph>
      <path d="M8 1.8v8.4M4.6 6.8 8 10.2l3.4-3.4M2.2 12.4v1.8h11.6v-1.8" />
    </Glyph>
  );
}

function PhotoIcon() {
  return (
    <Glyph>
      <rect x="1.5" y="3" width="13" height="10" rx="2.5" />
      <circle cx="5.2" cy="6.4" r="1.05" fill="currentColor" stroke="none" />
      <path d="M2 11.6 6 8l2.4 2 2.1-1.9 3.5 3.2" />
    </Glyph>
  );
}

function AudioIcon() {
  return (
    <Glyph>
      <path d="M2 7v2M5 4.5v7M8 2v12M11 5v6M14 7v2" />
    </Glyph>
  );
}

function MicIcon() {
  return (
    <Glyph>
      <rect x="6" y="1.5" width="4" height="7.5" rx="2" />
      <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 13v2" />
    </Glyph>
  );
}

function ChainIcon() {
  return (
    <Glyph>
      <path d="M6.6 9.4a2.7 2.7 0 0 0 3.9 0l2-2a2.7 2.7 0 0 0-3.9-3.9l-0.8 0.8" />
      <path d="M9.4 6.6a2.7 2.7 0 0 0-3.9 0l-2 2a2.7 2.7 0 0 0 3.9 3.9l0.8-0.8" />
    </Glyph>
  );
}

function PenIcon() {
  return (
    <Glyph>
      <path d="M11.4 2.4 13.6 4.6 5.4 12.8l-3 0.8 0.8-3z" />
    </Glyph>
  );
}

function BinIcon() {
  return (
    <Glyph>
      <path d="M2.6 4.4h10.8M6 4.4V2.8h4v1.6M4 4.4l0.7 9.1h6.6l0.7-9.1M6.6 7v4.2M9.4 7v4.2" />
    </Glyph>
  );
}

function FilmIcon() {
  return (
    <Glyph>
      <rect x="1.5" y="3" width="13" height="10" rx="2" />
      <path d="M5 3v10M11 3v10M1.5 8h13" />
    </Glyph>
  );
}

function NoteIcon() {
  return (
    <Glyph>
      <path d="M6.6 11.8V3.5l6-1.3v7.6" />
      <circle cx="4.9" cy="11.9" r="1.7" />
      <circle cx="10.9" cy="9.9" r="1.7" />
    </Glyph>
  );
}

/**
 * The one drawing surface every icon uses. A 16-unit box rendered at 16px puts
 * every stroke on a whole device pixel, and one weight across all four keeps
 * them the same colour of grey at a glance — four icons drawn at three weights
 * in two box sizes read as four different hands.
 */
function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="ico"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function encodePath(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

/**
 * A file's URL. Every media request names its project, because the server holds
 * no notion of a current one — which is what lets two reels be open in two tabs.
 */
function media(project: string | null, rel: string, extra = ""): string {
  const query = [project ? `p=${encodeURIComponent(project)}` : "", extra]
    .filter(Boolean)
    .join("&");
  return `/api/media/${encodePath(rel)}${query ? `?${query}` : ""}`;
}

/**
 * A link drawn like the other materials: the site on the first line, the rest
 * of the address on the second. `www.bounded.app` is what the project is about;
 * `https://` and a trailing slash are not.
 *
 * The `www.` is worn rather than stripped, and is added when the URL lacks it:
 * it is the shape a person recognises as a website at a glance, which is the
 * whole job of this line. It is display only — the stored link is untouched.
 */
function host(url: string): string {
  try {
    const name = new URL(url).hostname;
    return name.startsWith("www.") ? name : `www.${name}`;
  } catch {
    return url;
  }
}

function trail(url: string): string {
  try {
    const u = new URL(url);
    const rest = `${u.pathname}${u.search}`.replace(/\/$/, "");
    return rest ? `Link · ${rest}` : "Link";
  } catch {
    return "Link";
  }
}

/** A file's size, in the units a person reads. */
function size(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
