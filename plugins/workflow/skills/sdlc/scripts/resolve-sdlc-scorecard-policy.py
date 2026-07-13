#!/usr/bin/env python3
"""Resolve one immutable Task scorecard from a scorecard policy entry."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sdlc_validator", SCRIPT_DIR / "validate-sdlc-document.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("cannot load SDLC validator")
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def resolve(path: Path, story_points: int) -> dict[str, object]:
    policy = validator.load(path)
    validator.validate_document(policy)
    if policy["document_type"] != "scorecard_policy":
        raise validator.Invalid("scorecard resolution requires a scorecard_policy document")
    entry = next(
        (
            item
            for item in policy["entries"]
            if item["story_points"] == story_points
        ),
        None,
    )
    if entry is None:
        raise validator.Invalid("scorecard policy has no matching story_points")
    return {
        "classification": {"story_points": entry["story_points"]},
        "scorecard": {
            "policy_id": policy["policy_id"],
            "policy_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "story_points": entry["story_points"],
            "target_elapsed_seconds": entry["target_elapsed_seconds"],
            "baseline_sample_size": entry["sample_size"],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("policy", type=Path)
    parser.add_argument("story_points", type=int)
    args = parser.parse_args()
    try:
        print(json.dumps(resolve(args.policy, args.story_points), sort_keys=True))
    except validator.Invalid as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
