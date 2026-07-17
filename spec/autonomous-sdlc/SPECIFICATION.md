# Autonomous SDLC Specification

Status: Draft 0.1 — internal

This is the authoritative definition of the Autonomous SDLC bounded context. It defines domain language, workflow, and conformance. Hosts may implement it with Quarkus, an agent orchestrator, a service, or another runtime; they MUST preserve its domain behavior.

The key words **MUST**, **MUST NOT**, and **MAY** are normative.

## Boundary and model

The specification owns Delivery Tasks, Actors, Roles, Work Products, typed Phase contracts, approvals, events, and legal transitions. A host owns authentication, persistence, scheduling, delegation, UI, and telemetry transport.

```text
DeliveryTask (aggregate root)
  ├── RoleAssignment[Actor, SDLC Role]
  ├── Stage[DEFINE | REFINE | EXECUTE | IMPROVE]
  │     └── PhaseRun[1..*]
  │           ├── typed input
  │           └── PhaseOutcome → a typed next action or a terminal result
  └── DomainEvent[*]
```

`DeliveryTask`, `Actor`, `Stage`, and `PhaseRun` are entities with stable identities. `RoleAssignment`, `DeliveryRolePlan`, `WorkProduct`, `Definition`, `DeliveryContract`, `ImplementationPlan`, `ExecutionResult`, `ReviewDecision`, `ShipmentCandidate`, `AcceptanceDecision`, `ImprovementOutcome`, `Evidence`, `StartPhase`, `RequestApproval`, `CloseTask`, `Succeeded`, `Terminated`, `ApprovalRequirement`, `ReworkRequest`, `CommandEnvelope`, `BlockerReport`, `UnblockRequest`, and `SuccessorTask` are immutable value objects.

A Delivery Task is `ACTIVE`, `AWAITING_APPROVAL`, `AWAITING_INVESTIGATION`, `AWAITING_UNBLOCK`, or `CLOSED`. Stages occur once and in this order: `DEFINE`, `REFINE`, `EXECUTE`, `IMPROVE`. `CLOSED` is a Task state, never a Stage. DEFINE and IMPROVE each contain one same-named Phase Run; REFINE may append a new REFINE Phase Run only after `SpecificationRejected`. EXECUTE contains the legal `PLAN -> EXECUTE -> REVIEW -> SHIP` path, including REVIEW correction loops.

## Actors, roles, and four-eyes control

An Actor is a human, agent, or system identity. A Role Assignment associates an Actor with an SDLC Role for one Delivery Task. One Actor MAY hold several roles and several Actors MAY hold one role; roles describe accountability, not organisational hierarchy.

| SDLC Role | Accountability | Typical responsibility |
| --- | --- | --- |
| `PRODUCT_OWNER` | Business outcome | provides Requested Outcome and business context |
| `BUSINESS_ANALYST` | Scope and business context | DEFINE and REFINE contribution |
| `SOLUTION_ARCHITECT` | Technical coherence | REFINE and PLAN contribution |
| `SOFTWARE_ENGINEER` | Implementation | PLAN and EXECUTE |
| `QUALITY_ENGINEER` | Verification and acceptance coverage | EXECUTE and REVIEW contribution |
| `PLATFORM_ENGINEER` | Delivery operability | PLAN, EXECUTE, and SHIP contribution |
| `SECURITY_ENGINEER` | Security constraints and verification | REFINE, EXECUTE, and REVIEW contribution |
| `SDLC_ORCHESTRATOR` | Legal workflow | selects Actors, validates outcomes, records events |

The SDLC Role enum is exactly `PRODUCT_OWNER`, `BUSINESS_ANALYST`, `SOLUTION_ARCHITECT`, `SOFTWARE_ENGINEER`, `QUALITY_ENGINEER`, `PLATFORM_ENGINEER`, `SECURITY_ENGINEER`, and `SDLC_ORCHESTRATOR`. Every Delivery Task MUST assign `PRODUCT_OWNER` and `SDLC_ORCHESTRATOR` before its first Phase starts. A Phase Executor is identified in `PhaseStarted` and is always a Contributor to its Work Product. A Work Product has immutable `contributors: ActorId[1..*]`.

