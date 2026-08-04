# macOS IME switch

Chrome cannot force the macOS Input Source from JS alone. **Primary path:** the local FastAPI bridge runs `ime-select` — no per-extension-id install.

## Daily use (recommended)

1. Enable Japanese in **System Settings → Keyboard → Input Sources**.
2. Start the bridge:

```bash
cd local-bridge
./start.sh
```

`start.sh` builds `local-bridge/bin/ime-select` once (Swift + Carbon). Side panel JA focus → `POST /ime/switch { "to": "ja" }`; Enter / Escape / blur → `{ "to": "restore" }`.

| Path | Behavior |
| --- | --- |
| Bridge running | Menu-bar IME flips JA ↔ ABC/previous |
| Bridge offline | Web only: `lang=ja-JP` + nudge (no error spam) |

### Manual test

```bash
curl -s http://127.0.0.1:8765/ime/status
curl -s -X POST http://127.0.0.1:8765/ime/ja
curl -s -X POST http://127.0.0.1:8765/ime/switch -H 'Content-Type: application/json' -d '{"to":"restore"}'
```

Or the binary directly:

```bash
./local-bridge/bin/ime-select current
./local-bridge/bin/ime-select list
./local-bridge/bin/ime-select set com.apple.inputmethod.Kotoeri.RomajiTyping.Japanese
./local-bridge/bin/ime-select set com.apple.keylayout.ABC
```

## Optional: Native Messaging fallback

Only if you want IME switch **without** the bridge. One-time:

```bash
cd scripts/ime-switch
chmod +x install.sh host.py
./install.sh <extension-id>
```

Registers `com.ytcaption.ime_switch` for that extension ID. The extension prefers the bridge; native host is fallback only.

### Uninstall native host

```bash
rm -f ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.ytcaption.ime_switch.json
rm -rf ~/.cache/ytcaption-ime
```
