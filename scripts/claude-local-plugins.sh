#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec claude \
  --plugin-dir "${repository_root}/plugins/common/core" \
  --plugin-dir "${repository_root}/plugins/common/workflow" \
  --plugin-dir "${repository_root}/plugins/common/orchestration" \
  --plugin-dir "${repository_root}/plugins/common/authoring" \
  "$@"
