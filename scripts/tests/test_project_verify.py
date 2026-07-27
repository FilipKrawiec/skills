"""Black-box tests for the compact hierarchical AGENTS.md project verifier."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CLI = REPOSITORY_ROOT / "scripts" / "project-verify.py"


class CompactProjectVerifyTests(unittest.TestCase):
    def run_cli(self, *args: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(CLI), *args],
            capture_output=True,
            text=True,
            cwd=cwd or REPOSITORY_ROOT,
        )

    def test_finds_root_agents_md_and_displays_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            agents_file = tmp_path / "AGENTS.md"
            agents_file.write_text(
                "---\n"
                "active_skills:\n"
                "  - ddd\n"
                "  - orchestrate-delivery\n"
                "build_tools:\n"
                "  just:\n"
                "    build_script: justfile\n"
                "    lifecycle_tasks:\n"
                "      unit: just unit\n"
                "      verify: just verify\n"
                "---\n"
                "# Monorepo Rules\n",
                encoding="utf-8",
            )
            (tmp_path / "justfile").write_text("default:\n\t@echo ok\n", encoding="utf-8")

            res = self.run_cli("--root", str(tmp_path), "status")
            self.assertEqual(res.returncode, 0)
            self.assertIn("Project Root:", res.stdout)
            self.assertIn("Active Skills: ['ddd', 'orchestrate-delivery']", res.stdout)
            self.assertIn("Detected Tool: 'just'", res.stdout)
            self.assertIn("Available Tasks: ['unit', 'verify']", res.stdout)

    def test_detects_tool_with_contains_matcher(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            agents_file = tmp_path / "AGENTS.md"
            agents_file.write_text(
                "---\n"
                "build_tools:\n"
                "  flutter:\n"
                "    build_script: pubspec.yaml\n"
                "    contains: 'sdk: flutter'\n"
                "    lifecycle_tasks:\n"
                "      verify: flutter test\n"
                "  dart:\n"
                "    build_script: pubspec.yaml\n"
                "    lifecycle_tasks:\n"
                "      verify: dart test\n"
                "---\n",
                encoding="utf-8",
            )
            (tmp_path / "pubspec.yaml").write_text("name: my_app\n\nenvironment:\n  sdk: '>=3.0.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n", encoding="utf-8")

            res = self.run_cli("--root", str(tmp_path), "status")
            self.assertEqual(res.returncode, 0)
            self.assertIn("Detected Tool: 'flutter'", res.stdout)

    def test_executes_lifecycle_task(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            agents_file = tmp_path / "AGENTS.md"
            agents_file.write_text(
                "---\n"
                "build_tools:\n"
                "  dummy:\n"
                "    build_script: build.txt\n"
                "    lifecycle_tasks:\n"
                "      unit: echo 'RUNNING UNIT TESTS'\n"
                "---\n",
                encoding="utf-8",
            )
            (tmp_path / "build.txt").write_text("dummy build script\n", encoding="utf-8")

            res = self.run_cli("--root", str(tmp_path), "unit")
            self.assertEqual(res.returncode, 0)
            self.assertIn("RUNNING UNIT TESTS", res.stdout)
            self.assertIn("PASS: Task 'unit' completed successfully.", res.stdout)

    def test_reports_error_when_task_not_found(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            agents_file = tmp_path / "AGENTS.md"
            agents_file.write_text(
                "---\n"
                "build_tools:\n"
                "  dummy:\n"
                "    build_script: build.txt\n"
                "    lifecycle_tasks:\n"
                "      unit: echo 'RUNNING UNIT'\n"
                "---\n",
                encoding="utf-8",
            )
            (tmp_path / "build.txt").write_text("dummy\n", encoding="utf-8")

            res = self.run_cli("--root", str(tmp_path), "nonexistent_task")
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("ERROR: Task 'nonexistent_task' not found", res.stderr)

    def test_hierarchical_agents_md_search(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            root_agents = tmp_path / "AGENTS.md"
            root_agents.write_text(
                "---\n"
                "build_tools:\n"
                "  root_tool:\n"
                "    build_script: root.txt\n"
                "    lifecycle_tasks:\n"
                "      verify: echo 'ROOT VERIFY'\n"
                "---\n",
                encoding="utf-8",
            )
            (tmp_path / "root.txt").write_text("root\n", encoding="utf-8")

            child_dir = tmp_path / "components" / "service_a"
            child_dir.mkdir(parents=True)

            res = self.run_cli("--root", str(child_dir), "status")
            self.assertEqual(res.returncode, 0)
            self.assertIn("Detected Tool: 'root_tool'", res.stdout)


if __name__ == "__main__":
    unittest.main()
