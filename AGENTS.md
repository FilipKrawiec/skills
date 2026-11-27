---
active_skills:
  - ddd
  - hexagonal-architecture
  - tdd
  - deliver
  - review
  - spec
  - plan
  - improve
  - writing-great-skill
  - explore
  - milestone
  - release
  - health
  - pair

build_tools:
  just:
    build_script: justfile
    lifecycle_tasks:
      unit: node --test scripts/tests/*.test.mjs
      verify: just verify

---

# Agent Guidance

## Verification

- Before editing, name the targeted test or validator; run it while you work. Run a full suite before starting only to reproduce a bug or set a baseline.
- Run the verify gate (`just verify`) once when the change is done. Never re-run it on unchanged code; a second pass proves nothing.
- Read-only analysis, plan-only work and doc edits without runnable scripts need no verification.
- Make a small change asked for in chat in place, with focused tests, without a plan, and open its issue with `issue create` before its PR (Shipping). Write plans only when asked or when the work spans several slices; once a plan is approved, `drive <issue>` delivers it.

## Output

- Approved milestone intent delegates slicing, routine engineering, technical ADRs and ready autonomous lanes. Record recommendations; temporary blockers retain lane authorization, so diagnose and replan technical failures.
- One list of owner decisions, the `spec` skill's reserved list: changed product/strategy intent (including an unfamiliar interaction direction), a new paid service or a budget increase, a weakened authority, credential, release or quality gate (a baseline retag through a reviewed PR is not one) and exact production approval. Everything else is delegated.
- The owner is asked to act at three gates only, the reserved decisions that need the owner's own step: production release (exact production approval), force-push to a protected branch, and credential or permission changes. Every other `drive` step runs under `init`'s standing `autoMode.allow` rule, including paid bench runs within the configured cap, epic approval taken from a recorded card decision, gate baseline retags through a reviewed PR, and delivery host and model changes. No skill or agent asks the owner to type or paste a line for anything else.
- Every owner message has a **Summary** (the outcome, linking the PR, issue or `file:line` with the detail) and a **Decision** (what the owner must decide, with options and a recommendation, or the next action and responsible actor; use "Nothing needed." only with no pending action). A session reply ≤ 5 lines; a run or review report ≤ 8.
- Start with the action or its evidence, not a preamble. Link changed files instead of pasting them.
- In PRs, logs and agent-to-agent output, give the commands run, their exit codes and the decisions left.
- Add an interface only once two implementations exist (a test fake counts, and so does each case of a repeated conditional). Verify state, not mock calls.

## Issues

- `issue create` is the only path to a new issue: it first matches every open issue and those closed in the last 30 days (a shared scope path, or none on either side, and the same failing behaviour or outcome), comments on and prints `Exists: #N` for a match instead of creating, and takes `--distinct-from N --reason "<one line>"` for a truly separate one. Never use raw `gh` or GitHub tools to create an issue. This binds every agent and every cloud or chat session.

## Diagrams

Use ASCII or Unicode box drawings and Markdown tables in portable skills and docs. GitHub issue bodies, plan comments and PR descriptions may use fenced `mermaid` diagrams when a flow or relationship needs explanation; include a text explanation. Literal GitHub output examples inside fenced code blocks may show that syntax.

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
- Change the board's Status columns, or which issues it holds, in the workflow skills, `plugins/common/workflow/skills/deliver/references/setup.md` and `plugins/common/workflow/scripts/lib/board.mjs` together with FilipKrawiec/devcontainer's `dev issuetracker`, which reads them, in a companion PR.
- Preserve existing user changes outside the requested scope.

## Shipping

- Deliver through `drive <issue|epic>` from the owner's session, as the `deliver` skill describes: it starts the work in an isolated worktree on a short-lived branch from the fetched base, opens the draft PR, runs one reviewer agent per round (Blocker and Important findings block, Nits never do, from the third blocking round a fresh implementer fixes the whole open set; the owner sees only a Reviewer-approved PR), readies the PR and turns on squash auto-merge. The main checkout stays as it is.
- Every PR delivers an issue; work with no issue, a small chat change made in place included, gets one first (no plan needed). Committed changes stay within the issue's scope packet when it has one. After the gate passes, `drive` pushes the branch and opens its PR. Use `Closes #<N>` when that issue's bounded outcome completes on merge. Use `Part of #<N>` only for a product-milestone issue that stays open through production acceptance; split work needing several PRs into sub-issues, each closed by its own PR.
- Tell the owner only when `drive` returns an owner step or the PR is ready with auto-merge on. Optional review suggestions do not block delivery.
- A fresh Reviewer, on Opus at medium effort at every risk (owner decision 2026-11-17 after the #613 bench), is the engineering merge gate; `review` records its exact-head decision through the configured GitHub reviewer identity, and that approval merges at every risk. Routine eligible merges are delegated. Owner rules add approval for reserved effects; they never replace independent review. The Reviewer bot is the sole code owner: the owner keeps admin override on any PR and gets a merge notice when a policy path changes (`.github/CODEOWNERS`, `.github/workflows/`, `.agents/config.json`, a recorded decision). AGY is advisory only, never reviewer or implementer. A recorded decision in `scripts/tests/workflow-decisions.test.mjs` changes only when the owner records a new one first. Force-pushing protected/default branches still requires explicit owner authority. Preserve GitHub protections; never claim they enforce a named reviewer without inspecting effective rules.

- Production requires owner approval of the demonstrated artifact and configuration, not merely merge approval. Hold stable publication (the `release` skill stops that stage) until native promotion controls exist.
