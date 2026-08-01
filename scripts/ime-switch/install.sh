#!/usr/bin/env bash
# OPTIONAL fallback: register Chrome Native Messaging host for JA↔ABC.
# Daily use does NOT need this — run local-bridge/start.sh and POST /ime/switch.
# Usage:
#   ./install.sh                 # prompts for extension ID
#   ./install.sh <extension-id>  # chrome://extensions → ID under "YouTube Caption Translate"
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST_NAME="com.ytcaption.ime_switch"
NM_DIR="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_JSON="${NM_DIR}/${HOST_NAME}.json"
PYTHON3="$(command -v python3)"

EXT_ID="${1:-}"
if [[ -z "${EXT_ID}" ]]; then
  echo "Chrome extension ID (chrome://extensions → YouTube Caption Translate → ID):"
  read -r EXT_ID
fi
EXT_ID="$(echo "${EXT_ID}" | tr -d '[:space:]')"
if [[ ! "${EXT_ID}" =~ ^[a-p]{32}$ ]]; then
  echo "Invalid extension ID (expect 32 chars a–p). Got: '${EXT_ID}'" >&2
  exit 1
fi

echo "Building ime-select (Swift / Carbon)…"
swiftc -O -o "${ROOT}/ime-select" "${ROOT}/ime_select.swift" -framework Carbon
chmod +x "${ROOT}/ime-select" "${ROOT}/host.py"

echo "Smoke test…"
"${ROOT}/ime-select" current >/dev/null
echo "  current=$("${ROOT}/ime-select" current)"

mkdir -p "${NM_DIR}"
cat > "${HOST_JSON}" <<EOF
{
  "name": "${HOST_NAME}",
  "description": "Switch macOS input source JA ↔ ABC for YT Caption side panel",
  "path": "${ROOT}/host.py",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
EOF

# Ensure host.py shebang is executable via python3 even if +x stripped
if [[ ! -x "${ROOT}/host.py" ]]; then
  chmod +x "${ROOT}/host.py"
fi

# Rewrite path to use absolute python3 wrapper if needed (safer on some setups)
WRAPPER="${ROOT}/host_wrap.sh"
cat > "${WRAPPER}" <<EOF
#!/usr/bin/env bash
exec "${PYTHON3}" "${ROOT}/host.py"
EOF
chmod +x "${WRAPPER}"

# Prefer wrapper so Chrome always finds python3
python3 -c "
import json
from pathlib import Path
p = Path('${HOST_JSON}')
data = json.loads(p.read_text())
data['path'] = '${WRAPPER}'
p.write_text(json.dumps(data, indent=2) + '\n')
"

echo
echo "Installed native host:"
echo "  ${HOST_JSON}"
echo "  allowed_origins: chrome-extension://${EXT_ID}/"
echo
echo "Reload the extension at chrome://extensions, then focus a JA cue in the side panel."
echo "Menu bar should flip to Japanese (あ) on focus and back to ABC on Enter/blur."
echo
echo "Optional: brew install im-select — host prefers bundled Swift binary first."
