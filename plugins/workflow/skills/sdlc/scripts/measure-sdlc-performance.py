#!/usr/bin/env python3
"""Emit deterministic performance metrics from an SDLC task record."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
VALIDATOR_PATH = SCRIPT_DIR / "validate-sdlc-document.py"
SPEC = importlib.util.spec_from_file_location("sdlc_validator", VALIDATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load SDLC validator")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def phases(task: dict[str, Any]) -> list[dict[str, Any]]:
    return [phase for stage in task["stages"] for phase in stage["phases"]]


def lifecycles(task: dict[str, Any]) -> list[dict[str, Any]]:
    return [lifecycle for phase in phases(task) for lifecycle in phase["lifecycles"]]


def phase_is_complete(phase: dict[str, Any]) -> bool:
    terminal = phase["lifecycles"][-1]
    return terminal["kind"] == "COMPLETE" and terminal["state"] == "SUCCEEDED"


def round_half_up(numerator: int, denominator: int) -> int:
    """Round a non-negative rational number to the nearest integer, ties upward."""
    if denominator <= 0:
        raise ValueError("denominator must be positive")
    quotient, remainder = divmod(numerator, denominator)
    return quotient + (2 * remainder >= denominator)


def scorecard(
    task: dict[str, Any],
    *,
    verify_success_count: int,
    terminal_verify_count: int,
    first_pass_delivery: bool | None,
    review_count: int,
    rework_cycle_count: int,
    elapsed_seconds: int,
) -> dict[str, Any]:
    if task["scorecard"] is None:
        return {
            "status": "UNSCORED" if task["state"] == "CLOSED" else "PROVISIONAL",
            "acceptance_score": None,
            "verification_score": None,
            "correctness_score": None,
            "delivery_score": None,
            "pace_score": None,
            "sdlc_health_score": None,
        }
    verification_score = (
        None
        if terminal_verify_count == 0
        else round_half_up(verify_success_count * 100, terminal_verify_count)
    )
    if task["state"] != "CLOSED":
        return {
            "status": "PROVISIONAL",
            "acceptance_score": None,
            "verification_score": verification_score,
            "correctness_score": None,
            "delivery_score": None,
            "pace_score": None,
            "sdlc_health_score": None,
        }

    acceptance_score = 100 if task["outcome"] == "ACCEPTED" else 0
    correctness_score = (
        None
        if verification_score is None
        else round_half_up(7 * acceptance_score + 3 * verification_score, 10)
    )
    delivery_score = (
        None
        if first_pass_delivery is None or review_count == 0
        else round_half_up(100 * (review_count - rework_cycle_count), review_count)
    )
    pace_score = round_half_up(
        min(task["scorecard"]["target_elapsed_seconds"], elapsed_seconds) * 100,
        elapsed_seconds,
    )
    health_components = (correctness_score, delivery_score, pace_score)
    sdlc_health_score = (
        None
        if any(component is None for component in health_components)
        else round_half_up(5 * correctness_score + 3 * delivery_score + 2 * pace_score, 10)
    )
    return {
        "status": "FINAL",
        "acceptance_score": acceptance_score,
        "verification_score": verification_score,
        "correctness_score": correctness_score,
        "delivery_score": delivery_score,
        "pace_score": pace_score,
        "sdlc_health_score": sdlc_health_score,
    }


def measure(task: dict[str, Any]) -> dict[str, Any]:
    all_phases = phases(task)
    all_lifecycles = lifecycles(task)
    starts = [validator.parse_rfc3339(item["started_at"], "lifecycle.started_at") for item in all_lifecycles]
    completions = [
        validator.parse_rfc3339(item["completed_at"], "lifecycle.completed_at")
        for item in all_lifecycles
        if item["completed_at"] is not None
    ]
    elapsed_end = max([*starts, *completions])
    elapsed_seconds = int((elapsed_end - min(starts)).total_seconds())

    verify_lifecycles = [
        item for item in all_lifecycles
        if item["kind"] == "VERIFY" and item["state"] in validator.TERMINAL_LIFECYCLE_STATES
    ]
    verification_success_rate = (
        sum(item["state"] == "SUCCEEDED" for item in verify_lifecycles) / len(verify_lifecycles)
        if verify_lifecycles else None
    )

    execute_paths = [stage["phases"] for stage in task["stages"] if stage["kind"] == "EXECUTE"]
    review_count = sum(phase["kind"] == "REVIEW" for path in execute_paths for phase in path)
    rework_cycle_count = sum(
        current["kind"] == "REVIEW" and following["kind"] in {"PLAN", "EXECUTE"}
        for path in execute_paths
        for current, following in zip(path, path[1:])
    )
    shipped = any(
        phase["kind"] == "SHIP" and phase_is_complete(phase)
        for path in execute_paths
        for phase in path
    )
    first_pass_delivery = rework_cycle_count == 0 if shipped else None

    return {
        "elapsed_seconds": elapsed_seconds,
        "stage_count": len(task["stages"]),
        "phase_count": len(all_phases),
        "lifecycle_count": len(all_lifecycles),
        "completed_phase_count": sum(phase_is_complete(phase) for phase in all_phases),
        "review_count": review_count,
        "rework_cycle_count": rework_cycle_count,
        "first_pass_delivery": first_pass_delivery,
        "verification_success_rate": verification_success_rate,
        "scorecard": scorecard(
            task,
            verify_success_count=sum(item["state"] == "SUCCEEDED" for item in verify_lifecycles),
            terminal_verify_count=len(verify_lifecycles),
            first_pass_delivery=first_pass_delivery,
            review_count=review_count,
            rework_cycle_count=rework_cycle_count,
            elapsed_seconds=elapsed_seconds,
        ),
    }


def measure_cohort(root: Path) -> dict[str, Any]:
    closed_scorecards = []
    active_task_count = 0
    for path in sorted(root.rglob("*.yaml")):
        if "/artifacts/" in path.as_posix():
            continue
        task = validator.load(path)
        validator.validate_document(task)
        if task["document_type"] != "task":
            continue
        if task["state"] == "CLOSED":
            closed_scorecards.append(measure(task)["scorecard"])
        else:
            active_task_count += 1

    def average(field: str) -> int | None:
        values = [scorecard[field] for scorecard in closed_scorecards if scorecard[field] is not None]
        return round_half_up(sum(values), len(values)) if values else None

    return {
        "closed_task_count": len(closed_scorecards),
        "active_task_count": active_task_count,
        "sdlc_health_score": average("sdlc_health_score"),
        "correctness_score": average("correctness_score"),
        "delivery_score": average("delivery_score"),
        "pace_score": average("pace_score"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", type=Path, help="SDLC task YAML document")
    parser.add_argument("--cohort", type=Path, help="directory of task YAML documents")
    args = parser.parse_args()
    try:
        if (args.path is None) == (args.cohort is None):
            raise validator.Invalid("provide exactly one of path or --cohort")
        if args.cohort is not None:
            print(json.dumps(measure_cohort(args.cohort), sort_keys=True))
            return 0
        task = validator.load(args.path)
        validator.validate_document(task)
        if task["document_type"] != "task":
            raise validator.Invalid("performance metrics require a task document")
        print(json.dumps(measure(task), sort_keys=True))
    except validator.Invalid as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
