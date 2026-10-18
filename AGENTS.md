---
active_skills:
  - ddd
  - hexagonal-architecture
  - tdd
  - vcs
  - review
  - spec
  - plan
  - ship
  - improve
  - writing-great-skill
  - afk
  - agent-review
  - explore
  - milestone
  - release
  - health

build_tools:
  just:
    build_script: justfile
    lifecycle_tasks:
      unit: python3 -m unittest discover -s scripts/tests
      verify: just verify

---

# Agent Guidance

## Verification

- Before editing, name the targeted test or validator; run it while you work. Run a full suite before starting only to reproduce a bug or set a baseline.
- Run the verify gate (`just verify`) once when the change is done. Never re-run it on unchanged code; a second pass proves nothing.
- Read-only analysis, plan-only work and doc edits without runnable scripts need no verification.
- Make a change asked for in chat in place, with focused tests. Dispatch workers, open issues or write plans only when asked or when the work spans several slices.

## Output

- Approved milestone intent delegates slicing, routine engineering, technical ADRs and ready autonomous lanes. Record recommendations; reserve changed product/strategy intent, unfamiliar interaction direction, new paid services/budget increases, authority/credential/release changes, quality-gate weakening and exact production approval for the owner. Temporary blockers retain lane authorization; diagnose and replan technical failures.
- Every owner message has a **Summary** (the outcome, linking the PR, issue or `file:line` with the detail) and a **Decision** (what the owner must decide, with options and a recommendation, or "Nothing needed."). A session reply ≤ 5 lines; a run or review report ≤ 8.
- Start with the action or its evidence, not a preamble. Link changed files instead of pasting them.
- In PRs, logs and agent-to-agent output, give the commands run, their exit codes and the decisions left.
- Add an interface only once two implementations exist (a test fake counts, and so does each case of a repeated conditional). Verify state, not mock calls.

## Diagrams

Use ASCII or Unicode box drawings and Markdown tables in portable skills and docs. GitHub issue bodies, plan comments and PR descriptions may use fenced `mermaid` diagrams when a flow or relationship needs explanation; include a text explanation. Literal GitHub output examples inside fenced code blocks may show that syntax.

## Doctrine

- Writing domain logic, entities or value objects under `domain/`: invoke `ddd`.
- Defining ports or adapters under `infrastructure/` or `api/`: invoke `hexagonal-architecture`.
- Writing tests under `tests/`: invoke `tdd`.
- Editing anything under `plugins/`: invoke `writing-great-skill` first; it is the standard every skill, description and envelope here follows.

## Goal

Keep this repository as a compact, agent-agnostic skill library. Its workflow skills govern consuming product repositories; maintaining the library does not initiate their product-health or runtime setup. Use this repository's configured tests and validator; add tooling only for an identified library need within the requested scope.

This is a public repository. Do not add proprietary, client, or secret material to its skills or plugin packages.

## Architectural Decisions

`docs/adr/001-provider-neutral-project-verification.md` is the single current ADR baseline. See `docs/adr/README.md`.
See `docs/CONCEPTS.md` for the core architecture and concept guide.
See `CONTRIBUTING.md` for maintainer and skill authoring workflows.

## Layout

- `plugins/common/*/skills/`: Canonical portable skill implementations (YAML and Markdown formats for cross-agent compatibility with Codex, Claude, etc.)
- `docs/`: Concepts (`docs/CONCEPTS.md`), ADRs (`docs/adr/`), and durable project records

## Editing Rules

- Update the relevant skill and its references together.
- Keep what every run needs in `SKILL.md`; move to `references/` only a branch some runs skip.
- Change the board's Status columns, or which issues it holds, in the workflow skills and `plugins/common/workflow/skills/afk/references/setup.md` together with FilipKrawiec/devcontainer's `dev issuetracker`, which reads them, in a companion PR.
- Preserve existing user changes outside the requested scope.

## Shipping

- Work happens in an isolated worktree on a short-lived branch made from the fetched base branch; the main checkout stays as it is. The start, open-PR and tidy steps are in `plugins/common/workflow/skills/vcs/SKILL.md`.
- Before opening a PR, run `review` on the branch as two fresh-context workers (axes A and B), fix every finding, and quote the verdict in the PR body.
- Committed changes stay within the issue's scope packet when it has one. After verification, an agent pushes the branch and opens or updates the PR that closes the issue (`Closes #<N>`, linking the `## Plan` comment when one was posted).
- Open ready PRs and turn on squash auto-merge bound to the reviewed head; it waits for required independent approvals and checks. Wait for a prerequisite PR instead of opening stacked drafts. Optional review suggestions do not block delivery.
- The owner retains merge authority: merging, approving and force-pushing a protected or default branch happen only on the owner's explicit word; for a PR that matches no owner rule, `agent-review`'s approval is that word. GitHub branch protection and CODEOWNERS enforce this, not local hooks.

- Production requires owner approval of the demonstrated artifact and configuration, not merely merge approval. Keep stable publication held until native promotion controls exist.
