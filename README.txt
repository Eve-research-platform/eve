Eve v63 Beta consolidated sync patch

This patch consolidates the current guided deployment wizard, Google guided Cloud Shell flow,
readiness CORS handshake, and updated deployment regression tests.

Apply by copying ALL contents of this folder into the root of your local eve repository,
preserving folders and replacing existing files. Then commit and push to main.

This exact consolidated tree passed:
  npm run check && npm test
including:
  v63.1 guided deployment wizard contract passed
  v63.2 guided Google Cloud Shell deployment contract passed
