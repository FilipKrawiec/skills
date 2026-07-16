#!/usr/bin/env python3
"""Validate append-only SDLC task records for schema version 1."""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml

STAGE_KINDS = ["DEFINE", "REFINE", "EXECUTE", "IMPROVE"]
PHASE_KINDS = {
    "DEFINE": ["DEFINE"],
    "REFINE": ["REFINE"],
    "IMPROVE": ["IMPROVE"],
}
EXECUTE_PHASE_NEXT = {
    "PLAN": {"EXECUTE"},
    "EXECUTE": {"REVIEW"},
    "REVIEW": {"PLAN", "EXECUTE", "SHIP"},
    "SHIP": set(),
}
LIFECYCLE_KINDS = ["DEFINE", "EXECUTE", "VERIFY", "IMPROVE", "COMPLETE"]
TASK_STATES = {"ACTIVE", "CLOSED"}
TASK_OUTCOMES = {"ACCEPTED", "REJECTED", "CANCELLED", "FAILED"}
LIFECYCLE_STATES = {"ACTIVE", "SUCCEEDED", "FAILED", "CANCELLED"}
TERMINAL_LIFECYCLE_STATES = LIFECYCLE_STATES - {"ACTIVE"}
LINK_KINDS = {"DERIVATION", "BLOCKING", "DEPENDENCY", "DUPLICATION", "RELATION", "IMPLEMENTATION"}
DIAGNOSIS_CONFIDENCE = {"LOW", "MEDIUM", "HIGH"}
STORY_POINTS = {1, 2, 3, 5, 8}
RFC3339_TIMESTAMP = re.compile(
    r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$"
)


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


def require_exact(obj: dict[str, Any], keys: set[str], ctx: str) -> None:
    require(obj, keys, ctx)
    unexpected = obj.keys() - keys
    if unexpected:
        raise Invalid(f"{ctx} contains unsupported keys: {sorted(unexpected)}")


