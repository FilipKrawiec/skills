#!/usr/bin/env python3
"""Release main: bump from conventional commits, sync manifests, commit and tag.

`.github/workflows/release.yml` runs it after every verified push to `main`, then pushes the
commit and tag together and publishes the GitHub Release.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
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


def manifest_version(root: Path = ROOT) -> tuple[int, int, int]:
    """The version every package-metadata.json carries."""
    versions = {json.loads(p.read_text())["version"]
                for p in (root / "plugins" / "common").glob("*/package-metadata.json")}
    if len(versions) != 1:
        raise SystemExit(f"package-metadata.json versions disagree: {sorted(versions)}")
    version = parse_semver(versions.pop())
    assert version is not None
    return version


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

        if "BREAKING CHANGE:" in commit or re.match(r"^\w+(\([^)]+\))?!:", first_line):
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


def discover_common_package_names(root: Path = ROOT) -> list[str]:
    common_dir = root / "plugins" / "common"
    if not common_dir.is_dir():
        return []
    return sorted(
        pkg.name
        for pkg in common_dir.iterdir()
        if pkg.is_dir() and not pkg.name.startswith(".")
    )


def bump_package_metadata(root: Path, new_version: str) -> None:
    for pkg in discover_common_package_names(root):
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


def get_manifest_paths(root: Path) -> list[str]:
    manifest_paths: list[str] = []
    for pkg in discover_common_package_names(root):
        pkg_dir = root / "plugins" / "common" / pkg
        for p in (
            pkg_dir / "package-metadata.json",
            pkg_dir / "plugin.json",
            pkg_dir / ".claude-plugin" / "plugin.json",
            pkg_dir / ".codex-plugin" / "plugin.json",
        ):
            if p.is_file():
                manifest_paths.append(str(p.relative_to(root)))

    # sync_manifests rewrites the marketplace catalogs too; a release commits them with the rest.
    for p in (root / ".claude-plugin" / "marketplace.json", root / ".agents" / "plugins" / "marketplace.json"):
        if p.is_file():
            manifest_paths.append(str(p.relative_to(root)))
    return manifest_paths


def ensure_releasable(root: Path) -> None:
    """Refuse unless on a clean `main` level with a freshly fetched `origin/main`."""
    git("fetch", "--quiet", "--tags", "origin", cwd=root)
    branch = git("branch", "--show-current", cwd=root)
    if branch != "main":
        fail(f"release only from main, not '{branch or 'a detached HEAD'}'")
    status = git("status", "--porcelain", cwd=root)
    if status:
        fail(f"cannot release with dirty working tree:\n{status}")
    if git("rev-parse", "HEAD", cwd=root) != git("rev-parse", "origin/main", cwd=root):
        fail("main is not level with origin/main; pull or push first")


def perform_release(
    bump_type: str = "auto",
    message: str | None = None,
    dry_run: bool = False,
    root: Path = ROOT,
) -> str | None:
    if not dry_run:
        ensure_releasable(root)
    latest_tag = get_latest_release_tag(root)
    if latest_tag and not git("rev-list", f"{latest_tag}..HEAD", cwd=root):
        print(f"Nothing to release: {latest_tag} is HEAD.")
        return None
    # Without tags (a shallow or fresh clone) the manifests carry the released version.
    current_version = parse_semver(latest_tag) if latest_tag else manifest_version(root)
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

    # 2. Commit version bump (stage only updated manifests)
    manifest_paths = get_manifest_paths(root)
    status = git("status", "--porcelain", cwd=root)
    if status:
        git("add", *manifest_paths, cwd=root)
        git("commit", "-m", f"chore(release): bump version to {next_version}", cwd=root)

    # 3. Create annotated tag
    release_msg = message or f"Release {tag_name}: {resolved_bump} release automated from conventional commits"
    git("tag", "-a", tag_name, "-m", release_msg, cwd=root)

    # 4. Validate release
    import importlib.util
    val_spec = importlib.util.spec_from_file_location("val_module", root / "scripts" / "validate-plugin-definitions.py")
    assert val_spec and val_spec.loader
    val_module = importlib.util.module_from_spec(val_spec)
    val_spec.loader.exec_module(val_module)
    val_module.validate_repository_release_version(root)

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
