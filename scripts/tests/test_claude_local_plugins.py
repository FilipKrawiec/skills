"""Contract for launching Claude with this checkout's plugin directories."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
LAUNCHER = REPOSITORY_ROOT / "scripts" / "claude-local-plugins.sh"


class ClaudeLocalPluginsLauncherTests(unittest.TestCase):
    """The launcher must be independent of its caller's working directory."""

    def test_passes_local_plugin_directories_in_package_order_and_forwards_arguments(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            bin_directory = temporary_root / "bin"
            bin_directory.mkdir()
            arguments_file = temporary_root / "claude-arguments.json"
            fake_claude = bin_directory / "claude"
            fake_claude.write_text(
                "#!/usr/bin/env python3\n"
                "import json\n"
                "import os\n"
                "import sys\n"
                "from pathlib import Path\n"
                "Path(os.environ['CLAUDE_ARGUMENTS_FILE']).write_text(\n"
                "    json.dumps(sys.argv[1:]), encoding='utf-8'\n"
                ")\n",
                encoding="utf-8",
            )
            fake_claude.chmod(0o755)

            caller_directory = temporary_root / "another-working-directory"
            caller_directory.mkdir()
            forwarded_arguments = ("--model", "sonnet", "implement the task")
            environment = {
                **os.environ,
                "PATH": f"{bin_directory}{os.pathsep}{os.environ['PATH']}",
                "CLAUDE_ARGUMENTS_FILE": str(arguments_file),
            }

            result = subprocess.run(
                ["bash", str(LAUNCHER), *forwarded_arguments],
                cwd=caller_directory,
                capture_output=True,
                text=True,
                env=environment,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                json.loads(arguments_file.read_text(encoding="utf-8")),
                [
                    "--plugin-dir",
                    str(REPOSITORY_ROOT / "plugins" / "common" / "core"),
                    "--plugin-dir",
                    str(REPOSITORY_ROOT / "plugins" / "common" / "workflow"),
                    "--plugin-dir",
                    str(REPOSITORY_ROOT / "plugins" / "common" / "orchestration"),
                    "--plugin-dir",
                    str(REPOSITORY_ROOT / "plugins" / "common" / "authoring"),
                    *forwarded_arguments,
                ],
            )


if __name__ == "__main__":
    unittest.main()
