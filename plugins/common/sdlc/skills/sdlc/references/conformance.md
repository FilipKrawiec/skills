# Autonomous SDLC Conformance

This document supplies implementation-neutral scenarios for the [Autonomous SDLC Specification](autonomous-sdlc-specification.md). A Conforming Host MUST preserve their outcome and event ordering.

## Valid: accepted delivery

```text
TaskCreated(initial Role Assignments including PRODUCT_OWNER, SDLC_ORCHESTRATOR, and DEFINE executor)
PhaseStarted(DEFINE, RequestedOutcome, PRODUCT_OWNER or BUSINESS_ANALYST executor)
PhaseCompleted(DEFINE, Succeeded { Definition, contributors, Evidence, StartPhase(REFINE) })
PhaseStarted(REFINE, Definition, BUSINESS_ANALYST or SOLUTION_ARCHITECT executor)
PhaseCompleted(REFINE, Succeeded { DeliveryContract { delivery_role_plan }, contributors, Evidence, RequestApproval(SPECIFICATION) })
SpecificationApprovalRequested(DeliveryContract, ApprovalRequirement)
ActorAssigned(eligible non-contributor, planned role)
SpecificationApproved(DeliveryContract, eligible non-contributor)
PhaseStarted(PLAN, DeliveryContract, selected executor)
PhaseCompleted(PLAN, Succeeded { ImplementationPlan, contributors, Evidence, StartPhase(EXECUTE) })
PhaseStarted(EXECUTE, ImplementationPlan, executor)
PhaseCompleted(EXECUTE, Succeeded { ExecutionResult, contributors, Evidence, StartPhase(REVIEW) })
PhaseStarted(REVIEW, ExecutionResult, non-contributor reviewer)
PhaseCompleted(REVIEW, Succeeded { ReviewDecision { READY_FOR_SHIP }, contributors, Evidence, StartPhase(SHIP) })
PhaseStarted(SHIP, ExecutionResult + ReviewDecision { READY_FOR_SHIP }, executor)
PhaseCompleted(SHIP, Succeeded { ShipmentCandidate, contributors, Evidence, RequestApproval(SHIPMENT) })
ShipmentApprovalRequested(ShipmentCandidate, ApprovalRequirement)
ShipmentApproved(ShipmentCandidate, eligible non-contributor, approval Evidence)
PhaseStarted(IMPROVE, AcceptanceDecision { ACCEPTED }, selected executor)
PhaseCompleted(IMPROVE, Succeeded { ImprovementOutcome { ACCEPTED }, contributors, Evidence, CloseTask(ACCEPTED) })
TaskClosed(ACCEPTED)
```

## Valid: review correction

A REVIEW completed with `ReviewDecision { CORRECT_EXECUTE }` MUST use `StartPhase(EXECUTE)` and count one Rework Cycle. `CORRECT_PLAN` likewise uses `StartPhase(PLAN)` and counts one Rework Cycle. Neither decision may supply another executor selection, skip directly to SHIP, or close the Task.

## Valid: approval rework

`SpecificationRejected` MUST append REFINE with its Rework Request only when the Delivery Guard admits the next Rework Cycle. `ShipmentRejected` likewise appends REVIEW only when admitted. When the guard denies rework, it records the rejection and feedback, then emits InvestigationRequired without appending a Phase Run. Neither event may rewrite the rejected Work Product or skip to an unrelated Phase.

## Valid: blocked delivery

When active EXECUTE completes with `Terminated { BLOCKED, reason }`, the Task emits `PhaseCompleted(EXECUTE, Terminated { BLOCKED, reason })` then `TaskClosed(BLOCKED)`. It emits no successor start or Work Product.

## Valid: delivery-guard breach

When an active Phase Run reaches five hours of Active Delivery Time, the SDLC Orchestrator issues EnforceDeliveryGuard; the Task emits PhaseSuspended(DELIVERY_GUARD), then InvestigationRequired, and enters AWAITING_INVESTIGATION. When a correction would create the third Rework Cycle, or when an approval would start a non-terminal Phase after the limit, it records that decision then emits InvestigationRequired without starting the requested Phase. ResolveInvestigation may only split or cancel; a terminal closure remains legal.

## Valid: unblock, resume, and delivery-guard breach

An active EXECUTE executor may return `BlockerReport { blocker, evidence }`. The Task-assigned SDLC Orchestrator issues RequestUnblock for that same Phase Run and a selected, Task-assigned Actor in an eligible unblocking role who is not the EXECUTE executor. The Task emits `PhaseSuspended(BLOCKER)`, then `UnblockRequested`, and enters AWAITING_UNBLOCK. The selected Actor resolves it with Evidence; the Task emits `UnblockResolved`, then `PhaseResumed`. The same EXECUTE executor resumes the same Phase Run with its original Implementation Plan and accumulated Active Delivery Time. It starts no new Phase Run and receives no time-budget extension. If that resumed run later reaches its Active Delivery Time limit, it emits the one permitted second suspension, `PhaseSuspended(DELIVERY_GUARD)`, then `InvestigationRequired`; it must not resume again and ResolveInvestigation can only split or cancel.

## Valid: command retry and split

Repeating an identical Command Envelope returns the events produced by its first application and appends none. A new command at a stale expected revision is rejected. For a SPLIT decision, the source TaskSplit, every child TaskCreated + initial PhaseStarted carrying the same split identity, and source TaskClosed(SPLIT) become observable together; retrying the same split command does not create extra children.

## Invalid scenarios

An implementation MUST reject all of the following:

- Starting PLAN before `SpecificationApproved`.
- Starting a successor without an atomically supplied, Task-assigned eligible selected successor executor.
- Selecting DEFINE or REFINE executor roles outside the Initial Phase Selection rules.
- Selecting an actor that is not assigned to a role allowed by the StartPhase or Approval Requirement, or selecting roles outside the approved Delivery Role Plan.
- Starting REVIEW with an Actor recorded as a Contributor to the reviewed Execution Result.
- Recording an approval decision from an Actor recorded as a Contributor to its subject Work Product, even when the Actors have the same role.
- Starting SHIP without `ReviewDecision { READY_FOR_SHIP }`.
- Completing REVIEW or shipment approval with a decision value outside its closed enum.
- Completing a successful Phase without Evidence, contributors, and exactly one Next Action; recording a Work Product for a terminated Phase Outcome.
- Using a REVIEW executor requirement or any other second successor-selection value outside `StartPhase`.
- Starting IMPROVE before `ShipmentApproved`, or starting REVIEW after `ShipmentRejected` without its Rework Request.
- Starting normal or rework delivery work after a Delivery Guard breach and before investigation is resolved.
- Resolving a Delivery Guard investigation through Unblock or ordinary delivery work.
- Suspending a completed Phase Run, resuming a different Phase Run or executor, or granting a resumed Phase Run extra Active Delivery Time.
- Suspending one Phase Run more than once for `BLOCKER`, suspending it after a `DELIVERY_GUARD` suspension, or selecting its executor as the unblocking Actor.
- Closing an accepted Task without successful IMPROVE.
- Rewriting started input, Work Product, contributor set, or completed outcome.
- Replaying a command with different contents under the same command identity, applying a new command at a stale expected revision, or creating a Task with an expected revision other than zero.
- Deciding approval or resolving unblock with a stale, unknown, or non-pending requirement/request identity.
- Recording duplicate Stage or Phase Run identities, dangling events, non-monotonic events, a successor before its predecessor completes, or an event after closure.
