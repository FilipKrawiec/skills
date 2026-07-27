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
        (root / "README.md").write_text("# Example\n", encoding="utf-8")
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
        (root / "README.md").write_text("# Example\n", encoding="utf-8")
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
                "version: 1\ndefault_executor: antigravity\nexecutor_failure: return-for-review\n",
                encoding="utf-8",
            )

            result = self.run_cli("orchestrator-config-check", "--config", str(config))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS default_executor=antigravity failure=return-for-review\n")
        self.assertEqual(result.stderr, "")

    def test_rejects_an_executor_config_that_allows_automatic_retry(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            config = Path(temporary_directory) / "orchestrator.yaml"
            config.write_text(
                "version: 1\ndefault_executor: antigravity\nexecutor_failure: retry-another\n",
                encoding="utf-8",
            )

            result = self.run_cli("orchestrator-config-check", "--config", str(config))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, "")
        self.assertEqual(
            result.stderr,
            "ERROR orchestrator.failure path=" + str(config) + " remedy=set executor_failure: return-for-review\n",
        )

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

    def test_requires_a_documentation_link_for_each_task(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            self.write_manifest(
                root,
                {
                    "id": "verification-foundation",
                    "state": "planned",
                    "adr": "docs/adr/0001-example.md",
                    "docs": [],
                    "evidence": [],
                },
            )

            result = self.run_cli("check", "--root", str(root))

        self.assertEqual(result.returncode, 1)
        self.assertEqual(
            result.stderr,
            "ERROR task.docs task=verification-foundation remedy=provide one or more relative documentation paths\n",
        )

    def test_accepts_a_task_packet_for_a_linked_git_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            worktree, base_revision = self.create_linked_worktree(Path(temporary_directory))
            task = self.task_packet(
                "linked-worktree-task",
                {
                    "kind": "git-worktree",
                    "repository": "repository",
                    "worktree": ".",
                    "base_revision": base_revision,
                },
            )
            self.write_v2_manifest(worktree, [task])

            result = self.run_cli("check", "--root", str(worktree))

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "PASS tasks=1\n")
        self.assertEqual(result.stderr, "")

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
            entry = root / "doctrines" / "no-any.md"
            entry.parent.mkdir()
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
            entry = root / "preferences" / "use-prettier.md"
            entry.parent.mkdir()
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
            entries = {
                "technology-profiles/typescript.md": "technology-profile",
                "config-artifacts/typescript-eslint.md": "config-artifact",
                "examples/typescript-strict.md": "example",
            }
            for relative_path, kind in entries.items():
                entry = root / relative_path
                entry.parent.mkdir(exist_ok=True)
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
            entry = root / "doctrines" / "no-any.md"
            entry.parent.mkdir()
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
            (root / ".project-knowledge").mkdir()
            (root / ".project-knowledge" / "project-profiles.yaml").write_text(
                "version: 1\nprofiles:\n  - typescript\n", encoding="utf-8"
            )
            (root / "package.json").write_text(
                json.dumps({"scripts": {"verify": "node -e 'process.exit(0)'"}}),
                encoding="utf-8",
            )
            profile = knowledge / "technology-profiles" / "typescript.md"
            profile.parent.mkdir(parents=True)
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
            (root / ".project-knowledge").mkdir()
            (root / ".project-knowledge" / "project-profiles.yaml").write_text(
                "version: 1\nprofiles:\n  - typescript\n", encoding="utf-8"
            )
            (root / "package.json").write_text(
                json.dumps({"scripts": {"verify": "node -e 'process.exit(1)'"}}),
                encoding="utf-8",
            )
            profile = knowledge / "technology-profiles" / "typescript.md"
            profile.parent.mkdir(parents=True)
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