Segregation is by Actor identity, never role: a REVIEW executor MUST NOT be a Contributor to the Execution Result it evaluates; an approval decision Actor MUST NOT be a Contributor to the Work Product it decides. These rules apply even when the involved Actors share the same role.

Before a Delivery Role Plan exists, DEFINE selection is limited to `PRODUCT_OWNER` or `BUSINESS_ANALYST`, and REFINE selection is limited to `BUSINESS_ANALYST` or `SOLUTION_ARCHITECT`. All later Phase and approval selection uses the approved Delivery Role Plan.

## Commands and events

| Command | Preconditions | Events |
| --- | --- | --- |
| `CreateTask` | new identity; initial Role Assignments include Product Owner, SDLC Orchestrator, and DEFINE executor | `TaskCreated`, `PhaseStarted(DEFINE)` |
| `AssignActor` | Task is not CLOSED; Actor is identified; Role is in the SDLC Role enum | `ActorAssigned` |
| `CompleteActivePhase` | Task is ACTIVE; exactly one active Phase Run; submitted `PhaseOutcome` matches that Phase | `PhaseCompleted`, then its required Next Action |
| `RequestUnblock` | Task is ACTIVE; the named active Phase Run has returned a `BlockerReport` | `PhaseSuspended`, `UnblockRequested` |
| `ResolveUnblock` | Task is AWAITING_UNBLOCK; issuer is the selected unblocking Actor | `UnblockResolved`, `PhaseResumed` |
| `DecideApproval` | Task is AWAITING_APPROVAL; issuer satisfies the pending Approval Requirement and is not an excluded Contributor | approval decision, then successor start or feedback-driven rework |
| `EnforceDeliveryGuard` | Task is ACTIVE; active delivery time is greater than or equal to its limit | `PhaseSuspended(DELIVERY_GUARD)`, `InvestigationRequired` |
| `ResolveInvestigation` | Task is AWAITING_INVESTIGATION; an Investigation Required event exists | `SPLIT` or `CANCEL` investigation decision and its defined next action |

Every command is `CommandEnvelope { task_id, command_id, expected_revision, issued_by, payload }`. `command_id` is unique per Task and `expected_revision` is the aggregate revision observed by the issuer. `CreateTask.expected_revision` is exactly `0` for an absent Task identity. A host MUST apply a command only at its expected revision. A repeated command with the same `command_id` and identical envelope MUST return its original result and events without appending another event; reuse of a command ID with different contents, a second creation command for an existing Task identity, or a new command at a stale revision, MUST be rejected.

`CreateTask` is issued by the Actor assigned as its initial `SDLC_ORCHESTRATOR`. `AssignActor`, `CompleteActivePhase`, `RequestUnblock`, `EnforceDeliveryGuard`, and `ResolveInvestigation` are issued by a Task-assigned `SDLC_ORCHESTRATOR`. `DecideApproval` is issued by its deciding Actor. `ResolveUnblock` is issued by the selected unblocking Actor. An executor proposes an outcome or a Blocker Report, but never issues a Task-mutating command merely by doing so.

The command payloads are exactly:

- `CreateTask { requested_outcome, initial_role_assignments, define_executor }`
- `AssignActor { actor, role }`
- `CompleteActivePhase { phase_run_id, outcome, selected_successor_executor? }`
- `RequestUnblock { phase_run_id, blocker_report, selected_unblocking_actor }`
- `ResolveUnblock { unblock_request_id, resolution_evidence }`
- `DecideApproval { approval_requirement_id, decision, evidence, rework_request?, selected_successor_executor? }`, where Specification `decision` is exactly `APPROVED | REJECTED` and Shipment `decision` is exactly `ACCEPTED | REJECTED`; `rework_request` is required exactly for `REJECTED`, and shipment decisions require `APPROVAL` Evidence.
- `EnforceDeliveryGuard { phase_run_id, observed_active_delivery_time }`
- `ResolveInvestigation { decision: SPLIT | CANCEL, split_id?, successors?, rationale }`; `split_id` and a non-empty `successors: Set<SuccessorTask>` are required exactly for `SPLIT`. `SuccessorTask` is `{ task_id, requested_outcome, initial_role_assignments, define_executor }`.

