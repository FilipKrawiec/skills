from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "measure-sdlc-performance.py"
BASE_TIME = datetime(2026, 7, 13, 9, 0, tzinfo=timezone.utc)


def timestamp(offset_seconds: int) -> str:
    return (BASE_TIME + timedelta(seconds=offset_seconds)).isoformat().replace("+00:00", "Z")


def lifecycle(kind: str, sequence: int, *, state: str = "SUCCEEDED") -> dict:
    start = (sequence - 1) * 60
    return {
        "lifecycle_id": f"01L{sequence}",
        "kind": kind,
        "sequence": sequence,
        "state": state,
        "started_at": timestamp(start),
        "completed_at": timestamp(start + 30) if state != "ACTIVE" else None,
        "result": {"summary": kind} if state != "ACTIVE" else None,
        "improvement": {"strengths": [], "frictions": [], "proposals": [], "evidence_refs": []}
        if state != "ACTIVE"
        else None,
        "artifacts": [],
    }


def agentic_diagnosis() -> dict:
    return {
        "facts": [{"statement": "The recorded evidence supports this improvement.", "evidence_refs": []}],
        "hypotheses": [],
        "recommendation": {
            "action": "Keep the effective workflow control.",
            "expected_signal": "Comparable tasks retain the same result.",
            "success_criterion": "The next comparable task meets its acceptance criteria.",
        },
    }


def completed_phase(kind: str, sequence: int, *, base: int) -> dict:
    steps = ["DEFINE", "EXECUTE", "VERIFY", "IMPROVE", "COMPLETE"]
    phase = {
        "phase_id": f"01P{sequence}",
        "kind": kind,
        "sequence": sequence,
        "lifecycles": [
            {
                **lifecycle(step, index + 1),
                "lifecycle_id": f"01L{sequence}{index + 1}",
                "started_at": timestamp(base + index * 60),
                "completed_at": timestamp(base + index * 60 + 30),
            }
            for index, step in enumerate(steps)
        ],
    }
    if kind == "IMPROVE":
        phase["lifecycles"][-1]["result"]["agentic_diagnosis"] = agentic_diagnosis()
    return phase


def active_phase(kind: str, sequence: int, *, base: int) -> dict:
    return {
        "phase_id": f"01P{sequence}",
        "kind": kind,
        "sequence": sequence,
        "lifecycles": [
            {
                **lifecycle("DEFINE", 1, state="ACTIVE"),
                "lifecycle_id": f"01L{sequence}1",
                "started_at": timestamp(base),
            }
        ],
    }


def stage(kind: str, sequence: int, phases: list[dict]) -> dict:
    return {"stage_id": f"01S{sequence}", "kind": kind, "sequence": sequence, "phases": phases}


def completed_improve_stage(sequence: int, *, base: int) -> dict:
    return stage("IMPROVE", sequence, [completed_phase("IMPROVE", 1, base=base)])


def task(
    stages: list[dict],
    *,
    state: str = "ACTIVE",
    target_elapsed_seconds: int = 2070,
    scorecard_value: dict | None | object = ...,
    classification_value: dict | None | object = ...,
) -> dict:
    if scorecard_value is ...:
        scorecard_value = {
            "policy_id": "delivery-baseline-2026-q3",
            "policy_sha256": "a" * 64,
            "story_points": 3,
            "target_elapsed_seconds": target_elapsed_seconds,
            "baseline_sample_size": 4,
        }
    if classification_value is ...:
        classification_value = (
            {"story_points": 3}
            if scorecard_value is not None
            else None
        )
    return {
        "schema_version": "1",
        "document_type": "task",
        "task_id": "01TASK",
        "revision": 1,
        "state": state,
        "outcome": "ACCEPTED" if state == "CLOSED" else None,
        "classification": classification_value,
        "scorecard": scorecard_value,
        "stages": stages,
        "audit": [{"sequence": 1, "event": "Created", "actor": "tester", "occurred_at": timestamp(0)}],
    }


def measure(snapshot: dict) -> dict:
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "task.yaml"
        path.write_text(yaml.safe_dump(snapshot), encoding="utf-8")
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), str(path)],
            check=False,
            capture_output=True,
            text=True,
        )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


