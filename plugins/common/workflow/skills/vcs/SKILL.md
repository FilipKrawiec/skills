---
name: vcs
description: Use when performing Git or version control operations, including branching, commits, rebases, squashes, force-with-lease pushes, merges, and file moves.
---

# Version Control System (VCS) Workflow

Follow these steps for all version control and git operations to maintain a clean, readable, and linear history.

## Execution Phases

### Phase 1: Preflight & Branch Isolation
1. Inspect working tree status: `git status --short --branch`.
2. Create a short-lived task branch or dedicated worktree from main.
*Exit Gate*: Working directory is clean and isolated on the task branch.

### Phase 2: Atomic Staging & Inspection
1. Stage only files modified within the active task boundary: `git add <paths>`.
2. For renames or file moves, execute `git mv` to preserve blame history.
3. Inspect the staged diff: `git diff --staged`.
*Exit Gate*: Staged diff contains only intentional, task-scoped changes.

### Phase 3: Conventional Commit Creation
1. Write an atomic commit message using Conventional Commits format (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
2. Execute commit: `git commit -m "<type>: <concise description>"`.
*Exit Gate*: Commit created with clean git log entry.
*Output Envelope*:
```text
📦 Commit Hash: `<short-sha>`
📝 Message: `<type>: <description>`
```

### Phase 4: Sync, Push & Release
1. Rebase task branch onto the latest origin main when upstream moves.
2. Push branch to remote: `git push -u origin <branch-name>`.
3. Open Review Request linking the Delivery Record identifier.
4. On `main`, trigger automated release: `python3 scripts/release.py` (or `just release`) and push tags: `git push --follow-tags`.
*Exit Gate*: Branch or release tag is pushed with clean verification pass.

---

## Delivery Authority & Merge Rules

- Agents may create commits, push verified task branches, and publish or update Review Requests as normal delivery work. Once specification and plan are durable, create exactly one durable Delivery Record for the cohesive delivery slice in the configured tracker; the configured host integration may close or update it on merge.
- The user retains merge authority. Do not merge, approve, or force-push a protected/default branch unless the user explicitly authorizes that action.

## Context Pointers

- Read [branch-management.md](references/branch-management.md) when naming branches, branching off main, or managing branch lifecycles.
- Read [commit-guidelines.md](references/commit-guidelines.md) when writing commit messages or creating commits.
- Read [integration-policies.md](references/integration-policies.md) when rebasing, squashing, force-pushing, or merging code.
- Read [file-operations.md](references/file-operations.md) when renaming, moving, or deleting files.
