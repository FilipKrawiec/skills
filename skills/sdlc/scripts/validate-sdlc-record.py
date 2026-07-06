#!/usr/bin/env python3
"""Validate the structure of SDLC YAML record files inside .sdlc/issues/."""

from __future__ import annotations

import re
import sys
from pathlib import Path

import yaml

VALID_PHASES = {"DEFINE", "SPEC", "PLAN", "EXECUTE", "REVIEW", "SHIP", "IMPROVE"}
VALID_STAGES = {"INITIALIZATION", "CONFIGURATION", "EXECUTION", "VERIFY", "IMPROVE"}
VALID_STATUSES = {"PENDING", "IN_PROGRESS", "COMPLETED"}


def require_keys(mapping: dict, keys: set[str], context: str) -> None:
    """Fail when a mapping is missing required keys."""
    missing = keys - set(mapping.keys())
    if missing:
        print(f"Error: Missing keys in {context}: {sorted(missing)}", file=sys.stderr)
        sys.exit(1)


def require_mapping(value: object, context: str) -> dict:
    """Return value as dict or fail with a useful schema error."""
    if not isinstance(value, dict):
        print(f"Error: {context} must be a dictionary block", file=sys.stderr)
        sys.exit(1)
    return value


def require_list(value: object, context: str) -> None:
    """Fail when a value is not a YAML list."""
    if not isinstance(value, list):
        print(f"Error: {context} must be a list", file=sys.stderr)
        sys.exit(1)


