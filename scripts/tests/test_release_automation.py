"""Unit and integration tests for release automation workflow."""

from __future__ import annotations

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
VALIDATE_RELEASE = REPOSITORY_ROOT / "scripts" / "validate-release-version.py"


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

    def test_perform_release_aborts_on_dirty_worktree(self) -> None:
        sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))
        try:
            import release
            with tempfile.TemporaryDirectory() as tmp_dir:
                root = Path(tmp_dir)
                subprocess.run(["git", "init", "-b", "main"], cwd=root, check=True, capture_output=True)
                subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
                subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=root, check=True)
                (root / "file.txt").write_text("initial", encoding="utf-8")
                subprocess.run(["git", "add", "."], cwd=root, check=True)
                subprocess.run(["git", "commit", "-m", "chore: initial"], cwd=root, check=True)
                subprocess.run(["git", "tag", "-a", "v8.3.0", "-m", "v8.3.0"], cwd=root, check=True)

                # Make worktree dirty
                (root / "unrelated.txt").write_text("dirty content", encoding="utf-8")

                with self.assertRaises(SystemExit):
                    release.perform_release("patch", root=root)
        finally:
            sys.path.pop(0)


if __name__ == "__main__":
    unittest.main()
