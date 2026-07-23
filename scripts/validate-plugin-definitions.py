#!/usr/bin/env python3
"""Validate that plugin manifests match this repository's packaged skill layout."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None


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

PACKAGE_METADATA = {
    ROOT / "plugins" / "common" / "core" / "package-metadata.json": "filipkrawiec-core",
    ROOT / "plugins" / "common" / "workflow" / "package-metadata.json": "filipkrawiec-workflow",
    ROOT / "plugins" / "common" / "sdlc" / "package-metadata.json": "filipkrawiec-sdlc",
    ROOT / "plugins" / "common" / "authoring" / "package-metadata.json": "filipkrawiec-authoring",
}

PACKAGE_SKILL_TREES = {
    ROOT / "plugins" / "common" / "core" / "skills": {"ddd", "hexagonal-architecture"},
    ROOT / "plugins" / "common" / "workflow" / "skills": {"tdd", "vcs", "grill-with-docs"},
    ROOT / "plugins" / "common" / "sdlc" / "skills": {"sdlc", "sdlc-define", "sdlc-refine", "sdlc-execute", "sdlc-improve", "sdlc-help"},
    ROOT / "plugins" / "common" / "authoring" / "skills": {"writing-great-skill", "teach"},
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

    frontmatter_text = "\n".join(lines[1:end])
    if yaml is not None:
        try:
            data = yaml.safe_load(frontmatter_text) or {}
        except yaml.YAMLError as exc:
            fail(f"{path.relative_to(ROOT)} has invalid YAML frontmatter: {exc}")
    else:
        # Fallback simple line-based key-value parser for basic frontmatter
        data = {}
        curr_key = None
        curr_val = []
        for line in lines[1:end]:
            if ":" in line and not line.startswith(" ") and not line.startswith("\t"):
                if curr_key:
                    data[curr_key] = "\n".join(curr_val).strip()
                k, v = line.split(":", 1)
                curr_key = k.strip()
                curr_val = [v.strip()]
            elif curr_key:
                curr_val.append(line.strip())
        if curr_key:
            data[curr_key] = "\n".join(curr_val).strip()

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


def validate_package_metadata(path: Path, expected_name: str) -> None:
    metadata = load_json(path)
    if metadata.get("name") != expected_name:
        fail(f"{path.relative_to(ROOT)} must use package name {expected_name}")
    if not isinstance(metadata.get("version"), str) or not re.fullmatch(r"\d+\.\d+\.\d+", metadata["version"]):
        fail(f"{path.relative_to(ROOT)} must define a semantic version")
    if not isinstance(metadata.get("description"), str) or not metadata["description"]:
        fail(f"{path.relative_to(ROOT)} must define a non-empty description")

    package_root = path.parent
    antigravity = load_json(package_root / "plugin.json")
    claude = load_json(package_root / ".claude-plugin" / "plugin.json")
    codex = load_json(package_root / ".codex-plugin" / "plugin.json")
    if antigravity != {"name": metadata["name"], "description": metadata["description"]}:
        fail(f"{(package_root / 'plugin.json').relative_to(ROOT)} must match package identity")
    for manifest_path, manifest in ((package_root / ".claude-plugin" / "plugin.json", claude), (package_root / ".codex-plugin" / "plugin.json", codex)):
        if manifest.get("name") != metadata["name"] or manifest.get("version") != metadata["version"]:
            fail(f"{manifest_path.relative_to(ROOT)} must match package name and version")
        if manifest.get("description") != metadata["description"] or manifest.get("skills") != "./skills/":
            fail(f"{manifest_path.relative_to(ROOT)} must match package description and skills path")


def validate_agy_plugins() -> None:
    agy_dir = ROOT / "plugins" / "agy"
    if not agy_dir.is_dir():
        fail("missing plugins/agy directory")

    valid_packages = set(PACKAGE_METADATA.values())
    for plugin_path in agy_dir.iterdir():
        if not plugin_path.is_dir():
            continue
        manifest_path = plugin_path / "plugin.json"
        manifest = load_json(manifest_path)
        if not isinstance(manifest.get("name"), str) or not manifest["name"].startswith("filipkrawiec-agy-"):
            fail(f"{manifest_path.relative_to(ROOT)} must use package name starting with filipkrawiec-agy-")
        if not isinstance(manifest.get("description"), str) or not manifest["description"]:
            fail(f"{manifest_path.relative_to(ROOT)} must define a non-empty description")

        if "dependencies" in manifest:
            deps = manifest["dependencies"]
            if not isinstance(deps, list) or not all(isinstance(dep, str) for dep in deps):
                fail(f"{manifest_path.relative_to(ROOT)} dependencies must be a list of string package names")
            for dep in deps:
                if dep not in valid_packages:
                    fail(f"{manifest_path.relative_to(ROOT)} dependency '{dep}' is not a valid common package")

        rules_dir = plugin_path / "rules"
        if rules_dir.is_dir():
            for rule_file in rules_dir.glob("*.md"):
                content = rule_file.read_text(encoding="utf-8")
                if not content.strip().startswith("# "):
                    fail(f"{rule_file.relative_to(ROOT)} rule file must start with a markdown header (#)")

        agents_dir = plugin_path / "agents"
        if agents_dir.is_dir():
            for agent_file in agents_dir.glob("*.md"):
                content = agent_file.read_text(encoding="utf-8")
                if not content.strip().startswith("# "):
                    fail(f"{agent_file.relative_to(ROOT)} agent file must start with a markdown header (#)")


def main() -> None:
    for path, name in PACKAGE_METADATA.items():
        validate_package_metadata(path, name)

    for root, skills in PACKAGE_SKILL_TREES.items():
        validate_skill_tree(root, skills)

    validate_agy_plugins()

    print("Plugin validation passed.")



if __name__ == "__main__":
    main()
