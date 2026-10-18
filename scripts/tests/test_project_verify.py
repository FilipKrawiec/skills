"""Black-box tests for the compact hierarchical AGENTS.md project verifier."""

from __future__ import annotations

import subprocess
import importlib
import sys
import tempfile
import unittest
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CLI = REPOSITORY_ROOT / "scripts" / "project-verify.py"
project_verify = importlib.import_module('scripts.project-verify')


class CompactProjectVerifyTests(unittest.TestCase):
    def test_fallback_parser_preserves_lists_nested_tasks_and_quoted_colons(self) -> None:
        config = project_verify.parse_yaml_fallback(
            "# ignored comment\n\n"
            "- orphan\n"
            "title: 'Project: checks'\n"
            "active_skills:\n  - 'ddd'\n  - \"tdd\"\n"
            "tool_list:\n  - python\n"
            "build_tools:\n"
            "  'python':\n"
            "    build_script: \"check.py\"\n"
            "    lifecycle_tasks:\n"
            "      verify: 'echo result: ok'\n"
            "  fallback:\n"
            "    lifecycle_tasks:\n"
            "      unit: echo unit\n"
            "ignored line\n"
        )
        self.assertEqual(config, {
            "title": "Project: checks",
            "active_skills": ["ddd", "tdd"],
            "tool_list": ["python"],
            "build_tools": {
                "python": {"build_script": "check.py", "lifecycle_tasks": {"verify": "echo result: ok"}},
                "fallback": {"lifecycle_tasks": {"unit": "echo unit"}},
            },
        })

    def test_frontmatter_requires_opening_and_closing_delimiters(self) -> None:
        for content in ("", "# Rules\n", "active_skills: []\n---\n", "---\nactive_skills: []\n"):
            with self.subTest(content=content):
                self.assertEqual(project_verify.parse_frontmatter_text(content), {})

    def test_invalid_child_agents_does_not_hide_valid_parent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "AGENTS.md").write_text("---\nactive_skills:\n  - ddd\n---\n", encoding="utf-8")
            child = root / "child"
            child.mkdir()
            (child / "AGENTS.md").write_text("---\nunterminated: rules\n", encoding="utf-8")
            self.assertEqual(project_verify.find_agents_md(child), (root.resolve(), {"active_skills": ["ddd"]}))

    def test_missing_agents_reports_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            res = self.run_cli("--root", tmp_dir, "status")
            self.assertEqual(res.returncode, 1)
            self.assertIn("Could not find valid AGENTS.md with frontmatter in hierarchy", res.stderr)
            self.assertNotIn("Project Root:", res.stdout)

    def test_build_tool_selection_skips_unusable_candidates_and_keeps_first_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "build.txt").write_text("plain project\n", encoding="utf-8")
            (root / "directory").mkdir()
            first = {"lifecycle_tasks": {"verify": "echo first"}}
            matched = {"build_script": "build.txt", "contains": "plain"}
            tools = {
                "invalid": "not a mapping",
                "first": first,
                "second": {"lifecycle_tasks": {"verify": "echo second"}},
                "missing": {"build_script": "absent"},
                "mismatch": {"build_script": "build.txt", "contains": "flutter"},
                "unreadable": {"build_script": "directory", "contains": "plain"},
            }
            self.assertEqual(project_verify.detect_build_tool(root, {"build_tools": tools}), ("first", first))
            tools["matched"] = matched
            self.assertEqual(project_verify.detect_build_tool(root, {"build_tools": tools}), ("matched", matched))
            self.assertEqual(project_verify.detect_build_tool(root, {}), ("default", {}))
            self.assertEqual(project_verify.detect_build_tool(root, {"build_tools": {"missing": tools["missing"]}}), ("default", {}))

    def test_task_failure_propagates_exit_code_and_runs_at_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            root = Path(tmp_dir)
            (root / "AGENTS.md").write_text(
                "---\nbuild_tools:\n  fallback:\n    lifecycle_tasks:\n"
                "      verify: 'printf ran > result.txt; exit 23'\n---\n", encoding="utf-8"
            )
            child = root / "child"
            child.mkdir()
            res = self.run_cli("--root", str(child), "verify", cwd=child)
            self.assertEqual(res.returncode, 23)
            self.assertIn("Task 'verify' failed with exit code 23", res.stderr)
            self.assertNotIn("PASS:", res.stdout)
            self.assertEqual((root / "result.txt").read_text(encoding="utf-8"), "ran")
            self.assertFalse((child / "result.txt").exists())

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
                "  - deliver\n"
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
            self.assertIn("Active Skills: ['ddd', 'deliver']", res.stdout)
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
                "      unit: echo RUNNING_UNIT_TESTS\n"
                "---\n",
                encoding="utf-8",
            )
            (tmp_path / "build.txt").write_text("dummy build script\n", encoding="utf-8")

            res = self.run_cli("--root", str(tmp_path), "unit")
            self.assertEqual(res.returncode, 0, f"stderr: {res.stderr}, stdout: {res.stdout}")
            self.assertIn("RUNNING_UNIT_TESTS", res.stdout)
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

    def test_reports_error_when_task_command_is_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            agents_file = tmp_path / "AGENTS.md"
            agents_file.write_text(
                "---\n"
                "build_tools:\n"
                "  dummy:\n"
                "    build_script: build.txt\n"
                "    lifecycle_tasks:\n"
                "      empty_task: '   '\n"
                "---\n",
                encoding="utf-8",
            )
            (tmp_path / "build.txt").write_text("dummy\n", encoding="utf-8")

            res = self.run_cli("--root", str(tmp_path), "empty_task")
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("ERROR: Task 'empty_task' not found or empty", res.stderr)

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

    def test_strict_git_hygiene_blocks_dirty_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            # Initialize a git repo with a dirty worktree
            subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp_path, capture_output=True, check=True)
            subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=tmp_path, capture_output=True, check=True)

            agents_file = tmp_path / "AGENTS.md"
            agents_file.write_text(
                "---\n"
                "build_tools:\n"
                "  dummy:\n"
                "    build_script: build.txt\n"
                "    lifecycle_tasks:\n"
                "      verify: echo 'RUNNING VERIFY'\n"
                "---\n",
                encoding="utf-8",
            )
            (tmp_path / "build.txt").write_text("dummy\n", encoding="utf-8")
            subprocess.run(["git", "add", "."], cwd=tmp_path, capture_output=True, check=True)
            subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=tmp_path, capture_output=True, check=True)

            # Non-strict verify passes with warning
            res_warn = self.run_cli("--root", str(tmp_path), "verify")
            self.assertEqual(res_warn.returncode, 0)

            # Make worktree dirty
            (tmp_path / "dirty.txt").write_text("uncommitted\n", encoding="utf-8")

            # Strict verify fails
            res_strict = self.run_cli("--root", str(tmp_path), "--strict-git", "verify")
            self.assertEqual(res_strict.returncode, 1)
            self.assertIn("ERROR: Git worktree has uncommitted changes", res_strict.stderr)


if __name__ == "__main__":
    unittest.main()
