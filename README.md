# Eve v63.0.0

Eve is a privacy-first, self-hosted user research platform.

## The simple operating model

- **Develop:** one canonical GitHub repository. `main` is continuous Eve Beta.
- **Test:** give researchers the public `/beta/` installer link. They choose **Your organisation's cloud** or **This computer**.
- **Release:** run **Promote Eve to stable** in GitHub Actions. GitHub creates the tag, containers, ZIPs, checksums and `/stable/` page automatically.
- **Phone/browser development:** open the repo in GitHub Codespaces; Eve is preconfigured to run on forwarded port 8787.

Researchers do not need GitHub, Git, Node commands, Terraform or cloud CLI tools to start the supported browser-first installation routes.

See `OPERATING_MODEL.md` for the maintainer workflow and `START_HERE.md` for platform documentation.
