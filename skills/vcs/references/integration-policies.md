# Integration Policies

Follow these guidelines to sync, rebase, and merge changes cleanly:

## 1. Rebase-First Workflow
- Never run `git merge main` on a feature branch.
- Always keep feature branches up-to-date with the latest main branch by rebasing:
  ```bash
  git fetch origin
  git rebase origin/main
  ```
- Before rebasing, merging, creating a pull request, or cleaning up a branch, check branch and worktree state with `git status --short --branch` and preserve unrelated user changes.

## 2. Squashing Commits
- Squash intermediate commits (e.g., "fix typo", "wip") into logical, cohesive units before requesting a review or merging.
- **Target Squash Outcome:** The ultimate goal is that **only a single cohesive Conventional Commit per feature branch appears on the trunk/main branch** after the whole lifecycle is done.
  - **PR/MR Workflow:** If the repository uses a pull request workflow (e.g., GitHub/GitLab), you can let the remote platform handle the squashing during the merge (ensure "Squash and merge" or "Squash commits" is enabled/configured in the PR/MR settings).
  - **Local/Fast-forward Workflow:** If you are merging directly or using a fast-forward/direct push workflow, you must squash your branch commits locally first (using interactive rebase `git rebase -i HEAD~<n>` or `git merge --squash`).
- Ensure all commits on the main branch remain green, buildable, and pass all tests.
- **Amending Commits:** When updating a feature branch with new changes or addressing review feedback, prefer amending the existing commit (`git commit --amend`) instead of creating a new commit. This keeps the branch history clean and ensures a single Conventional Commit tracks the entire change.

## 3. Safe Force-Pushing
- When updating a remote branch that has been rebased, always use `--force-with-lease` to prevent overwriting changes pushed by others:
  ```bash
  git push origin feature/123-user-auth --force-with-lease
  ```

## 4. Handling Rebase Conflicts
If conflicts arise during a rebase:
1. Locate the conflicted files and resolve the conflicts manually.
2. Mark conflicts as resolved:
   ```bash
   git add <resolved-file>
   ```
3. Continue the rebase:
   ```bash
   git rebase --continue
   ```
4. **Never** run `git commit` to resolve conflicts during a rebase.
