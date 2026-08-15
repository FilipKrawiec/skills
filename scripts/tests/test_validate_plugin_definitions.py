"""Unit tests for validate-plugin-definitions.py."""

from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VALIDATOR_PATH = ROOT / "scripts" / "validate-plugin-definitions.py"

spec = importlib.util.spec_from_file_location("validate_plugin_definitions", VALIDATOR_PATH)
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)


class ValidatePluginDefinitionsUnitTests(unittest.TestCase):
    def test_strip_markdown_code_blocks_removes_fenced_and_inline_code(self) -> None:
        text = (
            "Intro text\n"
            "```markdown\n[fenced](broken/link.md)\n```\n"
            "Middle text with `[inline](broken/link2.md)` code\n"
            "Active link: [active](valid.md)"
        )
        stripped = v.strip_markdown_code_blocks(text)
        self.assertNotIn("broken/link.md", stripped)
        self.assertNotIn("broken/link2.md", stripped)
        self.assertIn("[active](valid.md)", stripped)

    def test_validate_markdown_links_accepts_valid_relative_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            target = tmp_path / "target.md"
            target.write_text("# Target\n", encoding="utf-8")
            source = tmp_path / "source.md"
            source.write_text("See [target](target.md#section) for details.\n", encoding="utf-8")

            v.validate_markdown_links(source)

    def test_validate_markdown_links_rejects_broken_relative_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            source = tmp_path / "source.md"
            source.write_text("See [broken](nonexistent.md) for details.\n", encoding="utf-8")

            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_markdown_links(source)
            self.assertIn("contains broken relative link target", str(ctx.exception))

    def test_validate_markdown_links_rejects_absolute_file_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            source = tmp_path / "source.md"
            source.write_text("See [abs](file:///tmp/something.md) for details.\n", encoding="utf-8")

            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_markdown_links(source)
            self.assertIn("must not use absolute file URL", str(ctx.exception))

    def test_parse_skill_frontmatter_handles_valid_and_invalid_yaml(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            skill_file = tmp_path / "SKILL.md"
            skill_file.write_text("---\nname: my-skill\ndescription: Use when testing.\n---\n# Content\n", encoding="utf-8")
            fm = v.parse_skill_frontmatter(skill_file)
            self.assertEqual(fm.get("name"), "my-skill")
            self.assertEqual(fm.get("description"), "Use when testing.")

            no_fm = tmp_path / "NO_FM.md"
            no_fm.write_text("# Content without frontmatter\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.parse_skill_frontmatter(no_fm)
            self.assertIn("must start with YAML frontmatter", str(ctx.exception))

            unclosed_fm = tmp_path / "UNCLOSED.md"
            unclosed_fm.write_text("---\nname: unclosed\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.parse_skill_frontmatter(unclosed_fm)
            self.assertIn("must close YAML frontmatter", str(ctx.exception))

    def test_validate_skill_spec_enforces_use_when_and_length_limits(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            skill_dir = tmp_path / "sample-skill"
            skill_dir.mkdir()
            skill_file = skill_dir / "SKILL.md"

            # Rejects non-"Use when..."
            skill_file.write_text("---\nname: sample-skill\ndescription: Do something for testing.\nallowed-tools: Read\n---\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("description must begin with 'Use when...'", str(ctx.exception))

            # Rejects description > 1024 chars
            long_desc = "Use when " + ("x" * 1020)
            skill_file.write_text(f"---\nname: sample-skill\ndescription: {long_desc}\nallowed-tools: Read\n---\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("description exceeds 1024 characters", str(ctx.exception))

            # Rejects reference > 300 lines
            skill_file.write_text("---\nname: sample-skill\ndescription: Use when testing.\nallowed-tools: Read\n---\n", encoding="utf-8")
            ref_dir = skill_dir / "references"
            ref_dir.mkdir()
            ref_file = ref_dir / "oversized.md"
            ref_file.write_text("\n".join(f"line {i}" for i in range(305)) + "\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("exceeds 300 lines", str(ctx.exception))

            # Rejects reference with Table of Contents (TOC)
            ref_file.write_text("## Contents\n- [Section 1](#1-section-1)\n## 1. Section 1\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("must not include a Table of Contents (TOC)", str(ctx.exception))

            # Accepts valid reference <= 300 lines without TOC
            ref_file.write_text("\n".join(f"line {i}" for i in range(250)) + "\n", encoding="utf-8")
            v.validate_skill_spec(skill_dir)

            # Accepts human summary when disable-model-invocation is true
            skill_file.write_text("---\nname: sample-skill\ndescription: Human summary description.\ndisable-model-invocation: true\nallowed-tools: Read\n---\n", encoding="utf-8")
            v.validate_skill_spec(skill_dir)

    def test_validate_skill_spec_enforces_mandatory_allowed_tools(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            skill_dir = tmp_path / "sample-skill"
            skill_dir.mkdir()
            skill_file = skill_dir / "SKILL.md"

            # Rejects missing allowed-tools
            skill_file.write_text("---\nname: sample-skill\ndescription: Use when testing.\n---\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("must define a non-empty 'allowed-tools'", str(ctx.exception))

            # Rejects empty allowed-tools
            skill_file.write_text("---\nname: sample-skill\ndescription: Use when testing.\nallowed-tools: \"   \"\n---\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("must define a non-empty 'allowed-tools'", str(ctx.exception))

            # Rejects non-string allowed-tools (e.g., list)
            skill_file.write_text("---\nname: sample-skill\ndescription: Use when testing.\nallowed-tools:\n  - Skill\n  - Read\n---\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("must define a non-empty 'allowed-tools'", str(ctx.exception))

            # Accepts valid space-delimited string
            skill_file.write_text("---\nname: sample-skill\ndescription: Use when testing.\nallowed-tools: Skill Read Edit Bash(pytest:*)\n---\n", encoding="utf-8")
            v.validate_skill_spec(skill_dir)

    def test_validate_skill_spec_rejects_legacy_resources_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            skill_dir = tmp_path / "sample-skill"
            skill_dir.mkdir()
            (skill_dir / "SKILL.md").write_text("---\nname: sample-skill\ndescription: Use when testing.\nallowed-tools: Read\n---\n", encoding="utf-8")
            (skill_dir / "resources").mkdir()

            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_skill_spec(skill_dir)
            self.assertIn("must be renamed to assets/", str(ctx.exception))

    def test_discover_common_packages_and_validate_all_in_repo(self) -> None:
        packages = v.discover_common_packages(ROOT)
        self.assertIn(ROOT / "plugins" / "common" / "core" / "package-metadata.json", packages)
        self.assertIn(ROOT / "plugins" / "common" / "workflow" / "package-metadata.json", packages)
        self.assertIn(ROOT / "plugins" / "common" / "sdlc" / "package-metadata.json", packages)
        self.assertIn(ROOT / "plugins" / "common" / "authoring" / "package-metadata.json", packages)

        for meta_path, pkg_name in packages.items():
            v.validate_package_metadata(meta_path, pkg_name)
            skills = v.validate_skill_tree(meta_path.parent / "skills")
            self.assertTrue(len(skills) > 0)

        v.validate_agy_plugins(ROOT)
        v.validate_retired_sdlc_is_absent(ROOT)
        v.validate_repository_release_version(ROOT)
        v.validate_repository_markdown_links(ROOT)

    def test_sync_manifests_synchronizes_all_manifests_and_catalogs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            common_pkg = tmp_root / "plugins" / "common" / "testpkg"
            common_pkg.mkdir(parents=True)
            meta = {
                "name": "filipkrawiec-testpkg",
                "version": "1.2.3",
                "description": "Test package description",
            }
            (common_pkg / "package-metadata.json").write_text(json.dumps(meta), encoding="utf-8")
            skills_dir = common_pkg / "skills" / "sample"
            skills_dir.mkdir(parents=True)
            (skills_dir / "SKILL.md").write_text("---\nname: sample\ndescription: Use when testing.\nallowed-tools: Read\n---\n", encoding="utf-8")

            # Marketplace dirs
            (tmp_root / ".claude-plugin").mkdir(parents=True)
            (tmp_root / ".claude-plugin" / "marketplace.json").write_text(json.dumps({"plugins": []}), encoding="utf-8")
            (tmp_root / ".agents" / "plugins").mkdir(parents=True)
            (tmp_root / ".agents" / "plugins" / "marketplace.json").write_text(json.dumps({"plugins": []}), encoding="utf-8")

            # AGY overlay
            agy_pkg = tmp_root / "plugins" / "agy" / "testpkg"
            agy_pkg.mkdir(parents=True)
            agy_meta = {
                "name": "filipkrawiec-agy-testpkg",
                "version": "0.0.0",
                "description": "AGY overlay",
                "dependencies": [{"name": "filipkrawiec-testpkg", "version": "0.0.0"}],
            }
            (agy_pkg / "plugin.json").write_text(json.dumps(agy_meta), encoding="utf-8")

            v.sync_manifests(tmp_root)

            # Assert generated files
            plugin_json = json.loads((common_pkg / "plugin.json").read_text(encoding="utf-8"))
            self.assertEqual(plugin_json["version"], "1.2.3")
            self.assertEqual(plugin_json["name"], "filipkrawiec-testpkg")

            claude_json = json.loads((common_pkg / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8"))
            self.assertEqual(claude_json["version"], "1.2.3")
            self.assertEqual(claude_json["skills"], "./skills/")

            codex_json = json.loads((common_pkg / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
            self.assertEqual(codex_json["version"], "1.2.3")
            self.assertEqual(codex_json["skills"], "./skills/")

            agy_json = json.loads((agy_pkg / "plugin.json").read_text(encoding="utf-8"))
            self.assertEqual(agy_json["version"], "1.2.3")
            self.assertEqual(agy_json["dependencies"][0]["version"], "1.2.3")

            claude_m = json.loads((tmp_root / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
            self.assertEqual(len(claude_m["plugins"]), 1)
            self.assertEqual(claude_m["plugins"][0]["name"], "filipkrawiec-testpkg")

            codex_m = json.loads((tmp_root / ".agents" / "plugins" / "marketplace.json").read_text(encoding="utf-8"))
            self.assertEqual(len(codex_m["plugins"]), 1)
            self.assertEqual(codex_m["plugins"][0]["name"], "filipkrawiec-testpkg")

    def test_validate_agy_plugins_subagent_skill_reference_checks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            common_pkg = tmp_root / "plugins" / "common" / "testpkg"
            common_pkg.mkdir(parents=True)
            meta = {
                "name": "filipkrawiec-testpkg",
                "version": "1.0.0",
                "description": "Test package",
            }
            (common_pkg / "package-metadata.json").write_text(json.dumps(meta), encoding="utf-8")
            (common_pkg / "plugin.json").write_text(json.dumps(meta), encoding="utf-8")
            (common_pkg / ".claude-plugin").mkdir()
            (common_pkg / ".claude-plugin" / "plugin.json").write_text(json.dumps({**meta, "skills": "./skills/"}), encoding="utf-8")
            (common_pkg / ".codex-plugin").mkdir()
            (common_pkg / ".codex-plugin" / "plugin.json").write_text(json.dumps({**meta, "skills": "./skills/"}), encoding="utf-8")
            skill_dir = common_pkg / "skills" / "valid-skill"
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text("---\nname: valid-skill\ndescription: Use when testing.\nallowed-tools: Read\n---\n", encoding="utf-8")

            agy_pkg = tmp_root / "plugins" / "agy" / "testpkg"
            agy_pkg.mkdir(parents=True)
            agy_meta = {
                "name": "filipkrawiec-agy-testpkg",
                "version": "1.0.0",
                "description": "AGY overlay",
                "dependencies": [{"name": "filipkrawiec-testpkg", "version": "1.0.0"}],
            }
            (agy_pkg / "plugin.json").write_text(json.dumps(agy_meta), encoding="utf-8")
            agents_dir = agy_pkg / "agents"
            agents_dir.mkdir()
            agent_file = agents_dir / "custom-agent.md"

            # Valid agent referencing valid-skill
            agent_file.write_text("# Custom Agent\n\n- **Skills**: valid-skill\n", encoding="utf-8")
            v.validate_agy_plugins(tmp_root)

            # Invalid agent referencing unknown-skill
            agent_file.write_text("# Custom Agent\n\n- **Skills**: valid-skill, unknown-skill\n", encoding="utf-8")
            with self.assertRaises(v.ValidationError) as ctx:
                v.validate_agy_plugins(tmp_root)
            self.assertIn("references unknown skill 'unknown-skill'", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

