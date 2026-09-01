Eve v63 Beta — Google guided Cloud Shell patch

What this changes
- Removes the retired Google Cloud Run Button from the researcher-facing Google path.
- Opens a normal Google Cloud Shell session instead.
- Copies a single bootstrap command which checks out the active Eve Beta revision and launches Eve's Google walkthrough.
- The Google walkthrough guides project selection, billing, API enablement and deployment.
- Keeps the Eve-side deployment wizard and /api/readiness verification.
- Advanced Google help now opens the deployment instructions instead of the previous Cloud Run Button/clone fallback.

How to apply
1. Extract this ZIP.
2. Copy everything inside it into the root of your local eve repository, preserving folders and replacing existing files.
3. In GitHub Desktop commit to main and push.
4. Publish Eve Beta runs automatically.
5. When the workflow is green, refresh /eve/beta/ and try Google again.

Expected Google flow
Start guided Google setup
→ normal Google Cloud Shell opens
→ Eve setup command is copied (or use Copy setup command)
→ paste once and press Enter
→ Eve Google walkthrough opens
→ choose/create project + billing
→ enable services
→ run Create Eve
→ copy final Eve HTTPS URL
→ return to Eve Beta and verify readiness

Validation
- npm run check: passed
- full npm test suite: passed
- staged canonical Beta smoke using eve-research/eve: passed
- staged Beta contained no deploy.cloud.run reference
