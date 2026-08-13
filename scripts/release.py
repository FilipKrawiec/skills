#!/usr/bin/env python3
"""Automated semantic release workflow for the skills repository."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMMON_PACKAGES = ("core", "workflow", "sdlc", "authoring")
RELEASE_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def git(*arguments: str, cwd: Path = ROOT) -> str:
    result = subprocess.run(
        ["git", *arguments], cwd=cwd, capture_output=True, text=True
    )
    if result.returncode:
        fail(result.stderr.strip() or f"git {' '.join(arguments)} failed")
    return result.stdout.strip()


def parse_semver(tag_or_version: str) -> tuple[int, int, int] | None:
    clean = tag_or_version.lstrip("v")
    match = re.fullmatch(r"^(\d+)\.(\d+)\.(\d+)$", clean)
    if not match:
        return None
    return tuple(int(part) for part in match.groups())  # type: ignore[return-value]


def get_latest_release_tag(root: Path = ROOT) -> str | None:
    tags = git("tag", "--list", "v*", cwd=root).splitlines()
    valid_tags: list[tuple[tuple[int, int, int], str]] = []
    for tag in tags:
        version = parse_semver(tag)
        if version:
            valid_tags.append((version, tag))
    if not valid_tags:
        return None
    valid_tags.sort()
    return valid_tags[-1][1]


def detect_bump_type(since_tag: str | None, root: Path = ROOT) -> str:
    """Analyze conventional commits since the last release to determine semver bump."""
    range_spec = f"{since_tag}..HEAD" if since_tag else "HEAD"
    log_output = git("log", range_spec, "--pretty=format:%B---COMMIT-SEP---", cwd=root)
    commits = [c.strip() for c in log_output.split("---COMMIT-SEP---") if c.strip()]

    has_breaking = False
    has_feat = False

    for commit in commits:
        lines = commit.splitlines()
        first_line = lines[0] if lines else ""

        if "BREAKING CHANGE:" in commit or "!:" in first_line:
            has_breaking = True
            break
        if re.match(r"^feat(\([^)]+\))?:", first_line, re.IGNORECASE):
            has_feat = True

    if has_breaking:
        return "major"
    if has_feat:
        return "minor"
    return "patch"


def compute_next_version(current: tuple[int, int, int], bump: str) -> str:
    major, minor, patch = current
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    if bump == "patch":
        return f"{major}.{minor}.{patch + 1}"
    fail(f"unknown bump type '{bump}', expected 'major', 'minor', 'patch', or 'auto'")


def bump_package_metadata(root: Path, new_version: str) -> None:
    for pkg in COMMON_PACKAGES:
        meta_path = root / "plugins" / "common" / pkg / "package-metadata.json"
        if meta_path.is_file():
            data = json.loads(meta_path.read_text(encoding="utf-8"))
            data["version"] = new_version
            meta_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def sync_all_manifests(root: Path) -> None:
    import importlib.util
    spec = importlib.util.spec_from_file_location("validator", root / "scripts" / "validate-plugin-definitions.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.sync_manifests(root)


def refresh_environments(root: Path) -> None:
    """Synchronize plugins into local Antigravity IDE and CLI caches."""
    target_dir = Path(root.parent / ".gemini" / "config" / "plugins").expanduser()
    if not target_dir.exists():
        target_dir = Path.home() / ".gemini" / "config" / "plugins"

    target_dir.mkdir(parents=True, exist_ok=True)

    # 1. Antigravity IDE
    for dir_path in (root / "plugins" / "common").glob("*"):
        if dir_path.is_dir():
            pkg_name = f"filipkrawiec-{dir_path.name}"
            dest = target_dir / pkg_name
            if dest.exists():
                subprocess.run(["rm", "-rf", str(dest)], check=False)
            subprocess.run(["cp", "-r", str(dir_path), str(dest)], check=False)

    for dir_path in (root / "plugins" / "agy").glob("*"):
        if dir_path.is_dir():
            pkg_name = f"filipkrawiec-agy-{dir_path.name}"
            dest = target_dir / pkg_name
            if dest.exists():
                subprocess.run(["rm", "-rf", str(dest)], check=False)
            subprocess.run(["cp", "-r", str(dir_path), str(dest)], check=False)

    # 2. Codex
    if subprocess.run(["command", "-v", "codex"], capture_output=True, shell=True).returncode == 0:
        for dir_path in (root / "plugins" / "common").glob("*"):
            if dir_path.is_dir():
                pkg = f"filipkrawiec-{dir_path.name}"
                subprocess.run(["codex", "plugin", "remove", f"{pkg}@filipkrawiec"], capture_output=True, check=False)
                subprocess.run(["codex", "plugin", "add", f"{pkg}@filipkrawiec"], capture_output=True, check=False)

    # 3. Claude Code
    if subprocess.run(["command", "-v", "claude"], capture_output=True, shell=True).returncode == 0:
        for dir_path in (root / "plugins" / "common").glob("*"):
            if dir_path.is_dir():
                pkg = f"filipkrawiec-{dir_path.name}"
                subprocess.run(["claude", "plugin", "update", f"{pkg}@filipkrawiec"], capture_output=True, check=False)


def perform_release(
    bump_type: str = "auto",
    message: str | None = None,
    dry_run: bool = False,
    root: Path = ROOT,
) -> str:
    latest_tag = get_latest_release_tag(root)
    current_version = parse_semver(latest_tag) if latest_tag else (8, 3, 0)
    assert current_version is not None

    if bump_type == "auto":
        resolved_bump = detect_bump_type(latest_tag, root)
    else:
        resolved_bump = bump_type

    next_version = compute_next_version(current_version, resolved_bump)
    tag_name = f"v{next_version}"

    print(f"=== Release Automation: {current_version} -> {next_version} ({resolved_bump}) ===")

    if dry_run:
        print(f"[dry-run] Would bump version to {next_version} and create tag {tag_name}")
        return next_version

    # 1. Update package metadata & sync manifests
    bump_package_metadata(root, next_version)
    sync_all_manifests(root)

    # 2. Commit version bump
    status = git("status", "--porcelain", cwd=root)
    if status:
        git("add", "-A", cwd=root)
        git("commit", "-m", f"chore(release): bump version to {next_version}", cwd=root)

    # 3. Create annotated tag
    release_msg = message or f"Release {tag_name}: {resolved_bump} release automated from conventional commits"
    git("tag", "-a", tag_name, "-m", release_msg, cwd=root)

    # 4. Refresh local environments
    refresh_environments(root)

    # 5. Validate release
    import importlib.util
    rel_spec = importlib.util.spec_from_file_location("rel_validator", root / "scripts" / "validate-release-version.py")
    assert rel_spec and rel_spec.loader
    rel_module = importlib.util.module_from_spec(rel_spec)
    rel_spec.loader.exec_module(rel_module)

    tag = rel_module.tag_at_head()
    rel_module.validate_manifest_versions(tag)

    print(f"Successfully released and tagged {tag_name}!")
    return next_version


def main() -> None:
    parser = argparse.ArgumentParser(description="Automate semantic versioning, manifest sync, and release tagging.")
    parser.add_argument(
        "bump",
        nargs="?",
        default="auto",
        choices=["auto", "patch", "minor", "major"],
        help="Type of semver bump (default: auto)",
    )
    parser.add_argument("-m", "--message", help="Custom release tag annotation message")
    parser.add_argument("--dry-run", action="store_true", help="Preview version calculation without modifying files")
    args = parser.parse_args()

    perform_release(bump_type=args.bump, message=args.message, dry_run=args.dry_run, root=ROOT)


if __name__ == "__main__":
    main()
