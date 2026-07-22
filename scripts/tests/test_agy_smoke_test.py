from __future__ import annotations

import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "agy-smoke-test.sh"


class AgySmokeTestContractTests(unittest.TestCase):
    def test_dry_run_uses_a_prompt_argument_and_headless_edit_permissions(self) -> None:
        result = subprocess.run(
            [str(SCRIPT), "--dry-run"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

        arguments = result.stdout.splitlines()
        self.assertEqual(arguments[0], "agy")
        self.assertIn("--new-project", arguments)
        self.assertIn("--mode=accept-edits", arguments)
        self.assertIn("--dangerously-skip-permissions", arguments)
        self.assertTrue(any(argument.startswith("--add-dir=") for argument in arguments))
        self.assertTrue(any(argument.startswith("--prompt=") for argument in arguments))


if __name__ == "__main__":
    unittest.main()
