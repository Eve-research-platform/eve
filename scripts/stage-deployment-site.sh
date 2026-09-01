#!/usr/bin/env bash
set -euo pipefail
REPO_SLUG="${1:?repo slug}"; CHANNEL="${2:?channel}"; REVISION="${3:?revision}"; IMAGE_TAG="${4:?image tag}"; OUT="${5:?output dir}"; SOURCE="${6:-.}"; BUILD="${7:-local}"
VERSION="$(tr -d '\r\n' < "$SOURCE/VERSION")"; REPO_LOWER="${REPO_SLUG,,}"; IMAGE="ghcr.io/${REPO_LOWER}:${IMAGE_TAG}"
rm -rf "$OUT"; mkdir -p "$OUT/deploy/azure" "$OUT/deploy/local" "$OUT/downloads"
cp "$SOURCE/index.html" "$SOURCE/deployment.css" "$SOURCE/deployment.js" "$OUT/"
cp "$SOURCE/deploy/local/README.md" "$OUT/deploy/local/README.md"
python3 - "$SOURCE" "$OUT" "$IMAGE" "$VERSION" <<'PY2'
from pathlib import Path
import re,sys
src,out,image,version=sys.argv[1:]
for name in ['azuredeploy.json','azuredeploy-private.json']:
    s=Path(src,'deploy','azure',name).read_text()
    s=re.sub(r'ghcr\.io/(?:OWNER/REPOSITORY|[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+):[^\"\\s,]+',image,s)
    s=re.sub(r'("name"\s*:\s*"EVE_RELEASE_VERSION"\s*,\s*"value"\s*:\s*")[^"]+("\s*})',r'\g<1>'+version+r'\2',s)
    Path(out,'deploy','azure',name).write_text(s)
PY2
if [[ "$CHANNEL" == "beta" ]]; then LOCAL_NAME="Eve-beta-local-relay-kit.zip"; else LOCAL_NAME="Eve-v${VERSION}-local-relay-kit.zip"; fi
EVE_PACKAGE_LABEL="${CHANNEL}" bash "$SOURCE/scripts/build-local-relay-kit.sh" "$OUT/downloads/$LOCAL_NAME"
cat > "$OUT/deployment-config.js" <<EOF
globalThis.EVE_FACTORY_CONFIG = {
  version: "${VERSION}",
  channel: "${CHANNEL}",
  build: "${BUILD}",
  repository: "https://github.com/${REPO_SLUG}",
  revision: "${REVISION}",
  containerImage: "${IMAGE}",
  googleTutorial: "deploy/google/tutorial.md",
  azureTemplatePath: "deploy/azure/azuredeploy.json",
  azurePrivateTemplatePath: "deploy/azure/azuredeploy-private.json",
  localKitPath: "downloads/${LOCAL_NAME}",
  localGuidePath: "deploy/local/README.md"
};
EOF
printf '%s\n' "Staged Eve ${CHANNEL}: ${REVISION} -> ${OUT}"
