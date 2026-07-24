#!/usr/bin/env bash
# Script to configure repository git hooks path and permissions.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOKS_DIR="${REPO_ROOT}/scripts/git-hooks"

if [[ ! -d "${HOOKS_DIR}" ]]; then
  echo "error: Git hooks directory not found at ${HOOKS_DIR}" >&2
  exit 1
fi

chmod +x "${HOOKS_DIR}"/* 2>/dev/null || true

if command -v git >/dev/null 2>&1 && git -C "${REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1; then
  git -C "${REPO_ROOT}" config core.hooksPath scripts/git-hooks
  git -C "${REPO_ROOT}" config push.followTags true
  echo "=== Configured git core.hooksPath to scripts/git-hooks ==="
  echo "=== Configured git push.followTags ==="
else
  echo "--- Not inside a git repository, skipping git config core.hooksPath ---"
fi
