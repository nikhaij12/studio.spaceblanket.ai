#!/bin/bash
# Double-click this file to start Reel Studio.
cd "$(dirname "$0")" || exit 1

PORT="${PORT:-4321}"

# Every prerequisite is checked here, not discovered ten minutes into a render.
# A missing ffmpeg used to fail at the moment the video was written, which reads
# as "the studio is broken" rather than as "one install is missing".
fail() {
  echo "$1"
  read -r -p "Press return to close."
  exit 1
}

command -v node >/dev/null 2>&1 ||
  fail "Node.js is not installed. Get it from nodejs.org (the LTS download), then double-click this again."

node -e 'process.exit(parseInt(process.versions.node) >= 22 ? 0 : 1)' ||
  fail "Node.js $(node -v) is too old — the renderer needs 22 or newer. Update from nodejs.org, then double-click this again."

command -v claude >/dev/null 2>&1 ||
  fail "Claude Code is not installed. Run:  curl -fsSL https://claude.ai/install.sh | bash"

command -v ffmpeg >/dev/null 2>&1 ||
  fail "ffmpeg is not installed. Run:  brew install ffmpeg"

command -v python3 >/dev/null 2>&1 ||
  fail "Python 3 is not installed. Get it from python.org, then double-click this again."

[ -d node_modules ] || npm install

# Open the studio once the server is up.
( for _ in $(seq 1 40); do
    if curl -s -o /dev/null "http://localhost:$PORT"; then open "http://localhost:$PORT"; break; fi
    sleep 0.5
  done ) &

npm run dev -- -p "$PORT"
