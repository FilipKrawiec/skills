"""Unit tests for automatic local plugin reinstallation git hooks."""

from __future__ import annotations

import os
import subprocess
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

    def test_post_commit_hook_on_main(self) -> None:
        post_commit = ROOT / "scripts" / "git-hooks" / "post-commit"
        result = subprocess.run([str(post_commit)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, f"post-commit failed: {result.stderr}")
        self.assertIn("Main branch commit detected", result.stdout)

    def test_post_merge_hook_on_main(self) -> None:
        post_merge = ROOT / "scripts" / "git-hooks" / "post-merge"
        result = subprocess.run([str(post_merge)], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, f"post-merge failed: {result.stderr}")
        self.assertIn("Main branch merge/pull detected", result.stdout)


if __name__ == "__main__":
    unittest.main()
