from __future__ import annotations

import copy
import hashlib
import importlib.util
import tempfile
import unittest
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "validate-sdlc-document.py"
ASSETS = ROOT / "assets"
SPEC = importlib.util.spec_from_file_location("validator", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)


def audit(event: str = "Created") -> list[dict]:
    return [{"sequence": 1, "event": event, "actor": "tester", "occurred_at": "2026-07-13T00:00:00Z"}]


def lifecycle(kind: str = "DEFINE", sequence: int = 1, *, state: str = "ACTIVE") -> dict:
    started_at = f"2026-07-13T00:{sequence:02d}:00Z"
    return {
        "lifecycle_id": f"01L{sequence}",
        "kind": kind,
        "sequence": sequence,
        "state": state,
        "started_at": started_at,
        "completed_at": None if state == "ACTIVE" else f"2026-07-13T00:{sequence:02d}:30Z",
        "result": None,
        "improvement": None,
        "artifacts": [],
    }


def artifact_ref() -> dict:
    return {
        "artifact_id": "evidence",
        "type": "record",
        "revision": 1,
        "uri": "artifact://evidence",
        "sha256": "a" * 64,
    }


def agentic_diagnosis() -> dict:
    return {
        "facts": [{"statement": "Review identified no unmet acceptance criteria.", "evidence_refs": []}],
        "hypotheses": [],
        "recommendation": {
            "action": "Keep the current review checklist.",
            "expected_signal": "Future review phases complete without rework.",
            "success_criterion": "Three consecutive tasks have no review-driven rework.",
        },
    }


def improvement() -> dict:
    return {"strengths": [], "frictions": [], "proposals": [], "evidence_refs": []}


def phase(kind: str, sequence: int = 1, *, lifecycles: list[dict] | None = None) -> dict:
    return {
        "phase_id": f"01P{sequence}",
        "kind": kind,
        "sequence": sequence,
        "lifecycles": lifecycles if lifecycles is not None else [lifecycle()],
    }


def completed_phase(kind: str, sequence: int) -> dict:
    lifecycles = [
        lifecycle("DEFINE", 1, state="SUCCEEDED"),
        lifecycle("EXECUTE", 2, state="SUCCEEDED"),
        lifecycle("VERIFY", 3, state="SUCCEEDED"),
        lifecycle("IMPROVE", 4, state="SUCCEEDED"),
        lifecycle("COMPLETE", 5, state="SUCCEEDED"),
    ]
    lifecycles[-1]["result"] = {"summary": f"Completed {kind} phase."}
    if kind == "IMPROVE":
        lifecycles[-1]["result"]["agentic_diagnosis"] = agentic_diagnosis()
    lifecycles[-1]["improvement"] = improvement()
    return phase(kind, sequence, lifecycles=lifecycles)


def stage(kind: str = "DEFINE", sequence: int = 1, *, phases: list[dict] | None = None) -> dict:
    default_phase_kind = {"DEFINE": "DEFINE", "REFINE": "REFINE", "IMPROVE": "IMPROVE"}.get(kind, "PLAN")
    return {
        "stage_id": f"01S{sequence}",
        "kind": kind,
        "sequence": sequence,
        "phases": phases if phases is not None else [phase(default_phase_kind)],
    }


def scorecard(*, target_elapsed_seconds: int = 3600, baseline_sample_size: int = 4) -> dict:
    return {
        "policy_id": "delivery-baseline-2026-q3",
        "policy_sha256": "a" * 64,
        "story_points": 3,
        "target_elapsed_seconds": target_elapsed_seconds,
        "baseline_sample_size": baseline_sample_size,
    }


def classification(*, story_points: int = 3) -> dict:
    return {"story_points": story_points}


def task(
    *,
    stages: list[dict] | None = None,
    state: str = "ACTIVE",
    scorecard_value: dict | None | object = ...,
    classification_value: dict | None | object = ...,
) -> dict:
    stages = stages if stages is not None else [stage()]
    requires_classification = any(stage_value["kind"] in {"EXECUTE", "IMPROVE"} for stage_value in stages)
    if classification_value is ...:
        classification_value = classification() if requires_classification else None
    if scorecard_value is ...:
        scorecard_value = scorecard() if requires_classification else None
    return {
        "schema_version": "1",
        "document_type": "task",
        "task_id": "01TASK",
        "revision": 1,
        "state": state,
        "outcome": None,
        "classification": classification_value,
        "scorecard": scorecard_value,
        "stages": stages,
        "audit": audit(),
    }


