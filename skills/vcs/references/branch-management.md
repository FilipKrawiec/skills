# Branch Management

Follow these guidelines to structure and manage git branches:

## 1. Trunk-Based Development
- All development must target the main branch (e.g., `main` or `master`).
- Feature branches must be short-lived (ideally merged within 1-2 days) to avoid drift and merge conflicts.

## 2. Branch Naming Conventions
- Branch names should follow the pattern: `<category>/<task-id>-<description>`
  - `<category>`: `feature`, `bugfix`, `hotfix`, `refactor`, `chore`, or `test`.
  - `<task-id>`: The issue tracker number (without the `#` prefix).
  - `<description>`: A short, hyphen-separated description (lowercase).
  - *Example:* `feature/123-user-auth`, `bugfix/456-cache-miss`.
- If no task ID exists, omit it: `<category>/<description>`
  - *Example:* `feature/user-auth`.

## 3. Branch Security
- Never push or force-push directly to the main branch.
- Commits must only be integrated into the main branch via pull requests or merge requests.
