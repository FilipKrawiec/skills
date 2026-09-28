---
name: issue-factory
description: Operate a bounded owner-approved GitHub issue queue through local Claude Code or Codex and return verified draft pull requests.
disable-model-invocation: true
allowed-tools: Skill Read Bash(python3:*,gh:*,git:*)
---

# Local Issue Factory

## 1. Prepare

Read [operations.md](references/operations.md). Confirm the private personal
repository, owner login, dedicated worker account or VM, configured verification
gate, and one active dispatcher. Select the executor with an issue label.

Exit gate: the read-only dispatcher report identifies eligible tasks and rejects
incomplete or unauthorized packets.

## 2. Authorize

Use an owner-authored issue containing observable acceptance criteria and a
bounded factory packet. Complete its prerequisite issues, then have the owner
apply `agent:ready` after specification review. Keep automation, permission,
credential, and instruction changes in interactive delivery.

Exit gate: owner readiness event, exactly one executor, approved paths, completed
dependencies, and a fresh local run record.

## 3. Execute

Start an explicitly bounded foreground run after the local-access review. The
dispatcher serializes tasks and creates a linked worktree from current upstream
main. Its trusted bundled TDD and review instructions guide the executor; the
dispatcher owns the final verification, commit, push, and draft PR publication.

Exit gate: a draft PR linked to one issue and verification evidence, or a blocked
record with preserved work. The pinned owner readiness event and verified Git
tree pass publication checks. Existing records return for owner recovery.

## 4. Return

Inspect the draft diff, acceptance results, and hosted checks. Let the owner make
merge and release decisions. Record recovery actions against the original issue
before reauthorizing a failed run.

Exit gate: owner-visible PR or blocker; inspect the worker session for lingering
processes and retain all unfinished work for recovery.

## Output

Return at most five lines: issue, executor, phase, draft PR or blocker, and the
next owner action. Private local logs remain local.
