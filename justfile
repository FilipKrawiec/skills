# justfile for skills repository

default: verify

# Run unit tests across script tools
unit:
    python3 -m unittest discover -s scripts/tests

# Validate plugin definitions and package manifests
verify: unit
    python3 scripts/validate-plugin-definitions.py

# Synchronize all host plugin manifests and marketplace catalogs from canonical package metadata
sync-manifests:
    python3 scripts/validate-plugin-definitions.py --sync

# Display verifier status and detected lifecycle tasks
status:
    python3 scripts/project-verify.py status

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
