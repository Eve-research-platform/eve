#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; VERSION="$(tr -d '\r\n' < "$ROOT/VERSION")"; REPO_SLUG="${1:-OWNER/REPOSITORY}"; OUT="${2:-$ROOT/dist}"
rm -rf "$OUT"; mkdir -p "$OUT"; STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
FULL="$STAGE/Eve-v${VERSION}-full"; mkdir -p "$FULL"
(cd "$ROOT" && tar --exclude='./.git' --exclude='./node_modules' --exclude='./dist' --exclude='./_site' -cf - .) | (cd "$FULL" && tar -xf -)
if [[ "$REPO_SLUG" != "OWNER/REPOSITORY" ]]; then
  (cd "$FULL" && node scripts/set-canonical-repository.js "$REPO_SLUG" "v${VERSION}")
  python3 - "$FULL/deployment-config.js" "$VERSION" <<'PY2'
from pathlib import Path
import sys,re
p=Path(sys.argv[1]); version=sys.argv[2]; s=p.read_text()
s=re.sub(r'channel:\s*"[^"]+"', 'channel: "stable"', s)
s=re.sub(r'build:\s*"[^"]+"', f'build: "v{version}"', s)
s=re.sub(r'localKitPath:\s*"[^"]+"', f'localKitPath: "downloads/Eve-v{version}-local-relay-kit.zip"', s)
p.write_text(s)
PY2
fi
(cd "$STAGE" && zip -qr "$OUT/Eve-v${VERSION}-full.zip" "Eve-v${VERSION}-full")
EVE_PACKAGE_LABEL="v${VERSION}" bash "$ROOT/scripts/build-local-relay-kit.sh" "$OUT/Eve-v${VERSION}-local-relay-kit.zip"
KIT="$STAGE/Eve-v${VERSION}-deployment-kit"; mkdir -p "$KIT/scripts" "$KIT/downloads"
for f in index.html public-home.html deployment.css deployment.js deployment-config.js app.json VERSION README.md CANONICAL_PUBLIC_EVE.md DISTRIBUTION.md RELEASE_VALIDATION.md OPERATING_MODEL.md; do [[ -f "$FULL/$f" ]] && cp "$FULL/$f" "$KIT/"; done
cp -R "$FULL/deploy" "$KIT/"; cp "$FULL/scripts/stage-deployment-site.sh" "$FULL/scripts/build-local-relay-kit.sh" "$KIT/scripts/"; cp "$OUT/Eve-v${VERSION}-local-relay-kit.zip" "$KIT/downloads/"
(cd "$STAGE" && zip -qr "$OUT/Eve-v${VERSION}-deployment-kit.zip" "Eve-v${VERSION}-deployment-kit")
(cd "$OUT" && sha256sum Eve-v${VERSION}-full.zip Eve-v${VERSION}-deployment-kit.zip Eve-v${VERSION}-local-relay-kit.zip > Eve-v${VERSION}-SHA256SUMS.txt)
echo "Release artifacts: $OUT"
