#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Eve needs Node.js 20 or newer." >&2
  exit 1
fi
echo "Starting Eve at http://localhost:${PORT:-8787}"
exec node server.js
