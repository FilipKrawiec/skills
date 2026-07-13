# ADR-0005: Mandate Observability in SDLC Agent Workflows

## Decision

We will mandate that all feature implementations design, plan, implement, and review observability (metrics, logs, traces, alerts, and dashboards) as core deliverables within the SDLC phases. We also enforce component testing with a running OpenTelemetry collector to verify telemetry signals where applicable.

Specifically, we integrate observability milestones into the existing SDLC phases:
- **REFINE**: Define telemetry requirements (metrics, logs, traces) and dashboard/alerting specifications (e.g., Grafana, Prometheus).
- **PLAN**: Design the specific observability configurations to write and the exact verification commands/tests.
- **EXECUTE**: Implement both production code instrumentation and dashboard configurations, verifying telemetry signals via component tests.
- **REVIEW**: Verify dashboard configs, alerting logic, and test coverage for telemetry emission.

We will keep the core TDD cycle as `Test -> Prod -> Refactor`, but we make observability a strict deliverable of the surrounding SDLC phases.

## Context

Our existing TDD workflow (`Test -> Prod -> Refactor`) guarantees functional correctness, but it does not prevent us from shipping "blind" code. Often, metrics, logs, tracing, and monitoring dashboards are treated as an afterthought or omitted entirely. 

To ensure system reliability and prompt incident detection, observability must be designed and verified from the start. We cannot verify dashboard configurations as a pre-phase of code implementation (because the application code must first exist to emit the telemetry), so we integrate these requirements directly into the SDLC lifecycle.

## Consequences

- Agents record the telemetry contract and dashboard requirements in the completed REFINE Lifecycle result or its Artifact References; the Task schema adds no duplicate top-level fields.
- Agents record the exact telemetry configurations and verification plan in the PLAN Phase result or its Artifact References.
- Agents must implement telemetry and verify it using component tests (ideally running an OpenTelemetry collector to assert against emitted signals).
- Code reviews must audit both the dashboard/alerting rules and the code instrumentation.
