"""Acceptance tests for repository-wide Git-tagged plugin releases."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
SOURCE_SCRIPT = REPOSITORY_ROOT / "scripts" / "validate-release-version.py"
COMMON_PACKAGES = ("core", "workflow", "sdlc", "authoring")
AGY_PACKAGES = ("core", "sdlc")
INITIAL_RELEASE_VERSION = "8.3.0"
INITIAL_RELEASE_TAG = f"v{INITIAL_RELEASE_VERSION}"


class ReleaseVersionValidationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name)
        scripts = self.root / "scripts"
        scripts.mkdir()
        shutil.copy2(SOURCE_SCRIPT, scripts / "validate-release-version.py")

        self.write_release(INITIAL_RELEASE_VERSION)
        self.git("init")
        self.git("config", "user.email", "test@example.com")
        self.git("config", "user.name", "Test User")
        self.git("add", ".")
        self.git("commit", "-m", "feat: first repository release")
        self.git("tag", "-a", INITIAL_RELEASE_TAG, "-m", INITIAL_RELEASE_TAG)

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

    def write_release(self, version: str) -> None:
        for package in COMMON_PACKAGES:
            package_root = self.root / "plugins" / "common" / package
            name = f"filipkrawiec-{package}"
            self.write_json(package_root / "package-metadata.json", {"name": name, "version": version})
            self.write_json(package_root / "plugin.json", {"name": name, "version": version})
            for host in (".claude-plugin", ".codex-plugin"):
                manifest: dict[str, object] = {"name": name, "version": version}
                if package == "sdlc":
                    manifest["dependencies"] = [
                        {"name": f"filipkrawiec-{dependency}", "version": version}
                        for dependency in ("core", "workflow", "authoring")
                    ]
                self.write_json(package_root / host / "plugin.json", manifest)

        for package in AGY_PACKAGES:
            manifest: dict[str, object] = {"name": f"filipkrawiec-agy-{package}", "version": version}
            if package == "sdlc":
                manifest["dependencies"] = [
                    {"name": f"filipkrawiec-{dependency}", "version": version}
                    for dependency in ("core", "workflow", "sdlc", "authoring")
                ]
            self.write_json(
                self.root / "plugins" / "agy" / package / "plugin.json",
                manifest,
            )

    def write_json(self, path: Path, value: dict[str, object]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value) + "\n", encoding="utf-8")

    def run_validator(self) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, "scripts/validate-release-version.py"],
            cwd=self.root,
            capture_output=True,
            text=True,
        )

    def test_accepts_the_initial_annotated_v8_3_0_release(self) -> None:
        result = self.run_validator()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(f"Release version validation passed: {INITIAL_RELEASE_TAG}", result.stdout)

    def test_rejects_a_manifest_that_differs_from_the_release_tag(self) -> None:
        metadata = self.root / "plugins" / "common" / "workflow" / "package-metadata.json"
        self.write_json(metadata, {"name": "filipkrawiec-workflow", "version": "0.0.0"})

        result = self.run_validator()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"does not match release tag {INITIAL_RELEASE_TAG}", result.stderr)

    def test_rejects_a_lightweight_tag(self) -> None:
        self.git("tag", "-d", INITIAL_RELEASE_TAG)
        self.git("tag", INITIAL_RELEASE_TAG)

        result = self.run_validator()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be annotated", result.stderr)

    def test_rejects_a_dependency_version_that_differs_from_the_release_tag(self) -> None:
        manifest = self.root / "plugins" / "common" / "sdlc" / ".codex-plugin" / "plugin.json"
        value = json.loads(manifest.read_text(encoding="utf-8"))
        value["dependencies"][0]["version"] = "8.2.0"
        self.write_json(manifest, value)

        result = self.run_validator()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(f"dependency does not match release tag {INITIAL_RELEASE_TAG}", result.stderr)

    def test_rejects_a_tag_that_does_not_point_to_head(self) -> None:
        (self.root / "README.md").write_text("next commit\n", encoding="utf-8")
        self.git("add", "README.md")
        self.git("commit", "-m", "fix: follow-up")

        result = self.run_validator()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("no annotated release tag points to HEAD", result.stderr)


if __name__ == "__main__":
    unittest.main()