Events are append-only and ordered within one Delivery Task. A host MAY use events, snapshots, relational records, or another representation if the observable event order is equivalent.

| Event | Required facts |
| --- | --- |
| `TaskCreated` | task identity, Requested Outcome, immutable initial Role Assignments, DEFINE executor, optional origin split identity, occurred-at |
| `ActorAssigned` | Actor, SDLC Role, occurred-at |
| `PhaseStarted` | phase-run identity, Stage, Phase kind, executor Actor, typed input, occurred-at |
| `PhaseCompleted` | phase-run identity, `PhaseOutcome`, occurred-at |
| `PhaseSuspended` | phase-run identity, cause `BLOCKER | DELIVERY_GUARD`, optional `BlockerReport`, occurred-at |
| `SpecificationApprovalRequested` | Delivery Contract, Approval Requirement including its identity, occurred-at |
| `SpecificationApproved` | Delivery Contract, deciding Actor, occurred-at |
| `SpecificationRejected` | Delivery Contract, deciding Actor, `ReworkRequest`, occurred-at |
| `ShipmentApprovalRequested` | Shipment Candidate, Approval Requirement including its identity, occurred-at |
| `ShipmentApproved` | Shipment Candidate, `AcceptanceDecision { ACCEPTED }`, deciding Actor, Evidence, occurred-at |
| `ShipmentRejected` | Shipment Candidate, `AcceptanceDecision { REJECTED }`, deciding Actor, `ReworkRequest`, Evidence, occurred-at |
| `InvestigationRequired` | breached Delivery Guard, active delivery time, rework-cycle count, occurred-at |
| `UnblockRequested` | Unblock Request, occurred-at |
| `UnblockResolved` | Unblock Request, resolving Actor, resolution evidence, occurred-at |
| `PhaseResumed` | phase-run identity, occurred-at |
| `TaskSplit` | split identity, source Task, non-empty `SuccessorTask` set, rationale, occurred-at |
| `TaskClosed` | `TaskTerminalOutcome`, `TaskClosingCause`, subject identity, occurred-at |

Every event carries the causing `command_id` and resulting aggregate revision. `TaskTerminalOutcome` is exactly `ACCEPTED | FAILED | BLOCKED | CANCELLED | SPLIT`. `TaskClosingCause` is exactly `IMPROVEMENT_COMPLETED | PHASE_TERMINATED | INVESTIGATION_CANCELLED | INVESTIGATION_SPLIT`. Successful IMPROVE maps only to `ACCEPTED` / `IMPROVEMENT_COMPLETED`; a `Terminated` Phase Outcome maps to its matching status / `PHASE_TERMINATED`; cancellation maps to `CANCELLED` / `INVESTIGATION_CANCELLED`; and split maps to `SPLIT` / `INVESTIGATION_SPLIT`.

## Typed phase contracts

`PhaseOutcome` is exactly one of the following discriminated values:

- `Succeeded { work_product, contributors, evidence, next_action }`
- `Terminated { status: FAILED | BLOCKED | CANCELLED, reason, evidence? }`

`Succeeded` is required for a successful Phase Run. Its Work Product, non-empty contributor set, and non-empty Evidence set are immutable. `Terminated` is required for an unsuccessful Phase Run; it has no Work Product and always closes the Task with its matching terminal outcome. A host MUST NOT represent an unsuccessful completion as a successful Work Product with a special status.

`next_action` is exactly one of:

