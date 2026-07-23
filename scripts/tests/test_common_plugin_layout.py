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
