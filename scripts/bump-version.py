#!/usr/bin/env python3
"""Validate plugin definitions and bump one release package's manifests."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PACKAGE_MANIFEST_PATHS = {
    "core": [
        ROOT / ".codex-plugin" / "plugin.json",
        ROOT / ".claude-plugin" / "plugin.json",
        ROOT / "plugins" / "core" / "plugin.json",
    ],
    "workflow": [ROOT / "plugins" / "workflow" / "plugin.json"],
    "sdlc": [ROOT / "plugins" / "sdlc" / "plugin.json"],
    "authoring": [ROOT / "plugins" / "authoring" / "plugin.json"],
}


def run_cmd(command: list[str]) -> str:
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode)
    return result.stdout.strip()


def parse_bump_type(msg: str) -> str:
    """Determine bump type from a commit message using conventional commit patterns."""
    if not msg:
        return "patch"

    if "BREAKING CHANGE:" in msg or "BREAKING-CHANGE:" in msg:
        return "major"

    lines = msg.strip().splitlines()
    if not lines:
        return "patch"
    summary = lines[0]

    match = re.match(r"^(\w+)(?:\([\w\-]+\))?(!)?\s*:", summary)
    if not match:
        return "patch"

    commit_type, is_breaking = match.groups()
    if is_breaking:
        return "major"
    if commit_type == "feat":
        return "minor"
    return "patch"


def get_bump_type_from_history(compare_branch: str) -> str:
    """Analyze commit history since compare_branch to find the highest bump type."""
    try:
        log_output = run_cmd(["git", "log", f"{compare_branch}..HEAD", "--pretty=%B"])
    except Exception:
        fallbacks = ["origin/main", "main"]
        log_output = ""
        for fallback in fallbacks:
            if fallback == compare_branch:
                continue
            try:
                log_output = run_cmd(["git", "log", f"{fallback}..HEAD", "--pretty=%B"])
                break
            except Exception:
                continue

    if not log_output.strip():
        return "patch"

    commits = log_output.split("\n\n")
    highest_bump = "patch"

    for commit in commits:
        if not commit.strip():
            continue
        bump = parse_bump_type(commit)
        if bump == "major":
            return "major"
        if bump == "minor":
            highest_bump = "minor"

    return highest_bump


def bump_version(current_version: str, bump_type: str) -> str:
    parts = current_version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Version must be in major.minor.patch format: {current_version}")

    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])

    if bump_type == "major":
        return f"{major + 1}.0.0"
    if bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def run_validation() -> None:
    print("Running plugin validation...")
    validation_script = ROOT / "scripts" / "validate-plugin-definitions.py"
    result = subprocess.run(["python3", str(validation_script)], cwd=ROOT)
    if result.returncode != 0:
        print("error: Plugin validation failed.", file=sys.stderr)
        sys.exit(result.returncode)
    print("Plugin validation passed.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Bump version in manifest files.")
    parser.add_argument(
        "--plugin",
        choices=PACKAGE_MANIFEST_PATHS,
        required=True,
        help="Release package whose manifests should be bumped.",
    )
    parser.add_argument("--type", choices=["major", "minor", "patch"], help="Explicitly specify version bump type.")
    parser.add_argument("--message", help="Commit message to parse for determining bump type.")
    parser.add_argument("--compare-branch", default="origin/main", help="Branch to compare with for history analysis.")
    args = parser.parse_args()

    staged_files = run_cmd(["git", "diff", "--cached", "--name-only"]).splitlines()
    staged_files = [f for f in staged_files if f.strip()]

    functional_changes = [
        f for f in staged_files
        if not f.endswith("plugin.json") and not f.endswith("marketplace.json")
    ]

    if not functional_changes:
        print("No functional changes staged. Skipping version bump.")
        run_validation()
        return

    run_validation()

    bump_type = None
    if args.type:
        bump_type = args.type
        print(f"Bump type from argument: {bump_type}")

    if not bump_type and "BUMP_TYPE" in os.environ:
        value = os.environ["BUMP_TYPE"].lower()
        if value in {"major", "minor", "patch"}:
            bump_type = value
            print(f"Bump type from environment variable BUMP_TYPE: {bump_type}")

    if not bump_type and args.message:
        bump_type = parse_bump_type(args.message)
        print(f"Bump type parsed from argument message: {bump_type}")

    if not bump_type and "COMMIT_MESSAGE" in os.environ:
        bump_type = parse_bump_type(os.environ["COMMIT_MESSAGE"])
        print(f"Bump type parsed from environment variable COMMIT_MESSAGE: {bump_type}")

    if not bump_type:
        editmsg_path = ROOT / ".git" / "COMMIT_EDITMSG"
        if editmsg_path.exists():
            try:
                bump_type = parse_bump_type(editmsg_path.read_text(encoding="utf-8"))
                print(f"Bump type parsed from .git/COMMIT_EDITMSG: {bump_type}")
            except Exception:
                pass

    if not bump_type:
        bump_type = get_bump_type_from_history(args.compare_branch)
        print(f"Bump type determined from branch history: {bump_type}")

    if not bump_type:
        bump_type = "patch"
        print("Defaulting to bump type: patch")

    manifest_paths = PACKAGE_MANIFEST_PATHS[args.plugin]
    manifests = {}
    for path in manifest_paths:
        if not path.exists():
            print(f"error: Manifest file not found: {path.relative_to(ROOT)}", file=sys.stderr)
            sys.exit(1)
        manifests[path] = json.loads(path.read_text(encoding="utf-8"))

    current_version = manifests[manifest_paths[0]].get("version", "0.1.0")
    try:
        new_version = bump_version(current_version, bump_type)
    except Exception as exc:
        print(f"error calculating new version: {exc}", file=sys.stderr)
        sys.exit(1)

    for path, manifest in manifests.items():
        manifest["version"] = new_version
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    run_cmd(["git", "add", *[str(path.relative_to(ROOT)) for path in manifest_paths]])
    print(
        f"Bumped {args.plugin} package from {current_version} to {new_version} "
        f"({bump_type} bump) and staged manifest changes."
    )


if __name__ == "__main__":
    main()
