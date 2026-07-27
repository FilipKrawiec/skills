#!/usr/bin/env python3
"""Verify a project's declared task links and completion evidence."""

from __future__ import annotations

import argparse
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import NoReturn


MANIFEST_NAME = ".project-verification.json"
KNOWLEDGE_INDEX_NAME = ".knowledge-index.json"
PROJECT_PROFILES_NAME = "project-profiles.yaml"
KNOWLEDGE_KINDS = {
    "doctrines": "doctrine",
    "glossary": "glossary",
    "preferences": "preference",
    "technology-profiles": "technology-profile",
    "templates": "template",
    "examples": "example",
    "config-artifacts": "config-artifact",
}
ENTRY_ID = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*$")


def fail(condition: str, remedy: str, task_id: str | None = None) -> NoReturn:
    task = f" task={task_id}" if task_id is not None else ""
    print(f"ERROR {condition}{task} remedy={remedy}", file=sys.stderr)
    raise SystemExit(1)


def load_manifest(root: Path) -> dict[str, object]:
    path = root / MANIFEST_NAME
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        fail("manifest.missing", f"create {MANIFEST_NAME}")
    except json.JSONDecodeError:
        fail("manifest.invalid_json", f"fix JSON in {MANIFEST_NAME}")
    if not isinstance(value, dict):
        fail("manifest.invalid", "make the manifest a JSON object")
    return value


def local_file(root: Path, value: object, condition: str, remedy: str, task_id: str) -> None:
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        fail(condition, remedy, task_id)


def git_output(root: Path, *arguments: str) -> str | None:
    result = subprocess.run(
        ["git", "-C", str(root), *arguments], capture_output=True, text=True, check=False
    )
    return result.stdout.strip() if result.returncode == 0 else None


def task_workspace(root: Path, task: dict[str, object], task_id: str) -> tuple[list[str], bool]:
    workspace = task.get("workspace")
    if not isinstance(workspace, dict) or not all(
        isinstance(workspace.get(field), str) and workspace[field]
        for field in ("kind", "repository", "worktree", "base_revision")
    ):
        fail("task.workspace", "declare kind, repository, worktree, and base_revision", task_id)

    kind = workspace["kind"]
    if kind not in {"git-worktree", "isolated-copy"}:
        fail("task.workspace_kind", "use git-worktree or isolated-copy", task_id)
    if kind == "git-worktree":
        git_dir = git_output(root, "rev-parse", "--path-format=absolute", "--git-dir")
        common_dir = git_output(root, "rev-parse", "--path-format=absolute", "--git-common-dir")
        if not git_dir or not common_dir or Path(git_dir).resolve() == Path(common_dir).resolve():
            fail("task.linked_worktree", "run the task in a linked Git worktree", task_id)
        repository = Path(common_dir).resolve().parent.name
        if workspace["repository"] != repository or workspace["worktree"] != ".":
            fail(
                "task.workspace_identity",
                "declare this repository name and worktree: .",
                task_id,
            )
        if git_output(root, "cat-file", "-e", f"{workspace['base_revision']}^{{commit}}") is None:
            fail("task.base_revision", "declare an existing Git commit as base_revision", task_id)

    affected_paths = task.get("affected_paths")
    if not (
        isinstance(affected_paths, list)
        and affected_paths
        and all(
            isinstance(path, str)
            and path
            and not Path(path).is_absolute()
            and ".." not in Path(path).parts
            for path in affected_paths
        )
    ):
        fail("task.affected_paths", "declare one or more relative affected_paths", task_id)
    if len(set(affected_paths)) != len(affected_paths):
        fail("task.affected_paths", "use unique affected_paths", task_id)

    dependencies = task.get("dependencies")
    if not isinstance(dependencies, list) or not all(
        isinstance(dependency, str) and dependency for dependency in dependencies
    ) or len(set(dependencies)) != len(dependencies):
        fail("task.dependencies", "declare dependencies as unique task ids", task_id)
    parallel = task.get("parallel")
    if not isinstance(parallel, bool):
        fail("task.parallel", "declare whether this task may run in parallel", task_id)
    outcome = task.get("execution_outcome")
    if outcome not in {"completed", "blocked", "escalated"}:
        fail("task.execution_outcome", "declare completed, blocked, or escalated", task_id)
    return affected_paths, parallel


