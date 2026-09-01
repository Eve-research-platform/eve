# Eve Navigation Companion v1.2.0

Chrome Manifest V3 companion extension for Eve Navigation tasks.

## What it does

When a participant starts a Navigation task in Eve, the extension:

1. receives the task instructions and optional timeout from Eve;
2. opens the configured start page in a new tab;
3. attaches a small Eve overlay to that tab while the participant navigates;
4. shows the task instructions;
5. shows a live countdown when a timeout is configured;
6. automatically detects the configured success page when one is set;
7. lets the participant select **I've completed this task** as a manual fallback;
8. sends completion or timeout back to the original Eve study tab.

The overlay follows full-page navigation because it is attached to the browser tab rather than a specific page URL.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `eve-navigation-companion` folder.
5. Reload Eve after installing the extension.

If Eve itself is opened from a `file://` URL, enable **Allow access to file URLs** for the extension. Running Eve over HTTP is preferred.

## Security / scope

- The content script is present on web pages so it can display the task overlay.
- The overlay is rendered inside a Shadow DOM to isolate it from the tested site's CSS.
- The extension only displays an overlay in the browser tab it opens for an active Eve task.
- Completion is sent back to the Eve source tab through the extension service worker.
- No website browsing content is uploaded by this MVP extension.


## Completion behaviour

When a participant selects **I’ve completed this task**, or when the configured success page is detected automatically, the extension sends the result back to Eve, activates and focuses the original Eve survey tab, and closes the dedicated navigation task tab.


## Automatic success detection

If a Navigation task has a success page, the companion compares the active task-tab URL with that configured destination. It ignores URL fragments and trailing slashes, and checks client-side route changes as well as full page loads. If the success URL includes a query string, the query string must match.