def validate_record(file_path: Path) -> None:
    """Validate SDLC record structure and contents."""
    print(f"Validating SDLC record: {file_path.name}")
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Error reading file: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        print(f"Error: Invalid YAML in {file_path.name}: {exc}", file=sys.stderr)
        sys.exit(1)
    data = require_mapping(data, "record")

    # 1. Top level keys validation
    required_top_keys = {"ticket", "title", "mode", "current_phase", "lifecycle_stage", "iteration", "harness", "phases"}
    require_keys(data, required_top_keys, "top-level record")

    # 2. Field values validation
    if data["mode"] not in {"hil", "afk"}:
        print(f"Error: 'mode' must be 'hil' or 'afk', got '{data['mode']}'", file=sys.stderr)
        sys.exit(1)

    if data["current_phase"] not in VALID_PHASES:
        print(f"Error: 'current_phase' must be one of {VALID_PHASES}, got '{data['current_phase']}'", file=sys.stderr)
        sys.exit(1)

    if data["lifecycle_stage"] not in VALID_STAGES:
        print(f"Error: 'lifecycle_stage' must be one of {VALID_STAGES}, got '{data['lifecycle_stage']}'", file=sys.stderr)
        sys.exit(1)

    # Validate iteration index pattern (e.g. "00")
    if not isinstance(data["iteration"], str) or not re.match(r"^\d{2}$", data["iteration"]):
        print(f"Error: 'iteration' must be a two-digit string (e.g., '00'), got '{data['iteration']}'", file=sys.stderr)
        sys.exit(1)

    # 3. Harness block validation
    harness = require_mapping(data["harness"], "harness")
    require_keys(harness, {"topology", "sandbox", "guides", "sensors", "approval", "event_log"}, "harness")
    sandbox = require_mapping(harness["sandbox"], "harness.sandbox")
    require_keys(sandbox, {"strategy", "image", "limits"}, "harness.sandbox")
    limits = require_mapping(sandbox["limits"], "harness.sandbox.limits")
    require_keys(limits, {"max_correction_attempts"}, "harness.sandbox.limits")
    guides = require_mapping(harness["guides"], "harness.guides")
    require_keys(guides, {"selected"}, "harness.guides")
    require_list(guides["selected"], "harness.guides.selected")
    sensors = require_mapping(harness["sensors"], "harness.sensors")
    require_keys(sensors, {"computational", "inferential"}, "harness.sensors")
    require_list(sensors["computational"], "harness.sensors.computational")
    require_list(sensors["inferential"], "harness.sensors.inferential")
    approval = require_mapping(harness["approval"], "harness.approval")
    require_keys(approval, {"human_required"}, "harness.approval")
    require_list(harness["event_log"], "harness.event_log")

    # 4. Phases block validation
    phases = require_mapping(data["phases"], "phases")

    missing_phases = VALID_PHASES - set(phases.keys())
    if missing_phases:
        print(f"Error: Missing phase blocks: {missing_phases}", file=sys.stderr)
        sys.exit(1)

    for phase_name, phase_data in phases.items():
        if not isinstance(phase_data, dict):
            print(f"Error: Phase block '{phase_name}' must be a dictionary", file=sys.stderr)
            sys.exit(1)

        # Status validation
        if "status" not in phase_data:
            print(f"Error: Missing 'status' in phase '{phase_name}'", file=sys.stderr)
            sys.exit(1)
        if phase_data["status"] not in VALID_STATUSES:
            print(f"Error: Invalid status '{phase_data['status']}' in phase '{phase_name}'. Must be one of {VALID_STATUSES}", file=sys.stderr)
            sys.exit(1)

        # Improvements list validation
        if "improvements" not in phase_data:
            print(f"Error: Missing 'improvements' list in phase '{phase_name}'", file=sys.stderr)
            sys.exit(1)

        # Check sub-blocks based on completion status
        if phase_name == "DEFINE" and phase_data["status"] in {"IN_PROGRESS", "COMPLETED"}:
            if "brief" not in phase_data or not isinstance(phase_data["brief"], dict):
                print("Error: DEFINE phase is active/completed but missing 'brief' dictionary", file=sys.stderr)
                sys.exit(1)
            required_brief_keys = {"summary", "context", "constraints", "acceptance_criteria", "non_goals"}
            require_keys(phase_data["brief"], required_brief_keys, "brief")

        elif phase_name == "SPEC" and phase_data["status"] == "COMPLETED":
            if "spec" not in phase_data or not isinstance(phase_data["spec"], dict):
                print("Error: SPEC phase completed but missing 'spec' dictionary", file=sys.stderr)
                sys.exit(1)
            required_spec_keys = {
                "design_boundaries",
                "affected_components",
                "architectural_decisions",
                "observability_requirements",
                "guide_requirements",
                "sensor_requirements",
                "grill_results",
            }
            require_keys(phase_data["spec"], required_spec_keys, "spec")

        elif phase_name == "PLAN" and phase_data["status"] == "COMPLETED":
            if "plan" not in phase_data or not isinstance(phase_data["plan"], dict):
                print("Error: PLAN phase completed but missing 'plan' dictionary", file=sys.stderr)
                sys.exit(1)
            if "approved" not in phase_data:
                print("Error: PLAN phase completed but missing 'approved' key", file=sys.stderr)
                sys.exit(1)
            required_plan_keys = {"test_strategy", "observability_plan", "guide_selection", "sensor_selection", "execution_steps"}
            require_keys(phase_data["plan"], required_plan_keys, "plan")

        elif phase_name == "REVIEW" and phase_data["status"] == "COMPLETED":
            if "review" not in phase_data or not isinstance(phase_data["review"], dict):
                print("Error: REVIEW phase completed but missing 'review' dictionary", file=sys.stderr)
                sys.exit(1)
            if "approved" not in phase_data:
                print("Error: REVIEW phase completed but missing 'approved' key", file=sys.stderr)
                sys.exit(1)
            required_review_keys = {
                "summary_of_changes",
                "git_diff_summary",
                "verification_results",
                "ai_review_findings",
                "reviewer_comments",
            }
            require_keys(phase_data["review"], required_review_keys, "review")

    print("✔ Validation successful")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 validate-sdlc-record.py <path_to_yaml_file_or_directory>")
        sys.exit(1)

    target_path = Path(sys.argv[1]).resolve()
    if target_path.is_file():
        validate_record(target_path)
    elif target_path.is_dir():
        yaml_files = list(target_path.glob("*.yaml")) + list(target_path.glob("*.yml"))
        if not yaml_files:
            print(f"No YAML files found in directory '{target_path}'")
            sys.exit(0)
        for yf in yaml_files:
            validate_record(yf)
    else:
        print(f"Error: Target path '{target_path}' does not exist", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