def paths_overlap(first: str, second: str) -> bool:
    first_parts = Path(first).parts
    second_parts = Path(second).parts
    shortest = min(len(first_parts), len(second_parts))
    return first_parts[:shortest] == second_parts[:shortest]
    candidate = (root / value).resolve()
    if root not in candidate.parents or not candidate.is_file():
        fail(condition, remedy, task_id)


def knowledge_fail(condition: str, path: Path, remedy: str) -> NoReturn:
    print(f"ERROR {condition} path={path.as_posix()} remedy={remedy}", file=sys.stderr)
    raise SystemExit(1)


def front_matter(path: Path, relative_path: Path) -> dict[str, str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0] != "---":
        knowledge_fail("knowledge.front_matter", relative_path, "start the entry with YAML front matter")
    try:
        end = lines.index("---", 1)
    except ValueError:
        knowledge_fail("knowledge.front_matter", relative_path, "close the YAML front matter")

    result: dict[str, str] = {}
    for line in lines[1:end]:
        if ":" not in line:
            knowledge_fail("knowledge.front_matter", relative_path, "use simple key: value metadata")
        key, value = line.split(":", 1)
        result[key.strip()] = value.strip()
    return result


def knowledge_index(root: Path, report: bool = True) -> int:
    root = root.resolve()
    if not root.is_dir():
        knowledge_fail("knowledge.root", root, "provide an existing knowledge root")

    for child in root.iterdir():
        if child.name in {KNOWLEDGE_INDEX_NAME, PROJECT_PROFILES_NAME} and child.is_file():
            continue
        if child.name not in KNOWLEDGE_KINDS or not child.is_dir():
            knowledge_fail(
                "knowledge.structure",
                child.relative_to(root),
                "use only allowed kind directories and the generated index",
            )

    entries: list[dict[str, object]] = []
    for directory, expected_kind in KNOWLEDGE_KINDS.items():
        category = root / directory
        if not category.exists():
            continue
        if not category.is_dir():
            knowledge_fail("knowledge.directory", Path(directory), "use the directory for this entry kind")
        for entry in sorted(category.iterdir()):
            relative_path = entry.relative_to(root)
            if entry.name == ".gitkeep" and entry.is_file():
                continue
            if not entry.is_file() or entry.suffix != ".md":
                knowledge_fail("knowledge.entry", relative_path, "use flat Markdown entries in allowed directories")
            metadata = front_matter(entry, relative_path)
            entry_id = metadata.get("id", "")
            if not ENTRY_ID.fullmatch(entry_id) or entry.stem != entry_id:
                knowledge_fail("knowledge.id", relative_path, "make id a kebab-case match for the filename")
            if metadata.get("kind") != expected_kind:
                knowledge_fail(
                    "knowledge.kind",
                    relative_path,
                    "make kind match the directory's allowed kind",
                )
            disabled = metadata.get("disabled", "false")
            if disabled not in {"true", "false"}:
                knowledge_fail(
                    "knowledge.disabled",
                    relative_path,
                    "use disabled: true or disabled: false when present",
                )
            entries.append(
                {
                    "id": entry_id,
                    "kind": expected_kind,
                    "path": relative_path.as_posix(),
                    "disabled": disabled == "true",
                }
            )

    entries.sort(key=lambda entry: (entry["kind"], entry["id"]))
    index_path = root / KNOWLEDGE_INDEX_NAME
    index_path.write_text(
        json.dumps({"version": 1, "entries": entries}, indent=2) + "\n",
        encoding="utf-8",
    )
    if report:
        print(f"PASS entries={len(entries)} index={KNOWLEDGE_INDEX_NAME}")
    return len(entries)


