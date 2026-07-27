"""Contract tests for refreshing all locally installed plugin hosts."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "refresh-local-plugins.sh"
PACKAGES = (
    "filipkrawiec-core",
    "filipkrawiec-workflow",
    "filipkrawiec-authoring",
    "filipkrawiec-orchestration",
)


class RefreshLocalPluginsTests(unittest.TestCase):
    def test_refreshes_codex_claude_and_antigravity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            bin_directory = temporary_root / "bin"
            bin_directory.mkdir()
            command_log = temporary_root / "commands.log"
            for command in ("codex", "claude"):
                executable = bin_directory / command
                executable.write_text(
                    "#!/usr/bin/env sh\n"
                    "printf '%s %s\\n' \"$0\" \"$*\" >> \"$PLUGIN_COMMAND_LOG\"\n",
                    encoding="utf-8",
                )
                executable.chmod(0o755)

            environment = os.environ | {
                "PATH": f"{bin_directory}{os.pathsep}{os.environ['PATH']}",
                "PLUGIN_COMMAND_LOG": str(command_log),
                "AGY_IDE_PLUGIN_DIR": str(temporary_root / "plugins"),
            }
            result = subprocess.run(
                [str(SCRIPT)], cwd=ROOT, env=environment, capture_output=True, text=True
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            commands = command_log.read_text(encoding="utf-8")
            for package in PACKAGES:
                self.assertIn(f"codex plugin remove {package}@filipkrawiec", commands)
                self.assertIn(f"codex plugin add {package}@filipkrawiec", commands)
                self.assertIn(f"claude plugin update {package}@filipkrawiec", commands)

            self.assertEqual(
                (temporary_root / "plugins" / "filipkrawiec-orchestration").resolve(),
                ROOT / "plugins" / "common" / "orchestration",
            )


if __name__ == "__main__":
    unittest.main()
