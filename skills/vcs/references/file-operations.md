# File Operations

Follow these rules to ensure file moves, renames, and deletions maintain history:

## 1. Moving and Renaming Files
- Always use `git mv` instead of standard filesystem `mv` commands:
  ```bash
  git mv old-path/file.py new-path/file.py
  ```
- This ensures Git records the rename/move explicitly, preserving revision history and blame tracking.

## 2. Deleting Files
- Use `git rm` to remove files from both the working tree and the index:
  ```bash
  git rm path/to/file.py
  ```

## 3. Ignoring Files
- Do not commit environment variables, keys, local IDE configs, or build artifacts.
- Keep the `.gitignore` file updated at the root of the project to filter untracked, generated files.
