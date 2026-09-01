#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Eve needs Node.js 20 or newer."
  printf "Press Enter to close…"
  read _
  exit 1
fi
URL="http://localhost:${PORT:-8787}"
( sleep 1; command -v open >/dev/null 2>&1 && open "$URL" || true ) &
exec node server.js
