# State Store Contract

Repository-changing work requires exactly one durable **State Authority**. Root `sdlc` owns authorization; a State Store owns persistence and concurrency. Stage skills propose results only.

## Select one authority

| Authority | Use when | Canonical state |
| --- | --- | --- |
| `FILE` | Direct CLI work | `.sdlc/` Task, policy, link, and artifact records in the repository. |
| `CONTROL_PLANE` | Harnessed or centrally coordinated work | A control-plane Task API or revisioned database. |

`HYBRID` is not a third authority: it is `CONTROL_PLANE` with a local State Projection for inspection. A projection is read-only for SDLC authorization.

## Required State Store operations

1. **Load** the active Task by `task_id`, including its revision and active Stage/Phase/Lifecycle.
2. **Create** a Task before DEFINE when no Task exists.
3. **Transition** atomically with `task_id`, `expected_revision`, audit entry, and complete candidate snapshot or semantic transition.
4. **Return** the committed revision and current snapshot, or a structured refusal such as `STATE_UNAVAILABLE`, `STALE_REVISION`, or `INVALID_TRANSITION`.
5. **Bind SHIP** authorization to the committed Task revision and candidate artifact digest.

Root must load and validate state before a repository mutation, then validate and commit the transition before authorizing the next mutation. It refuses work if the State Store cannot prove the current authority and revision.

## File-backed direct CLI

Initialize `.sdlc/` before changing repository files. Store the canonical Task at `.sdlc/tasks/<task-id>/task.yaml`, keep policies and links under the same root, and use the bundled validator for each previous/candidate transition. Replace the canonical file only after transition validation succeeds. The Task snapshot is the resume point.

## Control plane

The control plane may store snapshots, events, or both, but exposes the same revision-checked Task semantics. It is responsible for idempotency, leases or concurrency control, approvals, and any outbox. Root includes an idempotency key on retried transitions. A control-plane-issued SHIP authorization is the only authorization a VCS adapter accepts for a control-plane Task.
