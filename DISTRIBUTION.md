# Eve distribution

GitHub Actions owns distribution in v63.

## Beta
Push/merge to `main`. The Beta workflow validates Eve, publishes `ghcr.io/<repo>:beta`, builds the Local + Relay kit and updates the `/beta/` installer.

## Stable
Open **Actions → Promote Eve to stable → Run workflow**, type `PROMOTE`, and run it. The workflow uses `VERSION`, validates the candidate, creates `v<VERSION>`, publishes `:<VERSION>` and `:latest`, creates the full/deployment/local ZIPs plus checksums, creates a GitHub Release and updates `/stable/`.

No manual ZIP construction is required.
