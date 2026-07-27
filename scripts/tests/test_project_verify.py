"""Black-box tests for the provider-neutral project verification CLI."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CLI = REPOSITORY_ROOT / "scripts" / "project-verify.py"
TYPESCRIPT_EXAMPLE = REPOSITORY_ROOT / "examples" / "typescript-verification-loop"
TASK_PACKET_EXAMPLE = REPOSITORY_ROOT / "examples" / "task-packet-verification-loop"


class ProjectVerifyTests(unittest.TestCase):
    def run_cli(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(CLI), *arguments],
            capture_output=True,
            text=True,
        )

    def write_manifest(self, root: Path, task: dict[str, object]) -> None:
        (root / "docs" / "adr").mkdir(parents=True)
        (root / "docs" / "adr" / "0001-example.md").write_text("# Example\n", encoding="utf-8")
        (root / "docs" / "plans").mkdir(parents=True)
        (root / "docs" / "plans" / "example.md").write_text("# Example plan\n", encoding="utf-8")
        (root / "README.md").write_text("# Example\n", encoding="utf-8")
        task.setdefault("specification", "docs/plans/example.md")
        (root / ".project-verification.json").write_text(
            json.dumps({"version": 1, "tasks": [task]}) + "\n", encoding="utf-8"
        )

    def task_packet(self, task_id: str, workspace: dict[str, str]) -> dict[str, object]:
        return {
            "id": task_id,
            "state": "done",
            "adr": "docs/adr/0001-example.md",
            "docs": ["README.md"],
            "evidence": ["python3 scripts/project-verify.py verify"],
            "workspace": workspace,
            "affected_paths": [f"src/{task_id}"],
            "dependencies": [],
            "parallel": False,
            "execution_outcome": "completed",
        }

    def write_v2_manifest(self, root: Path, tasks: list[dict[str, object]]) -> None:
        (root / "docs" / "adr").mkdir(parents=True, exist_ok=True)
        (root / "docs" / "adr" / "0001-example.md").write_text("# Example\n", encoding="utf-8")
        (root / "docs" / "plans").mkdir(parents=True, exist_ok=True)
        (root / "docs" / "plans" / "example.md").write_text("# Example plan\n", encoding="utf-8")
        (root / "README.md").write_text("# Example\n", encoding="utf-8")
        for task in tasks:
            task.setdefault("specification", "docs/plans/example.md")
        (root / ".project-verification.json").write_text(
            json.dumps({"version": 2, "tasks": tasks}) + "\n", encoding="utf-8"
        )

    def create_linked_worktree(self, root: Path) -> tuple[Path, str]:
        repository = root / "repository"
        worktree = root / "task-worktree"
        repository.mkdir()
        subprocess.run(["git", "init"], cwd=repository, check=True, capture_output=True, text=True)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repository, check=True)
        subprocess.run(["git", "config", "user.name", "Test User"], cwd=repository, check=True)
        (repository / "seed.txt").write_text("seed\n", encoding="utf-8")
        subprocess.run(["git", "add", "seed.txt"], cwd=repository, check=True)
        subprocess.run(["git", "commit", "-m", "test seed"], cwd=repository, check=True, capture_output=True)
        base_revision = subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=repository, check=True, capture_output=True, text=True
        ).stdout.strip()
        subprocess.run(
            ["git", "worktree", "add", "-b", "task-packet-test", str(worktree), base_revision],
            cwd=repository,
            check=True,
            capture_output=True,
            text=True,
        )
        return worktree, base_revision

    def commit_all(self, root: Path, message: str) -> str:
        subprocess.run(["git", "add", "-A"], cwd=root, check=True, capture_output=True, text=True)
        subprocess.run(["git", "commit", "-m", message], cwd=root, check=True, capture_output=True, text=True)
        return subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=root, check=True, capture_output=True, text=True
        ).stdout.strip()

    def prepare_clean_linked_packet(
        self, root: Path, task_id: str = "linked-worktree-task"
    ) -> tuple[Path, Path, str, dict[str, object]]:
        worktree, base_revision = self.create_linked_worktree(root)
        task = self.task_packet(
            task_id,
            {
                "kind": "git-worktree",
                "repository": "repository",
                "worktree": ".",
                "base_revision": base_revision,
            },
        )
        task["affected_paths"] = [".project-verification.json", "README.md", "docs"]
        self.write_v2_manifest(worktree, [task])
        self.commit_all(worktree, "add task packet")
        return worktree, root / "repository", base_revision, task

    def central_scaffold(self, root: Path) -> None:
        for directory in (
            "doctrines",
            "glossary",
            "preferences",
            "technology-profiles",
            "templates",
            "examples",
            "config-artifacts",
        ):
            (root / directory).mkdir(parents=True, exist_ok=True)


    def test_help_is_discoverable(self) -> None:
        result = self.run_cli("--help")

        self.assertEqual(result.returncode, 0)
        self.assertIn("check", result.stdout)
        self.assertIn("project-init", result.stdout)
        self.assertNotIn("profile-add", result.stdout)
        self.assertNotIn("content-edit", result.stdout)
        self.assertEqual(result.stderr, "")

    def test_validates_the_local_orchestrator_routing_configuration(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config = Path(temporary_directory) / "orchestrator.yaml"
            config.write_text(
                "version: 1\ndefault_executor: antigravity\ntracker: local-tracker\nreview_provider: local-review\nexecutor_failure: return-for-review\n",
                encoding="utf-8",
            )

            result = self.run_cli("orchestrator-config-check", "--config", str(config))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            result.stdout,
            "PASS default_executor=antigravity tracker=local-tracker review_provider=local-review failure=return-for-review\n",
        )
        self.assertEqual(result.stderr, "")

    def test_rejects_an_executor_config_that_allows_automatic_retry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config = Path(temporary_directory) / "orchestrator.yaml"
            config.write_text(
                "version: 1\ndefault_executor: antigravity\ntracker: local-tracker\nreview_provider: local-review\nexecutor_failure: retry-another\n",
                encoding="utf-8",
            )

            result = self.run_cli("orchestrator-config-check", "--config", str(config))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(
            result.stderr,
            "ERROR orchestrator.failure path=" + str(config) + " remedy=set executor_failure: return-for-review\n",
        )

    def test_requires_provider_neutral_tracker_and_review_provider_identifiers(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config = Path(temporary_directory) / "orchestrator.yaml"
            config.write_text(
                "version: 1\ndefault_executor: antigravity\nexecutor_failure: return-for-review\n",
                encoding="utf-8",
            )

            result = self.run_cli("orchestrator-config-check", "--config", str(config))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR orchestrator.config", result.stderr)

    def test_accepts_a_completed_task_with_declared_links_and_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.write_manifest(
                root,
                {
                    "id": "verification-foundation",
                    "state": "done",
                    "adr": "docs/adr/0001-example.md",
                    "docs": ["README.md"],
                    "evidence": ["python3 -m unittest"],
                },
            )

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS tasks=1\n")
        self.assertEqual(result.stderr, "")

    def test_reports_the_missing_condition_and_remedy_for_completed_task_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.write_manifest(
                root,
                {
                    "id": "verification-foundation",
                    "state": "done",
                    "adr": "docs/adr/0001-example.md",
                    "docs": ["README.md"],
                    "evidence": [],
                },
            )

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(
            result.stderr,
            "ERROR task.evidence_missing task=verification-foundation remedy=record at least one verification command or artifact\n",
        )

    def test_requires_a_specification_or_plan_link_for_each_task(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.write_manifest(
                root,
                {
                    "id": "verification-foundation",
                    "state": "planned",
                    "specification": "",
                    "docs": [],
                    "evidence": [],
                },
            )

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR task.specification task=verification-foundation remedy=provide an existing relative specification or plan path inside the project root\n",
        )

    def test_rejects_a_missing_specification_link(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = {"id": "missing-specification", "state": "planned", "specification": "docs/plans/missing.md"}
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.specification", result.stderr)

    def test_rejects_a_specification_link_outside_the_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "project"
            root.mkdir()
            task = {"id": "escaping-specification", "state": "planned", "specification": "../outside.md"}
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.specification", result.stderr)

    def test_rejects_a_missing_documentation_link(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = {
                "id": "missing-doc",
                "state": "planned",
                "specification": "docs/plans/example.md",
                "docs": ["docs/missing.md"],
            }
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.docs", result.stderr)

    def test_rejects_a_documentation_link_outside_the_project_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "project"
            root.mkdir()
            task = {
                "id": "escaping-doc",
                "state": "planned",
                "specification": "docs/plans/example.md",
                "docs": ["../outside.md"],
            }
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.docs", result.stderr)

    def test_accepts_a_valid_non_adr_specification_link(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = {"id": "ordinary-change", "state": "planned", "specification": "docs/plans/example.md"}
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_accepts_an_optional_architectural_adr_link(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = {
                "id": "architectural-change",
                "state": "planned",
                "specification": "docs/plans/example.md",
                "adr": "docs/adr/0001-example.md",
            }
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_requires_a_delivery_record_when_a_review_request_is_published(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = {
                "id": "published-review",
                "state": "done",
                "specification": "docs/plans/example.md",
                "evidence": ["python3 -m unittest"],
                "review_request": {"published": True, "provider": "local-review", "reference": "review-42"},
            }
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.delivery_record", result.stderr)

    def test_does_not_require_traceability_for_an_unpublished_review_request(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = {
                "id": "local-review",
                "state": "planned",
                "specification": "docs/plans/example.md",
                "review_request": {"published": False},
            }
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_accepts_traceability_evidence_for_a_published_review_request(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = {
                "id": "published-review",
                "state": "done",
                "specification": "docs/plans/example.md",
                "evidence": ["python3 -m unittest"],
                "delivery_record": {"tracker": "local-tracker", "reference": "delivery-42"},
                "review_request": {"published": True, "provider": "local-review", "reference": "review-42"},
            }
            self.write_manifest(root, task)

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_accepts_the_repository_task_packet_example(self) -> None:
        result = self.run_cli("check", "--root", str(TASK_PACKET_EXAMPLE))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS tasks=1\n")

    def test_accepts_clean_committed_changes_within_a_git_task_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            worktree, _, _, _ = self.prepare_clean_linked_packet(Path(temporary_directory))

            result = self.run_cli("check", "--root", str(worktree))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS tasks=1\n")
        self.assertEqual(result.stderr, "")

    def test_rejects_a_git_worktree_base_that_is_not_an_ancestor_of_head(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            worktree, repository, _, task = self.prepare_clean_linked_packet(root)
            (repository / "future.txt").write_text("future\n", encoding="utf-8")
            future_revision = self.commit_all(repository, "future base")
            task["workspace"]["base_revision"] = future_revision
            self.write_v2_manifest(worktree, [task])
            self.commit_all(worktree, "declare future base")

            result = self.run_cli("check", "--root", str(worktree))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.base_not_ancestor", result.stderr)

    def test_rejects_an_unrelated_git_worktree_base(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            worktree, repository, _, task = self.prepare_clean_linked_packet(root)
            unrelated_revision = subprocess.run(
                [
                    "git",
                    "commit-tree",
                    "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
                    "-m",
                    "unrelated",
                ],
                cwd=repository,
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
            task["workspace"]["base_revision"] = unrelated_revision
            self.write_v2_manifest(worktree, [task])
            self.commit_all(worktree, "declare unrelated base")

            result = self.run_cli("check", "--root", str(worktree))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.base_not_ancestor", result.stderr)

    def test_rejects_a_dirty_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            worktree, _, _, _ = self.prepare_clean_linked_packet(Path(temporary_directory))
            (worktree / "untracked.txt").write_text("untracked\n", encoding="utf-8")

            result = self.run_cli("check", "--root", str(worktree))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.worktree_dirty", result.stderr)

    def test_rejects_committed_changes_outside_a_git_task_boundary(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            worktree, _, _, _ = self.prepare_clean_linked_packet(Path(temporary_directory))
            (worktree / "outside.txt").write_text("outside\n", encoding="utf-8")
            self.commit_all(worktree, "change outside boundary")

            result = self.run_cli("check", "--root", str(worktree))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.changed_path", result.stderr)

    def test_requires_complete_workspace_provenance_for_a_task_packet(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = self.task_packet("copy-task", {"kind": "isolated-copy"})
            self.write_v2_manifest(root, [task])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR task.workspace task=copy-task remedy=declare kind, repository, worktree, and base_revision\n",
        )

    def test_rejects_git_worktree_metadata_when_root_is_not_linked(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = self.task_packet(
                "git-task",
                {
                    "kind": "git-worktree",
                    "repository": "repository",
                    "worktree": ".",
                    "base_revision": "deadbeef",
                },
            )
            self.write_v2_manifest(root, [task])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR task.linked_worktree task=git-task remedy=run the task in a linked Git worktree\n",
        )

    def test_rejects_overlapping_declared_parallel_task_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            first = self.task_packet(
                "first-task",
                {
                    "kind": "isolated-copy",
                    "repository": "non-git-example",
                    "worktree": "copy-one",
                    "base_revision": "source-snapshot",
                },
            )
            first["affected_paths"] = ["src/payments"]
            first["parallel"] = True
            second = self.task_packet(
                "second-task",
                {
                    "kind": "isolated-copy",
                    "repository": "non-git-example",
                    "worktree": "copy-two",
                    "base_revision": "source-snapshot",
                },
            )
            second["affected_paths"] = ["src/payments/handler.py"]
            second["parallel"] = True
            self.write_v2_manifest(root, [first, second])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR task.affected_paths_overlap task=second-task remedy=serialize overlapping tasks or give them non-overlapping affected_paths\n",
        )

    def test_rejects_a_direct_dependency_declared_parallel(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            first = self.task_packet(
                "first-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "one", "base_revision": "one"},
            )
            second = self.task_packet(
                "second-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "two", "base_revision": "two"},
            )
            first["parallel"] = True
            first["dependencies"] = ["second-task"]
            self.write_v2_manifest(root, [first, second])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.parallel_dependency task=first-task", result.stderr)

    def test_rejects_a_transitive_dependency_declared_parallel(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            first = self.task_packet(
                "first-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "one", "base_revision": "one"},
            )
            second = self.task_packet(
                "second-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "two", "base_revision": "two"},
            )
            third = self.task_packet(
                "third-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "three", "base_revision": "three"},
            )
            first["parallel"] = True
            first["dependencies"] = ["second-task"]
            second["dependencies"] = ["third-task"]
            self.write_v2_manifest(root, [first, second, third])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.parallel_dependency task=first-task", result.stderr)

    def test_rejects_a_dependency_cycle(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            first = self.task_packet(
                "first-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "one", "base_revision": "one"},
            )
            second = self.task_packet(
                "second-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "two", "base_revision": "two"},
            )
            third = self.task_packet(
                "third-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "three", "base_revision": "three"},
            )
            first["dependencies"] = ["second-task"]
            second["dependencies"] = ["third-task"]
            third["dependencies"] = ["first-task"]
            self.write_v2_manifest(root, [first, second, third])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR task.dependencies", result.stderr)

    def test_accepts_independent_parallel_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            first = self.task_packet(
                "first-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "one", "base_revision": "one"},
            )
            second = self.task_packet(
                "second-task",
                {"kind": "isolated-copy", "repository": "copy", "worktree": "two", "base_revision": "two"},
            )
            first["parallel"] = True
            second["parallel"] = True
            first["affected_paths"] = ["src/first"]
            second["affected_paths"] = ["src/second"]
            self.write_v2_manifest(root, [first, second])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_accepts_the_documented_non_git_isolated_copy_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            task = self.task_packet(
                "copy-task",
                {
                    "kind": "isolated-copy",
                    "repository": "non-git-example",
                    "worktree": "copy-one",
                    "base_revision": "source-snapshot-2026-07-27",
                },
            )
            self.write_v2_manifest(root, [task])

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS tasks=1\n")

    def test_creates_a_concise_index_for_valid_knowledge_entries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.central_scaffold(root)
            entry = root / "doctrines" / "no-any.md"
            entry.write_text(
                "---\nid: no-any\nkind: doctrine\n---\n# No any\n",
                encoding="utf-8",
            )

            result = self.run_cli("knowledge-index", "--root", str(root))

            index = json.loads((root / ".knowledge-index.json").read_text(encoding="utf-8"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS entries=1 index=.knowledge-index.json\n")
        self.assertEqual(
            index,
            {
                "version": 1,
                "entries": [
                    {
                        "id": "no-any",
                        "kind": "doctrine",
                        "path": "doctrines/no-any.md",
                        "disabled": False,
                    }
                ],
            },
        )

    def test_rejects_a_stale_checked_in_knowledge_index_without_rewriting_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.central_scaffold(root)
            first = root / "doctrines" / "first.md"
            first.write_text("---\nid: first\nkind: doctrine\n---\n# First\n", encoding="utf-8")
            generated = self.run_cli("knowledge-index", "--root", str(root))
            before = (root / ".knowledge-index.json").read_text(encoding="utf-8")
            second = root / "doctrines" / "second.md"
            second.write_text("---\nid: second\nkind: doctrine\n---\n# Second\n", encoding="utf-8")

            result = self.run_cli("knowledge-index", "--check", "--root", str(root))
            after = (root / ".knowledge-index.json").read_text(encoding="utf-8")

        self.assertEqual(generated.returncode, 0, generated.stderr)
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR knowledge.index_stale", result.stderr)
        self.assertEqual(after, before)

    def test_rejects_a_stale_project_knowledge_index_without_rewriting_it(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            first = root / "technology-profiles" / "typescript.md"
            first.parent.mkdir()
            first.write_text(
                "---\nid: typescript\nkind: technology-profile\n---\n# TypeScript\n",
                encoding="utf-8",
            )
            generated = self.run_cli("knowledge-index", "--project", "--root", str(root))
            before = (root / ".knowledge-index.json").read_text(encoding="utf-8")
            second = root / "glossary" / "project-term.md"
            second.parent.mkdir()
            second.write_text(
                "---\nid: project-term\nkind: glossary\n---\n# Project Term\n",
                encoding="utf-8",
            )

            result = self.run_cli("knowledge-index", "--project", "--check", "--root", str(root))
            after = (root / ".knowledge-index.json").read_text(encoding="utf-8")

        self.assertEqual(generated.returncode, 0, generated.stderr)
        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR knowledge.index_stale", result.stderr)
        self.assertEqual(after, before)

    def test_accepts_a_fresh_sparse_project_knowledge_index(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            entry = root / "technology-profiles" / "typescript.md"
            entry.parent.mkdir()
            entry.write_text(
                "---\nid: typescript\nkind: technology-profile\n---\n# TypeScript\n",
                encoding="utf-8",
            )
            generated = self.run_cli("knowledge-index", "--project", "--root", str(root))

            result = self.run_cli("knowledge-index", "--project", "--check", "--root", str(root))

        self.assertEqual(generated.returncode, 0, generated.stderr)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS entries=1 index=.knowledge-index.json fresh\n")

    def test_accepts_the_complete_central_knowledge_scaffold_without_entries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            for directory in (
                "doctrines",
                "glossary",
                "preferences",
                "technology-profiles",
                "templates",
                "examples",
                "config-artifacts",
            ):
                marker = root / directory / ".gitkeep"
                marker.parent.mkdir()
                marker.touch()

            result = self.run_cli("knowledge-index", "--root", str(root))

            index = json.loads((root / ".knowledge-index.json").read_text(encoding="utf-8"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS entries=0 index=.knowledge-index.json\n")
        self.assertEqual(index, {"version": 1, "entries": []})

    def test_includes_explicit_entry_disablement_in_the_index(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.central_scaffold(root)
            entry = root / "preferences" / "use-prettier.md"
            entry.write_text(
                "---\nid: use-prettier\nkind: preference\ndisabled: true\n---\n# Use Prettier\n",
                encoding="utf-8",
            )

            result = self.run_cli("knowledge-index", "--root", str(root))

            index = json.loads((root / ".knowledge-index.json").read_text(encoding="utf-8"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(index["entries"][0]["disabled"])

    def test_indexes_typescript_profile_and_artifact_entries(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.central_scaffold(root)
            entries = {
                "technology-profiles/typescript.md": "technology-profile",
                "config-artifacts/typescript-eslint.md": "config-artifact",
                "examples/typescript-strict.md": "example",
            }
            for relative_path, kind in entries.items():
                entry = root / relative_path
                entry.write_text(
                    f"---\nid: {entry.stem}\nkind: {kind}\n---\n# {entry.stem}\n",
                    encoding="utf-8",
                )

            result = self.run_cli("knowledge-index", "--root", str(root))

            index = json.loads((root / ".knowledge-index.json").read_text(encoding="utf-8"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            {entry["path"] for entry in index["entries"]},
            set(entries),
        )

    def test_rejects_an_entry_whose_metadata_does_not_match_its_path(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.central_scaffold(root)
            entry = root / "doctrines" / "no-any.md"
            entry.write_text(
                "---\nid: no-any\nkind: preference\n---\n# No any\n",
                encoding="utf-8",
            )

            result = self.run_cli("knowledge-index", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR knowledge.kind path=doctrines/no-any.md remedy=make kind match the directory's allowed kind\n",
        )

    def test_rejects_a_directory_outside_the_allowed_knowledge_structure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "notes").mkdir()

            result = self.run_cli("knowledge-index", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR knowledge.structure path=notes remedy=use only allowed kind directories and the generated index\n",
        )

    def test_rejects_an_incomplete_central_knowledge_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "doctrines").mkdir()

            result = self.run_cli("knowledge-index", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR knowledge.directory path=glossary", result.stderr)

    def test_accepts_a_sparse_project_knowledge_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            entry = root / "technology-profiles" / "typescript.md"
            entry.parent.mkdir()
            entry.write_text(
                "---\nid: typescript\nkind: technology-profile\n---\n# TypeScript\n",
                encoding="utf-8",
            )

            result = self.run_cli("knowledge-index", "--project", "--root", str(root))

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_initializes_minimal_project_knowledge_scaffolding(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)

            result = self.run_cli("project-init", "--root", str(root))

            report = json.loads(result.stdout)
            glossary = root / ".project-knowledge" / "glossary" / "project-glossary.md"
            profiles = root / ".project-knowledge" / "project-profiles.yaml"
            self.assertTrue((root / "docs" / "adr").is_dir())
            self.assertTrue(glossary.is_file())
            self.assertEqual(profiles.read_text(encoding="utf-8"), "version: 1\nprofiles: []\n")
            self.assertIn("id: project-glossary", glossary.read_text(encoding="utf-8"))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stderr, "")
        self.assertEqual(
            report,
            {
                "created": [
                    ".project-knowledge/",
                    ".project-knowledge/glossary/",
                    ".project-knowledge/glossary/project-glossary.md",
                    ".project-knowledge/project-profiles.yaml",
                    "docs/",
                    "docs/adr/",
                ],
                "preserved": [],
                "profiles": [],
            },
        )

    def test_project_initialization_preserves_existing_content(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            glossary = root / ".project-knowledge" / "glossary" / "project-glossary.md"
            profiles = root / ".project-knowledge" / "project-profiles.yaml"
            glossary.parent.mkdir(parents=True)
            glossary.write_text("existing glossary\n", encoding="utf-8")
            profiles.write_text("version: 1\nprofiles:\n  - typescript\n", encoding="utf-8")

            result = self.run_cli("project-init", "--root", str(root))

            report = json.loads(result.stdout)
            self.assertEqual(glossary.read_text(encoding="utf-8"), "existing glossary\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(".project-knowledge/glossary/project-glossary.md", report["preserved"])
        self.assertIn(".project-knowledge/project-profiles.yaml", report["preserved"])
        self.assertEqual(report["profiles"], ["typescript"])

    def test_project_initialization_rejects_a_non_deterministic_profile_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            profiles = root / ".project-knowledge" / "project-profiles.yaml"
            profiles.parent.mkdir(parents=True)
            profiles.write_text("version: 1\nprofiles:\n- typescript\n", encoding="utf-8")

            result = self.run_cli("project-init", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertIn("ERROR project.profiles", result.stderr)
        self.assertIn("use two-space kebab-case profile entries", result.stderr)

    def test_checks_an_edited_project_knowledge_scaffold_and_profile_declaration(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            entry = root / ".project-knowledge" / "technology-profiles" / "typescript.md"
            entry.parent.mkdir(parents=True)
            entry.write_text(
                "---\nid: typescript\nkind: technology-profile\n---\n# TypeScript\n",
                encoding="utf-8",
            )
            (root / ".project-knowledge" / "project-profiles.yaml").write_text(
                "version: 1\nprofiles:\n  - typescript\n", encoding="utf-8"
            )
            (root / "docs" / "adr").mkdir(parents=True)

            result = self.run_cli("project-knowledge-check", "--root", str(root))

            index = json.loads(
                (root / ".project-knowledge" / ".knowledge-index.json").read_text(encoding="utf-8")
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS profiles=typescript entries=1\n")
        self.assertEqual(result.stderr, "")
        self.assertEqual(index["entries"][0]["id"], "typescript")

    def test_runs_a_selected_profile_declared_verification_check(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "project"
            knowledge = Path(temporary_directory) / "knowledge"
            root.mkdir()
            self.central_scaffold(knowledge)
            (root / ".project-knowledge").mkdir()
            (root / ".project-knowledge" / "project-profiles.yaml").write_text(
                "version: 1\nprofiles:\n  - typescript\n", encoding="utf-8"
            )
            (root / "package.json").write_text(
                json.dumps({"scripts": {"verify": "node -e 'process.exit(0)'"}}),
                encoding="utf-8",
            )
            profile = knowledge / "technology-profiles" / "typescript.md"
            profile.parent.mkdir(parents=True, exist_ok=True)
            profile.write_text(
                "---\nid: typescript\nkind: technology-profile\ncheck: npm run verify\n---\n# TypeScript\n",
                encoding="utf-8",
            )

            result = self.run_cli(
                "verify", "--root", str(root), "--knowledge-root", str(knowledge)
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS profiles=typescript checks=1\n")
        self.assertEqual(result.stderr, "")

    def test_normalizes_a_failed_declared_profile_check_with_a_remedy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "project"
            knowledge = Path(temporary_directory) / "knowledge"
            root.mkdir()
            self.central_scaffold(knowledge)
            (root / ".project-knowledge").mkdir()
            (root / ".project-knowledge" / "project-profiles.yaml").write_text(
                "version: 1\nprofiles:\n  - typescript\n", encoding="utf-8"
            )
            (root / "package.json").write_text(
                json.dumps({"scripts": {"verify": "node -e 'process.exit(1)'"}}),
                encoding="utf-8",
            )
            profile = knowledge / "technology-profiles" / "typescript.md"
            profile.parent.mkdir(parents=True, exist_ok=True)
            profile.write_text(
                "---\nid: typescript\nkind: technology-profile\ncheck: npm run verify\n---\n# TypeScript\n",
                encoding="utf-8",
            )

            result = self.run_cli(
                "verify", "--root", str(root), "--knowledge-root", str(knowledge)
            )

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(
            result.stderr,
            "ERROR profile.check_failed profile=typescript exit=1 remedy=run npm run verify directly and fix the reported failure\n",
        )

    def test_typescript_example_runs_the_shared_loop_successfully(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "typescript-verification-loop"
            shutil.copytree(TYPESCRIPT_EXAMPLE, root)

            result = self.run_cli(
                "verify", "--root", str(root), "--knowledge-root", str(REPOSITORY_ROOT / "knowledge")
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS profiles=typescript checks=1\n")
        self.assertEqual(result.stderr, "")

    def test_typescript_example_reports_the_native_check_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "typescript-verification-loop"
            shutil.copytree(TYPESCRIPT_EXAMPLE, root)
            package = json.loads((root / "package.json").read_text(encoding="utf-8"))
            package["scripts"]["verify"] = "node -e \"process.exit(1)\""
            (root / "package.json").write_text(json.dumps(package), encoding="utf-8")

            result = self.run_cli(
                "verify", "--root", str(root), "--knowledge-root", str(REPOSITORY_ROOT / "knowledge")
            )

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR profile.check_failed profile=typescript exit=1 remedy=run npm run verify directly and fix the reported failure\n",
        )


if __name__ == "__main__":
    unittest.main()
