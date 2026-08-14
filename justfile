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

# Check release version alignment across manifests and tags
release-check:
    python3 scripts/validate-release-version.py

# Perform automated semantic release (bumps version, syncs manifests, commits, and tags)
release bump="auto":
    python3 scripts/release.py {{bump}}

# Display verifier status and detected lifecycle tasks
status:
    python3 scripts/project-verify.py status

# Complete local contributor setup (configures git hooks and links plugins into local Antigravity IDE)
setup: setup-hooks link-agy

# Install/configure repository git hooks
setup-hooks:
    git config core.hooksPath scripts/git-hooks
    @echo "Configured git core.hooksPath to scripts/git-hooks"

# Install plugins as directory copies into local Antigravity IDE environment
install-agy:
    #!/usr/bin/env bash
    set -euo pipefail
    target_dir="${AGY_IDE_PLUGIN_DIR:-"$HOME/.gemini/config/plugins"}"
    mkdir -p "${target_dir}"
    rm -rf "${target_dir}/filipkrawiec-orchestration" "${target_dir}/filipkrawiec-agy-orchestration"
    for dir in plugins/common/*; do
      [ -d "$dir" ] || continue
      pkg="filipkrawiec-$(basename "$dir")"
      rm -rf "${target_dir}/${pkg}"
      cp -r "$dir" "${target_dir}/${pkg}"
    done
    for dir in plugins/agy/*; do
      [ -d "$dir" ] || continue
      pkg="filipkrawiec-agy-$(basename "$dir")"
      rm -rf "${target_dir}/${pkg}"
      cp -r "$dir" "${target_dir}/${pkg}"
    done
    echo "Installed plugins into ${target_dir}"

# Link plugins as symlinks into local Antigravity IDE environment (dev mode)
link-agy:
    #!/usr/bin/env bash
    set -euo pipefail
    repo_root="$(pwd -P)"
    target_dir="${AGY_IDE_PLUGIN_DIR:-"$HOME/.gemini/config/plugins"}"
    mkdir -p "${target_dir}"
    rm -rf "${target_dir}/filipkrawiec-orchestration" "${target_dir}/filipkrawiec-agy-orchestration"
    for dir in plugins/common/*; do
      [ -d "$dir" ] || continue
      pkg="filipkrawiec-$(basename "$dir")"
      rm -rf "${target_dir}/${pkg}"
      ln -s "${repo_root}/${dir}" "${target_dir}/${pkg}"
    done
    for dir in plugins/agy/*; do
      [ -d "$dir" ] || continue
      pkg="filipkrawiec-agy-$(basename "$dir")"
      rm -rf "${target_dir}/${pkg}"
      ln -s "${repo_root}/${dir}" "${target_dir}/${pkg}"
    done
    echo "Linked plugins into ${target_dir}"

# Refresh local plugin installations (Codex, Claude, Antigravity IDE)
refresh: install-agy
    #!/usr/bin/env bash
    if command -v codex >/dev/null 2>&1; then
      codex plugin remove "filipkrawiec-orchestration@filipkrawiec" >/dev/null 2>&1 || true
      for dir in plugins/common/*; do
        [ -d "$dir" ] || continue
        pkg="filipkrawiec-$(basename "$dir")"
        codex plugin remove "${pkg}@filipkrawiec" >/dev/null 2>&1 || true
        codex plugin add "${pkg}@filipkrawiec" || true
      done
    fi
    if command -v claude >/dev/null 2>&1; then
      claude plugin remove "filipkrawiec-orchestration@filipkrawiec" >/dev/null 2>&1 || true
      for dir in plugins/common/*; do
        [ -d "$dir" ] || continue
        pkg="filipkrawiec-$(basename "$dir")"
        claude plugin remove "${pkg}@filipkrawiec" >/dev/null 2>&1 || true
        claude plugin add "${pkg}@filipkrawiec" >/dev/null 2>&1 || true
        claude plugin update "${pkg}@filipkrawiec" || true
      done
    fi
    echo "Refreshed local plugin installations."

