#!/usr/bin/env python3
"""Validate that plugin manifests match this repository's canonical skill layout."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SKILLS = {
    "sdlc",
    "domain-driven-design",
    "hexagonal-architecture",
    "grill-with-docs",
    "writing-great-skill",
    "tdd",
    "vcs",
}
PLUGIN_NAME = "filipkrawiec"


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

