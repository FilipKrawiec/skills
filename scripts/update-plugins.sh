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

# 1. Setup git hooks
echo "=== Setting up git hooks ==="
scripts/setup-git-hooks.sh

# 2. Refresh every installed local host
scripts/refresh-local-plugins.sh

echo "=== Common packages, native overlays, and git hooks are ready ==="
