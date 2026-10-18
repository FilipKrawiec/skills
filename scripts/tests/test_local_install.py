"""Exercise explicit local links without touching host installations."""

import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class LocalInstallTests(unittest.TestCase):
    def run_link(self, destination, **environment):
        return subprocess.run(
            ["just", "link-agy"], cwd=ROOT,
            env={**os.environ, "AGY_IDE_PLUGIN_DIR": str(destination), **environment},
            capture_output=True, text=True,
        )

    def test_links_packages_and_replaces_stale_links_in_path_with_spaces(self):
        with tempfile.TemporaryDirectory(prefix="local install ") as temporary:
            destination = Path(temporary) / "plugin links"
            destination.mkdir()
            stale = destination / "filipkrawiec-core"
            stale.symlink_to(destination / "missing")
            unrelated = destination / "unrelated"
            unrelated.write_text("keep")
            for _ in range(2):
                result = self.run_link(destination)
                self.assertEqual(result.returncode, 0, result.stderr)
                for package in (ROOT / "plugins/common").iterdir():
                    if package.is_dir():
                        link = destination / f"filipkrawiec-{package.name}"
                        self.assertTrue(link.is_symlink())
                        self.assertEqual(link.resolve(), package.resolve())
                self.assertEqual(unrelated.read_text(), "keep")

    def test_creates_destination_without_importing_devcontainer_plugins(self):
        with tempfile.TemporaryDirectory(prefix="local install ") as temporary:
            root = Path(temporary)
            destination = root / "new plugin links"
            devcontainer = root / "devcontainer"
            (devcontainer / "plugins" / "unrequested").mkdir(parents=True)
            result = self.run_link(destination, DEVCONTAINER_ROOT=str(devcontainer))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                {entry.name for entry in destination.iterdir()},
                {f"filipkrawiec-{package.name}"
                 for package in (ROOT / "plugins/common").iterdir() if package.is_dir()},
            )

    def test_refuses_real_directory_or_file_without_removing_contents(self):
        for kind in ("directory", "file"):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory() as temporary:
                destination = Path(temporary)
                conflict = destination / "filipkrawiec-core"
                if kind == "directory":
                    conflict.mkdir()
                    preserved = conflict / "keep"
                else:
                    preserved = conflict
                preserved.write_text("valuable")
                result = self.run_link(destination)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(conflict.is_symlink())
                self.assertEqual(preserved.read_text(), "valuable")
