#!/usr/bin/env bash
# zai-usage one-click installer: curl -fsSL https://raw.githubusercontent.com/LogicIncZo/zai-usage/main/install.sh | bash
set -euo pipefail
REPO="LogicIncZo/zai-usage"
DEST="${HOME}/.local/bin"
SCRIPT="https://raw.githubusercontent.com/${REPO}/main/zai-usage.ts"

command -v bun >/dev/null 2>&1 || { echo "error: bun is required — install it from https://bun.sh first"; exit 1; }

mkdir -p "$DEST"

# if running from a repo checkout, install the sibling file; else download
SRC="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)/zai-usage.ts"
if [ -f "$SRC" ]; then
  cp "$SRC" "${DEST}/zai-usage"
else
  curl -fsSL "$SCRIPT" -o "${DEST}/zai-usage"
fi
chmod +x "${DEST}/zai-usage"

case ":$PATH:" in
  *":${DEST}:"*) ;;
  *) echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> ~/.bashrc
     echo "Added ~/.local/bin to PATH in ~/.bashrc (restart shell or: source ~/.bashrc)" ;;
esac

echo "Installed zai-usage → ${DEST}/zai-usage"
echo "Run:            zai-usage          (quota)"
echo "                zai-usage summary  (full dashboard)"
echo "                zai-usage --demo   (no API key needed)"
echo "API key: set ZAI_API_KEY (Settings > Advanced on Zo, or your shell profile)"
