Eve v63 Beta Pages packaging fix

Replace these files in the repository root, preserving folders:
- scripts/build-local-relay-kit.sh
- tests/v63_3_beta_site_packaging.test.js
- package.json

Fix:
- resolves relative Local + Relay ZIP output paths to an absolute path before zip changes into its temporary staging directory
- adds a regression test that runs the same relative-output staging path used by Publish Eve Beta

Validated with:
- beta site staging to a relative output path
- npm run check
- npm test
