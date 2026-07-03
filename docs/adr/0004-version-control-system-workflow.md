# ADR-0004: Version Control System (VCS) Workflow for Agent Workflows

## Decision

We will adopt a standardized Git workflow across all repositories to maintain a clean, readable, and linear history.

The detailed process guidelines are maintained in the canonical [vcs](../../skills/vcs/SKILL.md) skill and its reference files: [branch-management.md](../../skills/vcs/references/branch-management.md), [commit-guidelines.md](../../skills/vcs/references/commit-guidelines.md), [integration-policies.md](../../skills/vcs/references/integration-policies.md), and [file-operations.md](../../skills/vcs/references/file-operations.md).

## Context

Agents frequently generate fragmented or messy commit histories, execute redundant merge commits, or perform filesystem moves that break Git's history tracking. Implementing a clear, prescriptive VCS skill makes the agent's commits and branching patterns uniform, clean, and compatible with trunk-based setups.

## Consequences

- Agents must formulate commit messages and branch structures according to this standard.
- We must provide a concrete skill (`vcs`) to guide agents in this process.
