#!/usr/bin/env python3
"""Validate the structure of SDLC YAML record files inside .sdlc/issues/."""

from __future__ import annotations

import re
import sys
from pathlib import Path

VALID_PHASES = {"DEFINE", "SPEC", "PLAN", "EXECUTE", "REVIEW", "SHIP", "IMPROVE"}
VALID_STAGES = {"INITIALIZATION", "CONFIGURATION", "EXECUTION", "VERIFY", "IMPROVE"}
VALID_STATUSES = {"PENDING", "IN_PROGRESS", "COMPLETED"}


def parse_yaml_lines(lines: list[str]) -> dict:
    """A lightweight YAML-like dictionary parser for schema validation."""
    result = {}
    stack = [(0, result)]

    for line_idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("---"):
            continue

        indent = len(line) - len(line.lstrip())

        # Pop stack based on indentation
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()

        current_dict = stack[-1][1]

        # Handle list item
        if stripped.startswith("-"):
            # Ensure parent is a list
            list_key = "_list"
            if list_key not in current_dict:
                current_dict[list_key] = []
            val = stripped[1:].strip()
            # Strip quotes if string
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            current_dict[list_key].append(val)
            continue

        # Handle key-value pair
        if ":" in stripped:
            key, val = stripped.split(":", 1)
            key = key.strip()
            val = val.strip()

            # Strip quotes
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]

            if not val:  # Nested object
                new_dict = {}
                current_dict[key] = new_dict
                stack.append((indent, new_dict))
            else:
                # Convert boolean values
                if val.lower() == "true":
                    val = True
                elif val.lower() == "false":
                    val = False
                current_dict[key] = val
        else:
            print(f"Error: Invalid syntax on line {line_idx + 1}: '{line}'", file=sys.stderr)
            sys.exit(1)

    return result


def validate_record(file_path: Path) -> None:
    """Validate SDLC record structure and contents."""
    print(f"Validating SDLC record: {file_path.name}")
    try:
        content = file_path.read_text(encoding="utf-8")
    except Exception as e:
        print(f"Error reading file: {e}", file=sys.stderr)
        sys.exit(1)

    data = parse_yaml_lines(content.splitlines())

    # 1. Top level keys validation
    required_top_keys = {"ticket", "title", "mode", "current_phase", "lifecycle_stage", "iteration", "phases"}
    missing_top_keys = required_top_keys - set(data.keys())
    if missing_top_keys:
        print(f"Error: Missing top-level keys: {missing_top_keys}", file=sys.stderr)
        sys.exit(1)

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

    # 3. Phases block validation
    phases = data["phases"]
    if not isinstance(phases, dict):
        print("Error: 'phases' must be a dictionary block", file=sys.stderr)
        sys.exit(1)

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
            missing_brief = required_brief_keys - set(phase_data["brief"].keys())
            if missing_brief:
                print(f"Error: Missing keys in brief: {missing_brief}", file=sys.stderr)
                sys.exit(1)

        elif phase_name == "SPEC" and phase_data["status"] == "COMPLETED":
            if "spec" not in phase_data or not isinstance(phase_data["spec"], dict):
                print("Error: SPEC phase completed but missing 'spec' dictionary", file=sys.stderr)
                sys.exit(1)
            required_spec_keys = {"design_boundaries", "affected_components", "architectural_decisions", "grill_results"}
            missing_spec = required_spec_keys - set(phase_data["spec"].keys())
            if missing_spec:
                print(f"Error: Missing keys in spec: {missing_spec}", file=sys.stderr)
                sys.exit(1)

        elif phase_name == "PLAN" and phase_data["status"] == "COMPLETED":
            if "plan" not in phase_data or not isinstance(phase_data["plan"], dict):
                print("Error: PLAN phase completed but missing 'plan' dictionary", file=sys.stderr)
                sys.exit(1)
            if "approved" not in phase_data:
                print("Error: PLAN phase completed but missing 'approved' key", file=sys.stderr)
                sys.exit(1)

        elif phase_name == "REVIEW" and phase_data["status"] == "COMPLETED":
            if "review" not in phase_data or not isinstance(phase_data["review"], dict):
                print("Error: REVIEW phase completed but missing 'review' dictionary", file=sys.stderr)
                sys.exit(1)
            if "approved" not in phase_data:
                print("Error: REVIEW phase completed but missing 'approved' key", file=sys.stderr)
                sys.exit(1)

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
