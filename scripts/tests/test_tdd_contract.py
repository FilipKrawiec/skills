"""Regression checks for the standalone TDD workflow skill."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class TddContractTests(unittest.TestCase):
    def test_tdd_uses_one_agent_and_defers_vcs_to_ship(self) -> None:
        tdd = (ROOT / "plugins/workflow/skills/tdd/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("One agent owns", tdd)
        self.assertIn("VCS commits belong to SHIP", tdd)
        self.assertNotIn("spawns specialized subagents", tdd)
        self.assertNotIn("Commit and push", tdd)
        self.assertNotIn("isolated Subagent", tdd)


if __name__ == "__main__":
    unittest.main()
