#!/usr/bin/env bash
# Refresh every locally installed host from this repository's marketplace source.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGES=(
  filipkrawiec-core
  filipkrawiec-workflow
  filipkrawiec-authoring
  filipkrawiec-orchestration
)

if command -v codex >/dev/null 2>&1; then
  echo "=== Refreshing Codex plugins ==="
  for package in "${PACKAGES[@]}"; do
    codex plugin remove "${package}@filipkrawiec" >/dev/null 2>&1 || true
    if ! codex plugin add "${package}@filipkrawiec"; then
      echo "--- Could not refresh Codex plugin ${package}" >&2
    fi
  done
else
  echo "--- Codex CLI not found, skipping Codex refresh"
fi

if command -v claude >/dev/null 2>&1; then
  echo "=== Refreshing Claude plugins ==="
  for package in "${PACKAGES[@]}"; do
    if ! claude plugin update "${package}@filipkrawiec"; then
      echo "--- Could not refresh Claude plugin ${package}" >&2
    fi
  done
else
  echo "--- Claude CLI not found, skipping Claude refresh"
fi

echo "=== Refreshing Antigravity plugins ==="
"${REPO_ROOT}/scripts/link-agy-ide-plugins.sh" --replace

echo "=== Local plugin refresh complete; restart active Codex and Claude sessions to load changes ==="
