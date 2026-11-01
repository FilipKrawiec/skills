# justfile for skills repository

default: verify

# Run unit tests across script tools
unit:
    python3 -m unittest discover -s scripts/tests
    node --test scripts/tests/*.test.mjs

# Validate plugin definitions and package manifests
verify: unit
    node plugins/common/workflow/scripts/workflow.mjs manifests verify

# Synchronize all host plugin manifests and marketplace catalogs from canonical package metadata
sync-manifests:
    node plugins/common/workflow/scripts/workflow.mjs manifests sync

# Validate plugins with Antigravity CLI if available
validate-agy:
    #!/usr/bin/env bash
    if command -v agy >/dev/null 2>&1; then
      for dir in plugins/common/*; do
        [ -d "$dir" ] || continue
        agy plugin validate "$dir"
      done
    else
      echo "Antigravity CLI (agy) not found in PATH; skipping native validation."
    fi
# Display verifier status and detected lifecycle tasks
status:
    node plugins/common/workflow/scripts/workflow.mjs project status

# Explicitly link common packages into the selected Antigravity IDE plugin directory
link-agy:
    #!/usr/bin/env bash
    set -euo pipefail
    repo_root="$(pwd -P)"
    target_dir="${AGY_IDE_PLUGIN_DIR:-"$HOME/.gemini/config/plugins"}"
    for dir in "$repo_root"/plugins/common/*; do
      [ -d "$dir" ] || continue
      target="$target_dir/filipkrawiec-$(basename "$dir")"
      if [ -e "$target" ] && [ ! -L "$target" ]; then
        echo "Refusing to replace existing path: $target" >&2
        exit 1
      fi
    done
    mkdir -p "$target_dir"
    for dir in "$repo_root"/plugins/common/*; do
      [ -d "$dir" ] || continue
      target="$target_dir/filipkrawiec-$(basename "$dir")"
      if [ -L "$target" ]; then
        rm -- "$target"
      fi
      ln -s -- "$dir" "$target"
    done
    echo "Linked plugins into $target_dir"
