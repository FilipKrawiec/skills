# Context

## Terms

### Autonomous SDLC

The bounded context that defines deterministic autonomous delivery work independently of an executor, runtime, persistence mechanism, or host application.

### Delivery Task

The aggregate root for one requested delivery outcome. It owns ordered Stages, Phase Runs, role assignments, its event history, and its terminal outcome.

### Actor

An identified human, agent, or system that is assigned one or more SDLC Roles for a Delivery Task. The host owns authentication and runtime identity; the Task owns the role assignment and its accountability.

### SDLC Role

An accountability in the Autonomous SDLC bounded context. The closed role enum is `PRODUCT_OWNER`, `BUSINESS_ANALYST`, `SOLUTION_ARCHITECT`, `SOFTWARE_ENGINEER`, `QUALITY_ENGINEER`, `PLATFORM_ENGINEER`, `SECURITY_ENGINEER`, and `SDLC_ORCHESTRATOR`. A role is not an organisational reporting relationship.

### Role Assignment

The association of one Actor with one SDLC Role for one Delivery Task. An Actor may hold several Roles and an SDLC Role may be held by multiple Actors. The SDLC Orchestrator may add an assignment before selecting that Actor; ownership-bias control is enforced by a different Actor identity, not by a different Role.

### Delivery Role Plan

The immutable map of SDLC Roles approved during REFINE for each post-REFINE Phase, approval decision, and unblocking request. The SDLC Orchestrator selects only Task-assigned Actors whose Roles are eligible in this plan.

### Initial Phase Selection

The standard role-only selection before a Delivery Role Plan exists: DEFINE uses `PRODUCT_OWNER` or `BUSINESS_ANALYST`; REFINE uses `BUSINESS_ANALYST` or `SOLUTION_ARCHITECT`.

### Segregation of Duties

A mandatory Autonomous SDLC rule that prevents an Actor from reviewing or approving a Work Product to which that Actor is a recorded Contributor. It applies by Actor identity even when the reviewer or approver holds the same SDLC Role as the contributor.

### Product Owner

The business authority for a Delivery Task. The Product Owner provides the Requested Outcome and is accountable for its business value. Approval eligibility is an Actor-level policy, not a Product Owner-only privilege.

### Work Product

An immutable domain value produced by a Phase Run, such as a Delivery Contract, Implementation Plan, Execution Result, Review Decision, or shipment candidate. It records the Actor instances that contributed to it.

### Contributor

An Actor instance recorded on a Work Product. The Phase Executor is always a Contributor; other Actors are recorded when they materially produce or modify the Work Product.

### Stage

An ordered, mandatory part of a Delivery Task: `DEFINE`, `REFINE`, `EXECUTE`, or `IMPROVE`. A Stage owns one or more Phase Runs and is complete when its required terminal result is recorded.

### Phase Run

One bounded unit of work within a Stage. It receives one typed input and produces one typed terminal outcome. Its internal execution is opaque; its boundary is not.

### Phase Outcome

The immutable typed output of a completed Phase Run. It is exactly `Succeeded`, containing a Work Product, its contributors, Evidence, and one typed Next Action; or `Terminated`, containing `FAILED`, `BLOCKED`, or `CANCELLED`, a reason, and optional Evidence. A terminated outcome has no Work Product and closes the Delivery Task.

### Next Action

The sole workflow instruction in a successful Phase Outcome: `StartPhase`, `RequestApproval`, or `CloseTask`. It selects the only legal successor Phase Run, requests the only legal approval, or closes after IMPROVE. No Work Product may supply an independent executor-selection instruction.

### Start Phase

A Next Action that names one successor Phase and its eligible SDLC Roles. A REVIEW Work Product's closed decision derives this action: `CORRECT_PLAN` to PLAN, `CORRECT_EXECUTE` to EXECUTE, and `READY_FOR_SHIP` to SHIP.

### Blocker Report

An immutable report from an active Phase Executor that names a dependency or constraint and supporting Evidence that prevents the Phase from continuing. It is not a Phase Outcome and does not complete the Phase Run. The SDLC Orchestrator may use it to suspend that same Phase Run and request unblocking.

### Evidence

An immutable reference supporting a Phase Outcome. Its kind is `COMMAND`, `CHECK`, `APPROVAL`, or `ARTIFACT`; its reference identifies the supporting fact or artifact.

