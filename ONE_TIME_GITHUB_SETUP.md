# One-time GitHub setup — no terminal required

This is the only setup needed before Eve becomes a continuous Beta project.

1. In GitHub, create the public repository `eve-research/eve` if it does not already exist. Leave it empty.
2. Install/open **GitHub Desktop**, sign in, then choose **File → Clone repository** and select `eve-research/eve`.
3. Extract this repository-starter ZIP and copy **all contents inside the extracted folder** into the cloned `eve` folder.
4. In GitHub Desktop, enter summary `Start Eve v63 Beta`, click **Commit to main**, then **Push origin**.
5. In GitHub: **eve → Settings → Pages → Source → GitHub Actions**.
6. Open **Actions**. `Publish Eve Beta` runs automatically from the push. If needed, open it and choose **Run workflow**.
7. After the first Beta container appears under GitHub Packages, open its package settings and change visibility to **Public**. This is a one-time action required for Azure to pull Eve without registry credentials.
8. Your researcher Beta link is then normally `https://eve-research.github.io/eve/beta/`.

From then on, do not build ZIPs manually. `main` is Beta. GitHub validates and republishes Beta automatically. When a build is ready for wider use, open **Actions → Promote Eve to stable**, choose **Run workflow**, type `PROMOTE`, and GitHub creates the Stable tag, containers, release ZIPs, checksums and `/stable/` site.

For browser development, use **Code → Codespaces → Create codespace on main**. Eve's devcontainer installs Node automatically and forwards port 8787.
