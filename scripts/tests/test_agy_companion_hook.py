#!/usr/bin/env python3
"""Unit tests for Antigravity SDLC companion plugin check hook."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOOK_SCRIPT_PATH = ROOT / "plugins" / "agy" / "sdlc" / "scripts" / "check_companion_plugins.py"

spec = importlib.util.spec_from_file_location("check_companion_plugins", HOOK_SCRIPT_PATH)
hook_module = importlib.util.module_from_spec(spec)
sys.modules["check_companion_plugins"] = hook_module
spec.loader.exec_module(hook_module)


class TestAgyCompanionHook(unittest.TestCase):
    def test_build_hook_payload_empty_when_no_missing(self) -> None:
        payload = hook_module.build_hook_payload([])
        self.assertEqual(payload, {})

    def test_build_hook_payload_contains_ephemeral_notice(self) -> None:
        missing = ["filipkrawiec-authoring", "filipkrawiec-core"]
        payload = hook_module.build_hook_payload(missing)
        self.assertIn("injectSteps", payload)
        self.assertEqual(len(payload["injectSteps"]), 1)
        msg = payload["injectSteps"][0]["ephemeralMessage"]
        self.assertIn("SDLC notice: missing companion plugins", msg)
        self.assertIn("filipkrawiec-authoring, filipkrawiec-core", msg)

    def test_get_missing_companion_plugins_all_installed_in_cli(self) -> None:
        required = {"pkg-a", "pkg-b"}
        installed_cli = {"pkg-a", "pkg-b", "pkg-c"}
        with tempfile.TemporaryDirectory() as temp_dir:
            missing = hook_module.get_missing_companion_plugins(
                required=required,
                installed_cli=installed_cli,
                plugin_dir=Path(temp_dir),
            )
            self.assertEqual(missing, [])

    def test_get_missing_companion_plugins_installed_in_directory(self) -> None:
        required = {"pkg-a", "pkg-b"}
        installed_cli = set()
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            (temp_path / "pkg-a").mkdir()
            (temp_path / "pkg-b").mkdir()
            missing = hook_module.get_missing_companion_plugins(
                required=required,
                installed_cli=installed_cli,
                plugin_dir=temp_path,
            )
            self.assertEqual(missing, [])

    def test_get_missing_companion_plugins_partial_presence(self) -> None:
        required = {"pkg-a", "pkg-b", "pkg-c"}
        installed_cli = {"pkg-a"}
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            (temp_path / "pkg-b").mkdir()
            missing = hook_module.get_missing_companion_plugins(
                required=required,
                installed_cli=installed_cli,
                plugin_dir=temp_path,
            )
            self.assertEqual(missing, ["pkg-c"])

    def test_hook_script_cli_execution(self) -> None:
        result = subprocess.run(
            [sys.executable, str(HOOK_SCRIPT_PATH)],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0)
        output = json.loads(result.stdout)
        self.assertIsInstance(output, dict)


if __name__ == "__main__":
    unittest.main()
