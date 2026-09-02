#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(tr -d '\r\n' < "$ROOT/VERSION")"
LABEL="${EVE_PACKAGE_LABEL:-v${VERSION}}"
OUT="${1:-$ROOT/Eve-${LABEL}-local-relay-kit.zip}"
# Resolve relative output paths before changing into the temporary staging directory.
if [[ "$OUT" != /* ]]; then OUT="$PWD/$OUT"; fi
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
KIT="$STAGE/Eve-${LABEL}-local-relay"
mkdir -p "$KIT"
cp -R "$ROOT/app" "$ROOT/lib" "$ROOT/cloudflare-relay" "$KIT/"
cp "$ROOT/server.js" "$ROOT/v52_routes.js" "$ROOT/start-eve.bat" "$ROOT/start-eve.command" "$ROOT/start-eve.sh" "$ROOT/VERSION" "$KIT/"
cp "$ROOT/deploy/local/README.md" "$KIT/README.md"
mkdir -p "$(dirname "$OUT")"
(cd "$STAGE" && zip -qr "$OUT" "Eve-${LABEL}-local-relay")
echo "Built $OUT"