def project_profiles(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) < 2 or lines[0] != "version: 1":
        knowledge_fail(
            "project.profiles",
            path,
            "start the manifest with version: 1",
        )
    if lines[1] == "profiles: []":
        if len(lines) != 2:
            knowledge_fail(
                "project.profiles",
                path,
                "use only an empty list or two-space profile entries",
            )
        return []
    if lines[1] != "profiles:":
        knowledge_fail(
            "project.profiles",
            path,
            "use profiles: [] or a two-space profile list",
        )

    profiles: list[str] = []
    for line in lines[2:]:
        if not line.startswith("  - "):
            knowledge_fail(
                "project.profiles",
                path,
                "use two-space kebab-case profile entries",
            )
        profile = line.removeprefix("  - ")
        if not ENTRY_ID.fullmatch(profile) or profile in profiles:
            knowledge_fail(
                "project.profiles",
                path,
                "use unique kebab-case profile entries",
            )
        profiles.append(profile)
    return profiles


def orchestrator_config_check(path: Path) -> None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        knowledge_fail(
            "orchestrator.config_missing",
            path,
            "create the local orchestrator.yaml from the documented template",
        )

    values: dict[str, str] = {}
    for line in lines:
        if ":" not in line:
            knowledge_fail("orchestrator.config", path, "use simple key: value lines")
        key, value = line.split(":", 1)
        key, value = key.strip(), value.strip()
        if key in values or not key or not value:
            knowledge_fail("orchestrator.config", path, "use each required key once with a value")
        values[key] = value
    if set(values) != {"version", "default_executor", "executor_failure"}:
        knowledge_fail(
            "orchestrator.config",
            path,
            "use only version, default_executor, and executor_failure",
        )
    if values["version"] != "1":
        knowledge_fail("orchestrator.version", path, "set version: 1")
    if not ENTRY_ID.fullmatch(values["default_executor"]):
        knowledge_fail("orchestrator.default_executor", path, "use a kebab-case default_executor")
    if values["executor_failure"] != "return-for-review":
        knowledge_fail(
            "orchestrator.failure",
            path,
            "set executor_failure: return-for-review",
        )
    print(
        f"PASS default_executor={values['default_executor']} failure={values['executor_failure']}"
    )


def project_init(root: Path) -> None:
    root = root.resolve()
    if not root.is_dir():
        knowledge_fail("project.root", root, "provide an existing project root")

    created: list[str] = []
    preserved: list[str] = []

    def directory(relative_path: str) -> None:
        path = root / relative_path
        report_path = f"{relative_path}/"
        if path.exists():
            if not path.is_dir():
                knowledge_fail("project.directory", Path(relative_path), "replace it with a directory")
            preserved.append(report_path)
            return
        path.mkdir()
        created.append(report_path)

    def file(relative_path: str, content: str) -> None:
        path = root / relative_path
        if path.exists():
            preserved.append(relative_path)
            return
        path.write_text(content, encoding="utf-8")
        created.append(relative_path)

    directory(".project-knowledge")
    directory(".project-knowledge/glossary")
    file(
        ".project-knowledge/glossary/project-glossary.md",
        "---\nid: project-glossary\nkind: glossary\n---\n# Project Glossary\n\nAdd project terms here.\n",
    )
    file(f".project-knowledge/{PROJECT_PROFILES_NAME}", "version: 1\nprofiles: []\n")
    directory("docs")
    directory("docs/adr")
    profiles = project_profiles(root / ".project-knowledge" / PROJECT_PROFILES_NAME)
    print(
        json.dumps(
            {"created": created, "preserved": preserved, "profiles": profiles},
            sort_keys=True,
        )
    )


def project_knowledge_check(root: Path) -> None:
    root = root.resolve()
    if not root.is_dir():
        knowledge_fail("project.root", root, "provide an existing project root")

    knowledge_root = root / ".project-knowledge"
    if not knowledge_root.is_dir():
        knowledge_fail(
            "project.knowledge_root",
            Path(".project-knowledge"),
            "run project-init or create the Project Knowledge directory",
        )
    if not (root / "docs" / "adr").is_dir():
        knowledge_fail(
            "project.adr_directory",
            Path("docs/adr"),
            "run project-init or create the ADR directory",
        )

    profiles_path = knowledge_root / PROJECT_PROFILES_NAME
    if not profiles_path.is_file():
        knowledge_fail(
            "project.profiles_missing",
            Path(f".project-knowledge/{PROJECT_PROFILES_NAME}"),
            "run project-init or create an empty valid profile manifest",
        )
    profiles = project_profiles(profiles_path)
    entries = knowledge_index(knowledge_root, report=False)
    selected = ",".join(profiles) if profiles else "none"
    print(f"PASS profiles={selected} entries={entries}")


