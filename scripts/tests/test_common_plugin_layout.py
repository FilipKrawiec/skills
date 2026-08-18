"""Regression checks for directly installable common and agent overlay packages."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMMON_PACKAGES = tuple(
    sorted(p.name for p in (ROOT / "plugins" / "common").glob("*") if p.is_dir() and not p.name.startswith("."))
)


class CommonPluginLayoutTests(unittest.TestCase):
    def test_common_packages_are_directly_installable_by_every_host(self) -> None:
        for package in COMMON_PACKAGES:
            with self.subTest(package=package):
                root = ROOT / "plugins" / "common" / package
                self.assertTrue((root / "skills").is_dir())
                self.assertTrue((root / "plugin.json").is_file())
                self.assertTrue((root / ".claude-plugin" / "plugin.json").is_file())
                self.assertTrue((root / ".codex-plugin" / "plugin.json").is_file())

    def test_all_plugin_definitions_share_the_repository_release_version(self) -> None:
        release_version = json.loads(
            (ROOT / "plugins" / "common" / "core" / "package-metadata.json").read_text(encoding="utf-8")
        )["version"]
        versions = set()
        for package in COMMON_PACKAGES:
            root = ROOT / "plugins" / "common" / package
            for manifest in (
                root / "package-metadata.json",
                root / "plugin.json",
                root / ".claude-plugin" / "plugin.json",
                root / ".codex-plugin" / "plugin.json",
            ):
                versions.add(json.loads(manifest.read_text(encoding="utf-8"))["version"])

        for manifest in (ROOT / "plugins" / "agy").glob("*/plugin.json"):
            versions.add(json.loads(manifest.read_text(encoding="utf-8"))["version"])

        self.assertEqual(versions, {release_version})

    def test_common_packages_do_not_contain_agent_native_rules_or_agents(self) -> None:
        for package in COMMON_PACKAGES:
            root = ROOT / "plugins" / "common" / package
            with self.subTest(package=package):
                self.assertFalse((root / "rules").exists())
                self.assertFalse((root / "agents").exists())
                self.assertEqual(list(root.rglob("agents/openai.yaml")), [])

    def test_retired_orchestration_material_is_absent(self) -> None:
        self.assertFalse((ROOT / "plugins" / "common" / "orchestration").exists())
        self.assertFalse((ROOT / "plugins" / "agy" / "orchestration").exists())
        self.assertFalse((ROOT / "spec" / "autonomous-sdlc").exists())
        self.assertFalse((ROOT / "archive" / "autonomous-sdlc").exists())

    def test_antigravity_core_overlay_owns_reference_resolution_guidance(self) -> None:
        overlay = ROOT / "plugins" / "agy" / "core"
        self.assertTrue((overlay / "plugin.json").is_file())
        self.assertTrue((overlay / "rules" / "resolve-skill-references.md").is_file())

    def test_agent_marketplaces_list_only_their_common_packages(self) -> None:
        claude = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
        codex = json.loads((ROOT / ".agents" / "plugins" / "marketplace.json").read_text(encoding="utf-8"))
        self.assertEqual(
            {plugin["source"] for plugin in claude["plugins"]},
            {f"./plugins/common/{package}" for package in COMMON_PACKAGES},
        )
        self.assertEqual(
            {plugin["source"]["path"] for plugin in codex["plugins"]},
            {f"./plugins/common/{package}" for package in COMMON_PACKAGES},
        )

    def test_root_ci_runs_the_authoritative_operational_mvp_checks(self) -> None:
        workflow = (ROOT / ".github" / "workflows" / "verify.yml").read_text(encoding="utf-8")

        self.assertIn("python3 -m unittest discover -s scripts/tests", workflow)
        self.assertIn("python3 scripts/validate-plugin-definitions.py", workflow)
        self.assertIn("python3 scripts/project-verify.py status", workflow)

    def test_root_ci_defines_automated_release_on_main(self) -> None:
        release_wf = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")

        self.assertIn("branches:\n      - main", release_wf)
        self.assertIn("python3 scripts/release.py auto", release_wf)
        self.assertIn("git push origin main --follow-tags", release_wf)

    def test_readme_defines_the_pre_and_post_merge_release_boundary(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")

        self.assertIn("Pre-merge", readme)
        self.assertIn("Post-merge", readme)
        self.assertIn("does not claim a release tag", readme)

    def test_all_docs_and_adrs_are_indexed_in_docs_index(self) -> None:
        docs_index = (ROOT / "docs" / "index.md").read_text(encoding="utf-8")
        adr_readme = (ROOT / "docs" / "adr" / "README.md").read_text(encoding="utf-8")
        records_readme = (ROOT / "docs" / "records" / "README.md").read_text(encoding="utf-8")

        self.assertIn("CONCEPTS.md", docs_index)

        for adr_file in (ROOT / "docs" / "adr").glob("*.md"):
            if adr_file.name != "README.md":
                self.assertTrue(
                    adr_file.name in docs_index or adr_file.name in adr_readme,
                    f"ADR file {adr_file.name} is not indexed in docs/index.md or docs/adr/README.md",
                )

        for record_file in (ROOT / "docs" / "records").glob("*.md"):
            if record_file.name != "README.md":
                self.assertTrue(
                    record_file.name in docs_index or record_file.name in records_readme,
                    f"Record file {record_file.name} is not indexed in docs/index.md or docs/records/README.md",
                )

    def test_root_justfile_defines_standard_lifecycle_recipes(self) -> None:
        justfile = (ROOT / "justfile").read_text(encoding="utf-8")
        self.assertTrue((ROOT / "justfile").is_file())
        self.assertIn("unit:", justfile)
        self.assertIn("verify:", justfile)
        self.assertIn("status:", justfile)
        self.assertIn("release-check:", justfile)
        self.assertIn("install-agy:", justfile)
        self.assertIn("link-agy:", justfile)

    def test_all_skills_and_package_markdown_links_resolve_correctly(self) -> None:
        import re
        link_pattern = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
        for md_file in (ROOT / "plugins" / "common").rglob("*.md"):
            raw_content = md_file.read_text(encoding="utf-8")
            # Strip code blocks and inline code
            content = re.sub(r"```[\s\S]*?```", "", raw_content)
            content = re.sub(r"`[^`\n]+`", "", content)
            for match in link_pattern.finditer(content):
                target = match.group(2).strip()
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                self.assertFalse(
                    target.startswith("file://") or target.startswith("/"),
                    f"{md_file.relative_to(ROOT)} should not use absolute link '{target}'",
                )
                target_path = target.split("#", 1)[0]
                resolved = (md_file.parent / target_path).resolve()
                self.assertTrue(
                    resolved.is_file(),
                    f"{md_file.relative_to(ROOT)} broken relative link '{target}' -> {resolved}",
                )

    def test_skills_are_portable_and_do_not_hardcode_repo_specific_scripts(self) -> None:
        for md_file in (ROOT / "plugins").rglob("*.md"):
            content = md_file.read_text(encoding="utf-8")
            self.assertNotIn(
                "scripts/release.py",
                content,
                f"{md_file.relative_to(ROOT)} must not hardcode repository-specific release script 'scripts/release.py'",
            )
            self.assertNotIn(
                "scripts/tests",
                content,
                f"{md_file.relative_to(ROOT)} must not hardcode repository test directory 'scripts/tests'",
            )


if __name__ == "__main__":
    unittest.main()



