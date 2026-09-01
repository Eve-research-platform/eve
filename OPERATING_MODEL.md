# Eve operating model

Eve uses one canonical GitHub repository and two public channels.

## Beta — continuous

`main` is Eve Beta. Every push to `main` runs the conventional test suite, publishes `ghcr.io/<owner>/<repo>:beta`, rebuilds the Local + Relay download and updates the `/beta/` installer page. Maintainers do not build ZIP files or edit repository URLs manually.

This is the channel to give beta researchers. It is deliberately mutable and should be described as test software.

## Stable — promoted

Stable changes only when a maintainer runs **Promote Eve to stable** in GitHub Actions and types `PROMOTE`. The workflow validates the current `VERSION`, reruns tests, creates an immutable `v<VERSION>` tag, publishes the versioned container and `:latest`, creates the release ZIPs/checksums and updates `/stable/`.

## Phone-first development

Normal development should happen through pull requests to the canonical repository. GitHub runs validation automatically. For direct browser development, open the repository in GitHub Codespaces; `.devcontainer/devcontainer.json` installs Node and forwards Eve on port 8787. No local Git/Node setup is required on the phone.

## Researcher experience

Researchers receive a public Beta or Stable URL, not a GitHub repository. They choose:

1. **Your organisation's cloud** → Google Cloud or Microsoft Azure → Azure Standard or Private when applicable; or
2. **This computer** → download Local + Relay.

Infrastructure detail remains available in documentation, but it is not the primary installation journey.