def policy(*, entries: list[dict] | None = None, minimum_sample_size: int = 4) -> dict:
    return {
        "schema_version": "1",
        "document_type": "scorecard_policy",
        "policy_id": "delivery-baseline-2026-q3",
        "revision": 0,
        "minimum_sample_size": minimum_sample_size,
        "entries": entries if entries is not None else [{
            "story_points": 3,
            "target_elapsed_seconds": 3600,
            "sample_size": 4,
        }],
        "audit": audit("Derived"),
    }


def configure_task_for_policy(value: dict, policy_value: dict) -> None:
    raw_policy = yaml.safe_dump(policy_value, sort_keys=False).encode("utf-8")
    entry = policy_value["entries"][0]
    value["classification"] = classification(story_points=entry["story_points"])
    value["scorecard"] = {
        "policy_id": policy_value["policy_id"],
        "policy_sha256": hashlib.sha256(raw_policy).hexdigest(),
        "story_points": entry["story_points"],
        "target_elapsed_seconds": entry["target_elapsed_seconds"],
        "baseline_sample_size": entry["sample_size"],
    }


def link(source: str = "01TASK", target: str = "02TASK") -> dict:
    return {
        "schema_version": "1",
        "document_type": "task_link",
        "task_link_id": "01LINK",
        "revision": 1,
        "source_task_id": source,
        "target_task_id": target,
        "relationship_kind": "DERIVATION",
        "description": "Derived improvement",
        "description_history": [],
        "audit": audit(),
    }


def advance(value: dict) -> dict:
    current = copy.deepcopy(value)
    current["revision"] += 1
    current["audit"].append(
        {"sequence": 2, "event": "Changed", "actor": "tester", "occurred_at": "2026-07-13T01:00:00Z"}
    )
    return current


