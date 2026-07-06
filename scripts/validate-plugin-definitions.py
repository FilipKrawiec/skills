#!/usr/bin/env python3
"""Validate that plugin manifests match this repository's canonical skill layout."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SKILLS = {
    "sdlc",
    "domain-driven-design",
    "hexagonal-architecture",
    "grill-with-docs",
    "writing-great-skill",
    "tdd",
    "teach",
    "vcs",
}
PLUGIN_NAME = "filipkrawiec"
SKILL_NAME_RE = re.compile(r"^(?!.*--)[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
REFERENCE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*\.md$")
ALLOWED_FRONTMATTER_KEYS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
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


def run(command: list[str]) -> None:
    result = subprocess.run(command, cwd=ROOT, text=True)
    if result.returncode != 0:
        fail(f"command failed: {' '.join(command)}")


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

    frontmatter = parse_skill_frontmatter(skill_dir / "SKILL.md")
    extra_keys = set(frontmatter) - ALLOWED_FRONTMATTER_KEYS
    if extra_keys:
        fail(f"{skill_dir / 'SKILL.md'} uses non-spec frontmatter keys: {sorted(extra_keys)}")
    if frontmatter.get("name") != skill_name:
        fail(f"{skill_dir / 'SKILL.md'} name must match directory '{skill_name}'")
    if not isinstance(frontmatter.get("description"), str) or not frontmatter.get("description"):
        fail(f"{skill_dir / 'SKILL.md'} must define a non-empty description")
    if len(frontmatter["description"]) > 1024:
        fail(f"{skill_dir / 'SKILL.md'} description exceeds 1024 characters")

    legacy_resources = skill_dir / "resources"
    if legacy_resources.exists():
        fail(f"{legacy_resources.relative_to(ROOT)} must be renamed to assets/")

    references_dir = skill_dir / "references"
    if references_dir.exists():
        for reference in references_dir.rglob("*.md"):
            if not REFERENCE_NAME_RE.fullmatch(reference.name):
                fail(f"reference file must be lowercase kebab-case.md: {reference.relative_to(ROOT)}")


def validate_skill_tree() -> None:
    skills_dir = ROOT / "skills"
    if not skills_dir.is_dir():
        fail("missing skills/")

    found = {
        path.name
        for path in skills_dir.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }
    if found != EXPECTED_SKILLS:
        fail(f"skills mismatch: expected {sorted(EXPECTED_SKILLS)}, found {sorted(found)}")
    for skill_name in sorted(found):
        validate_skill_spec(skills_dir / skill_name)


def validate_manifest(path: Path, check_skills: bool = True) -> None:
    manifest = load_json(path)
    if manifest.get("name") != PLUGIN_NAME:
        fail(f"{path.relative_to(ROOT)} must use plugin name {PLUGIN_NAME}")
    if check_skills and manifest.get("skills") != "./skills/":
        fail(f"{path.relative_to(ROOT)} must set skills to ./skills/")


def find_marketplace_plugin(path: Path) -> dict:
    marketplace = load_json(path)
    plugins = marketplace.get("plugins")
    if not isinstance(plugins, list):
        fail(f"{path.relative_to(ROOT)} must define plugins[]")

    matches = [plugin for plugin in plugins if plugin.get("name") == PLUGIN_NAME]
    if len(matches) != 1:
        fail(f"{path.relative_to(ROOT)} must define exactly one {PLUGIN_NAME} plugin entry")
    return matches[0]

def validate_claude_marketplace(path: Path) -> None:
    plugin = find_marketplace_plugin(path)
    source = plugin.get("source")
    expected = {"source": "url", "url": "https://github.com/FilipKrawiec/skills.git"}
    if source != expected and source != "./":
        fail(f"{path.relative_to(ROOT)} must point {PLUGIN_NAME} at the GitHub repository or './'")


def main() -> None:
    validate_skill_tree()
    validate_manifest(ROOT / ".codex-plugin" / "plugin.json")
    validate_manifest(ROOT / ".claude-plugin" / "plugin.json")
    validate_claude_marketplace(ROOT / ".claude-plugin" / "marketplace.json")
    validate_manifest(ROOT / "plugin.json", check_skills=False)

    validate_script = Path.home() / ".codex" / "skills" / ".system" / "plugin-creator" / "scripts" / "validate_plugin.py"
    run(["python3", str(validate_script), "."])
    run(["claude", "plugin", "validate", "--strict", ".claude-plugin/plugin.json"])
    run(["claude", "plugin", "validate", "--strict", ".claude-plugin/marketplace.json"])
    run(["agy", "plugin", "validate", "."])


if __name__ == "__main__":
    main()
