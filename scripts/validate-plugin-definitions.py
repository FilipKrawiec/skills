#!/usr/bin/env python3
"""Validate that plugin manifests match this repository's packaged skill layout."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
SKILL_NAME_RE = re.compile(r"^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
REFERENCE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*\.md$")
ALLOWED_FRONTMATTER_KEYS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
}

ROOT_MANIFESTS = {
    ROOT / ".codex-plugin" / "plugin.json": ("filipkrawiec-core", "./plugins/core/skills/"),
    ROOT / ".claude-plugin" / "plugin.json": ("filipkrawiec-core", "./plugins/core/skills/"),
}

PACKAGE_MANIFESTS = {
    ROOT / "plugins" / "core" / "plugin.json": ("filipkrawiec-core", "./skills/"),
    ROOT / "plugins" / "workflow" / "plugin.json": ("filipkrawiec-workflow", "./skills/"),
    ROOT / "plugins" / "sdlc" / "plugin.json": ("filipkrawiec-sdlc", "./skills/"),
    ROOT / "plugins" / "authoring" / "plugin.json": ("filipkrawiec-authoring", "./skills/"),
}

PACKAGE_SKILL_TREES = {
    ROOT / "plugins" / "core" / "skills": {"ddd", "hexagonal-architecture"},
    ROOT / "plugins" / "workflow" / "skills": {"tdd", "vcs", "grill-with-docs"},
    ROOT / "plugins" / "sdlc" / "skills": {"sdlc", "sdlc-define", "sdlc-refine", "sdlc-execute", "sdlc-improve"},
    ROOT / "plugins" / "authoring" / "skills": {"writing-great-skill", "teach"},
}

MARKETPLACE_PLUGINS = {
    "filipkrawiec-core": "./plugins/core",
    "filipkrawiec-workflow": "./plugins/workflow",
    "filipkrawiec-sdlc": "./plugins/sdlc",
    "filipkrawiec-authoring": "./plugins/authoring",
}


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing {path.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {path.relative_to(ROOT)}: {exc}")


def parse_skill_frontmatter(path: Path) -> dict:
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()
    if not lines or lines[0] != "---":
        fail(f"{path.relative_to(ROOT)} must start with YAML frontmatter")

    try:
        end = lines.index("---", 1)
    except ValueError:
        fail(f"{path.relative_to(ROOT)} must close YAML frontmatter")

    try:
        data = yaml.safe_load("\n".join(lines[1:end])) or {}
    except yaml.YAMLError as exc:
        fail(f"{path.relative_to(ROOT)} has invalid YAML frontmatter: {exc}")
    if not isinstance(data, dict):
        fail(f"{path.relative_to(ROOT)} frontmatter must be a YAML mapping")
    return data


def validate_skill_spec(skill_dir: Path) -> None:
    skill_name = skill_dir.name
    if not SKILL_NAME_RE.fullmatch(skill_name):
        fail(f"skill directory must be lowercase kebab-case: {skill_dir.relative_to(ROOT)}")

    skill_file = skill_dir / "SKILL.md"
    frontmatter = parse_skill_frontmatter(skill_file)
    extra_keys = set(frontmatter) - ALLOWED_FRONTMATTER_KEYS
    if extra_keys:
        fail(f"{skill_file} uses non-spec frontmatter keys: {sorted(extra_keys)}")
    if frontmatter.get("name") != skill_name:
        fail(f"{skill_file} name must match directory '{skill_name}'")
    if not isinstance(frontmatter.get("description"), str) or not frontmatter.get("description"):
        fail(f"{skill_file} must define a non-empty description")
    if len(frontmatter["description"]) > 1024:
        fail(f"{skill_file} description exceeds 1024 characters")

    legacy_resources = skill_dir / "resources"
    if legacy_resources.exists():
        fail(f"{legacy_resources.relative_to(ROOT)} must be renamed to assets/")

    references_dir = skill_dir / "references"
    if references_dir.exists():
        for reference in references_dir.rglob("*.md"):
            if not REFERENCE_NAME_RE.fullmatch(reference.name):
                fail(f"reference file must be lowercase kebab-case.md: {reference.relative_to(ROOT)}")


def validate_skill_tree(root: Path, expected_skills: set[str]) -> None:
    if not root.is_dir():
        fail(f"missing {root.relative_to(ROOT)}/")

    found = {
        path.name
        for path in root.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }
    if found != expected_skills:
        fail(f"{root.relative_to(ROOT)} mismatch: expected {sorted(expected_skills)}, found {sorted(found)}")
    for skill_name in sorted(found):
        validate_skill_spec(root / skill_name)


def validate_manifest(path: Path, expected_name: str, expected_skills: str) -> None:
    manifest = load_json(path)
    if manifest.get("name") != expected_name:
        fail(f"{path.relative_to(ROOT)} must use plugin name {expected_name}")
    if manifest.get("skills") != expected_skills:
        fail(f"{path.relative_to(ROOT)} must set skills to {expected_skills}")


def validate_marketplace(path: Path) -> None:
    marketplace = load_json(path)
    plugins = marketplace.get("plugins")
    if not isinstance(plugins, list):
        fail(f"{path.relative_to(ROOT)} must define plugins[]")

    found = {plugin.get("name"): plugin for plugin in plugins if isinstance(plugin, dict)}
    if set(found) != set(MARKETPLACE_PLUGINS):
        fail(f"{path.relative_to(ROOT)} must define plugins {sorted(MARKETPLACE_PLUGINS)}")

    for plugin_name, expected_source in MARKETPLACE_PLUGINS.items():
        plugin = found[plugin_name]
        if plugin.get("source") != expected_source:
            fail(f"{path.relative_to(ROOT)} must point {plugin_name} at {expected_source}")


def main() -> None:
    for path, (name, skills_path) in ROOT_MANIFESTS.items():
        validate_manifest(path, name, skills_path)

    for path, (name, skills_path) in PACKAGE_MANIFESTS.items():
        validate_manifest(path, name, skills_path)

    for root, skills in PACKAGE_SKILL_TREES.items():
        validate_skill_tree(root, skills)

    validate_marketplace(ROOT / ".claude-plugin" / "marketplace.json")
    print("Plugin validation passed.")


if __name__ == "__main__":
    main()
