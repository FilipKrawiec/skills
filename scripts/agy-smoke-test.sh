#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--dry-run]" >&2
}

dry_run=false
case "${1:-}" in
  "") ;;
  --dry-run) dry_run=true ;;
  *)
    usage
    exit 2
    ;;
esac

prompt="Work only in the current temporary Git repository. Use the installed sdlc skill for this disposable smoke test. Create README.md whose exact content is '# Skill smoke test' followed by one newline. Verify the file content, then report the verification result."
model="${AGY_SMOKE_MODEL:-gemini-3.6-flash-high}"

if "${dry_run}"; then
  workspace="${TMPDIR:-/tmp}/skills-agy-smoke"
else
  if ! command -v agy >/dev/null 2>&1; then
    echo "agy is required for the Antigravity smoke test." >&2
    exit 1
  fi

  workspace="$(mktemp -d "${TMPDIR:-/tmp}/skills-agy-smoke.XXXXXX")"
  trap 'rm -rf "${workspace}"' EXIT
  git -C "${workspace}" init -q
fi

agy_command=(
  agy
  --new-project
  --mode=accept-edits
  --dangerously-skip-permissions
  "--add-dir=${workspace}"
  "--model=${model}"
  "--prompt=${prompt}"
)

if "${dry_run}"; then
  printf '%s\n' "${agy_command[@]}"
  exit 0
fi

(
  cd "${workspace}"
  "${agy_command[@]}"
)

if ! printf '# Skill smoke test\n' | cmp -s "${workspace}/README.md" -; then
  echo "Antigravity smoke test did not create the expected README.md." >&2
  exit 1
fi

echo "Antigravity smoke test passed."
