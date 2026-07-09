# File Operations

Follow these rules to ensure file moves, renames, and deletions maintain history:

## 1. Moving and Renaming Files
- Always use `git mv` instead of standard filesystem `mv` commands:
  ```bash
  git mv old-path/file.py new-path/file.py
  ```
- This ensures Git records the rename/move explicitly, preserving revision history and blame tracking.
- Before file moves, check `git status --short` and avoid moving or overwriting files with unrelated user changes.

## 2. Deleting Files
- Use `git rm` to remove files from both the working tree and the index:
  ```bash
  git rm path/to/file.py
  ```

## 3. Ignoring Files
- Do not commit environment variables, keys, local IDE configs, or build artifacts.
- Keep the `.gitignore` file updated at the root of the project to filter untracked, generated files.

## 4. Staging Files
- Use path-specific `git add <path>` commands for the current task.
- Inspect staged changes with `git diff --cached` before committing.
- Do not stage unrelated modified, deleted, or untracked files unless the user explicitly includes them in scope.
