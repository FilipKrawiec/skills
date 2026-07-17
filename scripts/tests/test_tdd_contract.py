"""Regression checks for the standalone TDD workflow skill."""

from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


class TddContractTests(unittest.TestCase):
    def test_tdd_is_portable_and_does_not_own_delivery_workflow(self) -> None:
        tdd = (ROOT / "plugins/workflow/skills/tdd/SKILL.md").read_text(encoding="utf-8")

        self.assertIn("TDD does not prescribe delegation, persistence, commits, or shipping workflow.", tdd)
        self.assertIn("**RED**", tdd)
        self.assertIn("**GREEN**", tdd)
        self.assertIn("**REFACTOR**", tdd)
        self.assertIn("**VERIFY**", tdd)
        self.assertNotIn("Lifecycle", tdd)
        self.assertNotIn("State Store", tdd)
        self.assertNotIn("VCS commits belong to SHIP", tdd)
        self.assertNotIn("spawns specialized subagents", tdd)
        self.assertNotIn("Commit and push", tdd)
        self.assertNotIn("isolated Subagent", tdd)


if __name__ == "__main__":
    unittest.main()
