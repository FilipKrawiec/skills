#!/usr/bin/env python3
"""Read-only checks for an already-versioned release candidate and its owner gate."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def git(root: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    if result.returncode:
        fail(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def validate_candidate(sha: str, tag: str, root: Path) -> None:
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        fail("candidate must be a full source SHA (40 lowercase hex characters)")
    if not re.fullmatch(r"v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", tag):
        fail("tag must be a stable semantic version, e.g. v1.2.3")
    if git(root, "status", "--porcelain", "--untracked-files=all"):
        fail("dirty candidate checkout")
    if git(root, "rev-parse", "HEAD") != sha:
        fail("HEAD is not the requested source SHA")
    git(root, "fetch", "--quiet", "--tags", "origin",
        "+refs/heads/main:refs/remotes/origin/main")
    if subprocess.run(["git", "merge-base", "--is-ancestor", sha, "origin/main"],
                      cwd=root, capture_output=True).returncode:
        fail("candidate is not an ancestor of fetched origin/main")
    packages = sorted((root / "plugins/common").glob("*"))
    packages = [p for p in packages if p.is_dir() and not p.name.startswith(".")]
    if not packages:
        fail("no package metadata found")
    for package in packages:
        for name in ("package-metadata.json", "plugin.json",
                     ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"):
            path = package / name
            if not path.is_file():
                fail(f"missing metadata: {path}")
            if json.loads(path.read_text()).get("version") != tag[1:]:
                fail(f"version mismatch: {path} must already be {tag[1:]}")
    if tag in git(root, "tag", "--list", tag).splitlines():
        if git(root, "rev-parse", f"refs/tags/{tag}^{{}}") != sha:
            fail("tag already points to a different commit")


def validate_production_environment(data: dict) -> None:
    # GitHub accepts ANY listed reviewer: alternatives would bypass the owner.
    rules = [rule for rule in data.get("protection_rules", [])
             if rule.get("type") == "required_reviewers"]
    reviewers = rules[0].get("reviewers", []) if len(rules) == 1 else []
    if (data.get("name") != "production" or len(reviewers) != 1
            or reviewers[0].get("type") != "User"
            or reviewers[0].get("reviewer", {}).get("login") != "FilipKrawiec"):
        fail("production must explicitly require FilipKrawiec as its sole user reviewer")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    candidate = commands.add_parser("candidate")
    candidate.add_argument("sha")
    candidate.add_argument("tag")
    candidate.add_argument("--root", type=Path, default=Path.cwd())
    commands.add_parser("production-gate", help="validate environment API JSON on stdin")
    args = parser.parse_args()
    try:
        if args.command == "production-gate":
            validate_production_environment(json.load(sys.stdin))
        else:
            validate_candidate(args.sha, args.tag, args.root)
    except (OSError, ValueError, TypeError, AttributeError) as error:
        fail(str(error))


if __name__ == "__main__":
    main()
