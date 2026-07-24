"""Unit tests for automatic local plugin reinstallation git hooks."""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class GitHooksTests(unittest.TestCase):
    def test_git_hooks_exist_and_are_executable(self) -> None:
        hooks = [
            ROOT / "scripts" / "git-hooks" / "post-commit",
            ROOT / "scripts" / "git-hooks" / "post-merge",
            ROOT / "scripts" / "git-hooks" / "pre-push",
            ROOT / "scripts" / "setup-git-hooks.sh",
        ]
        for hook in hooks:
            with self.subTest(hook=hook.name):
                self.assertTrue(hook.is_file(), f"{hook} does not exist")
                self.assertTrue(os.access(hook, os.X_OK), f"{hook} is not executable")

    def test_setup_git_hooks_script(self) -> None:
        setup_script = ROOT / "scripts" / "setup-git-hooks.sh"
        result = subprocess.run([str(setup_script)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, f"setup-git-hooks.sh failed: {result.stderr}")
        self.assertIn("Configured git core.hooksPath", result.stdout)

        current_hooks_path = subprocess.run(
            ["git", "config", "core.hooksPath"], cwd=ROOT, capture_output=True, text=True
        ).stdout.strip()
        self.assertEqual(current_hooks_path, "scripts/git-hooks")

        follow_tags = subprocess.run(
            ["git", "config", "push.followTags"], cwd=ROOT, capture_output=True, text=True
        ).stdout.strip()
        self.assertEqual(follow_tags, "true")

    def run_hook(self, name: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as temporary_directory:
            temporary_root = Path(temporary_directory)
            bin_directory = temporary_root / "bin"
            bin_directory.mkdir()
            for command in ("codex", "claude"):
                executable = bin_directory / command
                executable.write_text("#!/usr/bin/env sh\nexit 0\n", encoding="utf-8")
                executable.chmod(0o755)
            environment = os.environ | {
                "AGY_IDE_PLUGIN_DIR": str(temporary_root / "plugins"),
                "PATH": f"{bin_directory}{os.pathsep}{os.environ['PATH']}",
            }
            return subprocess.run(
                [str(ROOT / "scripts" / "git-hooks" / name)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                env=environment,
            )

    def assert_main_only_hook(self, name: str, expected_message: str) -> None:
        result = self.run_hook(name)
        self.assertEqual(result.returncode, 0, f"post-commit failed: {result.stderr}")
        branch = subprocess.run(
            ["git", "branch", "--show-current"], cwd=ROOT, capture_output=True, text=True, check=True
        ).stdout.strip()
        if branch == "main":
            self.assertIn(expected_message, result.stdout)
        else:
            self.assertEqual(result.stdout, "")

    def test_post_commit_hook_runs_only_on_main(self) -> None:
        self.assert_main_only_hook("post-commit", "Main branch commit detected")

    def test_post_merge_hook_runs_only_on_main(self) -> None:
        self.assert_main_only_hook("post-merge", "Main branch merge/pull detected")


if __name__ == "__main__":
    unittest.main()
