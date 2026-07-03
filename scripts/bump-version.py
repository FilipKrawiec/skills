#!/usr/bin/env python3
"""Validate plugin definitions and automatically bump version in manifests based on commit message or history."""

import argparse
import json
import os
import re
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

def parse_bump_type(msg: str) -> str:
    """Determine bump type from a commit message using conventional commit patterns."""
    if not msg:
        return "patch"
        
    # Check for breaking change indicators in body/footer
    if "BREAKING CHANGE:" in msg or "BREAKING-CHANGE:" in msg:
        return "major"
        
    lines = msg.strip().splitlines()
    if not lines:
        return "patch"
    summary = lines[0]
    
    # Matches: feat(scope)!: or feat!:
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
        # Fallback to local main or origin/main
        fallbacks = ["origin/main", "main"]
        log_output = ""
        for fb in fallbacks:
            if fb == compare_branch:
                continue
            try:
                log_output = run_cmd(["git", "log", f"{fb}..HEAD", "--pretty=%B"])
                break
            except Exception:
                continue
                
    if not log_output.strip():
        return "patch"
        
    # Split commit messages (separated by double newlines in git log)
    commits = log_output.split("\n\n")
    highest_bump = "patch"
    
    for commit in commits:
        if not commit.strip():
            continue
        bump = parse_bump_type(commit)
        if bump == "major":
            return "major"  # Highest possible, return early
        elif bump == "minor":
            highest_bump = "minor"
            
    return highest_bump

def bump_version(current_version: str, bump_type: str) -> str:
    parts = current_version.split(".")
    if len(parts) != 3:
        raise ValueError(f"Version must be in major.minor.patch format: {current_version}")
    
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    
    if bump_type == "major":
        return f"{major + 1}.0.0"
    elif bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    else: # patch
        return f"{major}.{minor}.{patch + 1}"

def main() -> None:
    parser = argparse.ArgumentParser(description="Bump version in manifest files.")
    parser.add_argument("--type", choices=["major", "minor", "patch"], help="Explicitly specify version bump type.")
    parser.add_argument("--message", help="Commit message to parse for determining bump type.")
    parser.add_argument("--compare-branch", default="origin/main", help="Branch to compare with for history analysis.")
    args = parser.parse_args()

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

    # 3. Determine bump type
    # Priority order:
    # A. Command-line argument --type
    # B. Environment variable BUMP_TYPE
    # C. Command-line argument --message
    # D. Environment variable COMMIT_MESSAGE
    # E. Fallback: COMMIT_EDITMSG file if exists
    # F. Fallback: Git history log (compare_branch..HEAD)
    # G. Fallback: patch
    
    bump_type = None
    
    # A. Command-line argument --type
    if args.type:
        bump_type = args.type
        print(f"Bump type from argument: {bump_type}")
        
    # B. Environment variable BUMP_TYPE
    if not bump_type and "BUMP_TYPE" in os.environ:
        val = os.environ["BUMP_TYPE"].lower()
        if val in ["major", "minor", "patch"]:
            bump_type = val
            print(f"Bump type from environment variable BUMP_TYPE: {bump_type}")
            
    # C. Command-line argument --message
    if not bump_type and args.message:
        bump_type = parse_bump_type(args.message)
        print(f"Bump type parsed from argument message: {bump_type}")
        
    # D. Environment variable COMMIT_MESSAGE
    if not bump_type and "COMMIT_MESSAGE" in os.environ:
        bump_type = parse_bump_type(os.environ["COMMIT_MESSAGE"])
        print(f"Bump type parsed from environment variable COMMIT_MESSAGE: {bump_type}")
        
    # E. COMMIT_EDITMSG file
    if not bump_type:
        editmsg_path = ROOT / ".git" / "COMMIT_EDITMSG"
        if editmsg_path.exists():
            try:
                msg = editmsg_path.read_text(encoding="utf-8")
                bump_type = parse_bump_type(msg)
                print(f"Bump type parsed from .git/COMMIT_EDITMSG: {bump_type}")
            except Exception:
                pass
                
    # F. Git history log
    if not bump_type:
        bump_type = get_bump_type_from_history(args.compare_branch)
        print(f"Bump type determined from branch history: {bump_type}")
        
    # G. Default
    if not bump_type:
        bump_type = "patch"
        print("Defaulting to bump type: patch")

    # 4. Bump version in manifests
    claude_json_path = ROOT / ".claude-plugin" / "plugin.json"
    codex_json_path = ROOT / ".codex-plugin" / "plugin.json"

    if not claude_json_path.exists() or not codex_json_path.exists():
        print("error: Manifest files not found", file=sys.stderr)
        sys.exit(1)

    claude_manifest = json.loads(claude_json_path.read_text(encoding="utf-8"))
    codex_manifest = json.loads(codex_json_path.read_text(encoding="utf-8"))

    current_version = claude_manifest.get("version", "0.1.0")
    try:
        new_version = bump_version(current_version, bump_type)
    except Exception as e:
        print(f"error calculating new version: {e}", file=sys.stderr)
        sys.exit(1)

    claude_manifest["version"] = new_version
    codex_manifest["version"] = new_version

    claude_json_path.write_text(json.dumps(claude_manifest, indent=2) + "\n", encoding="utf-8")
    codex_json_path.write_text(json.dumps(codex_manifest, indent=2) + "\n", encoding="utf-8")

    # 5. Stage the manifests
    run_cmd(["git", "add", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"])
    print(f"Bumped version from {current_version} to {new_version} ({bump_type} bump) and staged manifest changes.")

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
