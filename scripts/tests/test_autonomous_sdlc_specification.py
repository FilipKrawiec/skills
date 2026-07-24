"""Regression checks for the Autonomous SDLC specification boundary."""

from __future__ import annotations

import json
import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SPECIFICATION = ROOT / "spec" / "autonomous-sdlc" / "SPECIFICATION.md"
CONFORMANCE = ROOT / "spec" / "autonomous-sdlc" / "conformance.md"
SDLC_SKILL = ROOT / "plugins" / "common" / "sdlc" / "skills" / "sdlc" / "SKILL.md"
SDLC_SKILL_DIRECTORY = SDLC_SKILL.parent
PACKAGED_SPECIFICATION = SDLC_SKILL_DIRECTORY / "references" / "autonomous-sdlc-specification.md"
PACKAGED_CONFORMANCE = SDLC_SKILL_DIRECTORY / "references" / "conformance.md"


class AutonomousSdlcSpecificationTests(unittest.TestCase):
    def test_specification_defines_the_required_domain_contract(self) -> None:
        specification = SPECIFICATION.read_text(encoding="utf-8")

        self.assertIn("## Typed phase contracts", specification)
        for phase_contract in (
            "RequestedOutcome",
            "Definition",
            "DeliveryContract",
            "ImplementationPlan",
            "ExecutionResult",
            "ReviewDecision",
            "ShipmentCandidate",
            "AcceptanceDecision",
            "ImprovementOutcome",
        ):
            with self.subTest(phase_contract=phase_contract):
                self.assertIn(phase_contract, specification)

    def test_phase_outcome_has_one_typed_next_action_or_is_terminal(self) -> None:
        specification = SPECIFICATION.read_text(encoding="utf-8")
        conformance = CONFORMANCE.read_text(encoding="utf-8")

        self.assertIn("`Succeeded { work_product, contributors, evidence, next_action }`", specification)
        self.assertIn("`Terminated { status: FAILED | BLOCKED | CANCELLED, reason, evidence? }`", specification)
        for next_action in ("`StartPhase", "`RequestApproval", "`CloseTask"):
            with self.subTest(next_action=next_action):
                self.assertIn(next_action, specification)
        self.assertNotIn("executor_requirement", specification)
        self.assertNotIn("executor_requirement", conformance)

    def test_specification_defines_approval_wait_states_and_actor_four_eyes(self) -> None:
        specification = SPECIFICATION.read_text(encoding="utf-8")

        self.assertIn("AWAITING_APPROVAL", specification)
        self.assertIn("SpecificationApprovalRequested", specification)
        self.assertIn("ShipmentApprovalRequested", specification)
        self.assertIn("Segregation is by Actor identity, never role", specification)
        self.assertIn("MUST NOT be a Contributor", specification)

    def test_specification_bounds_rework_and_unblocking(self) -> None:
        specification = SPECIFICATION.read_text(encoding="utf-8")

        self.assertIn("maximum_active_delivery_time <= PT5H", specification)
        self.assertIn("maximum_rework_cycles <= 2", specification)
        self.assertIn("InvestigationRequired", specification)
        self.assertIn("AWAITING_UNBLOCK", specification)
        self.assertIn("`ResolveInvestigation` can only split or cancel", specification)
        self.assertIn("resumes exactly the same Phase Run", specification)
        self.assertIn("at most one `BLOCKER` suspension", specification)
        self.assertIn("only permitted second suspension", specification)

    def test_specification_defines_command_authority_and_retries(self) -> None:
        specification = SPECIFICATION.read_text(encoding="utf-8")

        self.assertIn("CommandEnvelope { task_id, command_id, expected_revision, issued_by, payload }", specification)
        self.assertIn("A host MUST apply a command only at its expected revision", specification)
        self.assertIn("Task-assigned `SDLC_ORCHESTRATOR`", specification)
        self.assertIn("initial_role_assignments, define_executor", specification)
        self.assertIn("TaskTerminalOutcome", specification)

    def test_conformance_covers_waiting_four_eyes_and_delivery_guards(self) -> None:
        conformance = CONFORMANCE.read_text(encoding="utf-8")

        for scenario in (
            "approval rework",
            "eligible non-contributor",
            "delivery-guard breach",
            "unblock, resume, and delivery-guard breach",
            "command retry and split",
        ):
            with self.subTest(scenario=scenario):
                self.assertIn(scenario, conformance)

    def test_sdlc_skill_uses_the_specification_as_its_authority(self) -> None:
        skill = SDLC_SKILL.read_text(encoding="utf-8")

        self.assertIn("references/autonomous-sdlc-specification.md", skill)
        self.assertIn("the authority", skill)

    def test_sdlc_enforces_companion_packages_through_host_plugins(self) -> None:
        sdlc_root = ROOT / "plugins" / "common" / "sdlc"
        required = {
            "filipkrawiec-core",
            "filipkrawiec-workflow",
            "filipkrawiec-authoring",
        }

        for host in (".claude-plugin", ".codex-plugin"):
            with self.subTest(host=host):
                manifest = json.loads((sdlc_root / host / "plugin.json").read_text(encoding="utf-8"))
                self.assertEqual(
                    {dependency["name"]: dependency["version"] for dependency in manifest["dependencies"]},
                    {package: manifest["version"] for package in required},
                )
                hook_config = sdlc_root / manifest["hooks"]
                self.assertTrue(hook_config.is_file())
                hooks = json.loads(hook_config.read_text(encoding="utf-8"))["hooks"]
                self.assertIn("SessionStart", hooks)
                self.assertIn("UserPromptSubmit", hooks)

        self.assertTrue((sdlc_root / "scripts" / "check-claude-companion-plugins.sh").is_file())
        self.assertTrue((sdlc_root / "scripts" / "check-codex-companion-plugins.sh").is_file())

    def test_companion_package_hooks_block_when_a_package_is_missing(self) -> None:
        scripts = ROOT / "plugins" / "common" / "sdlc" / "scripts"
        with tempfile.TemporaryDirectory() as temporary_directory:
            bin_dir = Path(temporary_directory)
            for command, output in (("claude", "[]"), ("codex", "")):
                command_path = bin_dir / command
                command_path.write_text(f"#!/usr/bin/env sh\nprintf '%s\\n' '{output}'\n", encoding="utf-8")
                command_path.chmod(command_path.stat().st_mode | stat.S_IXUSR)

            environment = os.environ | {"PATH": f"{bin_dir}:{os.environ['PATH']}"}
            claude = subprocess.run(
                [scripts / "check-claude-companion-plugins.sh"],
                input='{"hook_event_name":"UserPromptSubmit"}',
                text=True,
                capture_output=True,
                env=environment,
                check=False,
            )
            self.assertEqual(claude.returncode, 2)
            self.assertIn("filipkrawiec-authoring", claude.stderr)

            codex = subprocess.run(
                [scripts / "check-codex-companion-plugins.sh"],
                input='{"hook_event_name":"UserPromptSubmit"}',
                text=True,
                capture_output=True,
                env=environment,
                check=False,
            )
            self.assertEqual(codex.returncode, 0)
            response = json.loads(codex.stdout)
            self.assertFalse(response["continue"])
            self.assertIn("filipkrawiec-workflow", response["stopReason"])

    def test_plugin_ships_the_canonical_specification_without_drift(self) -> None:
        self.assertEqual(PACKAGED_SPECIFICATION.read_text(encoding="utf-8").rstrip(), SPECIFICATION.read_text(encoding="utf-8").rstrip())
        packaged_conformance = PACKAGED_CONFORMANCE.read_text(encoding="utf-8").replace(
            "(autonomous-sdlc-specification.md)", "(SPECIFICATION.md)"
        )
        self.assertEqual(packaged_conformance.rstrip(), CONFORMANCE.read_text(encoding="utf-8").rstrip())

    def test_stage_skills_do_not_duplicate_phase_contracts(self) -> None:
        stage_skills = (
            ROOT / "plugins" / "common" / "sdlc" / "skills" / "sdlc-define" / "SKILL.md",
            ROOT / "plugins" / "common" / "sdlc" / "skills" / "sdlc-refine" / "SKILL.md",
            ROOT / "plugins" / "common" / "sdlc" / "skills" / "sdlc-execute" / "SKILL.md",
            ROOT / "plugins" / "common" / "sdlc" / "skills" / "sdlc-improve" / "SKILL.md",
        )

        for path in stage_skills:
            with self.subTest(path=path):
                content = path.read_text(encoding="utf-8")
                authority = path.parent / "../sdlc/references/autonomous-sdlc-specification.md"
                self.assertIn("../sdlc/references/autonomous-sdlc-specification.md", content)
                self.assertTrue(authority.resolve().is_file())
                self.assertFalse((path.parent / "references" / "autonomous-sdlc-specification.md").exists())
                self.assertIn("`PhaseOutcome`", content)
                self.assertIn("`BlockerReport`", content)
                self.assertIn("Do not enact that action", content)
                self.assertNotIn("Input:", content)
                self.assertNotIn("Result:", content)

    def test_sdlc_skill_does_not_ship_a_cli_contract_or_python_runtime(self) -> None:
        self.assertFalse((SDLC_SKILL_DIRECTORY / "references" / "phase-contract.md").exists())
        self.assertEqual(list(SDLC_SKILL_DIRECTORY.rglob("*.py")), [])

    def test_stage_skills_describe_work_products_without_host_persistence(self) -> None:
        stage_files = tuple((ROOT / "plugins" / "sdlc" / "skills").rglob("*.md"))
        for path in stage_files:
            with self.subTest(path=path):
                content = path.read_text(encoding="utf-8")
                self.assertNotIn(".sdlc/tasks/", content)
                self.assertNotIn("host-scoped artifact", content)
                self.assertNotIn("copy/symlink", content)

    def test_define_skill_delegates_strategic_grilling_to_the_shared_skill(self) -> None:
        define_skill = (
            ROOT / "plugins" / "common" / "sdlc" / "skills" / "sdlc-define" / "SKILL.md"
        ).read_text(encoding="utf-8")

        self.assertIn("Strategic Definition Grilling", define_skill)
        self.assertIn(
            "Use `grill-with-docs` to perform the mandatory strategic Definition grilling against the available context and references.",
            define_skill,
        )
        self.assertIn("Bigger-picture fit", define_skill)
        self.assertIn("Viability", define_skill)
        self.assertNotIn("one sharp question at a time", define_skill)
        self.assertNotIn("ask concise decision questions", define_skill)

    def test_refine_skill_uses_technical_specification_grilling(self) -> None:
        refine_skill = (
            ROOT / "plugins" / "common" / "sdlc" / "skills" / "sdlc-refine" / "SKILL.md"
        ).read_text(encoding="utf-8")

        self.assertIn("Technical Specification Grilling", refine_skill)
        self.assertIn("technical grilling pass", refine_skill)
        self.assertIn("technical evidence disproves them", refine_skill)
        self.assertIn("`grill-with-docs`", refine_skill)


if __name__ == "__main__":
    unittest.main()
