# ADR-0004: Version Control System (VCS) Workflow for Agent Workflows

## Decision

We will adopt a standardized Git workflow across all repositories to maintain a clean, readable, and linear history.

The process is governed by the following rules:

1. **Trunk-Based Development with Short-Lived Branches:**
   - All work must be conducted on short-lived feature branches targeting the main/trunk branch.
   - Force-pushing (`git push --force-with-lease`) is authorized only on these feature branches to keep remote states aligned during rebases.

2. **Conventional Commits with Contextual ID Prefixing:**
   - Commit messages must follow the Conventional Commits specification.
   - If the task is associated with an issue tracker, the commit message must be prefixed with the issue/task ID (e.g., `123: feat: add new feature`).
   - If the task is not connected to an issue tracker, the ID prefix must be skipped.

3. **Rebase & Squash Merging:**
   - Commits must be squashed into logical, cohesive units before integration.
   - Merge operations must be performed using rebase (specifically squash and rebase via remote MR/PR) to preserve a linear history on the main branch.

4. **Preserving History on Renames:**
   - File renames and moves must use `git mv` instead of standard filesystem operations to ensure Git correctly tracks the file's revision history.

## Context

Agents frequently generate fragmented or messy commit histories, execute redundant merge commits, or perform filesystem moves that break Git's history tracking. Implementing a clear, prescriptive VCS skill makes the agent's commits and branching patterns uniform, clean, and compatible with trunk-based setups.

## Consequences

- Agents must formulate commit messages and branch structures according to this standard.
- We must provide a concrete skill (`vcs`) to guide agents in this process.