def text(value: Any, ctx: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise Invalid(f"{ctx} must be a non-empty string")


def nonnegative(value: Any, ctx: str) -> None:
    if type(value) is not int or value < 0:
        raise Invalid(f"{ctx} must be a non-negative integer")


def positive(value: Any, ctx: str) -> None:
    if type(value) is not int or value <= 0:
        raise Invalid(f"{ctx} must be a positive integer")


def parse_rfc3339(value: Any, ctx: str) -> datetime:
    if not isinstance(value, str) or not RFC3339_TIMESTAMP.fullmatch(value):
        raise Invalid(f"{ctx} must be an RFC3339 timestamp")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise Invalid(f"{ctx} must be an RFC3339 timestamp") from exc
    if parsed.tzinfo is None:
        raise Invalid(f"{ctx} must include an RFC3339 timezone")
    return parsed


def validate_audit(value: Any, ctx: str) -> None:
    items = sequence(value, ctx)
    for index, raw in enumerate(items, start=1):
        item = mapping(raw, f"{ctx}[{index - 1}]")
        require(item, {"sequence", "event", "actor", "occurred_at"}, f"{ctx}[{index - 1}]")
        if item["sequence"] != index:
            raise Invalid(f"{ctx} sequence must be contiguous from 1")
        for key in ("event", "actor", "occurred_at"):
            text(item[key], f"{ctx}[{index - 1}].{key}")


def validate_artifact(value: Any, ctx: str) -> None:
    artifact = mapping(value, ctx)
    require(artifact, {"artifact_id", "type", "revision", "uri", "sha256"}, ctx)
    for key in ("artifact_id", "type", "uri"):
        text(artifact[key], f"{ctx}.{key}")
    nonnegative(artifact["revision"], f"{ctx}.revision")
    digest = artifact["sha256"]
    validate_sha256(digest, f"{ctx}.sha256")


def validate_sha256(value: Any, ctx: str) -> None:
    if not isinstance(value, str) or len(value) != 64 or any(char not in "0123456789abcdefABCDEF" for char in value):
        raise Invalid(f"{ctx} must be a 64-character hexadecimal digest")


def validate_improvement(value: Any, ctx: str) -> None:
    improvement = mapping(value, ctx)
    require(improvement, {"strengths", "frictions", "proposals", "evidence_refs"}, ctx)
    for key in ("strengths", "frictions", "proposals"):
        sequence(improvement[key], f"{ctx}.{key}")
    for index, artifact in enumerate(sequence(improvement["evidence_refs"], f"{ctx}.evidence_refs")):
        validate_artifact(artifact, f"{ctx}.evidence_refs[{index}]")


def validate_evidence_references(value: Any, ctx: str) -> None:
    for index, artifact in enumerate(sequence(value, ctx)):
        validate_artifact(artifact, f"{ctx}[{index}]")


def validate_agentic_diagnosis(value: Any, ctx: str) -> None:
    diagnosis = mapping(value, ctx)
    require_exact(diagnosis, {"facts", "hypotheses", "recommendation"}, ctx)

    facts = sequence(diagnosis["facts"], f"{ctx}.facts")
    if not facts:
        raise Invalid(f"{ctx}.facts must contain structured evidence")
    for index, raw_fact in enumerate(facts):
        fact_ctx = f"{ctx}.facts[{index}]"
        fact = mapping(raw_fact, fact_ctx)
        require_exact(fact, {"statement", "evidence_refs"}, fact_ctx)
        text(fact["statement"], f"{fact_ctx}.statement")
        validate_evidence_references(fact["evidence_refs"], f"{fact_ctx}.evidence_refs")

    hypotheses = sequence(diagnosis["hypotheses"], f"{ctx}.hypotheses")
    for index, raw_hypothesis in enumerate(hypotheses):
        hypothesis_ctx = f"{ctx}.hypotheses[{index}]"
        hypothesis = mapping(raw_hypothesis, hypothesis_ctx)
        require_exact(
            hypothesis,
            {"statement", "confidence", "evidence_refs", "disconfirming_check"},
            hypothesis_ctx,
        )
        text(hypothesis["statement"], f"{hypothesis_ctx}.statement")
        if hypothesis["confidence"] not in DIAGNOSIS_CONFIDENCE:
            raise Invalid(f"{hypothesis_ctx}.confidence is invalid")
        validate_evidence_references(hypothesis["evidence_refs"], f"{hypothesis_ctx}.evidence_refs")
        text(hypothesis["disconfirming_check"], f"{hypothesis_ctx}.disconfirming_check")

    recommendation = mapping(diagnosis["recommendation"], f"{ctx}.recommendation")
    require_exact(
        recommendation,
        {"action", "expected_signal", "success_criterion"},
        f"{ctx}.recommendation",
    )
    for key in ("action", "expected_signal", "success_criterion"):
        text(recommendation[key], f"{ctx}.recommendation.{key}")


def validate_lifecycle(raw: Any, index: int, ctx: str) -> None:
    lifecycle = mapping(raw, ctx)
    require(lifecycle, {
        "lifecycle_id", "kind", "sequence", "state", "started_at", "completed_at", "result",
        "improvement", "artifacts",
    }, ctx)
    text(lifecycle["lifecycle_id"], f"{ctx}.lifecycle_id")
    if lifecycle["sequence"] != index + 1:
        raise Invalid(f"{ctx}.sequence must be contiguous from 1")
    if lifecycle["kind"] != LIFECYCLE_KINDS[index]:
        raise Invalid(f"{ctx}.kind must follow the shared lifecycle order")
    if lifecycle["state"] not in LIFECYCLE_STATES:
        raise Invalid(f"{ctx}.state is invalid")
    started_at = parse_rfc3339(lifecycle["started_at"], f"{ctx}.started_at")
    completed_at = lifecycle["completed_at"]
    if lifecycle["state"] == "ACTIVE":
        if completed_at is not None:
            raise Invalid(f"{ctx} active lifecycle cannot have a completion timestamp")
    else:
        completed = parse_rfc3339(completed_at, f"{ctx}.completed_at")
        if completed <= started_at:
            raise Invalid(f"{ctx}.completed_at must be after started_at")
    for artifact_index, artifact in enumerate(sequence(lifecycle["artifacts"], f"{ctx}.artifacts")):
        validate_artifact(artifact, f"{ctx}.artifacts[{artifact_index}]")
    if lifecycle["state"] == "ACTIVE" and (lifecycle["result"] is not None or lifecycle["improvement"] is not None):
        raise Invalid(f"{ctx} active lifecycle cannot have a result or improvement")


def phase_is_complete(phase: dict[str, Any]) -> bool:
    terminal = phase["lifecycles"][-1]
    return terminal["kind"] == "COMPLETE" and terminal["state"] == "SUCCEEDED"


def validate_phase(raw: Any, index: int, stage_kind: str, previous_kind: str | None, ctx: str) -> None:
    phase = mapping(raw, ctx)
    require(phase, {"phase_id", "kind", "sequence", "lifecycles"}, ctx)
    text(phase["phase_id"], f"{ctx}.phase_id")
    if phase["sequence"] != index + 1:
        raise Invalid(f"{ctx}.sequence must be contiguous from 1")
    if stage_kind == "EXECUTE":
        allowed_kinds = {"PLAN"} if previous_kind is None else EXECUTE_PHASE_NEXT[previous_kind]
    else:
        allowed_kinds = {PHASE_KINDS[stage_kind][0]} if previous_kind is None else set()
    if phase["kind"] not in allowed_kinds:
        raise Invalid(f"{ctx}.kind is not valid for {stage_kind}")
    lifecycles = sequence(phase["lifecycles"], f"{ctx}.lifecycles")
    if not lifecycles:
        raise Invalid(f"{ctx}.lifecycles must contain the active lifecycle")
    if len(lifecycles) > len(LIFECYCLE_KINDS):
        raise Invalid(f"{ctx}.lifecycles contains too many lifecycle steps")
    for lifecycle_index, lifecycle in enumerate(lifecycles):
        validate_lifecycle(lifecycle, lifecycle_index, f"{ctx}.lifecycles[{lifecycle_index}]")
        if lifecycle_index:
            previous = lifecycles[lifecycle_index - 1]
            previous_completed_at = parse_rfc3339(
                previous["completed_at"], f"{ctx}.lifecycles[{lifecycle_index - 1}].completed_at"
            )
            started_at = parse_rfc3339(lifecycle["started_at"], f"{ctx}.lifecycles[{lifecycle_index}].started_at")
            if started_at < previous_completed_at:
                raise Invalid(f"{ctx}.lifecycles timestamps must follow lifecycle order")
    terminal = lifecycles[-1]
    if terminal["state"] in TERMINAL_LIFECYCLE_STATES:
        mapping(terminal["result"], f"{ctx}.lifecycles[{len(lifecycles) - 1}].result")
        validate_improvement(terminal["improvement"], f"{ctx}.lifecycles[{len(lifecycles) - 1}].improvement")
    if stage_kind == "IMPROVE" and terminal["kind"] == "COMPLETE" and terminal["state"] == "SUCCEEDED":
        result_ctx = f"{ctx}.lifecycles[{len(lifecycles) - 1}].result"
        result = mapping(terminal["result"], result_ctx)
        if "agentic_diagnosis" not in result:
            raise Invalid(f"{result_ctx}.agentic_diagnosis is required for a completed IMPROVE phase")
        validate_agentic_diagnosis(result["agentic_diagnosis"], f"{result_ctx}.agentic_diagnosis")


def validate_stage(raw: Any, index: int, previous_kind: str | None) -> None:
    ctx = f"task.stages[{index}]"
    stage = mapping(raw, ctx)
    require(stage, {"stage_id", "kind", "sequence", "phases"}, ctx)
    text(stage["stage_id"], f"{ctx}.stage_id")
    if stage["sequence"] != index + 1:
        raise Invalid(f"{ctx}.sequence must be contiguous from 1")
    if stage["kind"] not in STAGE_KINDS:
        raise Invalid(f"{ctx}.kind is invalid")
    if previous_kind is not None and STAGE_KINDS.index(stage["kind"]) <= STAGE_KINDS.index(previous_kind):
        raise Invalid(f"{ctx}.kind must follow the stage order")
    phases = sequence(stage["phases"], f"{ctx}.phases")
    if not phases:
        raise Invalid(f"{ctx}.phases must contain the active phase")
    if stage["kind"] != "EXECUTE" and len(phases) > 1:
        raise Invalid(f"{ctx}.phases contains too many phases")
    previous_phase_kind = None
    for phase_index, phase in enumerate(phases):
        if phase_index and not phase_is_complete(phases[phase_index - 1]):
            raise Invalid(f"{ctx}.phases must complete before the next phase")
        validate_phase(phase, phase_index, stage["kind"], previous_phase_kind, f"{ctx}.phases[{phase_index}]")
        previous_phase_kind = phase["kind"]


def stage_is_complete(stage: dict[str, Any]) -> bool:
    phases = stage["phases"]
    return all(phase_is_complete(phase) for phase in phases) and (
        stage["kind"] != "EXECUTE" or phases[-1]["kind"] == "SHIP"
    )


def validate_scorecard(value: Any, ctx: str) -> None:
    scorecard = mapping(value, ctx)
    require_exact(
        scorecard,
        {
            "policy_id",
            "policy_sha256",
            "story_points",
            "target_elapsed_seconds",
            "baseline_sample_size",
        },
        ctx,
    )
    text(scorecard["policy_id"], f"{ctx}.policy_id")
    validate_sha256(scorecard["policy_sha256"], f"{ctx}.policy_sha256")
    validate_story_points(scorecard["story_points"], f"{ctx}.story_points")
    positive(scorecard["target_elapsed_seconds"], f"{ctx}.target_elapsed_seconds")
    positive(scorecard["baseline_sample_size"], f"{ctx}.baseline_sample_size")


def validate_story_points(value: Any, ctx: str) -> None:
    if value not in STORY_POINTS or type(value) is not int:
        raise Invalid(f"{ctx} must be one of {sorted(STORY_POINTS)}")


def validate_classification(value: Any, ctx: str) -> None:
    classification = mapping(value, ctx)
    require_exact(classification, {"story_points"}, ctx)
    validate_story_points(classification["story_points"], f"{ctx}.story_points")


def validate_scorecard_policy(data: dict[str, Any]) -> None:
    require_exact(
        data,
        {
            "schema_version",
            "document_type",
            "policy_id",
            "revision",
            "minimum_sample_size",
            "entries",
            "audit",
        },
        "scorecard_policy",
    )
    text(data["policy_id"], "scorecard_policy.policy_id")
    nonnegative(data["revision"], "scorecard_policy.revision")
    positive(data["minimum_sample_size"], "scorecard_policy.minimum_sample_size")
    entries = sequence(data["entries"], "scorecard_policy.entries")
    if not entries:
        raise Invalid("scorecard_policy.entries must not be empty")
    identities = set()
    for index, raw_entry in enumerate(entries):
        ctx = f"scorecard_policy.entries[{index}]"
        entry = mapping(raw_entry, ctx)
        require_exact(
            entry,
            {"story_points", "target_elapsed_seconds", "sample_size"},
            ctx,
        )
        validate_story_points(entry["story_points"], f"{ctx}.story_points")
        positive(entry["target_elapsed_seconds"], f"{ctx}.target_elapsed_seconds")
        positive(entry["sample_size"], f"{ctx}.sample_size")
        if entry["sample_size"] < data["minimum_sample_size"]:
            raise Invalid(f"{ctx}.sample_size is below minimum_sample_size")
        identity = entry["story_points"]
        if identity in identities:
            raise Invalid(f"duplicate scorecard policy entry: {identity}")
        identities.add(identity)
    validate_audit(data["audit"], "scorecard_policy.audit")


def validate_task(data: dict[str, Any]) -> None:
    require(data, {"task_id", "revision", "state", "outcome", "classification", "scorecard", "stages", "audit"}, "task")
    if "definition" in data:
        raise Invalid("task.definition belongs in the completed DEFINE lifecycle")
    if "specification" in data:
        raise Invalid("task.specification belongs in the completed REFINE lifecycle")
    text(data["task_id"], "task.task_id")
    nonnegative(data["revision"], "task.revision")
    if data["state"] not in TASK_STATES:
        raise Invalid("task.state is invalid")
    stages = sequence(data["stages"], "task.stages")
    if not stages:
        raise Invalid("task.stages must contain the active stage")
    if len(stages) > len(STAGE_KINDS):
        raise Invalid("task.stages contains too many stages")
    previous_kind = None
    for index, stage in enumerate(stages):
        validate_stage(stage, index, previous_kind)
        previous_kind = stage["kind"]
    requires_classification = any(stage["kind"] in {"EXECUTE", "IMPROVE"} for stage in stages)
    if data["classification"] is None:
        if requires_classification:
            raise Invalid("task.classification is required from EXECUTE onward")
    else:
        validate_classification(data["classification"], "task.classification")
    if data["scorecard"] is not None:
        validate_scorecard(data["scorecard"], "task.scorecard")
        if data["classification"] is None:
            raise Invalid("task.scorecard requires task.classification")
        if data["scorecard"]["story_points"] != data["classification"]["story_points"]:
            raise Invalid("task.scorecard story_points must match task.classification")
    if data["state"] == "CLOSED":
        if data["outcome"] not in TASK_OUTCOMES:
            raise Invalid("closed task requires a terminal outcome")
        if data["outcome"] in {"ACCEPTED", "REJECTED"}:
            if stages[-1]["kind"] != "IMPROVE" or not stage_is_complete(stages[-1]):
                raise Invalid("accepted or rejected task requires a completed IMPROVE stage")
        else:
            terminal = stages[-1]["phases"][-1]["lifecycles"][-1]
            if terminal["state"] != data["outcome"]:
                raise Invalid("failed or cancelled task requires a matching terminal lifecycle")
    elif data["outcome"] is not None:
        raise Invalid("active task cannot have an outcome")
    validate_audit(data["audit"], "task.audit")


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


VALIDATORS = {
    "task": validate_task,
    "task_link": validate_link,
    "scorecard_policy": validate_scorecard_policy,
}


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


def validate_lifecycle_transition(previous: dict[str, Any], current: dict[str, Any], ctx: str) -> None:
    immutable = ("lifecycle_id", "kind", "sequence")
    if any(previous[key] != current[key] for key in immutable):
        raise Invalid(f"{ctx} identity or order is immutable")
    if previous["state"] in TERMINAL_LIFECYCLE_STATES and previous != current:
        raise Invalid(f"{ctx} completed lifecycle is immutable")
    if previous["state"] == "ACTIVE" and current["state"] == "ACTIVE":
        raise Invalid(f"{ctx} active lifecycle cannot be rewritten")


def validate_phase_transition(previous: dict[str, Any], current: dict[str, Any], ctx: str) -> None:
    if any(previous[key] != current[key] for key in ("phase_id", "kind", "sequence")):
        raise Invalid(f"{ctx} identity or order is immutable")
    old_lifecycles = previous["lifecycles"]
    new_lifecycles = current["lifecycles"]
    if len(new_lifecycles) < len(old_lifecycles):
        raise Invalid(f"{ctx}.lifecycles cannot be removed")
    for index, old_lifecycle in enumerate(old_lifecycles):
        new_lifecycle = new_lifecycles[index]
        is_tail = index == len(old_lifecycles) - 1
        if old_lifecycle != new_lifecycle:
            if not is_tail or len(new_lifecycles) != len(old_lifecycles):
                raise Invalid(f"{ctx}.lifecycles history is immutable")
            validate_lifecycle_transition(old_lifecycle, new_lifecycle, f"{ctx}.lifecycles[{index}]")
    if len(new_lifecycles) > len(old_lifecycles):
        if old_lifecycles[-1]["kind"] == "COMPLETE" or old_lifecycles[-1]["state"] != "SUCCEEDED":
            raise Invalid(f"{ctx} can append a lifecycle only after successful completion")


def validate_stage_transition(previous: dict[str, Any], current: dict[str, Any], ctx: str) -> None:
    if any(previous[key] != current[key] for key in ("stage_id", "kind", "sequence")):
        raise Invalid(f"{ctx} identity or order is immutable")
    old_phases = previous["phases"]
    new_phases = current["phases"]
    if len(new_phases) < len(old_phases):
        raise Invalid(f"{ctx}.phases cannot be removed")
    for index, old_phase in enumerate(old_phases):
        new_phase = new_phases[index]
        is_tail = index == len(old_phases) - 1
        if old_phase != new_phase:
            if not is_tail or len(new_phases) != len(old_phases):
                raise Invalid(f"{ctx}.phases history is immutable")
            validate_phase_transition(old_phase, new_phase, f"{ctx}.phases[{index}]")
    if len(new_phases) > len(old_phases) and not stage_is_complete({**previous, "phases": old_phases}):
        last_phase = old_phases[-1]
        if last_phase["lifecycles"][-1]["kind"] != "COMPLETE" or last_phase["lifecycles"][-1]["state"] != "SUCCEEDED":
            raise Invalid(f"{ctx} can append a phase only after completing the previous phase")


def validate_task_transition(previous: dict[str, Any], current: dict[str, Any]) -> None:
    old_stages = previous["stages"]
    new_stages = current["stages"]
    if len(new_stages) < len(old_stages):
        raise Invalid("task.stages cannot be removed")
    for index, old_stage in enumerate(old_stages):
        new_stage = new_stages[index]
        is_tail = index == len(old_stages) - 1
        if old_stage != new_stage:
            if not is_tail or len(new_stages) != len(old_stages):
                raise Invalid("completed stage history is immutable")
            validate_stage_transition(old_stage, new_stage, f"task.stages[{index}]")
    if len(new_stages) > len(old_stages) and not stage_is_complete(old_stages[-1]):
        raise Invalid("task can append a stage only after completing the previous stage")
    if previous["state"] == "CLOSED" and previous != current:
        raise Invalid("closed task is immutable")
    binding_transition = (
        old_stages[-1]["kind"] == "REFINE"
        and stage_is_complete(old_stages[-1])
        and len(new_stages) == len(old_stages) + 1
        and new_stages[-1]["kind"] == "EXECUTE"
    )
    if previous["classification"] is not None:
        if previous["classification"] != current["classification"]:
            raise Invalid("task.classification is immutable once bound")
    elif current["classification"] is not None and not binding_transition:
        raise Invalid("task.classification can bind only when completed REFINE appends EXECUTE")
    if previous["scorecard"] is not None:
        if previous["scorecard"] != current["scorecard"]:
            raise Invalid("task.scorecard is immutable once bound")
    elif current["scorecard"] is not None and not binding_transition:
        raise Invalid("task.scorecard can bind only when completed REFINE appends EXECUTE")


def validate_transition(previous: dict[str, Any], current: dict[str, Any]) -> None:
    validate_document(previous)
    validate_document(current)
    if previous["document_type"] != current["document_type"]:
        raise Invalid("transition document types differ")
    id_key = {"task": "task_id", "task_link": "task_link_id"}[current["document_type"]]
    if previous[id_key] != current[id_key] or current["revision"] != previous["revision"] + 1:
        raise Invalid("transition identity or revision is invalid")
    if previous.get("audit") != current.get("audit", [])[:len(previous.get("audit", []))]:
        raise Invalid("audit history is not append-only")
    if current["document_type"] == "task":
        validate_task_transition(previous, current)
    else:
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
    policies: dict[str, tuple[Path, dict[str, Any], str]] = {}
    links = set()
    for path, data in docs:
        if data["document_type"] == "task":
            if data["task_id"] in tasks:
                raise Invalid(f"duplicate Task identity: {data['task_id']}")
            tasks[data["task_id"]] = (path, data)
        elif data["document_type"] == "scorecard_policy":
            policy_id = data["policy_id"]
            if policy_id in policies:
                raise Invalid(f"duplicate scorecard policy identity: {policy_id}")
            policies[policy_id] = (
                path,
                data,
                hashlib.sha256(path.read_bytes()).hexdigest(),
            )
    for path, task in tasks.values():
        scorecard = task["scorecard"]
        if scorecard is None:
            continue
        policy = policies.get(scorecard["policy_id"])
        if policy is None:
            raise Invalid(f"{path} references a missing scorecard policy")
        _, policy_data, policy_sha256 = policy
        if scorecard["policy_sha256"] != policy_sha256:
            raise Invalid(f"{path} scorecard policy digest does not match raw policy bytes")
        matched = next(
            (
                entry
                for entry in policy_data["entries"]
                if entry["story_points"] == scorecard["story_points"]
            ),
            None,
        )
        if matched is None:
            raise Invalid(f"{path} scorecard story_points do not exist in its policy")
        if (
            scorecard["target_elapsed_seconds"] != matched["target_elapsed_seconds"]
            or scorecard["baseline_sample_size"] != matched["sample_size"]
        ):
            raise Invalid(f"{path} scorecard does not match its policy entry")
    for path, data in docs:
        if data["document_type"] != "task_link":
            continue
        if data["source_task_id"] not in tasks or data["target_task_id"] not in tasks:
            raise Invalid(f"{path} references a missing Task")
        identity = (data["source_task_id"], data["target_task_id"], data["relationship_kind"])
        if identity in links:
            raise Invalid(f"duplicate Task Link relationship: {identity}")
        links.add(identity)


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
