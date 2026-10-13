# Studio by Spaceblanket.ai

A window onto Claude Code that makes videos. Drop your material on the left, say
what you want in the middle, watch the video appear on the right.

This studio is based on [Reel Studio by Oleg Melnikoff](https://github.com/melnikoff-oleg/reel-studio).

It is a thin wrapper and nothing more. The thing doing the work is Claude Code
with the HyperFrames skills, which is what lets the box in the middle take a
plain English sentence instead of the fifteen controls an editor would need.

Rendering happens on your machine. Claude Code still uses Anthropic's service
to interpret your instructions and may send content you provide to that service;
your Claude plan or Console usage may have a cost. Check its terms before using
sensitive material.

## Set it up with one message

Give the following **one sentence** to a coding assistant that can use your
computer's terminal (for example, Claude Code or Codex). It works as a request
on macOS, Linux, or Windows; the assistant should check your system and find
your actual Documents folder before choosing commands.

> Set up Studio by Spaceblanket.ai on my laptop from https://github.com/nikhaij12/studio.spaceblanket.ai: read its README, detect my operating system and Documents folder, clone it into a `studio-spaceblanket-ai` folder there without overwriting an existing copy, install only missing Git, Node.js 22 or newer, ffmpeg, Python 3, and official Claude Code CLI prerequisites, ask before administrator-level changes and let me complete Claude sign-in myself, run `npm install`, start the app, verify that it loads, leave it running, and tell me the exact local URL to open and anything I still need to do.

The assistant needs permission to run terminal commands on your laptop. It
cannot sign in to Claude for you, and the `localhost` link it gives you works
on **that laptop only**; it is not a public link you can send to someone else.
If you already have a `Documents/studio-spaceblanket-ai` folder, it should inspect and
reuse it or ask what to do, **not delete or replace it**.

### What a successful setup looks like

1. `node -v` reports **22 or newer**, and `git --version`, `ffmpeg -version`,
   `python3 --version` (or `py -3 --version` on Windows), and
   `claude --version` all work. Use the [official Node.js download](https://nodejs.org/en/download)
   and [Claude Code setup guide](https://code.claude.com/docs/en/setup) if a
   prerequisite is missing. Installation may require your approval or an
   administrator password; do not paste passwords or login codes into a chat.
2. Run `claude` once in a terminal and finish its interactive sign-in. A Claude
   plan or Console account with Claude Code access is needed to make videos.
3. Clone [this repository](https://github.com/nikhaij12/studio.spaceblanket.ai) into
   Documents (or open the existing clone), then run `npm install` inside it.
4. Run `npm run dev`, keep that terminal open, and open
   [http://localhost:4321](http://localhost:4321). If that port is occupied,
   start Next.js on another available port and use the URL it prints. Check
   that the page actually loads before declaring setup complete.

If you prefer to do it yourself, the detailed instructions follow.

## What you need

Four things, once.

1. **Node.js 22 or newer** — nodejs.org, the LTS download. Check with
   `node -v`. Twenty is not enough: the HyperFrames renderer needs 22, and on
   an older Node the app installs cleanly and then fails at the moment it
   writes the video.
2. **Claude Code, version 2.1 or newer** — `curl -fsSL https://claude.ai/install.sh | bash`
   on macOS and Linux, `irm https://claude.ai/install.ps1 | iex` in PowerShell
   on Windows (`npm install -g @anthropic-ai/claude-code` gets you the same
   binary). Then run `claude` once in a terminal and sign in. This is the part
   that actually makes the videos, so it has to work on its own before the
   studio will do anything. It needs a Claude subscription (Pro or better —
   the free plan does not include Claude Code) or Console credit.
3. **ffmpeg** — `brew install ffmpeg` on a Mac, `sudo apt install ffmpeg` on
   Ubuntu, `winget install Gyan.FFmpeg.Essentials` on Windows. Rendering shells
   out to it.
4. **Python 3** — check with `python3 --version` (or `py -3 --version` on
   Windows); install it if missing. Some video workflows use it for audio work.

And one more, only if you want the studio to *find* things for you rather than
only cut what you gave it: the **`heygen` CLI**, signed in. Stock footage,
generated music, icons, cloned voices and colour grades all come through the
`media-use` skill, which needs it. Everything made from your own photos, clips,
voice takes and licensed tracks works without it. That is the one place where a
third party is involved, and it is opt-in.

The studio runs `claude` as a program, not as an editor plug-in, so what has to
work is `claude` typed into a terminal. Installing the VS Code extension is
convenient — it gives you the same thing in a side panel — but the extension
deliberately does not put `claude` on your PATH, so it is not on its own enough.
If `claude --version` prints a number, you are ready.

**Platforms.** Built and used on macOS; Linux is the same shape. Windows is
best-effort: the studio starts a run by spawning `claude` directly, which may
fail if your install put only a `.cmd` shim on PATH. Prefer the official native
Claude Code installer on Windows. If a run still dies instantly, try running
the project under WSL rather than deleting files from the repository.

## Get it

On macOS or Linux, from a terminal:

    cd ~/Documents
    git clone https://github.com/nikhaij12/studio.spaceblanket.ai.git studio-spaceblanket-ai
    cd studio-spaceblanket-ai

On Windows, from PowerShell:

    Set-Location ([Environment]::GetFolderPath('MyDocuments'))
    git clone https://github.com/nikhaij12/studio.spaceblanket.ai.git studio-spaceblanket-ai
    Set-Location studio-spaceblanket-ai

If the folder already exists, do not clone over it. Open it and check what is
inside first. Windows may keep Documents under OneDrive; the PowerShell command
above resolves its configured location.

No git? Open https://github.com/nikhaij12/studio.spaceblanket.ai, press the green
**Code** button, choose **Download ZIP**, and unzip it. The folder you end up
with is the whole thing — the app, the agent's instructions, and every
HyperFrames skill it uses. Nothing else gets fetched at install time except npm
packages.

Put it wherever you keep your own files. It writes only inside itself, so a
Documents folder is fine and so is the Desktop.

## Install and run

In a terminal inside the folder:

    npm install
    npm run dev

Then open http://localhost:4321

On a Mac, after installing the prerequisites, you can skip the two run commands:
double-click `start.command`. It installs npm packages if needed, starts the
studio, and opens your browser. It does **not** install Node, Claude Code,
ffmpeg, or Python for you. macOS may ask you to confirm the first time —
right-click it and choose Open. (Windows and Linux: use the two commands above.)

The terminal it leaves behind is the app's engine. Nothing in it needs reading;
closing it stops the studio.

### What to expect the first time

`npm install` takes a minute or two. The first video takes much longer than
later ones: the agent installs the HyperFrames renderer on first use and pulls
down its own copy of Chromium (~150 MB) to render pages into frames, so that
first run needs an internet connection even though the rendering itself is
local. A short video is usually a few minutes; a long one with captions and
music can be fifteen. The middle panel shows a spinner and a clock for as long
as it is working.

A fresh clone has an **empty `music/` folder**, on purpose — a licence is yours,
not this repo's to ship. The studio works without it; ask for music and the
agent will say there is none. Drop your own licensed `.mp3` or `.wav` files into
`music/` and they become available to every project at once.

`projects/` starts empty too, and stays empty until you actually give the studio
something. Opening the app creates nothing.

### If something is wrong

- **"command not found: claude"** — Claude Code isn't installed, or isn't on
  your PATH. Run `claude` in a terminal; until that works, the studio can't.
- **The middle panel says the run didn't start** — same thing. Check the
  terminal the studio is running in for the actual error.
- **A hydration warning names `cz-shortcut-listen` on `<body>`** — a browser
  extension added that attribute before React loaded. Try a private window or
  turn off the extension for localhost. This is not caused by Node.js.
- **Port 4321 is in use** — something else is on it. Run `npx next dev -p 4400`
  and open http://localhost:4400 instead; `start.command` reads `PORT` for the
  same reason.
- **The video never appears on the right** — the studio only looks in the
  project's `out/` folder. If the agent says it wrote one somewhere else, tell
  it: "put the finished video in this project's out folder".
- **Install fails on Windows or Linux** — save the full npm error first; the
  cause may be a platform-specific optional dependency, Node version, or
  network issue. If npm points specifically to an incompatible lockfile, try
  `npm install --package-lock=false` without deleting the tracked lockfile.
- **The run starts and immediately stops** — three things do this. The `claude`
  you have works but has no credit or no subscription attached; or it is old
  enough not to know `--permission-mode dontAsk` and exits on the unknown flag
  (`claude --version` must be 2.1 or newer); or you are on Windows and what is
  on your PATH is a `.cmd` shim. Run `claude` in a terminal and send it one
  message; whatever it says there is the real error.
- **Every render fails but the app is fine** — check `node -v`. Below 22, the
  renderer will not run.
- **A style does not appear after saving** — wait for the confirmation message
  in the studio. Saving analyzes the video with Claude Code; check that `claude`
  is signed in and read any error in the Instructions panel. The style should
  then appear under Your styles.
- **It says it can't find music, or can't find a stock shot** — a bed comes from
  the `music/` folder in this repo, which ships empty; anything *found* rather
  than supplied needs the `heygen` CLI signed in (see "What you need").

## Making a video — the whole of it

1. Open the app. You are in a new, empty project already.
2. Drop your photos, clips, voice takes and notes on the left panel. Paste a
   link there too — the product page the video is about, the article it
   explains.
3. Say what you want in the middle box and press Build.
4. The video plays on the right when it is done. Type a change; it re-cuts.

There is nothing else to configure and no file to edit. That is the point: a
person who does not know what a project folder is can make a video here.

## What it can make

Whatever you can describe. Captions timed to your voice, footage cut to a beat,
motion graphics, a talking-head recut with the pauses taken out, a photo
montage, a title card, a different look on the same edit.

Nothing on the working screen suggests what to type. Example pills lived under
the chat box briefly and were cut: an empty box says "anything", and a pair of
examples quietly narrows it to two things. What it can do lives on its own
page, read once.

If it asks a question, answer it in the box. It is a conversation, not a form.

"What it can do", top right, is the one page of documentation: what it makes,
what it can find for you, and the sentence that gets each one. It reads in a
minute and is deliberately the quietest thing in the header — it answers a
question you have once, before you start.

## Saving a style, and using it again

When a video looks the way you want, press Save this style, type a name, and
press Save style. Wait for confirmation; the studio checks that Claude actually
wrote the reusable skill. To keep the finished MP4 itself, press Download video.

The saved style then appears as a chip above the chat box, under Your styles.
Click it and the sentence lands in the box: "Use my saved X style for this."
Add whatever else you want and press Build. It applies to completely different
material — that is the point of saving one.

A style is a Claude Code skill, and that is not a metaphor: it is a folder with
a `SKILL.md` in `.claude/skills/`, exactly like the workflows that ship with
this app, found by the agent the same way. Nothing about it is specific to this
app, and you can edit or delete one by hand.

The studio knows which skills are yours by knowing which ones came with it —
anything else in that folder is a style you saved. No registry, no marker, and
no cooperation needed from the agent that wrote it.

A style does not have to come from a video the studio made. New style from a
video, at the end of the chips, takes a video you admire — yours or anyone's —
uploads it into the project like any other clip, and has the agent study it:
a few frames pulled out with ffmpeg and looked at on your own machine, no
external service. Name it, press Save, and the look joins the rail as a chip
you can apply to your own material.

## Everything is in this folder

The studio runs Claude Code with this folder as its working directory, which
means the agent reads this folder's `CLAUDE.md` and this folder's
`.claude/skills`. Zip the folder, hand it to somebody, and the instructions and
the whole pipeline travel with it.

- `CLAUDE.md` — the ten lines that tell the agent what job it has
- `.claude/skills/` — HyperFrames and its workflows, plus any style you save
- `projects/` — one folder per video, your material and your renders
- `music/` — the shared track library; drop your licensed beds in here

What does *not* travel with it is whatever you already have globally: your own
`~/.claude/CLAUDE.md`, your global skills, your settings and your MCP servers
all still load on top. Nothing here isolates the run from them. On a machine
with a heavily customised global config, the agent is this folder's
instructions plus yours, not this folder's alone.

`.claude/skills/` is HeyGen's open-source HyperFrames skill set, vendored so a
clone is self-contained and so a style you save lands beside them. They are
theirs, not this repo's invention.

## Projects — one folder per video, inside the app

Every video lives in `projects/<date>_<name>/`, and the folder listing IS the
list — no database, no index file, so a project copied in by hand appears and a
deleted one is simply gone. The switcher beside the wordmark opens past projects;
it is a chip in the header rather than a gallery screen because the app opens on
the thing you came to make, and a picker in front of that would mean choosing
before starting.

Renaming is in the switcher: open it, press Rename, type, press return. The
folder on disk is renamed too — the folder IS the project here, it is what you
open in Finder and copy to another machine, and a project called "reel" on disk
while the app calls it something else is two names for one thing. The date
prefix is kept, since that is what orders the folder and not the part anyone is
renaming.

Deleting is in the switcher too: Delete under the current reel, a bin on every
row of the list. It takes two clicks — the first turns the button red and makes
it say what it is about to do — because it removes the folder from disk and
there is no undo. If the reel had a live agent, that run is stopped and
forgotten with it.

Two rules that look like bugs if you don't know them:

- **Opening the app does not create anything.** A new project is a name on
  screen until the first file lands or the first message is sent, and only then
  does `POST /api/projects` make the folder. Otherwise every idle visit would
  leave an empty dated folder behind and the switcher would fill with projects
  nobody made.
- **The server has no notion of a current project.** Every request names its own
  (`?p=<slug>`), which is what lets two projects be open in two tabs with a run
  going in each. Sessions have always been keyed by folder; only the UI was
  single-project.
- **An upload answers with the new list of materials**, and the panel takes it
  from there rather than fetching state again. The reload used to go through a
  closure over "the current project", which is null when the very drop being
  handled is what created the project — so sixty files landed on disk and the
  panel stayed empty until you switched reels and came back. The effect that
  would have caught it fires the moment the project is set, which is *before*
  the upload finishes, so it saw an empty folder. Answering with the truth
  removes the round trip and the whole class of bug. `loadState` also takes an
  explicit slug now, and carries a sequence number so a slow early answer can't
  overwrite a fast later one.
- **The upload is the one XHR in the app.** `fetch` still cannot report upload
  progress, and sixty camera originals is a real wait — a wait with nothing
  moving reads as nothing happening. The dock turns into a labelled progress
  bar driven by actual bytes.
- **A rename moves the live agent with the folder** — `moveSession` re-keys it,
  and the next message tells the agent the new path, because its opening turn
  named the old one and it would otherwise render into a folder that is gone.
  That function writes the session's fields directly instead of calling a
  method on it, and that is not a style choice: the session map lives on
  `globalThis` so a hot reload cannot orphan a running render, which means it
  can hold instances built from an earlier version of the module, whose
  prototype is missing any method added since. Calling one throws mid-rename.

Two environment variables survive, and they are the whole configuration surface.
`REEL_PROJECTS` moves the projects folder somewhere other than inside the app —
useful if your videos live on an external disk. `REEL_PROJECT` points the studio
at one single folder outside the app, which is how it ran before projects
existed.

## Versions — every cut, and what made it

A video is never right the first time: you render, watch it, change the music,
render again. Those renders accumulate in the project's `out/`, so the rail under
the picture needs no new bookkeeping — it numbers them oldest-first (v1, v2, v3)
and clicking one plays it.

Clicking an older one also puts an "About v2" chip in the composer, and the next
message carries a line telling the agent which cut is meant. The chip is visible
and removable on purpose: selecting a version silently changing what your
sentence means would be hidden state.

**Each render keeps everything it was built from.** When a run finishes and
wrote a new `.mp4`, `snapshotRender` clones the whole project — composition,
build scripts, stems, notes — into `versions/<render-stem>/`, minus output and
installs, with an `about.json` recording what was asked for. Which folders a
build uses is the agent's business and differs per kind of video, so the
snapshot takes everything rather than a list this app maintains. Without it, "go
back to v2 but with the other track" means rebuilding v2 from memory, because
the next render overwrites the composition in place.

This is affordable only because it clones: `cp -c` makes the tree copy-on-write,
so a measured snapshot of the Paris reel is 76 MB of materials for 0.5 MB of
actual disk, written in 58 ms. A filesystem without clonefile falls back to a
real copy rather than keeping nothing. Snapshotting is wrapped in a catch — it is
a courtesy to your future self, never the thing that fails a finished render.

## How it works

- `POST /api/run` spawns Claude Code in this app's folder. The whole command,
  since it is the one thing worth being able to reproduce by hand:

      claude -p <prompt> --output-format stream-json --verbose \
        --include-partial-messages --forward-subagent-text \
        --permission-mode dontAsk \
        --allowedTools Read,Write,Edit,Glob,Grep,Bash,WebFetch,WebSearch,Skill,Task,TodoWrite \
        [--resume <session id>]

  with the cwd set to this folder, the environment inherited plus
  `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0`, stdin ignored, and no `--model` —
  so it runs whatever model you have set as your default. The first turn names
  the `hyperframes` skill and the project path; every later turn passes
  `--resume` so feedback lands in the same session. It names the router rather
  than one workflow — the router reads the request and picks captions, motion
  graphics, a slideshow or whatever fits. Naming a workflow here would make the
  studio a machine for one kind of video.
- The process is owned by a module-level session, not by the HTTP request, so a
  render that takes fifteen minutes survives page reloads.
- `GET /api/events` is an SSE feed. Streamed text and reasoning arrive as deltas
  and are coalesced server-side into one growing event per block, so the client
  upserts on `seq` instead of appending thousands of fragments.
- `GET /api/media/<path>?p=<slug>` serves photos and the video out of the project
  folder, with Range support so the video can be scrubbed. The slug is a single
  path segment of safe characters and the path is resolved and confined to the
  project root — those two checks are the whole of what stands between a query
  parameter and the rest of the disk.
- `POST /api/upload` takes files dropped on the left panel and writes them into
  the project. Each kind lands in whichever folder already holds most of that
  kind, so a dropped file arrives where its kind lives rather than in a directory
  of this app's invention. Photos, video, audio and notes are accepted, the name
  is reduced to a basename before it touches the disk, and an existing name is
  never overwritten (`rec1.m4a` next to a `rec1.m4a` becomes `rec1-2.m4a`).
- The right panel plays a render out of the project's `out/` (or `reel/out`, for
  projects made before that convention), and the rail under it lists every one.
  The agent chooses the filename; the app discovers it.

## Recording and replay — server-side only, no UI

The engine can still record a run to
`<project>/YYYY-MM-DD_studio_run_HHMM.jsonl` (`POST /api/run` with
`{"record": true}`) and replay one at 3x pacing (`POST /api/replay`). Nothing in
the interface exposes either: the record tick-box and the replay picker were two
controls and a filename dropdown that no viewer of a demo needs, and they cost
more clarity than they bought. The capability is kept because a scripted
simulation of a run may be wanted later; if it comes back, it should come back as
something that does not look like a settings panel.

## Permissions — read this before pointing it at anything else

The agent runs unattended, so nothing may block on an approval prompt. The run
uses `--permission-mode dontAsk` with an explicit allowlist, which denies every
tool not named:

    Read, Write, Edit, Glob, Grep, Bash, WebFetch, WebSearch, Skill, Task,
    TodoWrite

`Bash` is unscoped, because rendering shells out to python, ffmpeg and the
HyperFrames renderer. That means an unattended agent can run arbitrary shell
commands with your user's privileges. That is the deal this tool makes to be a
one-click studio: fine on your own machine, not something to expose to an
untrusted prompt or run on a shared box.

`WebFetch` and `WebSearch` are there because a link is one of the materials the
left panel accepts, and "make a video about this page" has to be able to read
the page. Without them the only route is a bash `curl`, which is a worse tool
for the job on a wider surface.

Narrow `ALLOWED_TOOLS` in `lib/session.ts` if you want a tighter surface — e.g.
scope bash with `Bash(python3 *)`.

## Look and feel — the choices are deliberate

The direction is "darkroom glass": translucent slabs floating over a grainy
almost-black ground, with Instagram's palette used as an accent rather than as
the surface. Things that are easy to mistake for oversights and undo:

- **The ground is almost black, and it has to stay that way.** Sampled, the
  gutters sit around rgb(13,13,14) and the lit corners reach rgb(23,22,35). An
  earlier version ran seven ambient pools at three times the opacity, which
  turned a near-black app into a purple-grey one — the colour stopped being an
  accent and became the surface. Three soft pools is the whole budget.
- **Panels pop by edge and shadow, not by fill.** Because the ground is this
  dark, the panel wash must NOT fade out at the bottom or a slab stops reading as
  a slab; the linear wash therefore ends at .058, not at .03. Measured panel/
  gutter contrast is about 1.25. If it needs to pop more, raise `--edge`, `--lit`
  and the dark halo in `--drop` — do not lighten the ground.
- **The colour is one thread, not a set of accents.** Instagram's spectrum is cut
  into pieces and laid along the page in the order the work happens: violet at
  the wordmark, violet-to-magenta in the first arrow, rose-to-gold in the second,
  and the full spectrum around the finished reel's frame. Read left to right, the
  page is one gradient interrupted by the panels doing the work. That is why
  `--brand-mark` is three stops and not six — six reads as a flag, three reads as
  light falling across the letters — and why the two arrows do not share a
  gradient. Everything else is achromatic on purpose, so the photographs and the
  reel are the only saturated things on screen. `--safelight` is held clear of
  the spectrum's orange end so an error can never be mistaken for an accent. No
  Instagram mark or wordmark appears anywhere — this borrows a palette, it does
  not impersonate a brand.
- **The logo has no plate under it, and it is a lockup, not a word.** The glass
  card that used to sit there framed nothing and separated nothing; it was
  decoration pretending to be structure. But gradient type on its own was a flat
  sticker on the room — nothing to catch light on and nothing to cast. So the
  mark from the favicon sits beside the word: a frame with the play triangle
  knocked out of it, ringed and shadowed, which gives the logo a body and the
  wordmark something to belong to. The mark carries the whole spectrum on
  purpose even though the wordmark carries only its first slice: it is the seed
  the rest of the page unfolds left to right.
- **The travelling light is the status indicator, and there is no idle state.**
  The wordmark's gradient drifts and the LED pulses while a run is live; when
  nothing is running, the readout is not there at all. It used to print "Idle",
  which is a machine announcing that it has nothing to announce — the still page
  already says it.
- **`.ambient` is a fixed layer, not `background-attachment: fixed`.** The latter
  forces the whole compositing tree to repaint on every scroll.
- **The reel's transport is built, not borrowed, and so is its full screen.**
  Chrome's own control bar prints the running time, which is the single piece of
  chrome most explicitly cut from this page, and its grey scrubber cuts across
  the bottom corners of the gradient frame. So: click to play, one hairline of
  the reel's own colours for progress, and a corner button that fullscreens the
  black mat inside the frame rather than the video element — fullscreening the
  video hands the browser's chrome and its clock straight back. In full screen
  the picture is centred by `object-fit`, never by layout: the panel sizes the
  video with `height: 100%`, and 100% of an auto-sized box is indefinite, so the
  video falls back to its intrinsic 1080x1920 and runs off the bottom of the
  screen. Measured before and after: 880x1564 in a 880x600 window, then 880x600
  with the picture letterboxed at 9:16 inside it.
- **A playing reel has no overlay at all — not a transparent one.** The glyph's
  `:hover` rule and its `[data-playing]` rule have equal specificity, so for a
  while the hover won and crossing the picture with the pointer dropped a pool of
  shade and a pause glyph over a reel someone was watching, full screen included.
  The playing rule now comes second and takes `pointer-events` with it, so the
  element cannot be hovered while it is invisible and the picture itself is the
  click target. Verified in all three states: playing with the pointer parked in
  the middle (overlay 0, `pointer-events: none`, `elementFromPoint` is the
  video), clicking it (paused, overlay back and clickable), and the same again
  in full screen. Keyboard focus is the one exception, because a control has to
  be findable to be usable.
- **The agent's column is the narrowest on screen, on purpose.** It used to be
  the widest. Nobody watching a demo needs the internals to be the biggest thing
  in the frame; the input and the result do. `tool_result` rows are filtered out
  of the stream for the same reason — they were the noisiest thing the engine
  emits and the least legible.
- **The column widths are derived, not chosen.** The reel panel is as wide as a
  9:16 video is when it is as tall as the panel; the agent's column is the
  narrowest that keeps a line of prose readable; materials takes the remainder,
  which is what lands its contact sheet on six whole columns.
- **Type runs in three registers that never trade places.** Michroma
  for the wordmark and the three panel names, JetBrains Mono for eyebrows, state
  and the agent's own voice, DM Sans for anything a person reads as content. The
  shelf eyebrows are mono precisely so they cannot compete with the panel name
  above them.

## Materials is a place you put things

The left panel is the drop target — the whole panel, not a strip inside it —
because a pile of your own photographs is something you throw at a place. It
lights up and says "Drop to add" while something is over it, and the files it is
already holding are drawn as files: the real filename with its real extension,
the real size, and an icon for which of the two kinds it is.

That last part reverses an earlier decision, on purpose. Filenames and sizes were
cut from this panel as residue, and they are back because the panel's job
changed: once it is somewhere you can put a file, what is in it has to look like
what you would put there, or the drop zone is a claim the interface doesn't back
up. Dragging is also invisible until you try it, so there is an "Add files"
button doing the same job for anyone who never thinks to drag.

## What the panels are allowed to say

Every other label on this page had to earn its place, and most of them didn't.
Removed deliberately, so they don't get helpfully added back: the file count on
Materials, the project folder's name in the header, the source folder under each
shelf, per-shelf counts, photo filenames, the reel's duration, the render's
filename, the "9:16" badge, the "Idle" state readout, and the "Cmd + Enter to
build · follow-ups stay in the same session" hint.

What is left: a shelf per kind of material with an icon and a one-word name, one
row per source file, the dock, and the three panel headings.

## The contact sheet sizes itself

`useSheetCapacity` measures how many whole rows of tiles fit in the height the
panel has left once the Audio shelf and the dock have taken their share, and
shows exactly that many with a `+N` tile in the last slot. A fixed cap cannot
satisfy both halves of what the panel owes: too high and Audio drops below the
fold, which is the thing the owner objected to most; too low and a tall window
ends in a slab of dead space. At 1680px wide it settles on 12 tiles at 760px
tall, 30 at 1000, 48 at 1300.

It cannot oscillate, because every input is a container the content does not
size — the scroller's height comes from the panel, the audio shelf's from its own
rows, and `scrollbar-gutter: stable` holds the width whether or not a scrollbar
is showing. Note that the room left over is computed from the elements, never
from `scrollHeight`: that reports the box's height rather than the content's
whenever the content is the shorter of the two, which hands back the dead space
the measurement exists to remove.

**A link is a material.** A video is often made *about* something that lives on
the web, and a panel that only takes files says that kind of source doesn't
exist — so the URL ends up in the chat box, where it scrolls away. Add link puts
it on the shelf beside the photos. They are kept in a plain `links.md` at the
top of the project, one per line, because the agent reads the folder anyway and
a markdown list needs no parser, no schema and no explaining; editing it by hand
works. A bare `bounded.app` is what a person types, so a scheme is assumed
rather than refused, and only http and https survive — everything else a
browser will hand over (`javascript:`, `file:`, `data:`) is either useless to
the agent or something it should never be handed at all. A link is also the one
material you can add by mistyping it, so it is the one with an × on the row.

The `Clips` shelf was cut once, when this made photo reels and only photo reels,
and is back now that it doesn't: a studio that silently swallows the footage you
dropped is worse than one that shows it. `Notes` stayed cut. A script or a
transcript is something the agent reads, not something you look at while making
a video — dropped text still lands in the project, it just isn't a shelf.

Type is three faces with three jobs. Michroma carries the wordmark and panel
titles; DM Sans is the interface voice; JetBrains Mono is the instrument
readout for streams, paths, and sizes.

## Contact-sheet thumbnails

`lib/thumbs.ts` resizes photos with sharp and caches them under the OS temp
directory; the sheet requests `?t=200`. This is not an optimisation, it is the
difference between working and not: the photos are camera originals — 158 MB
across 73 files, up to 5712x4284 — and handing those to the browser to paint a
72px tile meant it decoded every one at full resolution. Scroll frames were
hitting 500 ms, with a worst case of 2.7 seconds. With thumbnails the same scroll
never exceeds 10 ms, and a cold cache fills all 73 tiles in about 600 ms.

Only a fixed set of widths is honoured, because an open size parameter is a
resize bomb. Cache keys include size and mtime, so editing a photo invalidates
its thumbnail without anyone clearing anything.

## What "Materials" counts, and which render plays

Both of these look like bugs if you don't know the rule.

- **Materials means what you supplied, not what the pipeline derived.**
  `scanMaterials` skips `out/`, `reel/`, `build/` and `versions/`. A build writes
  a card and a punch crop of every photo, so without that skip 73 real photos
  show up as 260 near-identical tiles — and `versions/` holds a clone of all of
  that per cut.
- **A finished video is one in a named output folder, not any .mp4.** Only `out/`
  and `reel/out` are listed. A build leaves dozens of per-attempt renders around
  and dropped footage is an .mp4 too; both would otherwise show up as cuts. The
  panel opens on the newest one and the rail is how you get back to the others.
- **The music is found outside the project, by name.** Beds are scored from the
  shared `music/` library in this folder, so nothing in the project folder is the
  track — `lib/music.ts` lists the library and looks for each filename in the
  project's own text instead. A reel can be scored from more than one track and
  usually is: this one runs a different bed under its Dubai section and its Paris
  section. An earlier version narrowed matches to the ones whose line also named
  the project, on the theory that a build script's spec table lists other videos'
  beds. That theory was wrong here and it silently hid a track that really is in
  the cut, so every referenced track now counts.
- **A finished run only takes over the panel if it actually wrote a render** —
  `newestRenderSince`, not "newest file". Otherwise every completed turn dragged
  the panel onto whatever was newest in `reel/out`, including experiments you had
  deliberately switched away from.

## Notes

- **The panel shows the agent's sentences, not its tool calls.** `tool` and
  `tool_result` rows are both filtered out, and the engine's "Session up, N
  tools available" is no longer emitted at all — bash, Read and Glob are the
  machinery of making a video rather than the making of it, and someone who has
  never opened a terminal reads a wall of them as errors. That is only honest
  if something says work is still happening, so the stream ends in a spinner
  and an elapsed clock for as long as the run lasts. The clock does the real
  work: four minutes with a number on it is patience, four minutes without one
  is worry. Its start is read off the last `asked` event rather than kept in
  state, so a reload mid-render still shows the true elapsed time.
- Reasoning rows are often empty: current models omit their raw chain of thought,
  so `thinking` blocks stream with no text. Blocks are emitted lazily, so those
  never show up as blank rows.
- `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` is set on the child so a long render
  is not cut off by the default background-task grace period.
- **`/api/media` builds its own `ReadableStream` instead of using
  `Readable.toWeb`.** Every seek and every switch between cuts abandons a range
  request mid-flight, and that adapter keeps enqueueing into a controller the
  runtime has already closed — an ERR_INVALID_STATE thrown from inside it, which
  no try/catch here can reach, arriving as an uncaughtException. Six full UI
  passes went from 16 of them to none. Don't swap the hand-wired version back.
- `--bare` is deliberately not passed. It would skip loading project skills, and
  the skill is the entire pipeline.
