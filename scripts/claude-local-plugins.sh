#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec claude \
  --plugin-dir "${repository_root}/plugins/core" \
  --plugin-dir "${repository_root}/plugins/workflow" \
  --plugin-dir "${repository_root}/plugins/sdlc" \
  --plugin-dir "${repository_root}/plugins/authoring" \
  "$@"