### Specification Approval

An explicit approval of a Delivery Contract by an identified eligible Actor at a recorded time. It follows `SpecificationApprovalRequested` and permits EXECUTE to start.

### Shipment Approval

An explicit approval of the reviewed shipment candidate by an identified eligible Actor at a recorded time. It follows `ShipmentApprovalRequested`; a rejected candidate emits `ShipmentRejected`.

### Approval Requirement

A typed requirement emitted with a completed Work Product. It identifies the subject, eligible SDLC Roles, and excluded Contributor Actors. The SDLC Orchestrator selects an eligible non-contributor to decide it.

### Awaiting Approval

A Delivery Task state entered after REFINE or SHIP completes with an Approval Requirement. It has no active Phase Run and can proceed only through the corresponding approval decision.

### Rework Request

An immutable feedback value emitted by a rejected specification or shipment approval. The SDLC Orchestrator supplies it as input to a new previous Phase Run; it never rewrites the rejected Work Product.

### Delivery Guard

The immutable limit for one Delivery Task: at most five hours of Active Delivery Time and at most two Rework Cycles. A Task may tighten but never relax these limits. Breaching either requires investigation, which can only split or cancel the Task before any further delivery work.

### Active Delivery Time

The sum of intervals in which a Phase Run is active. Time spent in AWAITING_APPROVAL or AWAITING_INVESTIGATION is excluded from the Delivery Guard.

### Rework Cycle

One feedback-driven correction: Specification rejection to REFINE, Shipment rejection to REVIEW, or a REVIEW decision returning to PLAN or EXECUTE. It is counted when that correction would append a Phase Run.

### Investigation Required

A workflow event emitted when a Delivery Guard is breached. The Task enters AWAITING_INVESTIGATION and cannot start further normal Phase Runs until an investigation decision is recorded.

### Unblock

An ordinary blocker-resolution workflow, separate from Delivery Guard investigation. It suspends one active Phase Run while a different assigned Actor resolves a named dependency or constraint. The original executor then resumes the same Phase Run with its original input and accrued Active Delivery Time; waiting time is excluded and no extra delivery-time budget is granted.

### Unblock Request

The immutable request created from a Blocker Report. It identifies the suspended Phase Run, named blocker, selected eligible unblocking Actor, and the request's Evidence. A Phase Run may have at most one Unblock Request.

### Task Split

An investigation resolution that closes an oversized Delivery Task and records the identities and requested outcomes of the smaller successor Delivery Tasks created to replace it.

### Domain Event

An immutable workflow fact emitted by a Delivery Task: `TaskCreated`, `ActorAssigned`, `PhaseStarted`, `PhaseCompleted`, `PhaseSuspended`, `PhaseResumed`, `SpecificationApprovalRequested`, `SpecificationApproved`, `SpecificationRejected`, `ShipmentApprovalRequested`, `ShipmentApproved`, `ShipmentRejected`, `InvestigationRequired`, `UnblockRequested`, `UnblockResolved`, `TaskSplit`, or `TaskClosed`. Events define observable workflow facts; they do not require event-sourced storage. Each records the causing command and resulting aggregate revision.

### Command Envelope

The immutable request to change a Delivery Task: its Task identity, unique command identity, expected aggregate revision, issuing Actor, and typed payload. It makes command retries idempotent and stale concurrent commands rejectable.

### Phase Executor

An Actor selected for a Phase Run because of its SDLC Role. It performs the Phase from typed input and returns either a proposed typed outcome or a Blocker Report while the Phase is active. It is always a Contributor to the resulting Work Product and may be an agent, a human, a service, or a host-native delegation mechanism.

### Conforming Host

An implementation that preserves the Autonomous SDLC Specification's domain values, invariants, event ordering, and legal transitions. It owns storage, scheduling, UI, and delegation.

### Release Version

The one semantic version shared by every common and agent-native plugin in this repository. Its authoritative persistent record is the matching annotated Release Tag, not a version file.

### Release Tag

An annotated Git tag in the form `v<semantic-version>` that identifies the exact `main` commit from which a repository-wide plugin release is published.

### Release Publication

The Git push of a `main` commit and its Release Tag. It is permitted only when every version-bearing plugin manifest on that commit contains the tag's semantic version and the version differs from the preceding Release Tag.
