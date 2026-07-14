"""Regression checks for mandatory SDLC persistence and one-agent TDD."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class SdlcPersistenceContractTests(unittest.TestCase):
    def read(self, relative_path: str) -> str:
        return (ROOT / relative_path).read_text(encoding="utf-8")

    def test_root_requires_a_state_authority_before_repository_mutation(self) -> None:
        root_skill = self.read("plugins/sdlc/skills/sdlc/SKILL.md")
        state_store = self.read("plugins/sdlc/skills/sdlc/references/state-store.md")

        self.assertIn("State Authority", root_skill)
        self.assertIn("repository mutation", root_skill)
        self.assertIn("FILE", state_store)
        self.assertIn("CONTROL_PLANE", state_store)
        self.assertIn("expected_revision", state_store)
        self.assertIn("State Projection", state_store)

    def test_schema_makes_direct_cli_persistence_mandatory(self) -> None:
        schema = self.read("plugins/workflow/skills/sdlc/references/state-schema.md")

        self.assertIn("mandatory for direct CLI repository changes", schema)
        self.assertIn("HYBRID", schema)
        self.assertNotIn("may keep the envelope in session", schema)

    def test_tdd_uses_one_agent_and_defers_vcs_to_ship(self) -> None:
        tdd = self.read("plugins/workflow/skills/tdd/SKILL.md")

        self.assertIn("One agent owns", tdd)
        self.assertIn("VCS commits belong to SHIP", tdd)
        self.assertNotIn("spawns specialized subagents", tdd)
        self.assertNotIn("Commit and push", tdd)
        self.assertNotIn("isolated Subagent", tdd)


if __name__ == "__main__":
    unittest.main()
