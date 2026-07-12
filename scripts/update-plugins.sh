#!/usr/bin/env bash
#
# Script to update/sync plugins for both Antigravity (agy) and Claude Code (claude).
# It fetches/pulls the latest changes, runs validation, and reinstalls the plugins locally.

set -euo pipefail

# Get repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${REPO_ROOT}"

echo "=== Pulling latest changes from main ==="
git pull origin main

echo "=== Validating plugin definitions ==="
python3 scripts/validate-plugin-definitions.py

# 1. Antigravity (agy) plugins update
if command -v agy >/dev/null 2>&1; then
  echo "=== Updating Antigravity (agy) plugins ==="
  agy plugin install ./plugins/core
  agy plugin install ./plugins/workflow
  agy plugin install ./plugins/sdlc
  agy plugin install ./plugins/authoring
  echo "Antigravity plugins updated successfully."
else
  echo "--- Antigravity (agy) CLI not found, skipping ---"
fi

# 2. Claude Code (claude) plugins update
if command -v claude >/dev/null 2>&1; then
  echo "=== Updating Claude Code (claude) plugins ==="
  
  # Ensure the marketplace is updated
  claude plugin marketplace update
  
  # Re-install plugins globally (user scope)
  claude plugin install --scope user filipkrawiec-core@filipkrawiec
  claude plugin install --scope user filipkrawiec-workflow@filipkrawiec
  claude plugin install --scope user filipkrawiec-sdlc@filipkrawiec
  claude plugin install --scope user filipkrawiec-authoring@filipkrawiec


  echo "Claude Code plugins updated successfully."
else
  echo "--- Claude Code (claude) not found, skipping ---"
fi

echo "=== All plugins updated successfully ==="
