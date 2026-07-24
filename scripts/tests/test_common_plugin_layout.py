"""Regression checks for directly installable common and agent overlay packages."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMMON_PACKAGES = ("core", "workflow", "sdlc", "authoring")


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

        self.assertEqual(versions, {"8.3.1"})

    def test_common_packages_do_not_contain_agent_native_rules_or_agents(self) -> None:
        for package in COMMON_PACKAGES:
            root = ROOT / "plugins" / "common" / package
            with self.subTest(package=package):
                self.assertFalse((root / "rules").exists())
                self.assertFalse((root / "agents").exists())
                self.assertEqual(list(root.rglob("agents/openai.yaml")), [])

    def test_antigravity_sdlc_overlay_owns_the_native_rule_and_agent(self) -> None:
        overlay = ROOT / "plugins" / "agy" / "sdlc"
        manifest = json.loads((overlay / "plugin.json").read_text(encoding="utf-8"))
        rule = overlay / "rules" / "sdlc.md"
        content = rule.read_text(encoding="utf-8")
        self.assertEqual(manifest["name"], "filipkrawiec-agy-sdlc")
        self.assertEqual(
            {dependency["name"]: dependency["version"] for dependency in manifest["dependencies"]},
            {
                "filipkrawiec-sdlc": "8.3.1",
                "filipkrawiec-workflow": "8.3.1",
                "filipkrawiec-core": "8.3.1",
                "filipkrawiec-authoring": "8.3.1",
            },
        )
        hooks = json.loads((overlay / "hooks.json").read_text(encoding="utf-8"))["sdlc-companion-packages"]
        self.assertIn("PreInvocation", hooks)
        self.assertIn("PreToolUse", hooks)
        self.assertIn("Antigravity Autonomous SDLC Rules", content)
        self.assertIn("Proceed", content)
        self.assertIn("sdlc-reviewer", content)

        agent_def = overlay / "agents" / "sdlc-reviewer.md"
        self.assertTrue(agent_def.is_file())
        agent_content = agent_def.read_text(encoding="utf-8")
        self.assertIn("`ddd`", agent_content)
        self.assertIn("`hexagonal-architecture`", agent_content)
        self.assertIn("`grill-with-docs`", agent_content)
        self.assertIn("`tdd`", agent_content)
        self.assertIn("`vcs`", agent_content)

    def test_antigravity_core_overlay_owns_reference_resolution_guidance(self) -> None:
        overlay = ROOT / "plugins" / "agy" / "core"
        self.assertTrue((overlay / "plugin.json").is_file())
        self.assertTrue((overlay / "rules" / "resolve-skill-references.md").is_file())

    def test_shared_grilling_defines_process_without_stage_focus(self) -> None:
        grill_skill = (
            ROOT / "plugins" / "common" / "workflow" / "skills" / "grill-with-docs" / "SKILL.md"
        ).read_text(encoding="utf-8")

        self.assertIn("Ask one sharp decision question at a time", grill_skill)
        self.assertNotIn("When docs propose a new product or initiative", grill_skill)
        self.assertNotIn("strategic fit", grill_skill)
        self.assertNotIn("viability", grill_skill)

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


if __name__ == "__main__":
    unittest.main()
