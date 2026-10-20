#!/usr/bin/env bash
# Öppnar ett skal i Dev Containern, för tester och andra kommandon.
set -euo pipefail
cd "$(dirname "$0")"
# -it bara när vi har en terminal, annars går skriptet inte att köra från t.ex. ett annat verktyg
TTY=""; [ -t 0 ] && TTY="-it"
exec docker run --rm $TTY \
  -v "$PWD:/workspace" \
  -v mcp-roundtable-node-modules:/workspace/node_modules \
  -w /workspace \
  mcp-roundtable-dev bash