def profile_metadata(root: Path, profile: str) -> dict[str, str]:
    path = root / "technology-profiles" / f"{profile}.md"
    if not path.is_file():
        knowledge_fail(
            "profile.missing",
            Path(f"technology-profiles/{profile}.md"),
            "add the selected Central Knowledge technology profile",
        )
    metadata = front_matter(path, path.relative_to(root))
    if metadata.get("id") != profile or metadata.get("kind") != "technology-profile":
        knowledge_fail(
            "profile.metadata",
            path.relative_to(root),
            "make the selected profile id and kind match its path",
        )
    return metadata


def verify(root: Path, knowledge_root: Path) -> None:
    root = root.resolve()
    knowledge_root = knowledge_root.resolve()
    if not root.is_dir():
        knowledge_fail("project.root", root, "provide an existing project root")
    project_knowledge_root = root / ".project-knowledge"
    if not project_knowledge_root.is_dir():
        knowledge_fail(
            "project.knowledge_root",
            Path(".project-knowledge"),
            "run project-init or create the Project Knowledge directory",
        )
    profiles_path = project_knowledge_root / PROJECT_PROFILES_NAME
    if not profiles_path.is_file():
        knowledge_fail(
            "project.profiles_missing",
            Path(f".project-knowledge/{PROJECT_PROFILES_NAME}"),
            "run project-init or create an empty valid profile manifest",
        )

    knowledge_index(knowledge_root, report=False)
    knowledge_index(project_knowledge_root, report=False)
    profiles = project_profiles(profiles_path)
    for profile in profiles:
        central = profile_metadata(knowledge_root, profile)
        override_path = project_knowledge_root / "technology-profiles" / f"{profile}.md"
        effective = central.copy()
        if override_path.is_file():
            override = profile_metadata(project_knowledge_root, profile)
            if override.get("disabled") == "true":
                knowledge_fail(
                    "profile.disabled",
                    override_path.relative_to(project_knowledge_root),
                    "remove the profile from project-profiles.yaml or enable its override",
                )
            effective.update(override)

        command = effective.get("check", "")
        if not command:
            knowledge_fail(
                "profile.check_missing",
                Path(f"technology-profiles/{profile}.md"),
                "declare a simple check command in the active profile",
            )
        try:
            result = subprocess.run(
                shlex.split(command),
                cwd=root,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        except (OSError, ValueError):
            print(
                f"ERROR profile.check_unavailable profile={profile} remedy=run {command} directly and install or correct the required tool",
                file=sys.stderr,
            )
            raise SystemExit(1)
        if result.returncode != 0:
            print(
                f"ERROR profile.check_failed profile={profile} exit={result.returncode} remedy=run {command} directly and fix the reported failure",
                file=sys.stderr,
            )
            raise SystemExit(1)

    selected = ",".join(profiles) if profiles else "none"
    print(f"PASS profiles={selected} checks={len(profiles)}")


def check(root: Path) -> None:
    root = root.resolve()
    manifest = load_manifest(root)
    version = manifest.get("version")
    if version not in {1, 2}:
        fail("manifest.version", "set version to 1 or 2")

    completed_states = manifest.get("completed_states", ["done"])
    if not (
        isinstance(completed_states, list)
        and completed_states
        and all(isinstance(state, str) and state for state in completed_states)
    ):
        fail("manifest.completed_states", "provide one or more non-empty completion states")

    tasks = manifest.get("tasks")
    if not isinstance(tasks, list):
        fail("manifest.tasks", "provide tasks as a JSON array")

    seen_ids: set[str] = set()
    packet_tasks: list[tuple[str, dict[str, object], list[str], bool]] = []
    for task in tasks:
        if not isinstance(task, dict):
            fail("task.invalid", "make each task a JSON object")
        task_id = task.get("id")
        if not isinstance(task_id, str) or not task_id:
            fail("task.id", "provide a non-empty task id")
        if task_id in seen_ids:
            fail("task.duplicate_id", "use unique task ids", task_id)
        seen_ids.add(task_id)

        state = task.get("state")
        if not isinstance(state, str) or not state:
            fail("task.state", "provide the project's task state", task_id)

        adr = task.get("adr")
        if not isinstance(adr, str) or not adr.startswith("docs/adr/"):
            fail("task.adr", "link an ADR below docs/adr", task_id)
        local_file(root, adr, "task.adr_missing", "create the linked ADR or correct its path", task_id)

        docs = task.get("docs", [])
        if not (
            isinstance(docs, list)
            and docs
            and all(isinstance(doc, str) and doc for doc in docs)
        ):
            fail("task.docs", "provide one or more relative documentation paths", task_id)
        for doc in docs:
            local_file(root, doc, "task.doc_missing", "create the linked document or correct its path", task_id)

        evidence = task.get("evidence", [])
        if not isinstance(evidence, list) or not all(
            isinstance(item, str) and item for item in evidence
        ):
            fail("task.evidence", "provide evidence as a list of non-empty references", task_id)
        if state in completed_states and not evidence:
            fail(
                "task.evidence_missing",
                "record at least one verification command or artifact",
                task_id,
            )
        if version == 2:
            affected_paths, parallel = task_workspace(root, task, task_id)
            packet_tasks.append((task_id, task, affected_paths, parallel))

    if version == 2:
        for task_id, task, _, _ in packet_tasks:
            dependencies = task["dependencies"]
            assert isinstance(dependencies, list)
            if task_id in dependencies or any(dependency not in seen_ids for dependency in dependencies):
                fail("task.dependencies", "reference existing tasks other than this task", task_id)

        for index, (first_id, first_task, first_paths, first_parallel) in enumerate(packet_tasks):
            if not first_parallel:
                continue
            first_dependencies = first_task["dependencies"]
            assert isinstance(first_dependencies, list)
            for second_id, second_task, second_paths, second_parallel in packet_tasks[index + 1 :]:
                if not second_parallel:
                    continue
                second_dependencies = second_task["dependencies"]
                assert isinstance(second_dependencies, list)
                if first_id in second_dependencies or second_id in first_dependencies:
                    continue
                if any(paths_overlap(first, second) for first in first_paths for second in second_paths):
                    fail(
                        "task.affected_paths_overlap",
                        "serialize overlapping tasks or give them non-overlapping affected_paths",
                        second_id,
                    )

    print(f"PASS tasks={len(tasks)}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify a project's declared task links and completion evidence."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    check_parser = subparsers.add_parser("check", help="validate .project-verification.json")
    check_parser.add_argument("--root", type=Path, default=Path.cwd(), help="project root")
    index_parser = subparsers.add_parser(
        "knowledge-index", help="validate knowledge entries and create .knowledge-index.json"
    )
    index_parser.add_argument("--root", type=Path, required=True, help="knowledge root")
    init_parser = subparsers.add_parser(
        "project-init", help="create minimal Project Knowledge scaffolding without overwriting files"
    )
    init_parser.add_argument("--root", type=Path, default=Path.cwd(), help="project root")
    project_check_parser = subparsers.add_parser(
        "project-knowledge-check",
        help="validate Project Knowledge structure and declared profile selection",
    )
    project_check_parser.add_argument("--root", type=Path, default=Path.cwd(), help="project root")
    verify_parser = subparsers.add_parser(
        "verify", help="run deterministic checks declared by selected technology profiles"
    )
    verify_parser.add_argument("--root", type=Path, default=Path.cwd(), help="project root")
    verify_parser.add_argument(
        "--knowledge-root", type=Path, required=True, help="Central Knowledge root"
    )
    config_parser = subparsers.add_parser(
        "orchestrator-config-check", help="validate local orchestrator routing configuration"
    )
    config_parser.add_argument("--config", type=Path, required=True, help="local orchestrator config")
    arguments = parser.parse_args()
    if arguments.command == "check":
        check(arguments.root)
    elif arguments.command == "knowledge-index":
        knowledge_index(arguments.root)
    elif arguments.command == "project-init":
        project_init(arguments.root)
    elif arguments.command == "project-knowledge-check":
        project_knowledge_check(arguments.root)
    elif arguments.command == "verify":
        verify(arguments.root, arguments.knowledge_root)
    else:
        orchestrator_config_check(arguments.config)


if __name__ == "__main__":
    main()
