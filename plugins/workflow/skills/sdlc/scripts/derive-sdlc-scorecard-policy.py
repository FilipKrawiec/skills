#!/usr/bin/env python3
"""Derive deterministic P75 scorecard-policy entries from a closed Task cohort."""

from __future__ import annotations

import argparse
import importlib.util
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sdlc_validator", SCRIPT_DIR / "validate-sdlc-document.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load SDLC validator")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def elapsed_seconds(task: dict[str, Any]) -> int:
    lifecycles = [
        lifecycle
        for stage in task["stages"]
        for phase in stage["phases"]
        for lifecycle in phase["lifecycles"]
    ]
    starts = [validator.parse_rfc3339(item["started_at"], "lifecycle.started_at") for item in lifecycles]
    ends = [
        validator.parse_rfc3339(item["completed_at"], "lifecycle.completed_at")
        for item in lifecycles
        if item["completed_at"] is not None
    ]
    return int((max([*starts, *ends]) - min(starts)).total_seconds())


def percentile_75(values: list[int]) -> int:
    ordered = sorted(values)
    return ordered[math.ceil(3 * len(ordered) / 4) - 1]


def derive(cohort: Path, policy_id: str, minimum_sample_size: int, occurred_at: str) -> dict[str, Any]:
    validator.text(policy_id, "policy_id")
    validator.positive(minimum_sample_size, "minimum_sample_size")
    validator.parse_rfc3339(occurred_at, "occurred_at")
    groups: dict[str, list[int]] = defaultdict(list)
    for path in sorted(cohort.rglob("*.yaml")):
        if "/artifacts/" in path.as_posix():
            continue
        document = validator.load(path)
        validator.validate_document(document)
        if document["document_type"] != "task" or document["state"] != "CLOSED":
            continue
        classification = document["classification"]
        if classification is None:
            continue
        groups[classification["story_points"]].append(elapsed_seconds(document))
    entries = [
        {
            "story_points": story_points,
            "target_elapsed_seconds": percentile_75(values),
            "sample_size": len(values),
        }
        for story_points, values in sorted(groups.items())
        if len(values) >= minimum_sample_size
    ]
    if not entries:
        raise validator.Invalid("no closed story-points group reaches minimum_sample_size")
    policy = {
        "schema_version": "1",
        "document_type": "scorecard_policy",
        "policy_id": policy_id,
        "revision": 0,
        "minimum_sample_size": minimum_sample_size,
        "entries": entries,
        "audit": [
            {
                "sequence": 1,
                "event": "Derived",
                "actor": "scorecard-policy-deriver",
                "occurred_at": occurred_at,
            }
        ],
    }
    validator.validate_document(policy)
    return policy


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--policy-id", required=True)
    parser.add_argument("--minimum-sample-size", type=int, required=True)
    parser.add_argument("--occurred-at", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        policy = derive(args.cohort, args.policy_id, args.minimum_sample_size, args.occurred_at)
        args.output.write_text(yaml.safe_dump(policy, sort_keys=False), encoding="utf-8")
    except (OSError, validator.Invalid) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
