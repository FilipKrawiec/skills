# justfile for skills repository

default: verify

# Run unit tests across script tools
unit:
    python3 -m unittest discover -s scripts/tests

# Validate plugin definitions and package manifests
verify: unit
    python3 scripts/validate-plugin-definitions.py

# Check Central Knowledge index freshness
knowledge-check:
    python3 scripts/project-verify.py knowledge-index --check --root knowledge

# Check release version alignment across manifests and tags
release-check:
    python3 scripts/validate-release-version.py

# Install/configure repository git hooks
setup-hooks:
    ./scripts/setup-git-hooks.sh

# Install plugins as directory copies into local Antigravity IDE environment
install-agy:
    ./scripts/link-agy-ide-plugins.sh --copy --replace

# Link plugins as symlinks into local Antigravity IDE environment (dev mode)
link-agy:
    ./scripts/link-agy-ide-plugins.sh --link --replace
