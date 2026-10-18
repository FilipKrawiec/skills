# justfile for skills repository

default: verify

# Run unit tests across script tools
unit:
    python3 -m unittest discover -s scripts/tests

# Validate plugin definitions and package manifests
verify: confidence
    python3 scripts/validate-plugin-definitions.py

# Measure behavior once; each script has its own ratchet.
confidence:
    coverage run -m unittest discover -s scripts/tests
    coverage combine
    mkdir -p .health
    coverage json -o .health/coverage.json
    radon cc --json scripts/*.py > .health/complexity.json
    coverage report --include=scripts/project-verify.py --fail-under=95.33
    coverage report --include=scripts/release.py --fail-under=100
    coverage report --include=scripts/validate-plugin-definitions.py --fail-under=88.14
    coverage report --include=scripts/check-mutation-results.py --fail-under=100
    xenon --max-absolute D --max-modules C --max-average B scripts/*.py
    xenon --max-absolute C scripts/release.py scripts/check-mutation-results.py

# Mutate only an immutable disposable copy; never the contributor's checkout.
mutation target minimum:
    #!/usr/bin/env bash
    set -euo pipefail
    test -z "$(git status --porcelain --untracked-files=all)" || { echo "Commit changes before measuring an immutable candidate" >&2; exit 1; }
    repo_root="$(pwd -P)"
    scratch="$(mktemp -d)"
    trap 'rm -rf "$scratch"' EXIT
    git archive HEAD | tar -xf - -C "$scratch"
    cd "$scratch"
    cosmic-ray init "scripts/mutation/{{target}}.toml" session.sqlite
    cosmic-ray baseline "scripts/mutation/{{target}}.toml"
    cosmic-ray exec "scripts/mutation/{{target}}.toml" session.sqlite
    mkdir -p "$repo_root/.health"
    cp session.sqlite "$repo_root/.health/{{target}}.sqlite"
    python3 scripts/check-mutation-results.py session.sqlite "{{minimum}}"

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
