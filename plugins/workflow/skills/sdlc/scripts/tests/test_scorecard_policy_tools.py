from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[2]
RESOLVER = ROOT / "scripts" / "resolve-sdlc-scorecard-policy.py"
DERIVER = ROOT / "scripts" / "derive-sdlc-scorecard-policy.py"
VALIDATOR_SCRIPT = ROOT / "scripts" / "validate-sdlc-document.py"
SPEC = importlib.util.spec_from_file_location("validator", VALIDATOR_SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)
BASE_TIME = datetime(2026, 7, 13, 9, 0, tzinfo=timezone.utc)


def timestamp(offset_seconds: int) -> str:
    return (BASE_TIME + timedelta(seconds=offset_seconds)).isoformat().replace("+00:00", "Z")


def policy(entries: list[dict] | None = None) -> dict:
    return {
        "schema_version": "1",
        "document_type": "scorecard_policy",
        "policy_id": "delivery-baseline-2026-q3",
        "revision": 0,
        "minimum_sample_size": 4,
        "entries": entries if entries is not None else [
            {
                "story_points": 3,
                "target_elapsed_seconds": 300,
                "sample_size": 4,
            },
        ],
        "audit": [{
            "sequence": 1,
            "event": "Derived",
            "actor": "scorecard-policy-deriver",
            "occurred_at": "2026-07-13T10:00:00Z",
        }],
    }


def closed_task(task_id: str, elapsed_seconds: int, *, story_points: int = 3) -> dict:
    timestamps = [elapsed_seconds * index // 10 for index in range(11)]

    def completed_phase(kind: str, stage_sequence: int, start_index: int) -> dict:
        lifecycles = []
        for sequence, lifecycle_kind in enumerate(("DEFINE", "EXECUTE", "VERIFY", "IMPROVE", "COMPLETE"), start=1):
            result = {"summary": lifecycle_kind}
            if kind == "IMPROVE" and lifecycle_kind == "COMPLETE":
                result["agentic_diagnosis"] = {
                    "facts": [{"statement": "Recorded delivery evidence was reviewed.", "evidence_refs": []}],
                    "hypotheses": [],
                    "recommendation": {
                        "action": "Retain the current delivery controls.",
                        "expected_signal": "Comparable tasks retain accepted outcomes.",
                        "success_criterion": "The next comparable task is accepted.",
                    },
                }
            lifecycles.append({
                "lifecycle_id": f"{task_id}-S{stage_sequence}-L{sequence}",
                "kind": lifecycle_kind,
                "sequence": sequence,
                "state": "SUCCEEDED",
                "started_at": timestamp(timestamps[start_index + sequence - 1]),
                "completed_at": timestamp(timestamps[start_index + sequence]),
                "result": result,
                "improvement": {"strengths": [], "frictions": [], "proposals": [], "evidence_refs": []},
                "artifacts": [],
            })
        return {
            "phase_id": f"{task_id}-P{stage_sequence}",
            "kind": kind,
            "sequence": 1,
            "lifecycles": lifecycles,
        }

    return {
        "schema_version": "1",
        "document_type": "task",
        "task_id": task_id,
        "revision": 1,
        "state": "CLOSED",
        "outcome": "ACCEPTED",
        "classification": {
            "story_points": story_points,
        },
        "scorecard": None,
        "stages": [
            {
                "stage_id": f"{task_id}-S1",
                "kind": "DEFINE",
                "sequence": 1,
                "phases": [completed_phase("DEFINE", 1, 0)],
            },
            {
                "stage_id": f"{task_id}-S2",
                "kind": "IMPROVE",
                "sequence": 2,
                "phases": [completed_phase("IMPROVE", 2, 5)],
            },
        ],
        "audit": [{
            "sequence": 1,
            "event": "Created",
            "actor": "tester",
            "occurred_at": timestamp(0),
        }],
    }


class ScorecardPolicyToolsTest(unittest.TestCase):
    def test_resolver_emits_the_exact_task_update_envelope_for_a_policy_entry(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.yaml"
            raw_policy = yaml.safe_dump(policy(), sort_keys=False)
            path.write_text(raw_policy, encoding="utf-8")

            completed = subprocess.run(
                [sys.executable, str(RESOLVER), str(path), "3"],
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(
            json.loads(completed.stdout),
            {
                "classification": {
                    "story_points": 3,
                },
                "scorecard": {
                    "policy_id": "delivery-baseline-2026-q3",
                    "policy_sha256": hashlib.sha256(raw_policy.encode("utf-8")).hexdigest(),
                    "story_points": 3,
                    "target_elapsed_seconds": 300,
                    "baseline_sample_size": 4,
                },
            },
        )

    def test_resolver_rejects_unknown_story_points(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "policy.yaml"
            path.write_text(yaml.safe_dump(policy()), encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(RESOLVER), str(path), "8"],
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertNotEqual(completed.returncode, 0)

    def test_deriver_builds_a_valid_p75_policy_from_closed_comparable_tasks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cohort = root / "cohort"
            cohort.mkdir()
            for task_id, elapsed in (("01TASK", 100), ("02TASK", 200), ("03TASK", 300), ("04TASK", 400)):
                (cohort / f"{task_id}.yaml").write_text(
                    yaml.safe_dump(closed_task(task_id, elapsed)), encoding="utf-8"
                )
            (cohort / "under-sampled.yaml").write_text(
                yaml.safe_dump(closed_task("05TASK", 999, story_points=2)), encoding="utf-8"
            )
            output = root / "policy.yaml"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(DERIVER),
                    "--cohort", str(cohort),
                    "--policy-id", "delivery-baseline-2026-q3",
                    "--minimum-sample-size", "4",
                    "--occurred-at", "2026-07-13T10:00:00Z",
                    "--output", str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(completed.returncode, 0, completed.stderr)
            derived = yaml.safe_load(output.read_text(encoding="utf-8"))

        self.assertEqual(
            derived,
            policy(),
        )
        validator.validate_document(derived)

    def test_deriver_fails_when_no_group_reaches_the_minimum_sample_size(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cohort = root / "cohort"
            cohort.mkdir()
            (cohort / "task.yaml").write_text(
                yaml.safe_dump(closed_task("01TASK", 100)), encoding="utf-8"
            )
            output = root / "policy.yaml"
            completed = subprocess.run(
                [
                    sys.executable,
                    str(DERIVER),
                    "--cohort", str(cohort),
                    "--policy-id", "delivery-baseline-2026-q3",
                    "--minimum-sample-size", "4",
                    "--occurred-at", "2026-07-13T10:00:00Z",
                    "--output", str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertNotEqual(completed.returncode, 0)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
