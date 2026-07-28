from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "link-agy-ide-plugins.sh"
EXPECTED_PLUGINS = {
    "filipkrawiec-core": ROOT / "plugins" / "common" / "core",
    "filipkrawiec-workflow": ROOT / "plugins" / "common" / "workflow",
    "filipkrawiec-orchestration": ROOT / "plugins" / "common" / "orchestration",
    "filipkrawiec-authoring": ROOT / "plugins" / "common" / "authoring",
    "filipkrawiec-agy-core": ROOT / "plugins" / "agy" / "core",
    "filipkrawiec-agy-orchestration": ROOT / "plugins" / "agy" / "orchestration",
}


class AgyIdePluginLinkTests(unittest.TestCase):
    def test_copies_all_packages_by_default_to_the_selected_ide_plugin_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            target_root = Path(temporary_directory) / "plugins"
            environment = os.environ | {"AGY_IDE_PLUGIN_DIR": str(target_root)}

            subprocess.run(
                [str(SCRIPT)],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )

            for name, source in EXPECTED_PLUGINS.items():
                target = target_root / name
                self.assertTrue(target.is_dir())
                self.assertFalse(target.is_symlink())
                self.assertTrue((target / "plugin.json").is_file())

    def test_links_all_packages_when_link_flag_provided(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            target_root = Path(temporary_directory) / "plugins"
            environment = os.environ | {"AGY_IDE_PLUGIN_DIR": str(target_root)}

            subprocess.run(
                [str(SCRIPT), "--link"],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )

            for name, source in EXPECTED_PLUGINS.items():
                target = target_root / name
                self.assertTrue(target.is_symlink())
                self.assertEqual(target.resolve(), source.resolve())

    def test_refuses_to_replace_an_existing_snapshot_without_opt_in(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            target_root = Path(temporary_directory) / "plugins"
            snapshot = target_root / "filipkrawiec-core"
            snapshot.mkdir(parents=True)
            (snapshot / "stale.txt").write_text("snapshot")
            environment = os.environ | {"AGY_IDE_PLUGIN_DIR": str(target_root)}

            result = subprocess.run(
                [str(SCRIPT)],
                cwd=ROOT,
                env=environment,
                capture_output=True,
                text=True,
            )

            self.assertNotEqual(result.returncode, 0)
            self.assertTrue((snapshot / "stale.txt").is_file())
            self.assertIn("--replace", result.stderr)

    def test_replace_preserves_a_snapshot_before_creating_the_copy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            target_root = Path(temporary_directory) / "plugins"
            snapshot = target_root / "filipkrawiec-core"
            snapshot.mkdir(parents=True)
            (snapshot / "stale.txt").write_text("snapshot")
            environment = os.environ | {"AGY_IDE_PLUGIN_DIR": str(target_root)}

            subprocess.run(
                [str(SCRIPT), "--replace"],
                cwd=ROOT,
                env=environment,
                check=True,
                capture_output=True,
                text=True,
            )

            self.assertTrue(snapshot.is_dir())
            self.assertFalse(snapshot.is_symlink())
            self.assertTrue((snapshot / "plugin.json").is_file())
            backups = list((target_root / ".skills-backups").glob("*/filipkrawiec-core/stale.txt"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(), "snapshot")


if __name__ == "__main__":
    unittest.main()

