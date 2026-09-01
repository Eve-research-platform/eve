#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
FILE="${1:-}"
if [ -z "$FILE" ]; then
  printf "Path to eve-relay-setup.json: "
  read FILE
fi
node scripts/deploy-relay.mjs "$FILE"