- `StartPhase { next_phase, eligible_roles }`, which selects the stated non-terminal Phase. `eligible_roles` is a non-empty subset of the defined SDLC Roles.
- `RequestApproval { kind: SPECIFICATION | SHIPMENT, approval_requirement_id, subject_work_product, eligible_roles, excluded_contributor_actor_ids }`, which creates the corresponding task-unique `ApprovalRequirement` and moves the Task to AWAITING_APPROVAL.
- `CloseTask { outcome: ACCEPTED }`, which is legal only for successful IMPROVE.

Capabilities and free-form selection criteria are not part of this specification. `StartPhase` is the only source of executor selection for a successor; no Work Product may introduce a second executor-selection value.

Whenever a `CompleteActivePhase` or `DecideApproval` command will admit and start a `StartPhase`, including admitted specification or shipment rejection rework, its `selected_successor_executor` is required. The orchestrator validates that this Actor is currently Task-assigned, has a role in that StartPhase's eligible roles, and satisfies every applicable four-eyes rule; it then emits PhaseStarted atomically with the command's transition. The field is absent for RequestApproval, CloseTask, and Guard-denied transitions. The Delivery Role Plan supplies eligibility only; this command field is the sole concrete Actor selection.

| Stage / Phase | Input | Successful Work Product | Next instruction |
| --- | --- | --- | --- |
| DEFINE / DEFINE | `RequestedOutcome { goal, scope, constraints, references }` | `Definition { goal, scope, non_goals, decisions, references }` | `StartPhase(REFINE, Initial Phase Selection)` |
| REFINE / REFINE | `Definition`, optional rejected Delivery Contract, optional Rework Request | `DeliveryContract { deliverable, completion_condition, acceptance_criteria, constraints, risks, verification_plan, delivery_role_plan }` | `RequestApproval(SPECIFICATION, DeliveryContract, plan specification-approval roles)` |
| EXECUTE / PLAN | Delivery Contract plus correction context | `ImplementationPlan { slices, boundaries, verification_plan, recovery_controls }` | `StartPhase(EXECUTE, plan EXECUTE roles)` |
| EXECUTE / EXECUTE | Implementation Plan | `ExecutionResult { change_summary, verification, skipped_checks, residual_risks }` | `StartPhase(REVIEW, plan REVIEW roles)` |
| EXECUTE / REVIEW | Execution Result, Delivery Contract, prior corrections, optional rejected Shipment Candidate, optional Rework Request | `ReviewDecision { decision, findings }` | `StartPhase` whose next phase is derived from `decision` |
| EXECUTE / SHIP | Execution Result, `ReviewDecision { READY_FOR_SHIP }`, and Evidence | `ShipmentCandidate { release, evidence }` | `RequestApproval(SHIPMENT, ShipmentCandidate, plan shipment-approval roles)` |
| approval / shipment | pending Shipment Candidate | `AcceptanceDecision { decision, approver, recorded_at, evidence }` | `ACCEPTED` starts IMPROVE; `REJECTED` starts REVIEW |
| IMPROVE / IMPROVE | Acceptance Decision, completed outcomes, residual risks | `ImprovementOutcome { delivery_outcome, observations, risks, follow_ups }` | `CloseTask(ACCEPTED)` |

`DeliveryRolePlan` is `{ phase_roles: Map<PLAN | EXECUTE | REVIEW | SHIP | IMPROVE, NonEmptySet<SDLC Role>>, approval_roles: Map<SPECIFICATION | SHIPMENT, NonEmptySet<SDLC Role>>, unblock_roles: NonEmptySet<SDLC Role> }`. Every listed key is mandatory. It does not require an Actor to be assigned when REFINE completes. The orchestrator may emit `ActorAssigned` later, then selects an assigned Actor in an eligible role. `ApprovalRequirement` is `{ id, kind, subject_phase_run_id, subject_work_product, eligible_roles, excluded_contributor_actor_ids }`; its identity is task-unique and `DecideApproval` MUST reference the currently pending requirement. `ReviewDecision.decision` is exactly one of `CORRECT_PLAN`, `CORRECT_EXECUTE`, or `READY_FOR_SHIP`; it derives the sole legal `StartPhase.next_phase` as PLAN, EXECUTE, or SHIP respectively. `AcceptanceDecision.decision` is exactly `ACCEPTED` or `REJECTED`; it maps only to ShipmentApproved or ShipmentRejected respectively. Every post-REFINE `StartPhase`, `RequestApproval`, or `UnblockRequest` MUST use the non-empty roles for its matching Delivery Role Plan key. `Evidence` is `{ kind: COMMAND | CHECK | APPROVAL | ARTIFACT, reference }`; both fields are required and non-empty. An approved or rejected shipment decision MUST include `APPROVAL` Evidence.

