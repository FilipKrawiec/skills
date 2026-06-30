#!/usr/bin/env python3
"""Validate plugin definitions and automatically bump version in manifests if there are staged changes."""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def run_cmd(command: list[str]) -> str:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    return result.stdout.strip()

def main() -> None:
    # 1. Check staged files
    staged_files = run_cmd(["git", "diff", "--cached", "--name-only"]).splitlines()
    staged_files = [f for f in staged_files if f.strip()]
    
    # Filter out manifests so we don't trigger on version bumps themselves
    functional_changes = [
        f for f in staged_files 
        if not f.endswith("plugin.json") and not f.endswith("marketplace.json")
    ]
    
    if not functional_changes:
        print("No functional changes staged. Skipping version bump.")
        # Still run validation to make sure everything is fine
        run_validation()
        return

    # 2. Run validation script
    run_validation()

    # 3. Bump version
    claude_json_path = ROOT / ".claude-plugin" / "plugin.json"
    codex_json_path = ROOT / ".codex-plugin" / "plugin.json"

    if not claude_json_path.exists() or not codex_json_path.exists():
        print("error: Manifest files not found", file=sys.stderr)
        sys.exit(1)

    claude_manifest = json.loads(claude_json_path.read_text(encoding="utf-8"))
    codex_manifest = json.loads(codex_json_path.read_text(encoding="utf-8"))

    current_version = claude_manifest.get("version", "0.1.0")
    try:
        parts = current_version.split(".")
        if len(parts) != 3:
            raise ValueError("Version must be in major.minor.patch format")
        parts[2] = str(int(parts[2]) + 1)
        new_version = ".".join(parts)
    except Exception as e:
        print(f"error parsing version '{current_version}': {e}", file=sys.stderr)
        sys.exit(1)

    claude_manifest["version"] = new_version
    codex_manifest["version"] = new_version

    claude_json_path.write_text(json.dumps(claude_manifest, indent=2) + "\n", encoding="utf-8")
    codex_json_path.write_text(json.dumps(codex_manifest, indent=2) + "\n", encoding="utf-8")

    # 4. Stage the manifests
    run_cmd(["git", "add", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"])
    print(f"Bumped version from {current_version} to {new_version} and staged manifest changes.")

def run_validation() -> None:
    print("Running plugin validation...")
    validation_script = ROOT / "scripts" / "validate-plugin-definitions.py"
    result = subprocess.run(["python3", str(validation_script)], cwd=ROOT)
    if result.returncode != 0:
        print("error: Plugin validation failed.", file=sys.stderr)
        sys.exit(result.returncode)
    print("Plugin validation passed.")

if __name__ == "__main__":
    main()