def measure_cohort(snapshots: list[tuple[str, dict]]) -> dict:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for relative_path, snapshot in snapshots:
            path = root / relative_path
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(yaml.safe_dump(snapshot), encoding="utf-8")
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), "--cohort", str(root)],
            check=False,
            capture_output=True,
            text=True,
        )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


class MeasureSdlcPerformanceTest(unittest.TestCase):
    def test_emits_exact_metrics_for_a_first_pass_closed_delivery(self) -> None:
        snapshot = task(
            [
                stage("DEFINE", 1, [completed_phase("DEFINE", 1, base=0)]),
                stage("REFINE", 2, [completed_phase("REFINE", 1, base=300)]),
                stage(
                    "EXECUTE",
                    3,
                    [
                        completed_phase("PLAN", 1, base=600),
                        completed_phase("EXECUTE", 2, base=900),
                        completed_phase("REVIEW", 3, base=1200),
                        completed_phase("SHIP", 4, base=1500),
                    ],
                ),
                stage("IMPROVE", 4, [completed_phase("IMPROVE", 1, base=1800)]),
            ],
            state="CLOSED",
        )

        self.assertEqual(
            measure(snapshot),
            {
                "elapsed_seconds": 2070,
                "stage_count": 4,
                "phase_count": 7,
                "lifecycle_count": 35,
                "completed_phase_count": 7,
                "review_count": 1,
                "rework_cycle_count": 0,
                "first_pass_delivery": True,
                "verification_success_rate": 1.0,
                "scorecard": {
                    "status": "FINAL",
                    "acceptance_score": 100,
                    "verification_score": 100,
                    "correctness_score": 100,
                    "delivery_score": 100,
                    "pace_score": 100,
                    "sdlc_health_score": 100,
                },
            },
        )

    def test_counts_review_driven_rework_from_the_execute_phase_path(self) -> None:
        snapshot = task(
            [
                stage(
                    "EXECUTE",
                    1,
                    [
                        completed_phase("PLAN", 1, base=0),
                        completed_phase("EXECUTE", 2, base=300),
                        completed_phase("REVIEW", 3, base=600),
                        completed_phase("PLAN", 4, base=900),
                        completed_phase("EXECUTE", 5, base=1200),
                        completed_phase("REVIEW", 6, base=1500),
                        completed_phase("SHIP", 7, base=1800),
                    ],
                )
            ]
        )

        self.assertEqual(
            measure(snapshot),
            {
                "elapsed_seconds": 2070,
                "stage_count": 1,
                "phase_count": 7,
                "lifecycle_count": 35,
                "completed_phase_count": 7,
                "review_count": 2,
                "rework_cycle_count": 1,
                "first_pass_delivery": False,
                "verification_success_rate": 1.0,
                "scorecard": {
                    "status": "PROVISIONAL",
                    "acceptance_score": None,
                    "verification_score": 100,
                    "correctness_score": None,
                    "delivery_score": None,
                    "pace_score": None,
                    "sdlc_health_score": None,
                },
            },
        )

    def test_reports_null_for_metrics_without_a_terminal_verify_or_ship_phase(self) -> None:
        snapshot = task([stage("DEFINE", 1, [active_phase("DEFINE", 1, base=0)])])

        self.assertEqual(
            measure(snapshot),
            {
                "elapsed_seconds": 0,
                "stage_count": 1,
                "phase_count": 1,
                "lifecycle_count": 1,
                "completed_phase_count": 0,
                "review_count": 0,
                "rework_cycle_count": 0,
                "first_pass_delivery": None,
                "verification_success_rate": None,
                "scorecard": {
                    "status": "PROVISIONAL",
                    "acceptance_score": None,
                    "verification_score": None,
                    "correctness_score": None,
                    "delivery_score": None,
                    "pace_score": None,
                    "sdlc_health_score": None,
                },
            },
        )

    def test_emits_raw_provisional_metrics_for_an_unbound_define_task(self) -> None:
        snapshot = task(
            [stage("DEFINE", 1, [active_phase("DEFINE", 1, base=0)])],
            scorecard_value=None,
        )

        self.assertEqual(
            measure(snapshot),
            {
                "elapsed_seconds": 0,
                "stage_count": 1,
                "phase_count": 1,
                "lifecycle_count": 1,
                "completed_phase_count": 0,
                "review_count": 0,
                "rework_cycle_count": 0,
                "first_pass_delivery": None,
                "verification_success_rate": None,
                "scorecard": {
                    "status": "PROVISIONAL",
                    "acceptance_score": None,
                    "verification_score": None,
                    "correctness_score": None,
                    "delivery_score": None,
                    "pace_score": None,
                    "sdlc_health_score": None,
                },
            },
        )

    def test_emits_unscored_raw_metrics_for_a_closed_calibration_task(self) -> None:
        snapshot = task(
            [
                stage("DEFINE", 1, [completed_phase("DEFINE", 1, base=0)]),
                stage("REFINE", 2, [completed_phase("REFINE", 1, base=300)]),
                stage("EXECUTE", 3, [
                    completed_phase("PLAN", 1, base=600),
                    completed_phase("EXECUTE", 2, base=900),
                    completed_phase("REVIEW", 3, base=1200),
                    completed_phase("SHIP", 4, base=1500),
                ]),
                stage("IMPROVE", 4, [completed_phase("IMPROVE", 1, base=1800)]),
            ],
            state="CLOSED",
            scorecard_value=None,
            classification_value={"story_points": 3},
        )

        self.assertEqual(
            measure(snapshot),
            {
                "elapsed_seconds": 2070,
                "stage_count": 4,
                "phase_count": 7,
                "lifecycle_count": 35,
                "completed_phase_count": 7,
                "review_count": 1,
                "rework_cycle_count": 0,
                "first_pass_delivery": True,
                "verification_success_rate": 1.0,
                "scorecard": {
                    "status": "UNSCORED",
                    "acceptance_score": None,
                    "verification_score": None,
                    "correctness_score": None,
                    "delivery_score": None,
                    "pace_score": None,
                    "sdlc_health_score": None,
                },
            },
        )

    def test_elapsed_ends_at_the_started_at_of_a_later_active_lifecycle(self) -> None:
        active_execute = {
            **lifecycle("EXECUTE", 2, state="ACTIVE"),
            "started_at": timestamp(600),
        }
        snapshot = task(
            [
                stage(
                    "DEFINE",
                    1,
                    [
                        {
                            "phase_id": "01P1",
                            "kind": "DEFINE",
                            "sequence": 1,
                            "lifecycles": [
                                {
                                    **lifecycle("DEFINE", 1),
                                    "started_at": timestamp(0),
                                    "completed_at": timestamp(30),
                                },
                                active_execute,
                            ],
                        }
                    ],
                )
            ]
        )

        self.assertEqual(measure(snapshot)["elapsed_seconds"], 600)

    def test_uses_terminal_verify_states_for_the_success_rate(self) -> None:
        failed_verify = {
            "phase_id": "01P2",
            "kind": "EXECUTE",
            "sequence": 2,
            "lifecycles": [
                {
                    **lifecycle("DEFINE", 1),
                    "started_at": timestamp(300),
                    "completed_at": timestamp(330),
                },
                {
                    **lifecycle("EXECUTE", 2),
                    "started_at": timestamp(360),
                    "completed_at": timestamp(390),
                },
                {
                    **lifecycle("VERIFY", 3, state="FAILED"),
                    "started_at": timestamp(420),
                    "completed_at": timestamp(450),
                },
            ],
        }
        snapshot = task(
            [stage("EXECUTE", 1, [completed_phase("PLAN", 1, base=0), failed_verify])]
        )

        metrics = measure(snapshot)

        self.assertEqual(metrics["elapsed_seconds"], 450)
        self.assertEqual(metrics["verification_success_rate"], 0.5)
        self.assertIsNone(metrics["first_pass_delivery"])

    def test_emits_final_health_score_for_accepted_reworked_delivery(self) -> None:
        snapshot = task(
            [
                stage(
                    "EXECUTE",
                    1,
                    [
                        completed_phase("PLAN", 1, base=0),
                        completed_phase("EXECUTE", 2, base=300),
                        completed_phase("REVIEW", 3, base=600),
                        completed_phase("PLAN", 4, base=900),
                        completed_phase("EXECUTE", 5, base=1200),
                        completed_phase("REVIEW", 6, base=1500),
                        completed_phase("SHIP", 7, base=1800),
                    ],
                ),
                completed_improve_stage(2, base=2100),
            ],
            state="CLOSED",
            target_elapsed_seconds=1185,
        )

        scorecard = measure(snapshot)["scorecard"]

        self.assertEqual(
            scorecard,
            {
                "status": "FINAL",
                "acceptance_score": 100,
                "verification_score": 100,
                "correctness_score": 100,
                "delivery_score": 50,
                "pace_score": 50,
                "sdlc_health_score": 75,
            },
        )

    def test_weights_rejected_acceptance_and_health_score_exactly(self) -> None:
        snapshot = task(
            [
                stage(
                    "EXECUTE",
                    1,
                    [
                        completed_phase("PLAN", 1, base=0),
                        completed_phase("EXECUTE", 2, base=300),
                        completed_phase("REVIEW", 3, base=600),
                        completed_phase("PLAN", 4, base=900),
                        completed_phase("EXECUTE", 5, base=1200),
                        completed_phase("REVIEW", 6, base=1500),
                        completed_phase("SHIP", 7, base=1800),
                    ],
                ),
                completed_improve_stage(2, base=2100),
            ],
            state="CLOSED",
            target_elapsed_seconds=2370,
        )
        snapshot["outcome"] = "REJECTED"

        self.assertEqual(
            measure(snapshot)["scorecard"],
            {
                "status": "FINAL",
                "acceptance_score": 0,
                "verification_score": 100,
                "correctness_score": 30,
                "delivery_score": 50,
                "pace_score": 100,
                "sdlc_health_score": 50,
            },
        )

    def test_delivery_score_uses_each_review_and_rework_transition(self) -> None:
        phase_kinds = [
            "PLAN", "EXECUTE", "REVIEW",
            "PLAN", "EXECUTE", "REVIEW",
            "PLAN", "EXECUTE", "REVIEW", "SHIP",
        ]
        phases = []
        for sequence, kind in enumerate(phase_kinds, start=1):
            value = completed_phase(kind, sequence, base=(sequence - 1) * 300)
            value["lifecycles"][2]["state"] = "FAILED"
            phases.append(value)
        snapshot = task(
            [
                stage("EXECUTE", 1, phases),
                completed_improve_stage(2, base=3000),
            ],
            state="CLOSED",
            target_elapsed_seconds=2453,
        )

        self.assertEqual(
            measure(snapshot)["scorecard"],
            {
                "status": "FINAL",
                "acceptance_score": 100,
                "verification_score": 9,
                "correctness_score": 73,
                "delivery_score": 33,
                "pace_score": 75,
                "sdlc_health_score": 61,
            },
        )

    def test_cohort_uses_only_closed_task_scorecards(self) -> None:
        closed = task(
            [
                stage("DEFINE", 1, [completed_phase("DEFINE", 1, base=0)]),
                stage("REFINE", 2, [completed_phase("REFINE", 1, base=300)]),
                stage("EXECUTE", 3, [
                    completed_phase("PLAN", 1, base=600),
                    completed_phase("EXECUTE", 2, base=900),
                    completed_phase("REVIEW", 3, base=1200),
                    completed_phase("SHIP", 4, base=1500),
                ]),
                stage("IMPROVE", 4, [completed_phase("IMPROVE", 1, base=1800)]),
            ],
            state="CLOSED",
        )
        active = task([stage("DEFINE", 1, [active_phase("DEFINE", 1, base=0)])])
        active["task_id"] = "02TASK"

        self.assertEqual(
            measure_cohort([
                ("archive/closed-task.yaml", closed),
                ("active/task.yaml", active),
            ]),
            {
                "closed_task_count": 1,
                "active_task_count": 1,
                "sdlc_health_score": 100,
                "correctness_score": 100,
                "delivery_score": 100,
                "pace_score": 100,
            },
        )


if __name__ == "__main__":
    unittest.main()
