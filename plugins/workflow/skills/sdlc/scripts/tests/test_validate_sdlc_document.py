from __future__ import annotations

import copy
import importlib.util
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "validate-sdlc-document.py"
SPEC = importlib.util.spec_from_file_location("validator", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)


def audit(event: str = "Created") -> list[dict]:
    return [{"sequence": 1, "event": event, "actor": "tester", "occurred_at": "2026-07-11T00:00:00Z"}]


def budget() -> dict:
    return {"tokens": -1, "elapsed_seconds": -1, "model_cycles": 12, "tool_calls": 24, "autonomous_corrections": 3, "concurrency": 2}


def task(stage: str = "IN_DEVELOPMENT") -> dict:
    return {
        "schema_version": "1", "document_type": "task", "task_id": "01TASK", "revision": 1,
        "stage": stage, "outcome": None,
        "definition": {"title": "Task", "requested_outcome": "Deliver it", "context": "Context", "initial_scope": [], "external_references": []},
        "specification": {
            "deliverable": "Artifact", "completion_condition": "Accepted", "acceptance_criteria": [], "constraints": [],
            "non_goals": [], "target_repository": "owner/repo", "allowed_paths": [], "risks": [], "controls": {},
            "budget": budget(), "collaboration_mode": "afk", "max_recovery_tries": 3,
        },
        "execution_slot": {"task_execution_id": "01EXEC", "status": "ACTIVE"}, "retrospective": None, "audit": audit(),
    }


def execution(task_id: str = "01TASK", execution_id: str = "01EXEC") -> dict:
    return {
        "schema_version": "1", "document_type": "task_execution", "task_execution_id": execution_id, "task_id": task_id,
        "revision": 1, "state": "ACTIVE", "recovery_window": {"recovery_window_id": "01WIN", "max_tries": 3, "tries_used": 0},
        "phase_runs": [], "budget_extensions": [], "deadline_extensions": [], "human_interventions": [],
        "acceptance_decision": None, "execution_outcome": None,
        "usage": {"tokens": 0, "elapsed_seconds": 0, "model_cycles": 0, "tool_calls": 0, "autonomous_corrections": 0, "concurrency": 0},
        "costs": [], "audit": audit(),
    }


def link(source: str = "01TASK", target: str = "02TASK") -> dict:
    return {"schema_version": "1", "document_type": "task_link", "task_link_id": "01LINK", "revision": 1,
            "source_task_id": source, "target_task_id": target, "relationship_kind": "DERIVATION",
            "description": "Derived improvement", "description_history": [], "audit": audit()}


def phase_run(run_id: str, sequence: int, *, kind: str = "REVIEW", recovery_window_id: str = "01WIN") -> dict:
    return {
        "phase_run_id": run_id, "kind": kind, "sequence": sequence, "state": "ACTIVE",
        "lifecycle_stage": "DEFINE", "cause": kind.lower(), "recovery_window_id": recovery_window_id,
        "result": None, "improvement": None, "artifacts": [],
    }


def advance(value: dict) -> dict:
    current = copy.deepcopy(value)
    current["revision"] += 1
    current["audit"].append(
        {"sequence": 2, "event": "Changed", "actor": "tester", "occurred_at": "2026-07-11T01:00:00Z"}
    )
    return current


