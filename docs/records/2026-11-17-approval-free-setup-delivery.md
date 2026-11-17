# Approval-free setup delivery, measured (epic #635)

Measurement of epic #635's own delivery for #615 (epic #610). Evidence was collected by the delivering drive session on 2026-11-17. This record makes no judgement against the #606 baseline or the Reviewer bench; that stays in #615.

## Drive session

- Session `local_55e8c433-fbfe-4d54-bb20-de1417b365f5`, started 2026-11-17T15:01Z through Remote Control by the coordinator.
- Its `get_session` row reports model `claude-sonnet-5-5`, effort `low`, permission mode `auto`.
- It delivered #628 (PR #638) and #609 (PR #643), plus the epic children #639 (PR #640) and #641 (PR #642) and, in stagely-pro, #1639 (PR #1640, Reviewer bot sole code owner).
- Agents it dispatched: implementer and devops on Sonnet medium, planner on Opus medium, Reviewer on Opus medium in separate sessions.

## Owner steps raised

| # | Step | Reserved by the epic |
| --- | --- | --- |
| 1 | stagely-pro PR #1640, CODEOWNERS path, `review:owner` | Yes, the typed go-ahead; Filip answered "approved" at 15:34Z |
| 2 | skills PR #638 (#628), CODEOWNERS path, `review:owner` | Yes, the same single "approved" covered both PRs |

Two owner-visible requests were not owner steps: stopping session `local_33ac4286` (denied by the auto-mode classifier; resolved when the lock aged out) and filing issues (the coordinator filed #639 and #641). Unreserved owner steps: 0.

## Failed dispatches and refusals

Failed agent dispatches: 0. Implementer, devops and planner dispatches succeeded. Refusals and blocked or repeated steps, with causes:

| Event | Cause |
| --- | --- |
| `stop_session` on `local_33ac4286` | Denied by the auto-mode classifier |
| `issue create` for the orphaned-lock issue | Denied by the classifier; the coordinator filed #639 |
| `drive 635` and `issue create` | Blocked by an orphaned lock (PID 13571), then by the Owner check after #638; skills#641 fixed it |
| Implementer resumed on PR #640 round 1 | Repeated its old hand-back with no fix; fixed on the explicit re-send |
| Implementer on PR #642 | Touched an out-of-scope file; reverted |

## Cost per merged PR

From the `status` reviewer rows (the review round is not tracked here). Implementer, devops and planner usage is `unreported` by the host, and the Sonnet drive session's own cost is in no `workflow:usage` row, so total cost per PR is unknown.

| PR | Issue | Reviewer sessions | Reviewer cost |
| --- | --- | --- | --- |
| #638 | #628 | 3 | $1.72 |
| #640 | #639 | 2 | $1.03 |
| #642 | #641 | 2 | $0.91 |
| #643 | #609 | 2 | $1.29 |
| stagely-pro#1640 | stagely-pro#1639 | 2 | $1.02 |

Median reviewer cost per merged PR over the five PRs: $1.03 (sorted $0.91, $1.02, $1.03, $1.29, $1.72).

The drive session's own comment on #615 is posted by the drive session, not by this record's author.
