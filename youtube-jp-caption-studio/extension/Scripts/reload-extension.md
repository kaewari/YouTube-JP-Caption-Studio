# Reload Chrome extension after code changes

Unpacked MV3 does **not** hot-reload `content_scripts` / MAIN-world `page_capture.js` until:

1. Open `chrome://extensions`
2. Find **YouTube JP Caption Studio**
3. Click **Reload** (↻)
4. Hard-refresh the YouTube tab (`Cmd+Shift+R`) — SPA navigate alone keeps a stale MAIN-world inject

Optional: open `chrome-extension://<id>/reload.html` (calls `chrome.runtime.reload()`). ID is under the extension card on `chrome://extensions`.

Version bump in `manifest.json` makes a successful reload visible on the card.
