#!/usr/bin/env bash
# Opens a shell in the Dev Container, for tests and other commands.
set -euo pipefail
cd "$(dirname "$0")"
# -it only when we have a terminal, otherwise the script cannot be run from e.g. another tool
TTY=""; [ -t 0 ] && TTY="-it"
exec docker run --rm $TTY \
  -v "$PWD:/workspace" \
  -v mcp-roundtable-node-modules:/workspace/node_modules \
  -w /workspace \
  mcp-roundtable-dev bash
