---
name: vcs
description: Use when committing changes, performing Git operations (such as moving/renaming files, merging, or rebasing), or applying trunk-based development workflow.
---

# Version Control System (VCS) Workflow

Follow these rules and steps for all version control and git operations.

## Trunk-Based Development & Branching

- Work on **short-lived feature branches** that target the main/trunk branch.
- Integrate feature branches frequently to keep them short-lived.
- On feature branches, the agent is authorized to force-push (`git push --force-with-lease`) to update remote branches.

## Commit Messages

- Use **Conventional Commits** format.
- If the work is connected to an issue tracker, every commit message **must start with the issue/task ID number** (e.g., `123: feat(auth): add login form` or `#45: fix: resolve null pointer exception`).
- If the work is not connected to an issue tracker, the task ID number **must be skipped** (e.g., `feat(auth): add login form`).

## File Operations

- Always use `git mv` instead of standard filesystem moves or renames (`mv`) to ensure file history is preserved.

## Merging & Squashing

- Squash commits to present clean, logical units of work.
- Always perform merges/integrations via **rebase** (squash and rebase via remote MR/PR) to maintain a clean, flat, and linear history.
