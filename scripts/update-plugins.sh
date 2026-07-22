#!/usr/bin/env bash
#
# Script to update source, validate it, and rebuild agent-native local bundles.

set -euo pipefail

# Get repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "=== Pulling latest changes from main ==="
git pull origin main

echo "=== Validating plugin definitions ==="
python3 scripts/validate-plugin-definitions.py

# 1. Antigravity IDE native plugins
echo "=== Linking Antigravity IDE plugins ==="
scripts/link-agy-ide-plugins.sh --replace

# 2. Claude Code bundle availability
if command -v claude >/dev/null 2>&1; then
  echo "Claude Code common packages are ready; run scripts/claude-local-plugins.sh to load them."
else
  echo "--- Claude Code (claude) not found, skipping ---"
fi

echo "=== Common packages and native overlays are ready ==="
