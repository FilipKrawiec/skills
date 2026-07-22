# Branch Management

Follow these guidelines to structure and manage git branches:

## 1. Worktree-Based Trunk Development

- Start each task in a dedicated Git worktree on a short-lived branch; do not develop in the primary main/trunk worktree.
- Keep the primary worktree checked out at main/trunk solely for integration and push verification.
- Feature branches should be short-lived (ideally merged within 1-2 days) to avoid drift and merge conflicts.

## 2. Branch Naming Conventions
- Branch names should follow the pattern: `<category>/<task-id>-<description>`
  - `<category>`: `feature`, `bugfix`, `hotfix`, `refactor`, `chore`, or `test`.
  - `<task-id>`: The issue tracker number (without the `#` prefix).
  - `<description>`: A short, hyphen-separated description (lowercase).
  - *Example:* `feature/123-user-auth`, `bugfix/456-cache-miss`.
- If no task ID exists, omit it: `<category>/<description>`
  - *Example:* `feature/user-auth`.

## 3. Trunk Integration

- Follow repository shipping policy. Direct trunk shipping and merge-request delivery are both valid integration mechanisms.
- Whichever mechanism is used, every finished task—accepted or rejected—must produce exactly one cohesive outcome commit on main/trunk. Use a squash merge locally or in the hosting platform to achieve it.