class ValidatorTest(unittest.TestCase):
    def test_accepts_each_document_type(self) -> None:
        validator.validate_document(task())
        validator.validate_document(execution())
        validator.validate_document(link())

    def test_rejects_old_or_unknown_schema(self) -> None:
        value = task()
        value["schema_version"] = "2"
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_budget_sentinels_and_finite_concurrency(self) -> None:
        value = task()
        value["specification"]["budget"]["concurrency"] = -1
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_recovery_window_is_bounded(self) -> None:
        value = execution()
        value["recovery_window"]["max_tries"] = 4
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_artifact_requires_sha256(self) -> None:
        value = execution()
        value["phase_runs"] = [{"phase_run_id": "run", "kind": "EXECUTE", "sequence": 1, "state": "ACTIVE",
            "lifecycle_stage": "DEFINE", "cause": "delivery", "result": None, "improvement": None,
            "artifacts": [{"artifact_id": "a", "type": "patch", "revision": 1, "uri": "artifact://a", "sha256": "bad"}]}]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_closed_task_requires_outcome_and_retrospective(self) -> None:
        value = task("CLOSED")
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_task_link_rejects_self_reference(self) -> None:
        value = link("01TASK", "01TASK")
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_review_runs_are_limited_to_three(self) -> None:
        value = execution()
        for index in range(4):
            value["phase_runs"].append(phase_run(f"r{index}", index + 1))
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_review_limit_is_scoped_to_each_recovery_window(self) -> None:
        value = execution()
        value["phase_runs"] = [
            phase_run(f"r{index}", index + 1, recovery_window_id="01WIN" if index < 3 else "02WIN")
            for index in range(6)
        ]
        validator.validate_document(value)

    def test_task_transition_freezes_definition(self) -> None:
        previous = task()
        current = copy.deepcopy(previous)
        current["revision"] = 2
        current["definition"]["title"] = "Changed"
        current["audit"].append({"sequence": 2, "event": "Changed", "actor": "tester", "occurred_at": "2026-07-11T01:00:00Z"})
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_task_transition_advances_one_stage(self) -> None:
        previous = task("IN_DEVELOPMENT")
        current = copy.deepcopy(previous)
        current["revision"] = 2
        current["stage"] = "IMPROVE"
        current["audit"].append({"sequence": 2, "event": "Improve", "actor": "tester", "occurred_at": "2026-07-11T01:00:00Z"})
        validator.validate_transition(previous, current)

    def test_transition_requires_next_revision_and_append_only_audit(self) -> None:
        previous = task()
        current = copy.deepcopy(previous)
        current["revision"] = 3
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

        current["revision"] = 2
        current["audit"] = []
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_terminal_execution_is_immutable(self) -> None:
        previous = execution()
        previous["state"] = "FAILED"
        previous["execution_outcome"] = {"summary": "failed"}
        current = copy.deepcopy(previous)
        current["revision"] = 2
        current["audit"].append({"sequence": 2, "event": "Changed", "actor": "tester", "occurred_at": "2026-07-11T01:00:00Z"})
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_execution_transition_preserves_task_identity(self) -> None:
        previous = execution()
        current = advance(previous)
        current["task_id"] = "02TASK"
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_execution_transition_preserves_existing_phase_runs(self) -> None:
        previous = execution()
        previous["phase_runs"] = [phase_run("r1", 1)]
        current = advance(previous)
        current["phase_runs"][0]["cause"] = "rewritten"
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_execution_transition_cannot_delete_phase_runs(self) -> None:
        previous = execution()
        previous["phase_runs"] = [phase_run("r1", 1)]
        current = advance(previous)
        current["phase_runs"] = []
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_execution_transition_usage_is_nondecreasing(self) -> None:
        previous = execution()
        previous["usage"]["tokens"] = 10
        current = advance(previous)
        current["usage"]["tokens"] = 9
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_task_link_transition_preserves_endpoints_and_kind(self) -> None:
        for field, replacement in (
            ("source_task_id", "03TASK"),
            ("target_task_id", "03TASK"),
            ("relationship_kind", "DEPENDENCY"),
        ):
            with self.subTest(field=field):
                previous = link()
                current = advance(previous)
                current[field] = replacement
                with self.assertRaises(validator.Invalid):
                    validator.validate_transition(previous, current)

    def test_root_rejects_missing_task_and_duplicate_execution(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "one.yaml").write_text(yaml.safe_dump(execution("missing")), encoding="utf-8")
            with self.assertRaises(validator.Invalid):
                validator.validate_root(root)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "task.yaml").write_text(yaml.safe_dump(task()), encoding="utf-8")
            (root / "one.yaml").write_text(yaml.safe_dump(execution()), encoding="utf-8")
            (root / "two.yaml").write_text(yaml.safe_dump(execution(execution_id="02EXEC")), encoding="utf-8")
            with self.assertRaises(validator.Invalid):
                validator.validate_root(root)

    def test_root_accepts_task_execution_and_link_graph(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            other = task("IN_DEVELOPMENT")
            other["task_id"] = "02TASK"
            other["execution_slot"] = None
            for name, value in (("task.yaml", task()), ("other.yaml", other), ("execution.yaml", execution()), ("link.yaml", link())):
                (root / name).write_text(yaml.safe_dump(value), encoding="utf-8")
            validator.validate_root(root)

    def test_root_rejects_duplicate_task_ids(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            first = task()
            first["execution_slot"] = None
            second = copy.deepcopy(first)
            (root / "one.yaml").write_text(yaml.safe_dump(first), encoding="utf-8")
            (root / "two.yaml").write_text(yaml.safe_dump(second), encoding="utf-8")
            with self.assertRaises(validator.Invalid):
                validator.validate_root(root)

    def test_root_rejects_execution_slot_identity_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            owner = task()
            owner["execution_slot"]["task_execution_id"] = "02EXEC"
            (root / "task.yaml").write_text(yaml.safe_dump(owner), encoding="utf-8")
            (root / "execution.yaml").write_text(yaml.safe_dump(execution()), encoding="utf-8")
            with self.assertRaises(validator.Invalid):
                validator.validate_root(root)


if __name__ == "__main__":
    unittest.main()