class ValidatorTest(unittest.TestCase):
    def test_canonical_document_assets_use_only_schema_v1(self) -> None:
        for name in ("task-template.yaml", "task-link-template.yaml", "scorecard-policy-template.yaml"):
            value = yaml.safe_load((ASSETS / name).read_text(encoding="utf-8"))
            self.assertEqual(value["schema_version"], "1", name)

        task_template = yaml.safe_load((ASSETS / "task-template.yaml").read_text(encoding="utf-8"))
        self.assertIn("classification", task_template)
        self.assertIsNone(task_template["classification"])
        self.assertIsNone(task_template["scorecard"])

    def test_accepts_task_and_link_documents(self) -> None:
        validator.validate_document(task())
        validator.validate_document(link())
        validator.validate_document(policy())

    def test_accepts_only_schema_v1_and_rejects_task_execution_documents(self) -> None:
        validator.validate_document(task())
        validator.validate_document(link())
        validator.validate_document(policy())

        old_task = task()
        old_task["schema_version"] = "2"
        with self.assertRaises(validator.Invalid):
            validator.validate_document(old_task)

        with self.assertRaises(validator.Invalid):
            validator.validate_document({"schema_version": "1", "document_type": "task_execution"})

    def test_rejects_top_level_specification(self) -> None:
        value = task()
        value["specification"] = {"deliverable": "belongs in REFINE"}
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_rejects_top_level_definition(self) -> None:
        value = task()
        value["definition"] = {"title": "belongs in DEFINE"}
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_task_allows_an_unbound_scorecard_and_validates_a_bound_scorecard(self) -> None:
        value = task()
        del value["scorecard"]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        validator.validate_document(task(scorecard_value=None))

        for field in ("policy_id", "policy_sha256", "story_points", "target_elapsed_seconds", "baseline_sample_size"):
            value = task(stages=[stage("EXECUTE", 1)])
            del value["scorecard"][field]
            with self.assertRaises(validator.Invalid):
                validator.validate_document(value)

        for invalid_target in (0, -1, 1.5, "3600", True):
            value = task(stages=[stage("EXECUTE", 1)])
            value["scorecard"]["target_elapsed_seconds"] = invalid_target
            with self.assertRaises(validator.Invalid):
                validator.validate_document(value)

        for invalid_sample_size in (0, -1, 1.5, "4", True):
            value = task(stages=[stage("EXECUTE", 1)])
            value["scorecard"]["baseline_sample_size"] = invalid_sample_size
            with self.assertRaises(validator.Invalid):
                validator.validate_document(value)

        for invalid_digest in ("a" * 63, "g" * 64, 123):
            value = task(stages=[stage("EXECUTE", 1)])
            value["scorecard"]["policy_sha256"] = invalid_digest
            with self.assertRaises(validator.Invalid):
                validator.validate_document(value)

    def test_scorecard_is_optional_at_every_stage_for_calibration(self) -> None:
        validator.validate_document(task(scorecard_value=None))
        validator.validate_document(task(stages=[stage("DEFINE", 1), stage("REFINE", 2)], scorecard_value=None))

        for stage_kind in ("EXECUTE", "IMPROVE"):
            validator.validate_document(task(stages=[stage(stage_kind, 1)], scorecard_value=None))

    def test_transition_binds_classification_only_when_completed_refine_appends_execute(self) -> None:
        completed_define = stage("DEFINE", 1, phases=[completed_phase("DEFINE", 1)])
        completed_refine = stage("REFINE", 2, phases=[completed_phase("REFINE", 1)])
        previous = task(stages=[completed_define, completed_refine], scorecard_value=None, classification_value=None)
        current = advance(previous)
        current["classification"] = classification()
        current["scorecard"] = scorecard()
        current["stages"].append(stage("EXECUTE", 3))
        validator.validate_transition(previous, current)

    def test_transition_rejects_premature_incomplete_or_mutated_classification(self) -> None:
        initial = task(scorecard_value=None, classification_value=None)
        current = advance(initial)
        current["classification"] = classification()
        current["scorecard"] = scorecard()
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(initial, current)

        completed_define = stage("DEFINE", 1, phases=[completed_phase("DEFINE", 1)])
        completed_refine = stage("REFINE", 2, phases=[completed_phase("REFINE", 1)])
        refine_only = task(stages=[completed_define, completed_refine], scorecard_value=None, classification_value=None)
        current = advance(refine_only)
        current["classification"] = classification()
        current["scorecard"] = scorecard()
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(refine_only, current)

        incomplete_refine = task(
            stages=[completed_define, stage("REFINE", 2)],
            scorecard_value=None,
            classification_value=None,
        )
        current = advance(incomplete_refine)
        current["classification"] = classification()
        current["scorecard"] = scorecard()
        current["stages"].append(stage("EXECUTE", 3))
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(incomplete_refine, current)

        bound = task(stages=[completed_define, completed_refine, stage("EXECUTE", 3)])
        current = advance(bound)
        current["classification"]["story_points"] = 5
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(bound, current)

    def test_classification_is_required_after_execute_and_matches_a_bound_scorecard(self) -> None:
        value = task(stages=[stage("EXECUTE", 1)], scorecard_value=None, classification_value=None)
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("EXECUTE", 1)])
        value["classification"]["story_points"] = 5
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        for malformed in ({}, {"story_points": 0}, {"story_points": 4}, {"story_points": 3, "extra": "not allowed"}):
            value = task(classification_value=malformed)
            with self.assertRaises(validator.Invalid):
                validator.validate_document(value)

    def test_scorecard_policy_requires_nonempty_unique_well_sampled_entries(self) -> None:
        validator.validate_document(policy())

        for story_points in (1, 2, 3, 5, 8):
            validator.validate_document(policy(entries=[{
                "story_points": story_points,
                "target_elapsed_seconds": 3600,
                "sample_size": 4,
            }]))

        value = policy(entries=[])
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = policy()
        value["minimum_sample_size"] = 0
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = policy(entries=[{
            "story_points": 3,
            "target_elapsed_seconds": 3600,
            "sample_size": 3,
        }])
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = policy(entries=[
            {"story_points": 3, "target_elapsed_seconds": 3600, "sample_size": 4},
            {"story_points": 3, "target_elapsed_seconds": 7200, "sample_size": 5},
        ])
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = policy()
        value["entries"][0]["target_elapsed_seconds"] = 0
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = policy()
        value["entries"][0]["story_points"] = 4
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("EXECUTE", 1)])
        value["scorecard"]["story_points"] = 4
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_task_owns_ordered_stages(self) -> None:
        value = task(stages=[stage("DEFINE", 1), stage("REFINE", 2), stage("EXECUTE", 3), stage("IMPROVE", 4)])
        value["stages"][2]["phases"] = [
            completed_phase("PLAN", 1),
            completed_phase("EXECUTE", 2),
            completed_phase("REVIEW", 3),
            phase("SHIP", 4),
        ]
        validator.validate_document(value)

    def test_stage_kind_controls_its_phase_kinds(self) -> None:
        value = task(stages=[stage("REFINE", phases=[phase("PLAN")])])
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("EXECUTE", phases=[phase("PLAN"), phase("SHIP", 2)])])
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_execute_phases_allow_review_driven_loops(self) -> None:
        value = task(stages=[stage("EXECUTE", phases=[
            completed_phase("PLAN", 1),
            completed_phase("EXECUTE", 2),
            completed_phase("REVIEW", 3),
            completed_phase("PLAN", 4),
            completed_phase("EXECUTE", 5),
            completed_phase("REVIEW", 6),
            phase("SHIP", 7),
        ])])
        validator.validate_document(value)

    def test_phase_owns_ordered_shared_lifecycles(self) -> None:
        value = task(stages=[stage("EXECUTE", phases=[phase("PLAN", lifecycles=[
            lifecycle("DEFINE", 1, state="SUCCEEDED"),
            lifecycle("EXECUTE", 2, state="SUCCEEDED"),
            lifecycle("VERIFY", 3, state="SUCCEEDED"),
            lifecycle("IMPROVE", 4, state="SUCCEEDED"),
            lifecycle("COMPLETE", 5, state="SUCCEEDED"),
        ])])])
        terminal = value["stages"][0]["phases"][0]["lifecycles"][-1]
        terminal["result"] = {"summary": "Completed PLAN phase."}
        terminal["improvement"] = improvement()
        validator.validate_document(value)

    def test_lifecycles_reject_invalid_or_out_of_order_kinds(self) -> None:
        value = task()
        value["stages"][0]["phases"][0]["lifecycles"] = [lifecycle("EXECUTE")]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_lifecycles_require_valid_ordered_timestamp_pairs(self) -> None:
        value = task()
        del value["stages"][0]["phases"][0]["lifecycles"][0]["started_at"]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task()
        value["stages"][0]["phases"][0]["lifecycles"][0]["started_at"] = "tomorrow"
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task()
        value["stages"][0]["phases"][0]["lifecycles"][0]["completed_at"] = "2026-07-13T00:01:00Z"
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("EXECUTE", phases=[completed_phase("PLAN", 1)])])
        complete = value["stages"][0]["phases"][0]["lifecycles"][-1]
        complete["completed_at"] = None
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        complete["completed_at"] = "2026-07-13T00:04:00Z"
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task()
        value["stages"][0]["phases"][0]["lifecycles"] = [
            lifecycle("DEFINE", 1, state="SUCCEEDED"),
            lifecycle("VERIFY", 2),
        ]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_terminal_lifecycle_requires_result_and_improvement(self) -> None:
        value = task()
        value["stages"][0]["phases"][0]["lifecycles"][0]["state"] = "SUCCEEDED"
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_successful_complete_lifecycle_requires_result_and_improvement_in_non_improve_phase(self) -> None:
        value = task(stages=[stage("DEFINE", phases=[completed_phase("DEFINE", 1)])])

        for field in ("result", "improvement"):
            with self.subTest(field=field):
                incomplete = copy.deepcopy(value)
                incomplete["stages"][0]["phases"][0]["lifecycles"][-1][field] = None
                with self.assertRaises(validator.Invalid):
                    validator.validate_document(incomplete)

    def test_failed_or_cancelled_lifecycle_can_close_task_with_matching_outcome(self) -> None:
        for lifecycle_state, outcome in (("FAILED", "FAILED"), ("CANCELLED", "CANCELLED")):
            with self.subTest(lifecycle_state=lifecycle_state):
                previous = task()
                failed_lifecycle = previous["stages"][0]["phases"][0]["lifecycles"][0]
                failed_lifecycle.update({
                    "state": lifecycle_state,
                    "completed_at": "2026-07-13T00:01:30Z",
                    "result": {"summary": f"Lifecycle {lifecycle_state.lower()}."},
                    "improvement": improvement(),
                })
                current = advance(previous)
                current["state"] = "CLOSED"
                current["outcome"] = outcome
                validator.validate_transition(previous, current)

    def test_failed_or_cancelled_lifecycle_requires_result_and_valid_improvement_evidence(self) -> None:
        for lifecycle_state in ("FAILED", "CANCELLED"):
            valid = task()
            terminal = valid["stages"][0]["phases"][0]["lifecycles"][0]
            terminal.update({
                "state": lifecycle_state,
                "completed_at": "2026-07-13T00:01:30Z",
                "result": {"summary": f"Lifecycle {lifecycle_state.lower()}."},
                "improvement": improvement(),
            })

            for field, invalid_value in (
                ("result", None),
                ("result", "not a mapping"),
                ("improvement", None),
            ):
                with self.subTest(lifecycle_state=lifecycle_state, field=field, invalid_value=invalid_value):
                    invalid = copy.deepcopy(valid)
                    invalid["stages"][0]["phases"][0]["lifecycles"][0][field] = invalid_value
                    with self.assertRaises(validator.Invalid):
                        validator.validate_document(invalid)

            invalid_evidence = copy.deepcopy(valid)
            invalid_evidence["stages"][0]["phases"][0]["lifecycles"][0]["improvement"]["evidence_refs"] = [{
                **artifact_ref(),
                "sha256": "invalid",
            }]
            with self.subTest(lifecycle_state=lifecycle_state, field="improvement.evidence_refs"):
                with self.assertRaises(validator.Invalid):
                    validator.validate_document(invalid_evidence)

    def test_completed_improve_phase_requires_a_valid_agentic_diagnosis(self) -> None:
        value = task(stages=[stage("IMPROVE", phases=[completed_phase("IMPROVE", 1)])])
        validator.validate_document(value)

        value = task(stages=[stage("IMPROVE", phases=[completed_phase("IMPROVE", 1)])])
        del value["stages"][0]["phases"][0]["lifecycles"][-1]["result"]["agentic_diagnosis"]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("IMPROVE", phases=[completed_phase("IMPROVE", 1)])])
        value["stages"][0]["phases"][0]["lifecycles"][-1]["result"]["agentic_diagnosis"]["hypotheses"] = [{
            "statement": "The checklist prevented rework.",
            "confidence": "CERTAIN",
            "evidence_refs": [],
            "disconfirming_check": "Compare the next task's review outcome.",
        }]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("IMPROVE", phases=[completed_phase("IMPROVE", 1)])])
        value["stages"][0]["phases"][0]["lifecycles"][-1]["result"]["agentic_diagnosis"]["hypotheses"] = [{
            "statement": "The checklist prevented rework.",
            "confidence": "MEDIUM",
            "evidence_refs": [],
        }]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("IMPROVE", phases=[completed_phase("IMPROVE", 1)])])
        value["stages"][0]["phases"][0]["lifecycles"][-1]["result"]["agentic_diagnosis"]["facts"][0]["evidence_refs"] = [{
            **artifact_ref(),
            "sha256": "invalid",
        }]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

        value = task(stages=[stage("IMPROVE", phases=[completed_phase("IMPROVE", 1)])])
        value["stages"][0]["phases"][0]["lifecycles"][-1]["result"]["agentic_diagnosis"]["extra"] = "not allowed"
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_artifact_requires_sha256(self) -> None:
        value = task()
        value["stages"][0]["phases"][0]["lifecycles"][0]["artifacts"] = [
            {"artifact_id": "a", "type": "patch", "revision": 1, "uri": "artifact://a", "sha256": "bad"}
        ]
        with self.assertRaises(validator.Invalid):
            validator.validate_document(value)

    def test_transition_freezes_completed_stage_and_phase_history(self) -> None:
        previous = task()
        previous["stages"][0]["phases"][0]["lifecycles"][0].update({
            "kind": "COMPLETE",
            "state": "SUCCEEDED",
            "result": {"summary": "defined"},
            "improvement": {"strengths": [], "frictions": [], "proposals": [], "evidence_refs": []},
        })
        current = advance(previous)
        current["stages"][0]["kind"] = "REFINE"
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

        current = advance(previous)
        current["stages"][0]["phases"][0]["lifecycles"][0]["result"] = {"summary": "rewritten"}
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)

    def test_transition_appends_lifecycle_steps_without_rewriting_history(self) -> None:
        previous = task()
        previous["stages"][0]["phases"][0]["lifecycles"][0].update({
            "state": "SUCCEEDED",
            "completed_at": "2026-07-13T00:01:30Z",
            "result": {"summary": "defined"},
            "improvement": {"strengths": [], "frictions": [], "proposals": [], "evidence_refs": []},
        })
        current = advance(previous)
        current["stages"][0]["phases"][0]["lifecycles"].append(lifecycle("EXECUTE", 2))
        validator.validate_transition(previous, current)

    def test_transition_appends_execute_phase_from_review_loop(self) -> None:
        previous = task(stages=[stage("EXECUTE", phases=[
            completed_phase("PLAN", 1),
            completed_phase("EXECUTE", 2),
            completed_phase("REVIEW", 3),
        ])])
        current = advance(previous)
        current["stages"][0]["phases"].append(phase("PLAN", 4))
        validator.validate_transition(previous, current)

    def test_root_resolves_task_scorecards_against_their_policy(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            other = task()
            other["task_id"] = "02TASK"
            policy_value = policy()
            primary = task()
            configure_task_for_policy(primary, policy_value)
            configure_task_for_policy(other, policy_value)
            for name, value in (
                ("policy.yaml", policy_value),
                ("task.yaml", primary),
                ("other.yaml", other),
                ("link.yaml", link()),
            ):
                (root / name).write_text(yaml.safe_dump(value), encoding="utf-8")
            # The digest intentionally binds the exact raw YAML bytes, so rewrite
            # tasks after preserving the same policy serialization.
            raw_policy = (root / "policy.yaml").read_bytes()
            for path in (root / "task.yaml", root / "other.yaml"):
                value = yaml.safe_load(path.read_text(encoding="utf-8"))
                value["scorecard"]["policy_sha256"] = hashlib.sha256(raw_policy).hexdigest()
                path.write_text(yaml.safe_dump(value), encoding="utf-8")
            validator.validate_root(root)

    def test_root_rejects_unknown_or_mismatched_scorecard_policies(self) -> None:
        def validate_with(mutator) -> None:
            with tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                policy_value = policy()
                task_value = task()
                (root / "policy.yaml").write_text(yaml.safe_dump(policy_value), encoding="utf-8")
                task_value["scorecard"] = scorecard()
                task_value["classification"] = classification()
                task_value["scorecard"].update({
                    "policy_id": policy_value["policy_id"],
                    "policy_sha256": hashlib.sha256((root / "policy.yaml").read_bytes()).hexdigest(),
                    "story_points": 3,
                    "target_elapsed_seconds": 3600,
                    "baseline_sample_size": 4,
                })
                mutator(task_value)
                (root / "task.yaml").write_text(yaml.safe_dump(task_value), encoding="utf-8")
                with self.assertRaises(validator.Invalid):
                    validator.validate_root(root)

        validate_with(lambda value: value["scorecard"].update(policy_id="unknown-policy"))
        validate_with(lambda value: value["scorecard"].update(policy_sha256="b" * 64))
        validate_with(lambda value: value["scorecard"].update(story_points=8))
        validate_with(lambda value: value["scorecard"].update(target_elapsed_seconds=7200))
        validate_with(lambda value: value["scorecard"].update(baseline_sample_size=5))

    def test_root_rejects_task_execution_and_duplicate_task_ids(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "execution.yaml").write_text(
                yaml.safe_dump({"schema_version": "1", "document_type": "task_execution"}), encoding="utf-8"
            )
            with self.assertRaises(validator.Invalid):
                validator.validate_root(root)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            policy_value = policy()
            first = task()
            second = task()
            (root / "policy.yaml").write_text(yaml.safe_dump(policy_value), encoding="utf-8")
            digest = hashlib.sha256((root / "policy.yaml").read_bytes()).hexdigest()
            for value in (first, second):
                value["classification"] = classification()
                value["scorecard"] = scorecard()
                value["scorecard"].update(policy_sha256=digest)
            (root / "one.yaml").write_text(yaml.safe_dump(first), encoding="utf-8")
            (root / "two.yaml").write_text(yaml.safe_dump(second), encoding="utf-8")
            with self.assertRaises(validator.Invalid):
                validator.validate_root(root)

    def test_task_link_rejects_self_reference_and_transition_rewrites(self) -> None:
        with self.assertRaises(validator.Invalid):
            validator.validate_document(link("01TASK", "01TASK"))

        previous = link()
        current = advance(previous)
        current["relationship_kind"] = "DEPENDENCY"
        with self.assertRaises(validator.Invalid):
            validator.validate_transition(previous, current)


if __name__ == "__main__":
    unittest.main()
