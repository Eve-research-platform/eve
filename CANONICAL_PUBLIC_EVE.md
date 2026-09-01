# Canonical public Eve — v63 operating model

The canonical repository is the single source of truth. Normal publication no longer requires editing `OWNER/REPOSITORY` or running a local canonicalisation command.

## One-time GitHub setup

1. Create a public repository such as `eve-research/eve`.
2. Put this full release at the repository root and push it to `main`.
3. In **Settings → Pages**, select **GitHub Actions** as the source.
4. In the GHCR package settings, make the Eve container public after the first Beta workflow publishes it. This is a one-time package visibility action.

After that:

- every push to `main` runs **Publish Eve Beta**;
- the repository name is derived automatically from `GITHUB_REPOSITORY`;
- the public site contains `/beta/` and `/stable/`;
- Beta is rebuilt automatically;
- Stable changes only through **Promote Eve to stable**.

`scripts/set-canonical-repository.js` remains only for manual/offline release copies.