Every Task has an immutable `DeliveryGuard { maximum_active_delivery_time <= PT5H, maximum_rework_cycles <= 2 }`. Active Delivery Time is the sum of active Phase Run intervals; AWAITING_APPROVAL, AWAITING_INVESTIGATION, and AWAITING_UNBLOCK do not consume it. A Task MAY tighten either limit but MUST NOT relax either one. `ReworkCycle` increments for every Specification or Shipment rejection and every REVIEW correction that would append a Phase Run. The Task-assigned SDLC Orchestrator MUST issue `EnforceDeliveryGuard` when an active Phase Run's Active Delivery Time is greater than or equal to its limit; it suspends that Phase Run, emits InvestigationRequired, and enters AWAITING_INVESTIGATION. Guard admission is also mandatory whenever any command would start a non-terminal Phase Run, including after an approval decision: if Active Delivery Time is greater than or equal to the limit, or the requested successor would exceed the rework limit, the orchestrator records the decision, emits InvestigationRequired, enters AWAITING_INVESTIGATION, and MUST NOT start that Phase Run. A terminal closure takes precedence over this guard.

## Workflow

```text
DEFINE → REFINE → [SpecificationApprovalRequested] → PLAN
PLAN → EXECUTE → REVIEW
REVIEW → PLAN | EXECUTE | SHIP
SHIP → [ShipmentApprovalRequested] → ShipmentApproved → IMPROVE → CLOSED
ShipmentRejected → REVIEW
```

`SpecificationApproved` starts PLAN only when Guard admission permits it. `ShipmentApproved` derives `AcceptanceDecision { ACCEPTED, approver: CommandEnvelope.issued_by, recorded_at: ShipmentApproved.occurred_at, evidence: DecideApproval.evidence }` and starts IMPROVE only when Guard admission permits it. `ShipmentRejected` derives the corresponding rejected Acceptance Decision, records its Rework Request, and appends REVIEW only when Guard admission permits it. A normal successful `ImprovementOutcome.delivery_outcome` is `ACCEPTED`.

`SpecificationRejected` appends a new REFINE Phase Run with its `ReworkRequest` only when the Delivery Guard admits that Rework Cycle. `ShipmentRejected` likewise appends a new REVIEW Phase Run only when admitted. The rejected Work Product remains immutable; all admitted rework is observable as a new Phase Run. When the guard denies the rework, the rejection and its feedback are recorded, followed by `InvestigationRequired`; no Phase Run is appended.

When the Delivery Guard is breached, `InvestigationRequired` suspends its normal transition. `ResolveInvestigation` can only split or cancel; it MUST NOT request an unblock or start further delivery work.

An executor may instead return `BlockerReport { blocker, evidence }` while its Phase Run is active. `blocker` is non-empty and `evidence` is a non-empty Evidence set. It is not a Phase Outcome and does not complete the Phase Run. The orchestrator may then issue `RequestUnblock`, which records `PhaseSuspended` and `UnblockRequested`, and enters AWAITING_UNBLOCK. `UnblockRequest` is `{ id, phase_run_id, blocker, selected_unblocking_actor, evidence }`; its identity is task-unique and `ResolveUnblock` MUST reference the currently pending request. The request names the same suspended Phase Run, the named blocker, and a selected Task-assigned Actor in an eligible Unblock role who is different from that Phase Run's executor. Before a Delivery Role Plan exists, any Task-assigned SDLC Role is eligible for unblocking; after REFINE approval, the selected Actor's role MUST be in `DeliveryRolePlan.unblock_roles`. The Unblocking Actor MAY have contributed to earlier Work Products.

