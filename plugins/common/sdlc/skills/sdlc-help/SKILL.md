---
name: sdlc-help
description: Consumer quickstart and reference guide for Autonomous SDLC plugins, slash commands, rules, subagents, and configuration. Activate this skill when the user asks how to use, configure, or troubleshoot SDLC plugins.
---

# Autonomous SDLC Consumer Quickstart & Reference

This guide provides a reference for developers and AI agents using the Autonomous SDLC plugin suite in target projects.

## 1. Quickstart Workflow

Execute repository changes through the Autonomous SDLC lifecycle:
1. **Define & Refine**: Propose and align on requirements, boundaries, and acceptance criteria.
2. **Contract Approval**: Review the generated `DeliveryContract` in the interactive artifact pane and click **Proceed**.
3. **Autonomous Execution & Review**: Once approved, execution (`PLAN` -> `EXECUTE` -> `REVIEW`) runs autonomously with unbiased four-eyes code review.

## 2. Slash Commands

- `/sdlc`: Run full Autonomous SDLC lifecycle orchestration.
- `/sdlc-define`: Execute DEFINE and produce the `Definition`.
- `/sdlc-refine`: Execute REFINE and produce the `DeliveryContract`.
- `/sdlc-execute`: Execute the EXECUTE stage.
- `/sdlc-plan`: Execute PLAN and produce the `ImplementationPlan`.
- `/sdlc-review`: Execute REVIEW and produce the `ReviewDecision`.
- `/sdlc-ship`: Execute SHIP and produce the `ShipmentCandidate`.
- `/sdlc-improve`: Execute IMPROVE and produce the `ImprovementOutcome`.
- `/sdlc-help`: Display this quickstart guide and plugin capabilities.
- `/grill-me`: Launch an interactive alignment interview to resolve design decisions and ambiguities before execution.
- `/goal`: Run a long-running delivery task with autonomous persistence until completed.

## 3. Project Configuration (`.agy/config.json`)

Customize plugin behavior for your repository by placing `.agy/config.json` in your project root:

```json
{
  "sdlc": {
    "enforce_hexagonal": true,
    "enforce_ddd": true,
    "require_four_eyes_review": true,
    "test_framework": "jest"
  }
}
```

- `enforce_hexagonal`: Toggle Hexagonal Architecture boundary checks during code review (default: `true`).
- `enforce_ddd`: Toggle Domain-Driven Design ubiquitous language and aggregate invariant checks (default: `true`).
- `require_four_eyes_review`: Enforce isolated subagent reviewer during the `REVIEW` phase (default: `true`).

## 4. Subagents & Rules

- **`sdlc-reviewer` Subagent**: Independent adversarial auditor invoked during `REVIEW` to evaluate changes against `DeliveryContract` and TDD/VCS standards.
- **Interactive Artifacts**: Change proposals and contracts render with a native **Proceed** button for human approval.
- **Subagent Fallback Protocol**: If subagent execution is restricted by environment limits, review degrades safely to inline fresh-turn audit.
