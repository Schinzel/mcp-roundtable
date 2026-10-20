#!/usr/bin/env bash
# Startar utvecklingsservern i Dev Containern. Körs från Macen.
# Bygger imagen första gången, installerar beroenden och startar wrangler dev.
# Servern nås på http://localhost:8787, MCP på http://localhost:8787/mcp. Ctrl+C stoppar.
set -euo pipefail
cd "$(dirname "$0")"

IMAGE=mcp-roundtable-dev
VOLUME=mcp-roundtable-node-modules

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Bygger $IMAGE ..."
  docker build -q -t "$IMAGE" .devcontainer
fi

# -it bara när vi har en terminal, annars går skriptet inte att köra från t.ex. ett annat verktyg
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
