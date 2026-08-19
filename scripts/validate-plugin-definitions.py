#!/usr/bin/env python3
"""Validate that plugin manifests match this repository's packaged skill layout."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

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
    "disable-model-invocation",
    "allowed-tools",
}
MAX_REFERENCE_LINES = 300

# Canonical cross-repo skills available in the environment
KNOWN_CORE_SKILLS = {
    "ddd",
    "hexagonal-architecture",
    "tdd",
    "vcs",
    "triage",
    "review",
    "guide",
    "rephrase",
    "grill-with-context",
    "swot",
    "teach",
    "writing-great-skill",
}


class ValidationError(Exception):
    """Raised when validation fails."""


def rel(path: Path) -> Path:
    return path.relative_to(ROOT) if path.is_relative_to(ROOT) else path


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    raise ValidationError(message)


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail(f"missing {rel(path)}")
    except json.JSONDecodeError as exc:
        fail(f"invalid JSON in {rel(path)}: {exc}")


def parse_skill_frontmatter(path: Path) -> dict:
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()
    rel_path = rel(path)
    if not lines or lines[0] != "---":
        fail(f"{rel_path} must start with YAML frontmatter")

    try:
        end = lines.index("---", 1)
    except ValueError:
        fail(f"{rel_path} must close YAML frontmatter")

    frontmatter_text = "\n".join(lines[1:end])
    if yaml is not None:
        try:
            data = yaml.safe_load(frontmatter_text) or {}
        except yaml.YAMLError as exc:
            fail(f"{rel_path} has invalid YAML frontmatter: {exc}")
    else:
        # Fallback simple line-based key-value parser for basic frontmatter
        def clean_val(val_list: list[str]) -> Any:
            val_str = "\n".join(val_list).strip()
            if (val_str.startswith('"') and val_str.endswith('"')) or (val_str.startswith("'") and val_str.endswith("'")):
                val_str = val_str[1:-1]
            if val_str.lower() == "true":
                return True
            if val_str.lower() == "false":
                return False
            return val_str

        data = {}
        curr_key = None
        curr_val = []
        for line in lines[1:end]:
            if ":" in line and not line.startswith(" ") and not line.startswith("\t"):
                if curr_key:
                    data[curr_key] = clean_val(curr_val)
                k, v = line.split(":", 1)
                curr_key = k.strip()
                curr_val = [v.strip()]
            elif curr_key:
                curr_val.append(line.strip())
        if curr_key:
            data[curr_key] = clean_val(curr_val)

    if not isinstance(data, dict):
        fail(f"{rel_path} frontmatter must be a YAML mapping")
    return data


MARKDOWN_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")


def strip_markdown_code_blocks(text: str) -> str:
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`[^`\n]+`", "", text)
    return text


def validate_markdown_links(file_path: Path) -> None:
    raw_content = file_path.read_text(encoding="utf-8")
    content = strip_markdown_code_blocks(raw_content)
    rel_path = rel(file_path)
    for match in MARKDOWN_LINK_RE.finditer(content):
        target = match.group(2).strip()
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        if target.startswith("file://") or target.startswith("/"):
            fail(f"{rel_path} must not use absolute file URL or path in link target: '{target}'")

        target_file_path = target.split("#", 1)[0]
        if not target_file_path:
            continue
        resolved = (file_path.parent / target_file_path).resolve()
        if not resolved.is_file():
            fail(f"{rel_path} contains broken relative link target '{target}' -> {resolved}")


def validate_skill_spec(skill_dir: Path) -> None:
    skill_name = skill_dir.name
    rel_dir = rel(skill_dir)
    if not SKILL_NAME_RE.fullmatch(skill_name):
        fail(f"skill directory must be lowercase kebab-case: {rel_dir}")

    skill_file = skill_dir / "SKILL.md"
    frontmatter = parse_skill_frontmatter(skill_file)
    extra_keys = set(frontmatter) - ALLOWED_FRONTMATTER_KEYS
    if extra_keys:
        fail(f"{rel(skill_file)} uses non-spec frontmatter keys: {sorted(extra_keys)}")
    if frontmatter.get("name") != skill_name:
        fail(f"{rel(skill_file)} name must match directory '{skill_name}'")

    description = frontmatter.get("description")
    if not isinstance(description, str) or not description:
        fail(f"{rel(skill_file)} must define a non-empty description")
    if len(description) > 1024:
        fail(f"{rel(skill_file)} description exceeds 1024 characters")
    is_user_invoked = frontmatter.get("disable-model-invocation") in (True, "true", "True")
    if not is_user_invoked and not description.startswith("Use when"):
        fail(f"{rel(skill_file)} description must begin with 'Use when...': '{description[:30]}...'")

    allowed_tools = frontmatter.get("allowed-tools")
    if not isinstance(allowed_tools, str) or not allowed_tools.strip() or "\n" in allowed_tools or allowed_tools.strip().startswith("-"):
        fail(f"{rel(skill_file)} must define a non-empty 'allowed-tools' space-delimited string")

    validate_markdown_links(skill_file)

    legacy_resources = skill_dir / "resources"
    if legacy_resources.exists():
        fail(f"{rel(legacy_resources)} must be renamed to assets/")

    references_dir = skill_dir / "references"
    if references_dir.exists():
        for reference in references_dir.rglob("*.md"):
            rel_ref = rel(reference)
            if not REFERENCE_NAME_RE.fullmatch(reference.name):
                fail(f"reference file must be lowercase kebab-case.md: {rel_ref}")
            ref_text = reference.read_text(encoding="utf-8")
            ref_lines = len(ref_text.splitlines())
            if ref_lines > MAX_REFERENCE_LINES:
                fail(f"reference file {rel_ref} exceeds {MAX_REFERENCE_LINES} lines ({ref_lines} lines)")
            if re.search(r"^##\s+(?:Contents|Table of Contents)", ref_text, re.MULTILINE | re.IGNORECASE):
                fail(f"reference file {rel_ref} must not include a Table of Contents (TOC)")
            validate_markdown_links(reference)


def discover_common_packages(root: Path = ROOT) -> dict[Path, str]:
    packages = {}
    # Structured layout: plugins/common/*
    common_dir = root / "plugins" / "common"
    if common_dir.is_dir():
        for pkg_dir in sorted(common_dir.iterdir()):
            if pkg_dir.is_dir() and not pkg_dir.name.startswith("."):
                meta_path = pkg_dir / "package-metadata.json"
                if meta_path.is_file():
                    expected_name = f"filipkrawiec-{pkg_dir.name}"
                    packages[meta_path] = expected_name

    # Flat layout: plugins/* (excluding container dirs common/agy)
    plugins_dir = root / "plugins"
    if plugins_dir.is_dir():
        for pkg_dir in sorted(plugins_dir.iterdir()):
            if pkg_dir.is_dir() and not pkg_dir.name.startswith(".") and pkg_dir.name not in ("common", "agy"):
                meta_path = pkg_dir / "package-metadata.json"
                if meta_path.is_file():
                    expected_name = f"filipkrawiec-{pkg_dir.name}"
                    packages[meta_path] = expected_name

    if not packages:
        fail("missing or empty plugins directory")
    return packages


def validate_skill_tree(root: Path) -> set[str]:
    if not root.is_dir():
        fail(f"missing {rel(root)}/")

    found = {
        path.name
        for path in root.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    }
    if not found:
        fail(f"{rel(root)} has no valid skills")
    for skill_name in sorted(found):
        validate_skill_spec(root / skill_name)
    return found


def validate_package_metadata(path: Path, expected_name: str) -> None:
    metadata = load_json(path)
    rel_path = rel(path)
    if metadata.get("name") != expected_name:
        fail(f"{rel_path} must use package name {expected_name}")
    if not isinstance(metadata.get("version"), str) or not re.fullmatch(r"\d+\.\d+\.\d+", metadata["version"]):
        fail(f"{rel_path} must define a semantic version")
    if not isinstance(metadata.get("description"), str) or not metadata["description"]:
        fail(f"{rel_path} must define a non-empty description")

    package_root = path.parent
    antigravity = load_json(package_root / "plugin.json")
    claude = load_json(package_root / ".claude-plugin" / "plugin.json")
    codex = load_json(package_root / ".codex-plugin" / "plugin.json")
    if (
        antigravity.get("name") != metadata["name"]
        or antigravity.get("description") != metadata["description"]
        or antigravity.get("version") != metadata["version"]
    ):
        fail(f"{rel(package_root / 'plugin.json')} must match package identity and version")
    for manifest_path, manifest in (
        (package_root / ".claude-plugin" / "plugin.json", claude),
        (package_root / ".codex-plugin" / "plugin.json", codex),
    ):
        if manifest.get("name") != metadata["name"] or manifest.get("version") != metadata["version"]:
            fail(f"{rel(manifest_path)} must match package name and version")
        if manifest.get("description") != metadata["description"] or manifest.get("skills") != "./skills/":
            fail(f"{rel(manifest_path)} must match package description and skills path")

    package_references = package_root / "references"
    if package_references.exists():
        for ref in package_references.rglob("*.md"):
            if not REFERENCE_NAME_RE.fullmatch(ref.name):
                fail(f"package reference file must be lowercase kebab-case.md: {rel(ref)}")
            ref_text = ref.read_text(encoding="utf-8")
            ref_lines = len(ref_text.splitlines())
            if ref_lines > MAX_REFERENCE_LINES:
                fail(f"package reference file {rel(ref)} exceeds {MAX_REFERENCE_LINES} lines ({ref_lines} lines)")
            if re.search(r"^##\s+(?:Contents|Table of Contents)", ref_text, re.MULTILINE | re.IGNORECASE):
                fail(f"package reference file {rel(ref)} must not include a Table of Contents (TOC)")
            validate_markdown_links(ref)


def discover_all_common_skills(root: Path = ROOT) -> set[str]:
    all_skills = set(KNOWN_CORE_SKILLS)
    common_pkgs = discover_common_packages(root)
    for meta_path in common_pkgs:
        skills_dir = meta_path.parent / "skills"
        if skills_dir.is_dir():
            for path in skills_dir.iterdir():
                if path.is_dir() and (path / "SKILL.md").is_file():
                    all_skills.add(path.name)
    return all_skills


def validate_agents_and_rules(directory: Path, valid_skills: set[str]) -> None:
    rules_dir = directory / "rules"
    if rules_dir.is_dir():
        for rule_file in sorted(rules_dir.glob("*.md")):
            content = rule_file.read_text(encoding="utf-8")
            if not content.strip().startswith("# "):
                fail(f"{rel(rule_file)} rule file must start with a markdown header (#)")
            validate_markdown_links(rule_file)

    agents_dir = directory / "agents"
    if agents_dir.is_dir():
        for agent_file in sorted(agents_dir.glob("*.md")):
            content = agent_file.read_text(encoding="utf-8")
            if not content.strip().startswith("# "):
                fail(f"{rel(agent_file)} agent file must start with a markdown header (#)")
            for line in content.splitlines():
                skills_match = re.match(r"^-\s+\*\*Skills\*\*:\s*(.+)$", line)
                if skills_match:
                    raw_skills = skills_match.group(1).split(",")
                    for skill in (s.strip(" `*") for s in raw_skills):
                        if skill and skill not in valid_skills:
                            fail(f"{rel(agent_file)} references unknown skill '{skill}'")
            validate_markdown_links(agent_file)


def validate_agy_plugins(root: Path = ROOT) -> None:
    agy_dir = root / "plugins" / "agy"
    if not agy_dir.is_dir():
        return

    valid_packages = set(discover_common_packages(root).values())
    valid_skills = discover_all_common_skills(root)
    for plugin_path in sorted(agy_dir.iterdir()):
        if not plugin_path.is_dir():
            continue
        manifest_path = plugin_path / "plugin.json"
        manifest = load_json(manifest_path)
        if not isinstance(manifest.get("name"), str) or not manifest["name"].startswith("filipkrawiec-agy-"):
            fail(f"{rel(manifest_path)} must use package name starting with filipkrawiec-agy-")
        if not isinstance(manifest.get("description"), str) or not manifest["description"]:
            fail(f"{rel(manifest_path)} must define a non-empty description")
        if not isinstance(manifest.get("version"), str) or not re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"]):
            fail(f"{rel(manifest_path)} must define a semantic version")

        if "dependencies" in manifest:
            deps = manifest["dependencies"]
            if not isinstance(deps, list) or not all(
                isinstance(dep, dict)
                and isinstance(dep.get("name"), str)
                and isinstance(dep.get("version"), str)
                and re.fullmatch(r"\d+\.\d+\.\d+", dep["version"])
                for dep in deps
            ):
                fail(f"{rel(manifest_path)} dependencies must be versioned package definitions")
            for dep in deps:
                if dep["name"] not in valid_packages:
                    fail(f"{rel(manifest_path)} dependency '{dep['name']}' is not a valid common package")

        validate_agents_and_rules(plugin_path, valid_skills)


def validate_retired_sdlc_is_absent(root: Path = ROOT) -> None:
    active_paths = (
        root / "plugins" / "common" / "orchestration",
        root / "plugins" / "agy" / "orchestration",
        root / "spec" / "autonomous-sdlc",
    )
    for active_path in active_paths:
        if active_path.exists():
            fail(f"retired orchestration material remains active at {rel(active_path)}")

    archive = root / "archive" / "autonomous-sdlc"
    if archive.exists():
        fail("retired SDLC archive must be removed; Git history is the only legacy reference")


def validate_repository_release_version(root: Path = ROOT) -> None:
    versions: set[str] = set()
    for metadata_path in discover_common_packages(root):
        package_root = metadata_path.parent
        for manifest_path in (
            metadata_path,
            package_root / "plugin.json",
            package_root / ".claude-plugin" / "plugin.json",
            package_root / ".codex-plugin" / "plugin.json",
        ):
            version = load_json(manifest_path).get("version")
            if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
                fail(f"{rel(manifest_path)} must define a semantic release version")
            versions.add(version)

    agy_dir = root / "plugins" / "agy"
    if agy_dir.is_dir():
        for manifest_path in agy_dir.glob("*/plugin.json"):
            version = load_json(manifest_path).get("version")
            if not isinstance(version, str) or not re.fullmatch(r"\d+\.\d+\.\d+", version):
                fail(f"{rel(manifest_path)} must define a semantic release version")
            versions.add(version)

    if len(versions) != 1:
        fail(f"all plugin definitions must share one release version, found {sorted(versions)}")


def validate_repository_markdown_links(root: Path = ROOT) -> None:
    for candidate in ("docs", "AGENTS.md", "README.md", "CONTRIBUTING.md", "EVENT-STORMING.md"):
        path = root / candidate
        if path.is_file():
            validate_markdown_links(path)
        elif path.is_dir():
            for md_file in path.rglob("*.md"):
                validate_markdown_links(md_file)


def sync_manifests(root: Path = ROOT) -> None:
    common_pkgs = discover_common_packages(root)
    if not common_pkgs:
        fail("No common packages found to sync")

    versions: set[str] = set()
    for meta_path in common_pkgs:
        data = load_json(meta_path)
        v = data.get("version")
        if v:
            versions.add(v)
    if len(versions) != 1:
        fail(f"Cannot sync: found multiple versions across package-metadata.json: {sorted(versions)}")
    release_version = next(iter(versions))

    synced_files: list[Path] = []
    claude_plugins: list[dict[str, Any]] = []
    codex_plugins: list[dict[str, Any]] = []

    # 1. Sync common packages
    for meta_path, pkg_name in sorted(common_pkgs.items()):
        pkg_root = meta_path.parent
        meta_data = load_json(meta_path)
        description = meta_data.get("description", "")
        pkg_rel_source = f"./{pkg_root.relative_to(root)}"

        # plugin.json
        plugin_json = pkg_root / "plugin.json"
        plugin_data = {
            "name": pkg_name,
            "description": description,
            "version": release_version,
        }
        plugin_json.write_text(json.dumps(plugin_data, indent=2) + "\n", encoding="utf-8")
        synced_files.append(plugin_json)

        # .claude-plugin/plugin.json
        claude_dir = pkg_root / ".claude-plugin"
        claude_dir.mkdir(parents=True, exist_ok=True)
        claude_json = claude_dir / "plugin.json"
        claude_data = {
            "name": pkg_name,
            "description": description,
            "version": release_version,
            "skills": "./skills/",
        }
        claude_json.write_text(json.dumps(claude_data, indent=2) + "\n", encoding="utf-8")
        synced_files.append(claude_json)

        # .codex-plugin/plugin.json
        codex_dir = pkg_root / ".codex-plugin"
        codex_dir.mkdir(parents=True, exist_ok=True)
        codex_json = codex_dir / "plugin.json"
        codex_data = {
            "name": pkg_name,
            "description": description,
            "version": release_version,
            "skills": "./skills/",
        }
        codex_json.write_text(json.dumps(codex_data, indent=2) + "\n", encoding="utf-8")
        synced_files.append(codex_json)

        repo_url = meta_data.get("repository", "https://github.com/FilipKrawiec/skills")
        claude_plugins.append({
            "name": pkg_name,
            "description": description,
            "category": "development",
            "source": pkg_rel_source,
            "homepage": repo_url,
        })

        codex_plugins.append({
            "name": pkg_name,
            "source": {"source": "local", "path": pkg_rel_source},
            "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"},
            "category": "Engineering",
        })

    # 2. Sync AGY overlays
    agy_dir = root / "plugins" / "agy"
    if agy_dir.is_dir():
        for agy_manifest in sorted(agy_dir.glob("*/plugin.json")):
            agy_data = load_json(agy_manifest)
            agy_data["version"] = release_version
            if "dependencies" in agy_data and isinstance(agy_data["dependencies"], list):
                for dep in agy_data["dependencies"]:
                    if isinstance(dep, dict) and "version" in dep:
                        dep["version"] = release_version
            agy_manifest.write_text(json.dumps(agy_data, indent=2) + "\n", encoding="utf-8")
            synced_files.append(agy_manifest)

    # 3. Sync Marketplace Catalogs (if they exist)
    claude_market = root / ".claude-plugin" / "marketplace.json"
    if claude_market.is_file():
        cm_data = load_json(claude_market)
        cm_data["plugins"] = claude_plugins
        claude_market.write_text(json.dumps(cm_data, indent=2) + "\n", encoding="utf-8")
        synced_files.append(claude_market)

    codex_market = root / ".agents" / "plugins" / "marketplace.json"
    if codex_market.is_file():
        cx_data = load_json(codex_market)
        cx_data["plugins"] = codex_plugins
        codex_market.write_text(json.dumps(cx_data, indent=2) + "\n", encoding="utf-8")
        synced_files.append(codex_market)

    print(f"Synchronized {len(synced_files)} manifest files to release version {release_version}.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate or synchronize plugin definitions and skills.")
    parser.add_argument("--sync", action="store_true", help="Synchronize all host plugin manifests from package-metadata.json")
    args = parser.parse_args()

    try:
        if args.sync:
            sync_manifests(ROOT)

        packages = discover_common_packages(ROOT)
        all_skills = discover_all_common_skills(ROOT)
        for path, name in packages.items():
            validate_package_metadata(path, name)
            validate_skill_tree(path.parent / "skills")
            validate_agents_and_rules(path.parent, all_skills)

        validate_agy_plugins(ROOT)
        validate_retired_sdlc_is_absent(ROOT)
        validate_repository_release_version(ROOT)
        validate_repository_markdown_links(ROOT)

        print("Plugin validation passed.")
    except ValidationError:
        sys.exit(1)


if __name__ == "__main__":
    main()
