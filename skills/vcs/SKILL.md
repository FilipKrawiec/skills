---
name: vcs
description: Use when committing changes, performing Git operations (such as moving/renaming files, merging, or rebasing), or applying trunk-based development workflow.
---

# Version Control System (VCS) Workflow

Follow these steps for all version control and git operations to maintain a clean, readable, and linear history.

## Steps

1. **Branch Off Trunk:** Create a short-lived feature branch targeting the main/trunk branch.
2. **Execute File Operations:** If moving or renaming files, use `git mv` instead of standard `mv` to preserve Git revision history.
3. **Commit Logically:** Write atomic commits using the Conventional Commits format. Prefix the commit message with the task/issue ID if connected to an issue tracker (otherwise skip).
4. **Integrate and Sync:** Squash commits into logical units and rebase the feature branch on top of main/trunk. When updating the remote branch during a rebase, use `git push --force-with-lease`.

## Context Pointers

- Read [0004-version-control-system-workflow.md](file:///Users/filip/Developer/projects/github.com/FilipKrawiec/skills/docs/adr/0004-version-control-system-workflow.md) for detailed Git workflow guidelines, commit prefix formats, and merging policies.
