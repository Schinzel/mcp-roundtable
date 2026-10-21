#!/usr/bin/env bash
# Starts the development server in the Dev Container. Run from the Mac.
# Builds the image the first time, installs dependencies and starts wrangler dev.
# The server is at http://localhost:8787, MCP at http://localhost:8787/mcp. Ctrl+C stops it.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE=mcp-roundtable-dev
VOLUME=mcp-roundtable-node-modules

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building $IMAGE ..."
  docker build -q -t "$IMAGE" .devcontainer
fi

# -it only when we have a terminal, otherwise the script cannot be run from e.g. another tool
TTY=""; [ -t 0 ] && TTY="-it"
exec docker run --rm $TTY \
  -p 8787:8787 \
  -v "$PWD:/workspace" \
  -v "$VOLUME:/workspace/node_modules" \
  -w /workspace \
  "$IMAGE" bash -c '
    bun install --silent
    exec bunx wrangler dev --ip 0.0.0.0 --port 8787
  '
