#!/usr/bin/env bash
# Symlink zai-usage into ~/.local/bin (requires bun on PATH)
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.local/bin"
ln -sf "$DIR/zai-usage.ts" "$HOME/.local/bin/zai-usage"
chmod +x "$DIR/zai-usage.ts"
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
     echo "Added ~/.local/bin to PATH in ~/.bashrc (restart shell or: source ~/.bashrc)" ;;
esac
echo "Installed. Run: zai-usage"
