# Commit Guidelines

Follow these guidelines to construct clean, atomic, and standardized commit messages:

## 1. Atomic Commits
- Commit early and often. Each commit must represent a single logical change (e.g., one refactoring, one feature component, or one bug fix).
- Avoid mixing unrelated changes (e.g., refactoring code while implementing a feature) in a single commit.

## 2. Commit Message Format
- Prefix commit messages with the Delivery Record identifier only when the configured tracker convention requires it.
- Use the Conventional Commits specification:
  ```
  [#<task-id> ]<type>[(<scope>)][!]: <description>

  [optional body]

  [optional footer(s)]
  ```

### Structural Elements
- **`<task-id>`**: (Optional) The issue/ticket ID preceded by a `#` followed by a space (e.g., `#123 `).
- **`<type>`**: Must be one of:
  - `feat`: A new feature
  - `fix`: A bug fix
  - `docs`: Documentation only changes
  - `style`: Changes that do not affect the meaning of the code (white-space, formatting, etc.)
  - `refactor`: A code change that neither fixes a bug nor adds a feature
  - `perf`: A code change that improves performance
  - `test`: Adding missing tests or correcting existing tests
  - `chore`: Changes to the build process or auxiliary tools/libraries
  - `wip`: Work in progress (permitted only for intermediate, local commits during development, to be squashed before review/merge)
- **`(<scope>)`**: (Optional) A noun describing a section of the codebase (e.g., `feat(auth):`).
- **`!`**: (Optional) Indicates a breaking change.
- **`<description>`**: A succinct description of the change in imperative tone (e.g., `add password validation`).

## 3. Breaking Changes
- Breaking changes must be flagged with a `!` after the type/scope, and a description in the footer:
  ```
  #123 feat(auth)!: remove basic authentication support

  BREAKING CHANGE: Basic authentication is no longer supported. Use OAuth2 instead.
  ```

## 4. Examples
- **With Task ID:** `#123 feat(auth): add google sign-in`
- **Without Task ID:** `fix(db): resolve memory leak in pool`
- **Breaking Change:** `#456 refactor(api)!: drop support for v1 endpoints`