`ResolveUnblock` records the selected Actor's resolution Evidence, then resumes exactly the same Phase Run with its original typed input and original executor. It does not append a new Phase Run, reset its accumulated Active Delivery Time, add delivery-time budget, or change the executor. Time while the Phase is suspended is excluded from Active Delivery Time. A Phase Run may have at most one `BLOCKER` suspension and may resume from that suspension only once. If its executor later returns `Terminated { BLOCKED }`, the Task closes as BLOCKED. A resumed Phase Run remains subject to the ordinary Delivery Guard; a later breach records its one permitted `DELIVERY_GUARD` suspension and can only split or cancel.

For `ResolveInvestigation(SPLIT)`, `TaskSplit`, every derived successor TaskCreated and initial PhaseStarted fact, and the source TaskClosed(SPLIT) form one atomic observable composite identified by `split_id`: a Conforming Host MUST expose all of them or none of them. The source Task's `ResolveInvestigation` command authorizes this derived creation; it is not an independently issued child `CreateTask` command. Each successor TaskCreated and its initial PhaseStarted carries `origin_split_id` and the parent command identity as its cause. A host MAY implement this with a transaction or durable saga, but it MUST make retries idempotent and MUST NOT expose a partial split as complete. A successor Task is independent after this composite completes; no global ordering applies after it.

## Invariants

- An ACTIVE Task has exactly one active Phase Run; an AWAITING_APPROVAL Task has none and exactly one pending Approval Requirement.
- An AWAITING_UNBLOCK Task has exactly one suspended, not completed, Phase Run and exactly one pending Unblock Request.
- The TaskCreated initial Role Assignments include the DEFINE executor. DEFINE and REFINE executors MUST be Task-assigned to an Initial Phase Selection role; only post-REFINE executors and approvers MUST be Task-assigned to matching Delivery Role Plan roles.
- An AWAITING_INVESTIGATION Task has no active Phase Run, may retain one suspended Phase Run only when the active-time limit triggered it, and no normal successor may start before `ResolveInvestigation`.
- An AWAITING_UNBLOCK Task leaves it only through `ResolveUnblock` by its selected unblocking Actor.
- A Task leaves AWAITING_APPROVAL only through `DecideApproval` by an eligible non-contributor Actor.
- An executor, approver, or unblocking Actor MUST be Task-assigned to an eligible Role, but need not have been assigned when REFINE completed. Independence is determined by Actor identity and contributor provenance, not distinct Roles.
- Stages and Phase Runs have unique identities within their Task and Stage respectively.
- A started input, completed Phase Outcome, Work Product, contributor set, Evidence set, terminal status, and event are immutable.
- Every non-final Phase Run completed successfully. A non-successful completion closes the Task.
- A Task MUST issue `EnforceDeliveryGuard` and enter AWAITING_INVESTIGATION when an active Phase Run reaches the Active Delivery Time limit, and MUST NOT start a non-terminal successor after five hours of Active Delivery Time or two Rework Cycles without Guard admission; terminal closure takes precedence.
- A Phase Run with a `BLOCKER` suspension can resume only once, retaining its original executor, input, and accrued Active Delivery Time. It receives no extra delivery-time budget. A later Delivery Guard breach is the only permitted second suspension; it enters investigation and the Task can only split or cancel.
- A successor starts after its predecessor completes. Event timestamps are monotonic within a Task.
- A closed Task emits no later event. It closes after successful IMPROVE or immediately after a failed, blocked, or cancelled Phase.
- Every persisted event references an existing Task and subject. A history MUST satisfy these rules, not merely its storage shape.

## Conformance

A Conforming Host MUST accept the valid scenarios and reject the invalid scenarios in [conformance.md](conformance.md). It MAY add host-specific data outside the domain values, but this specification defines no CLI, persistence schema, service API, executor vendor, or event-store requirement.
