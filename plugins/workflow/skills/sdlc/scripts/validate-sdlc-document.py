#!/usr/bin/env python3
"""Validate SDLC aggregate snapshots and transitions for schema version 1."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

TASK_STAGES = ["DEFINE", "SPEC", "IN_DEVELOPMENT", "IMPROVE", "CLOSED"]
TASK_OUTCOMES = {"ACCEPTED", "REJECTED", "CANCELLED", "FAILED"}
EXECUTION_STATES = {"ACTIVE", "WAITING_FOR_HUMAN", "AWAITING_ACCEPTANCE", "SUCCEEDED", "REJECTED", "FAILED", "CANCELLED"}
TERMINAL_EXECUTION_STATES = {"SUCCEEDED", "REJECTED", "FAILED", "CANCELLED"}
PHASE_KINDS = {"PLAN", "EXECUTE", "REVIEW", "SHIP"}
RUN_STATES = {"ACTIVE", "SUCCEEDED", "FAILED", "CANCELLED"}
LIFECYCLE_STAGES = {"DEFINE", "EXECUTE", "VERIFY", "IMPROVE", "COMPLETE"}
LINK_KINDS = {"DERIVATION", "BLOCKING", "DEPENDENCY", "DUPLICATION", "RELATION", "IMPLEMENTATION"}
REJECTION_CATEGORIES = {
    "NO_LONGER_NEEDED", "SUPERSEDED", "UNFINISHABLE_AS_SPECIFIED", "QUALITY_GATE_FAILED",
    "DELIVERY_BLOCKED", "RISK_NOT_ACCEPTED", "BUDGET_EXHAUSTED",
    "EXTERNAL_DEPENDENCY_UNAVAILABLE", "CANCELLED_BY_HUMAN", "OTHER",
}
BUDGET_KEYS = {"tokens", "elapsed_seconds", "model_cycles", "tool_calls", "autonomous_corrections", "concurrency"}


class Invalid(ValueError):
    pass


def mapping(value: Any, ctx: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise Invalid(f"{ctx} must be a mapping")
    return value


def sequence(value: Any, ctx: str) -> list[Any]:
    if not isinstance(value, list):
        raise Invalid(f"{ctx} must be a list")
    return value


def require(obj: dict[str, Any], keys: set[str], ctx: str) -> None:
    missing = keys - obj.keys()
    if missing:
        raise Invalid(f"{ctx} missing keys: {sorted(missing)}")


def text(value: Any, ctx: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise Invalid(f"{ctx} must be a non-empty string")


def nonnegative(value: Any, ctx: str) -> None:
    if type(value) is not int or value < 0:
        raise Invalid(f"{ctx} must be a non-negative integer")


def validate_audit(value: Any, ctx: str) -> None:
    items = sequence(value, ctx)
    expected = 1
    for index, raw in enumerate(items):
        item = mapping(raw, f"{ctx}[{index}]")
        require(item, {"sequence", "event", "actor", "occurred_at"}, f"{ctx}[{index}]")
        if item["sequence"] != expected:
            raise Invalid(f"{ctx} sequence must be contiguous from 1")
        for key in ("event", "actor", "occurred_at"):
            text(item[key], f"{ctx}[{index}].{key}")
        expected += 1


def validate_budget(value: Any, ctx: str, *, usage: bool = False) -> None:
    budget = mapping(value, ctx)
    require(budget, BUDGET_KEYS, ctx)
    for key in BUDGET_KEYS:
        amount = budget[key]
        if type(amount) is not int or amount < (0 if usage else -1):
            raise Invalid(f"{ctx}.{key} has an invalid value")
    if not usage and budget["concurrency"] <= 0:
        raise Invalid(f"{ctx}.concurrency must be positive and finite")


def validate_artifact(value: Any, ctx: str) -> None:
    artifact = mapping(value, ctx)
    require(artifact, {"artifact_id", "type", "revision", "uri", "sha256"}, ctx)
    for key in ("artifact_id", "type", "uri"):
        text(artifact[key], f"{ctx}.{key}")
    nonnegative(artifact["revision"], f"{ctx}.revision")
    digest = artifact["sha256"]
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdefABCDEF" for c in digest):
        raise Invalid(f"{ctx}.sha256 must be a 64-character hexadecimal digest")


def validate_improvement(value: Any, ctx: str) -> None:
    item = mapping(value, ctx)
    require(item, {"strengths", "frictions", "proposals", "evidence_refs"}, ctx)
    for key in ("strengths", "frictions", "proposals"):
        sequence(item[key], f"{ctx}.{key}")
    for index, ref in enumerate(sequence(item["evidence_refs"], f"{ctx}.evidence_refs")):
        validate_artifact(ref, f"{ctx}.evidence_refs[{index}]")


def validate_phase_run(raw: Any, index: int) -> None:
    ctx = f"phase_runs[{index}]"
    run = mapping(raw, ctx)
    require(run, {"phase_run_id", "kind", "sequence", "state", "lifecycle_stage", "cause", "recovery_window_id", "result", "improvement", "artifacts"}, ctx)
    text(run["phase_run_id"], f"{ctx}.phase_run_id")
    text(run["recovery_window_id"], f"{ctx}.recovery_window_id")
    if run["kind"] not in PHASE_KINDS or run["state"] not in RUN_STATES or run["lifecycle_stage"] not in LIFECYCLE_STAGES:
        raise Invalid(f"{ctx} has an invalid kind, state, or lifecycle_stage")
    if run["sequence"] != index + 1:
        raise Invalid("phase run sequence must be contiguous from 1")
    text(run["cause"], f"{ctx}.cause")
    for artifact_index, ref in enumerate(sequence(run["artifacts"], f"{ctx}.artifacts")):
        validate_artifact(ref, f"{ctx}.artifacts[{artifact_index}]")
    if run["state"] != "ACTIVE":
        mapping(run["result"], f"{ctx}.result")
        validate_improvement(run["improvement"], f"{ctx}.improvement")


def validate_task(data: dict[str, Any]) -> None:
    require(data, {"task_id", "revision", "stage", "outcome", "definition", "specification", "execution_slot", "retrospective", "audit"}, "task")
    text(data["task_id"], "task.task_id")
    nonnegative(data["revision"], "task.revision")
    if data["stage"] not in TASK_STAGES:
        raise Invalid("task.stage is invalid")
    definition = mapping(data["definition"], "task.definition")
    require(definition, {"title", "requested_outcome", "context", "initial_scope", "external_references"}, "task.definition")
    text(definition["title"], "task.definition.title")
    text(definition["requested_outcome"], "task.definition.requested_outcome")
    sequence(definition["initial_scope"], "task.definition.initial_scope")
    sequence(definition["external_references"], "task.definition.external_references")
    if TASK_STAGES.index(data["stage"]) >= TASK_STAGES.index("IN_DEVELOPMENT"):
        spec = mapping(data["specification"], "task.specification")
        require(spec, {"deliverable", "completion_condition", "acceptance_criteria", "constraints", "non_goals", "target_repository", "allowed_paths", "risks", "controls", "budget", "collaboration_mode", "max_recovery_tries"}, "task.specification")
        for key in ("deliverable", "completion_condition", "target_repository"):
            text(spec[key], f"task.specification.{key}")
        for key in ("acceptance_criteria", "constraints", "non_goals", "allowed_paths", "risks"):
            sequence(spec[key], f"task.specification.{key}")
        if spec["collaboration_mode"] not in {"afk", "hil"} or spec["max_recovery_tries"] not in {1, 2, 3}:
            raise Invalid("task.specification has invalid collaboration mode or recovery tries")
        validate_budget(spec["budget"], "task.specification.budget")
    if data["execution_slot"] is not None:
        slot = mapping(data["execution_slot"], "task.execution_slot")
        require(slot, {"task_execution_id", "status"}, "task.execution_slot")
        text(slot["task_execution_id"], "task.execution_slot.task_execution_id")
        if slot["status"] not in {"REQUESTED", "ACTIVE"}:
            raise Invalid("task.execution_slot.status is invalid")
    if data["stage"] == "CLOSED":
        if data["outcome"] not in TASK_OUTCOMES:
            raise Invalid("closed task requires a terminal outcome")
        mapping(data["retrospective"], "task.retrospective")
    elif data["outcome"] is not None:
        raise Invalid("non-closed task cannot have an outcome")
    validate_audit(data["audit"], "task.audit")


def validate_execution(data: dict[str, Any]) -> None:
    require(data, {"task_execution_id", "task_id", "revision", "state", "recovery_window", "phase_runs", "budget_extensions", "deadline_extensions", "human_interventions", "acceptance_decision", "execution_outcome", "usage", "costs", "audit"}, "task_execution")
    for key in ("task_execution_id", "task_id"):
        text(data[key], f"task_execution.{key}")
    nonnegative(data["revision"], "task_execution.revision")
    if data["state"] not in EXECUTION_STATES:
        raise Invalid("task_execution.state is invalid")
    window = mapping(data["recovery_window"], "task_execution.recovery_window")
    require(window, {"recovery_window_id", "max_tries", "tries_used"}, "task_execution.recovery_window")
    text(window["recovery_window_id"], "task_execution.recovery_window.recovery_window_id")
    if window["max_tries"] not in {1, 2, 3} or type(window["tries_used"]) is not int or not 0 <= window["tries_used"] <= window["max_tries"]:
        raise Invalid("task_execution.recovery_window counters are invalid")
    runs = sequence(data["phase_runs"], "task_execution.phase_runs")
    for index, run in enumerate(runs):
        validate_phase_run(run, index)
    review_counts: dict[str, int] = {}
    for run in runs:
        if run["kind"] == "REVIEW":
            window_id = run["recovery_window_id"]
            review_counts[window_id] = review_counts.get(window_id, 0) + 1
            if review_counts[window_id] > 3:
                raise Invalid(f"recovery window {window_id} permits at most three REVIEW runs")
    for key in ("budget_extensions", "deadline_extensions", "human_interventions", "costs"):
        sequence(data[key], f"task_execution.{key}")
    validate_budget(data["usage"], "task_execution.usage", usage=True)
    if data["state"] in TERMINAL_EXECUTION_STATES:
        mapping(data["execution_outcome"], "task_execution.execution_outcome")
    validate_audit(data["audit"], "task_execution.audit")


def validate_link(data: dict[str, Any]) -> None:
    require(data, {"task_link_id", "revision", "source_task_id", "target_task_id", "relationship_kind", "description", "description_history", "audit"}, "task_link")
    for key in ("task_link_id", "source_task_id", "target_task_id", "description"):
        text(data[key], f"task_link.{key}")
    if data["source_task_id"] == data["target_task_id"]:
        raise Invalid("task links cannot be self-referential")
    if data["relationship_kind"] not in LINK_KINDS:
        raise Invalid("task_link.relationship_kind is invalid")
    nonnegative(data["revision"], "task_link.revision")
    sequence(data["description_history"], "task_link.description_history")
    validate_audit(data["audit"], "task_link.audit")


VALIDATORS = {"task": validate_task, "task_execution": validate_execution, "task_link": validate_link}


def load(path: Path) -> dict[str, Any]:
    try:
        return mapping(yaml.safe_load(path.read_text(encoding="utf-8")), str(path))
    except (OSError, yaml.YAMLError) as exc:
        raise Invalid(f"cannot read {path}: {exc}") from exc


def validate_document(data: dict[str, Any]) -> None:
    if str(data.get("schema_version")) != "1":
        raise Invalid("schema_version must be '1'")
    kind = data.get("document_type")
    if kind not in VALIDATORS:
        raise Invalid(f"unsupported document_type: {kind}")
    VALIDATORS[kind](data)


def validate_transition(previous: dict[str, Any], current: dict[str, Any]) -> None:
    validate_document(previous)
    validate_document(current)
    if previous["document_type"] != current["document_type"]:
        raise Invalid("transition document types differ")
    id_key = {"task": "task_id", "task_execution": "task_execution_id", "task_link": "task_link_id"}[current["document_type"]]
    if previous[id_key] != current[id_key] or current["revision"] != previous["revision"] + 1:
        raise Invalid("transition identity or revision is invalid")
    if previous.get("audit") != current.get("audit", [])[: len(previous.get("audit", []))]:
        raise Invalid("audit history is not append-only")
    if current["document_type"] == "task":
        old_stage, new_stage = previous["stage"], current["stage"]
        if TASK_STAGES.index(new_stage) < TASK_STAGES.index(old_stage) or TASK_STAGES.index(new_stage) > TASK_STAGES.index(old_stage) + 1:
            raise Invalid("task stage transition is invalid")
        if old_stage != "DEFINE" and previous["definition"] != current["definition"]:
            raise Invalid("Definition is immutable after DEFINE")
        if old_stage != "SPEC" and previous["specification"] != current["specification"]:
            raise Invalid("Specification is immutable after SPEC")
        if old_stage != "IN_DEVELOPMENT" and previous["execution_slot"] != current["execution_slot"]:
            raise Invalid("Execution Slot changes only in IN_DEVELOPMENT")
        if old_stage != "IMPROVE" and previous["retrospective"] != current["retrospective"]:
            raise Invalid("Retrospective changes only in IMPROVE")
    if previous["document_type"] == "task_execution":
        if previous["state"] in TERMINAL_EXECUTION_STATES and previous != current:
            raise Invalid("terminal Task Execution is immutable")
        if previous["task_id"] != current["task_id"]:
            raise Invalid("Task Execution task_id is immutable")
        if previous["phase_runs"] != current["phase_runs"][: len(previous["phase_runs"])]:
            raise Invalid("Task Execution phase runs are not append-only")
        for key in BUDGET_KEYS:
            if current["usage"][key] < previous["usage"][key]:
                raise Invalid(f"Task Execution cumulative usage cannot decrease: {key}")
    if previous["document_type"] == "task_link":
        for key in ("source_task_id", "target_task_id", "relationship_kind"):
            if previous[key] != current[key]:
                raise Invalid(f"Task Link {key} is immutable")


def validate_root(root: Path) -> None:
    docs = []
    for path in root.rglob("*.yaml"):
        if "/artifacts/" in path.as_posix():
            continue
        data = load(path)
        validate_document(data)
        docs.append((path, data))
    tasks: dict[str, tuple[Path, dict[str, Any]]] = {}
    for path, data in docs:
        if data["document_type"] == "task":
            if data["task_id"] in tasks:
                raise Invalid(f"duplicate Task identity: {data['task_id']}")
            tasks[data["task_id"]] = (path, data)
    executions: dict[str, tuple[Path, dict[str, Any]]] = {}
    links = set()
    for path, data in docs:
        if data["document_type"] == "task_execution":
            if data["task_id"] not in tasks:
                raise Invalid(f"{path} references a missing Task")
            if data["task_id"] in executions:
                raise Invalid(f"Task {data['task_id']} has more than one Task Execution")
            executions[data["task_id"]] = (path, data)
        if data["document_type"] == "task_link":
            if data["source_task_id"] not in tasks or data["target_task_id"] not in tasks:
                raise Invalid(f"{path} references a missing Task")
            identity = (data["source_task_id"], data["target_task_id"], data["relationship_kind"])
            if identity in links:
                raise Invalid(f"duplicate Task Link relationship: {identity}")
            links.add(identity)
    for task_id, (path, task) in tasks.items():
        slot = task["execution_slot"]
        if slot is None:
            continue
        if task_id not in executions:
            raise Invalid(f"{path} execution_slot references a missing Task Execution")
        execution_path, execution = executions[task_id]
        if slot["task_execution_id"] != execution["task_execution_id"]:
            raise Invalid(f"{path} execution_slot does not match {execution_path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--previous", type=Path)
    args = parser.parse_args()
    try:
        if args.path.is_dir():
            if args.previous:
                raise Invalid("--previous is valid only for a document")
            validate_root(args.path)
        else:
            current = load(args.path)
            if args.previous:
                validate_transition(load(args.previous), current)
            else:
                validate_document(current)
    except Invalid as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    print("Validation successful")
    return 0


if __name__ == "__main__":
    sys.exit(main())
