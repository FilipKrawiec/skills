"""Regression checks for directly installable common and agent overlay packages."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMMON_PACKAGES = ("core", "workflow", "orchestration", "authoring")


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
            (ROOT / "plugins" / "common" / "orchestration" / "package-metadata.json").read_text(encoding="utf-8")
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

    def test_retired_sdlc_material_is_absent(self) -> None:
        self.assertFalse((ROOT / "plugins" / "common" / "sdlc").exists())
        self.assertFalse((ROOT / "plugins" / "agy" / "sdlc").exists())
        self.assertFalse((ROOT / "spec" / "autonomous-sdlc").exists())
        self.assertFalse((ROOT / "archive" / "autonomous-sdlc").exists())

    def test_antigravity_core_overlay_owns_reference_resolution_guidance(self) -> None:
        overlay = ROOT / "plugins" / "agy" / "core"
        self.assertTrue((overlay / "plugin.json").is_file())
        self.assertTrue((overlay / "rules" / "resolve-skill-references.md").is_file())

    def test_shared_grilling_uses_progressive_disclosure_for_planning_handoff(self) -> None:
        grill_skill = (
            ROOT / "plugins" / "common" / "workflow" / "skills" / "grill-with-docs" / "SKILL.md"
        ).read_text(encoding="utf-8")

        self.assertIn("Ask one sharp decision question at a time", grill_skill)
        self.assertIn("selected technology profiles", grill_skill)
        self.assertIn("Central Knowledge index entries", grill_skill)
        self.assertIn("Project Knowledge overrides", grill_skill)
        self.assertIn("compact record for the orchestrator", grill_skill)
        self.assertIn("does not edit implementation code", grill_skill)
        self.assertIn("only when the outcome is an architectural decision", grill_skill)
        self.assertNotIn("CONTEXT.md", grill_skill)
        self.assertNotIn("Autonomous SDLC", grill_skill)

    def test_vcs_delivery_authority_allows_task_branch_delivery_but_reserves_merge(self) -> None:
        vcs_skill = (ROOT / "plugins" / "common" / "workflow" / "skills" / "vcs" / "SKILL.md").read_text(
            encoding="utf-8"
        )

        self.assertIn("push verified task branches", vcs_skill)
        self.assertIn("publish or update Review Requests", vcs_skill)
        self.assertIn("Do not merge, approve, or force-push a protected/default branch", vcs_skill)
        self.assertIn("exactly one durable Delivery Record", vcs_skill)
        self.assertIn("configured host integration may close or update it on merge", vcs_skill)
        self.assertNotIn("GitHub Issue", vcs_skill)
        self.assertNotIn("pull request", vcs_skill)

    def test_orchestration_keeps_one_executor_context_for_a_cohesive_slice(self) -> None:
        skill = (
            ROOT
            / "plugins"
            / "common"
            / "orchestration"
            / "skills"
            / "orchestrate-delivery"
            / "SKILL.md"
        ).read_text(encoding="utf-8")
        packet = (
            ROOT
            / "plugins"
            / "common"
            / "orchestration"
            / "skills"
            / "orchestrate-delivery"
            / "references"
            / "task-packet.md"
        ).read_text(encoding="utf-8")

        self.assertIn("cohesive delivery slices", skill)
        self.assertIn("retains the slice context", skill)
        self.assertIn("Do not split test-writing, implementation, and verification", packet)
        self.assertIn("Executor rationale", packet)
        self.assertIn("Routing config", packet)
        self.assertIn("current configuration is Antigravity (AG)", packet)
        self.assertIn("does not automatically retry with another harness or fabricate execution", packet)
        self.assertIn("does not automatically retry with another harness", packet)
        self.assertIn("Delivery Record", packet)
        self.assertIn("exactly one durable Delivery Record", packet)
        self.assertIn("Every published Review Request links exactly one Delivery Record", packet)
        self.assertIn("chat-only ideation", packet)
        self.assertNotIn("GitHub Issue", packet)
        self.assertNotIn("pull request", packet)

    def test_active_delivery_guidance_preserves_the_provider_neutral_lifecycle(self) -> None:
        orchestration = (
            ROOT
            / "plugins"
            / "common"
            / "orchestration"
            / "skills"
            / "orchestrate-delivery"
            / "SKILL.md"
        ).read_text(encoding="utf-8")
        grilling = (
            ROOT / "plugins" / "common" / "workflow" / "skills" / "grill-with-docs" / "SKILL.md"
        ).read_text(encoding="utf-8")
        guidance = (ROOT / "AGENTS.md").read_text(encoding="utf-8")

        for stage in (
            "DEFINE",
            "SPECIFY / GRILL",
            "PLAN",
            "DISPATCH",
            "COLLECT / VERIFY",
            "REVIEW",
            "SHIP / RETURN",
        ):
            self.assertIn(stage, orchestration)
        self.assertIn("does not edit implementation code", orchestration)
        self.assertIn("Central Knowledge index entries", grilling)
        self.assertIn("Project Knowledge overrides", grilling)
        self.assertIn("stops and returns the slice", orchestration)
        self.assertIn("Review Request", orchestration)
        self.assertIn("user retains merge authority", orchestration)
        self.assertNotIn("skip feature branches", guidance)
        self.assertIn("Review Request", guidance)
        self.assertIn("user retains merge authority", guidance)

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
        self.assertIn("knowledge-check:", justfile)
        self.assertIn("release-check:", justfile)

    def test_define_skill_layout_and_authoring_spec(self) -> None:
        define_dir = ROOT / "plugins" / "common" / "orchestration" / "skills" / "define"
        self.assertTrue((define_dir / "SKILL.md").is_file())
        self.assertTrue((define_dir / "references" / "idea-capture.md").is_file())

        content = (define_dir / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("---\nname: define\n"))
        self.assertIn("description: Use when capturing business outcomes", content)
        self.assertIn("[idea-capture.md](references/idea-capture.md)", content)
        self.assertIn("Duplicate Prevention Check", content)
        self.assertIn("gh issue create", content)
        self.assertIn("01 Define", content)
        self.assertIn("Completion Boundary Guardrail", content)

    def test_specify_skill_layout_and_authoring_spec(self) -> None:
        specify_dir = ROOT / "plugins" / "common" / "orchestration" / "skills" / "specify"
        self.assertTrue((specify_dir / "SKILL.md").is_file())

        content = (specify_dir / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("---\nname: specify\n"))
        self.assertIn("description: Use when refining, grilling, and detailing a Backlog GitHub Issue", content)
        self.assertIn("grill-with-docs", content)
        self.assertIn("gh issue edit", content)
        self.assertIn("02 Spec", content)
        self.assertIn("Completion Boundary Guardrail", content)

    def test_orchestrate_delivery_skill_board_phase_transitions(self) -> None:
        orchestrate_dir = ROOT / "plugins" / "common" / "orchestration" / "skills" / "orchestrate-delivery"
        self.assertTrue((orchestrate_dir / "SKILL.md").is_file())

        content = (orchestrate_dir / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("---\nname: orchestrate-delivery\n"))
        self.assertIn("01 Define", content)
        self.assertIn("02 Spec", content)
        self.assertIn("03 Plan", content)
        self.assertIn("04 Execute", content)
        self.assertIn("05 Review", content)
        self.assertIn("06 Ship", content)

    def test_writing_great_skill_layout_and_reference_rules(self) -> None:
        skill_dir = ROOT / "plugins" / "common" / "authoring" / "skills" / "writing-great-skill"
        self.assertTrue((skill_dir / "SKILL.md").is_file())
        self.assertTrue((skill_dir / "references" / "glossary.md").is_file())
        self.assertTrue((skill_dir / "references" / "agentskills-guide.md").is_file())

        content = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("---\nname: writing-great-skill\n"))
        self.assertIn("Reference Scope & Sizing", content)
        self.assertIn("Lazy Loading Guardrail", content)
        self.assertIn("[glossary.md](references/glossary.md)", content)
        self.assertIn("[agentskills-guide.md](references/agentskills-guide.md)", content)

        glossary = (skill_dir / "references" / "glossary.md").read_text(encoding="utf-8")
        self.assertIn("## Shared Package Authority", glossary)
        self.assertIn("## Lazy Loading (Progressive Disclosure)", glossary)
        self.assertIn("## Greedy Pre-fetching", glossary)

    def test_swot_skill_layout_and_authoring_spec(self) -> None:
        skill_dir = ROOT / "plugins" / "common" / "authoring" / "skills" / "swot"
        self.assertTrue((skill_dir / "SKILL.md").is_file())
        self.assertTrue((skill_dir / "references" / "swot-methodology.md").is_file())
        self.assertTrue((skill_dir / "references" / "swot-template.md").is_file())

        content = (skill_dir / "SKILL.md").read_text(encoding="utf-8")
        self.assertTrue(content.startswith("---\nname: swot\n"))
        self.assertIn(
            "description: Use when performing a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats), strategic audit, or architectural health evaluation of a codebase, skill, framework, or technical component.",
            content,
        )
        self.assertIn("[swot-methodology.md](references/swot-methodology.md)", content)
        self.assertIn("[swot-template.md](references/swot-template.md)", content)
        self.assertLess(len(content.splitlines()), 45)

        methodology = (skill_dir / "references" / "swot-methodology.md").read_text(encoding="utf-8")
        template = (skill_dir / "references" / "swot-template.md").read_text(encoding="utf-8")
        self.assertLess(len(methodology.splitlines()), 300)
        self.assertLess(len(template.splitlines()), 300)

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


if __name__ == "__main__":
    unittest.main()



