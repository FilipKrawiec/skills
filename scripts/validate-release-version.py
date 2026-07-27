#!/usr/bin/env python3
"""Validate the one Git-tagged release version shared by every plugin."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMMON_PACKAGES = ("core", "workflow", "orchestration", "authoring")
RELEASE_TAG = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
INITIAL_RELEASE_VERSION = "8.3.0"


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def git(*arguments: str) -> str:
    result = subprocess.run(
        ["git", *arguments], cwd=ROOT, capture_output=True, text=True
    )
    if result.returncode:
        fail(result.stderr.strip() or f"git {' '.join(arguments)} failed")
    return result.stdout.strip()


def release_version(tag: str) -> tuple[int, int, int] | None:
    match = RELEASE_TAG.fullmatch(tag)
    if not match:
        return None
    return tuple(int(part) for part in match.groups())


def version_paths() -> list[Path]:
    paths: list[Path] = []
    for package in COMMON_PACKAGES:
        package_root = ROOT / "plugins" / "common" / package
        paths.extend(
            (
                package_root / "package-metadata.json",
                package_root / "plugin.json",
                package_root / ".claude-plugin" / "plugin.json",
                package_root / ".codex-plugin" / "plugin.json",
            )
        )

    agy_root = ROOT / "plugins" / "agy"
    if agy_root.is_dir():
        paths.extend(sorted(agy_root.glob("*/plugin.json")))
    return paths


def tag_at_head() -> str:
    candidates = [tag for tag in git("tag", "--points-at", "HEAD").splitlines() if release_version(tag)]
    if not candidates:
        fail("no annotated release tag points to HEAD")
    if len(candidates) != 1:
        fail(f"expected one release tag at HEAD, found {', '.join(candidates)}")

    tag = candidates[0]
    if git("cat-file", "-t", f"refs/tags/{tag}") != "tag":
        fail(f"release tag {tag} must be annotated")
    if git("rev-parse", f"{tag}^{{commit}}") != git("rev-parse", "HEAD"):
        fail(f"release tag {tag} must point to HEAD")
    return tag


def previous_release_version(current_tag: str) -> tuple[int, int, int] | None:
    versions = [
        version
        for tag in git("tag", "--merged", "HEAD").splitlines()
        if tag != current_tag and (version := release_version(tag)) is not None
    ]
    return max(versions) if versions else None


def validate_manifest_versions(tag: str) -> None:
    expected = tag.removeprefix("v")
    for path in version_paths():
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            fail(f"missing version-bearing plugin manifest: {path.relative_to(ROOT)}")
        except json.JSONDecodeError as exc:
            fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")

        if manifest.get("version") != expected:
            fail(f"{path.relative_to(ROOT)} does not match release tag {tag}")

        for dependency in manifest.get("dependencies", []):
            if not isinstance(dependency, dict) or dependency.get("version") != expected:
                fail(f"{path.relative_to(ROOT)} dependency does not match release tag {tag}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate that HEAD has one annotated tag and all plugins match its version."
    )
    parser.parse_args()

    tag = tag_at_head()
    current = release_version(tag)
    assert current is not None
    previous = previous_release_version(tag)
    if previous is None and tag.removeprefix("v") != INITIAL_RELEASE_VERSION:
        fail(f"first repository release must be v{INITIAL_RELEASE_VERSION}, found {tag}")
    if previous is not None and current <= previous:
        fail(f"release tag {tag} must advance beyond the preceding release")

    validate_manifest_versions(tag)
    print(f"Release version validation passed: {tag}")


if __name__ == "__main__":
    main()
