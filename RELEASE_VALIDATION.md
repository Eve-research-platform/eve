# Eve v63.0.0 validation

Conventional release gates are `npm run check` and `npm test`. Both Beta publishing and Stable promotion run them automatically. Browser E2E remains a separate release-quality gate where the environment can run Playwright.

A Stable promotion must additionally prove the supported installation routes against fresh infrastructure: Google Cloud, Azure Standard, Azure Private, and Local + Relay.

The first canonical repository setup also requires one manual GitHub action after Beta publishes the GHCR package: set the package visibility to **Public** so Azure can pull the image without registry credentials.
