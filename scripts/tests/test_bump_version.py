"""Release-package boundaries for ``scripts/bump-version.py``."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE_SCRIPT = REPOSITORY_ROOT / "scripts" / "bump-version.py"

PACKAGE_VERSIONS = {
    "plugins/common/core/package-metadata.json": "2.0.0",
    "plugins/common/workflow/package-metadata.json": "2.0.0",
    "plugins/common/sdlc/package-metadata.json": "4.0.0",
    "plugins/common/authoring/package-metadata.json": "2.0.0",
}


class BumpVersionPackageTests(unittest.TestCase):
    """The release command must never share a version across packages."""

    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)

        scripts_directory = self.root / "scripts"
        scripts_directory.mkdir()
        shutil.copy2(SOURCE_SCRIPT, scripts_directory / "bump-version.py")
        (scripts_directory / "validate-plugin-definitions.py").write_text(
            "#!/usr/bin/env python3\n",
            encoding="utf-8",
        )

        for relative_path, version in PACKAGE_VERSIONS.items():
            metadata_path = self.root / relative_path
            metadata_path.parent.mkdir(parents=True, exist_ok=True)
            metadata_path.write_text(
                json.dumps({"name": metadata_path.parent.name, "version": version}) + "\n",
                encoding="utf-8",
            )
            for agent in (".claude-plugin", ".codex-plugin"):
                manifest_path = metadata_path.parent / agent / "plugin.json"
                manifest_path.parent.mkdir(parents=True, exist_ok=True)
                manifest_path.write_text(
                    json.dumps({"name": metadata_path.parent.name, "version": version}) + "\n",
                    encoding="utf-8",
                )

        (self.root / "functional-change.txt").write_text("before\n", encoding="utf-8")
        self.git("init")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Test User")
        self.git("add", ".")
        self.git("commit", "-m", "initial")
        (self.root / "functional-change.txt").write_text("after\n", encoding="utf-8")
        self.git("add", "functional-change.txt")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def git(self, *arguments: str) -> None:
        subprocess.run(
            ["git", *arguments],
            cwd=self.root,
            check=True,
            capture_output=True,
            text=True,
        )

    def run_bump(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "scripts/bump-version.py", *arguments],
            cwd=self.root,
            capture_output=True,
            text=True,
        )

    def package_versions(self) -> dict[str, str]:
        return {
            relative_path: json.loads((self.root / relative_path).read_text(encoding="utf-8"))["version"]
            for relative_path in PACKAGE_VERSIONS
        }

    def test_workflow_major_bump_leaves_every_other_package_unchanged(self) -> None:
        result = self.run_bump("--plugin", "workflow", "--type", "major")

        self.assertEqual(result.returncode, 0, result.stderr)
        versions = self.package_versions()
        self.assertEqual(versions["plugins/common/workflow/package-metadata.json"], "3.0.0")
        self.assertEqual(versions["plugins/common/sdlc/package-metadata.json"], "4.0.0")
        self.assertEqual(versions["plugins/common/core/package-metadata.json"], "2.0.0")
        self.assertEqual(versions["plugins/common/authoring/package-metadata.json"], "2.0.0")

    def test_sdlc_major_bump_changes_only_the_sdlc_manifest(self) -> None:
        result = self.run_bump("--plugin", "sdlc", "--type", "major")

        self.assertEqual(result.returncode, 0, result.stderr)
        versions = self.package_versions()
        self.assertEqual(versions["plugins/common/sdlc/package-metadata.json"], "5.0.0")
        for relative_path, expected_version in PACKAGE_VERSIONS.items():
            if relative_path != "plugins/common/sdlc/package-metadata.json":
                self.assertEqual(versions[relative_path], expected_version)

    def test_plugin_selection_is_required(self) -> None:
        result = self.run_bump("--type", "major")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--plugin", result.stderr)
        self.assertEqual(self.package_versions(), PACKAGE_VERSIONS)

    def test_invalid_plugin_selection_is_rejected(self) -> None:
        result = self.run_bump("--plugin", "unknown", "--type", "major")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid choice", result.stderr)
        self.assertEqual(self.package_versions(), PACKAGE_VERSIONS)


if __name__ == "__main__":
    unittest.main()
