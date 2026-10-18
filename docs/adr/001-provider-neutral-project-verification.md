# ADR-001: Portable skills and delegated delivery

## Decision

This is the single current architectural baseline. The public library contains portable procedure skills and generated host manifests under `plugins/common/`; no proprietary, client or secret content.

The owner approves milestone outcomes and design direction, then the team autonomously refines and delivers bounded slices through planning, implementation, independent review and test deployment. Production requires a separate prepared demo and approval of the exact artifact and configuration. Technical decisions and technical ADR changes remain delegated unless they reverse owner strategy or cross a reserved boundary.

Keep authorization, type, milestone and waiting reason distinct. Temporary failure never erases a granted autonomous lane. Bound retries and replan from evidence; escalate concrete reserved decisions, not every technical difficulty. After each product milestone, complete bounded health work with frozen dependency targets and reproducible project-specific confidence gates; record agreed compatibility/outage exceptions explicitly.

GitHub preserves intent, approvals, claims and evidence across sessions. Hosts own model routing, dispatch, isolated credentials and enforceable coordination. Skills are not a credential or concurrency boundary. Require fresh read-only subagent context for code review; it needs no GitHub credentials. Posting autonomous GitHub approval separately requires approval credentials unavailable to the implementer. A missing approval capability does not prevent code review or authorize infrastructure migration. Parallel work needs proven claims and disjoint scopes including tests; serialize otherwise. Resume reconciles records against actual branch/PR/CI state and never fabricates execution.

Use isolated worktrees and short-lived branches from the fetched base. GitHub protections keep protected paths and owner-reserved actions under required approval. Autonomous engineering merge approval is not production approval. The five board columns and existing membership remain unchanged; any change needs coordinated devcontainer support.

Verification uses project-native commands. Here `just verify` runs unit fixtures and the plugin validator once. Retain `scripts/project-verify.py` as a compatibility entrypoint until consumers migrate, not as a required orchestration layer. Keep policy in its owning skill and use existing platform/build controls before adding a helper.

## Rationale and alternatives

Per-story owner approval and parking every failed fix consume owner attention without resolving engineering work. Unrestricted autonomy would lose product direction and production control. Milestone delegation plus exact-candidate production approval preserves both.

A script for every contract or role would turn this library into another runtime with duplicated host capabilities. Keep procedure guidance portable and enforcement in GitHub, project tools and the host. Package syntax tests alone do not prove credential isolation, release correctness or cross-harness behavior; record those integration capabilities honestly.

## Consequences

- `milestone`, `release` and `health` own their distinct procedures; existing delivery and doctrine skills remain their leaf tools.
- Always-needed instructions stay in the owning `SKILL.md`; references are conditional branches, not shared/injected procedures.
- Actual production promotion remains blocked until its native controls are configured. This repository's stable publication hold stays active until exact-candidate promotion replaces release-on-main.
- Engineering guidance can improve independently; weakening authority, credentials, release or quality gates requires owner approval by effect, regardless of filename.
- Host integrations and project initialization belong outside common packages. The retired Autonomous SDLC framework stays retired; Git history preserves its history.
