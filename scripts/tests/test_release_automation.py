"""Unit and integration tests for release automation workflow."""

from __future__ import annotations

import contextlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
RELEASE_SCRIPT = REPOSITORY_ROOT / "scripts" / "release.py"
VALIDATE_PLUGIN = REPOSITORY_ROOT / "scripts" / "validate-plugin-definitions.py"


class ReleaseAutomationTests(unittest.TestCase):
    def test_parse_semver(self) -> None:
        sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))
        try:
            import release
            self.assertEqual(release.parse_semver("v9.0.0"), (9, 0, 0))
            self.assertEqual(release.parse_semver("8.4.1"), (8, 4, 1))
            self.assertIsNone(release.parse_semver("invalid"))
        finally:
            sys.path.pop(0)

    def test_compute_next_version(self) -> None:
        sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))
        try:
            import release
            self.assertEqual(release.compute_next_version((9, 0, 0), "patch"), "9.0.1")
            self.assertEqual(release.compute_next_version((9, 0, 0), "minor"), "9.1.0")
            self.assertEqual(release.compute_next_version((9, 0, 0), "major"), "10.0.0")
        finally:
            sys.path.pop(0)

    def test_detect_bump_type_conventional_commits(self) -> None:
        sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))
        try:
            import release
            # Test in temporary git repo
            with tempfile.TemporaryDirectory() as tmp_dir:
                root = Path(tmp_dir)
                subprocess.run(["git", "init", "-b", "main"], cwd=root, check=True, capture_output=True)
                subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
                subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=root, check=True)

                (root / "file.txt").write_text("initial", encoding="utf-8")
                subprocess.run(["git", "add", "."], cwd=root, check=True)
                subprocess.run(["git", "commit", "-m", "chore: initial"], cwd=root, check=True)
                subprocess.run(["git", "tag", "-a", "v1.0.0", "-m", "v1.0.0"], cwd=root, check=True)

                # Commit a feature
                (root / "file.txt").write_text("feature", encoding="utf-8")
                subprocess.run(["git", "commit", "-am", "feat(core): add new capability"], cwd=root, check=True)

                bump = release.detect_bump_type("v1.0.0", root=root)
                self.assertEqual(bump, "minor")

                # Commit a breaking change
                (root / "file.txt").write_text("breaking", encoding="utf-8")
                subprocess.run(["git", "commit", "-am", "feat!: breaking API overhaul"], cwd=root, check=True)

                bump_breaking = release.detect_bump_type("v1.0.0", root=root)
                self.assertEqual(bump_breaking, "major")
        finally:
            sys.path.pop(0)

    def test_discover_common_package_names(self) -> None:
        sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))
        try:
            import release
            packages = release.discover_common_package_names(REPOSITORY_ROOT)
            self.assertIn("core", packages)
            self.assertIn("workflow", packages)
            self.assertIn("authoring", packages)
        finally:
            sys.path.pop(0)

    def test_perform_release_refuses_a_dirty_worktree(self) -> None:
        with released_clone() as root:
            (root / "unrelated.txt").write_text("dirty content", encoding="utf-8")
            self.assertRefused(root, "dirty working tree")

    def test_perform_release_refuses_a_branch_other_than_main(self) -> None:
        with released_clone() as root:
            run_git(root, "switch", "-c", "feature")
            self.assertRefused(root, "only from main")

    def test_perform_release_refuses_main_behind_origin(self) -> None:
        with released_clone() as root:
            other = root.parent / "other"
            run_git(root.parent, "clone", "-q", str(root.parent / "origin.git"), str(other))
            commit(other, "feat: someone else's change")
            run_git(other, "push", "-q", "origin", "HEAD:main")
            self.assertRefused(root, "not level with origin/main")

    def test_perform_release_refuses_main_ahead_of_origin(self) -> None:
        with released_clone() as root:
            commit(root, "feat: unpushed change")
            self.assertRefused(root, "not level with origin/main")

    def test_perform_release_does_nothing_when_the_last_tag_is_head(self) -> None:
        with released_clone() as root:
            sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))
            try:
                import release
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertIsNone(release.perform_release("auto", root=root))
                self.assertEqual(run_git(root, "tag", "--list"), "v8.3.0")
                self.assertEqual(run_git(root, "status", "--porcelain"), "")
            finally:
                sys.path.pop(0)

    def assertRefused(self, root: Path, reason: str) -> None:
        sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))
        try:
            import release
            stderr = io.StringIO()
            with self.assertRaises(SystemExit), contextlib.redirect_stderr(stderr):
                release.perform_release("patch", root=root)
            self.assertIn(reason, stderr.getvalue())
            self.assertEqual(run_git(root, "tag", "--list"), "v8.3.0")
        finally:
            sys.path.pop(0)


def run_git(cwd: Path, *arguments: str) -> str:
    return subprocess.run(
        ["git", *arguments], cwd=cwd, check=True, capture_output=True, text=True
    ).stdout.strip()


def commit(root: Path, message: str) -> None:
    run_git(root, "config", "user.name", "Test")
    run_git(root, "config", "user.email", "test@test.com")
    (root / "file.txt").write_text(message, encoding="utf-8")
    run_git(root, "add", ".")
    run_git(root, "commit", "-q", "-m", message)


@contextlib.contextmanager
def released_clone():
    """A clone of a bare origin whose main carries the release tag v8.3.0."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        base = Path(tmp_dir)
        run_git(base, "init", "-q", "--bare", "-b", "main", "origin.git")
        root = base / "clone"
        run_git(base, "clone", "-q", str(base / "origin.git"), str(root))
        run_git(root, "switch", "-q", "-C", "main")
        commit(root, "chore: initial")
        run_git(root, "tag", "-a", "v8.3.0", "-m", "v8.3.0")
        run_git(root, "push", "-q", "origin", "main", "v8.3.0")
        yield root

if __name__ == "__main__":
    unittest.main()
