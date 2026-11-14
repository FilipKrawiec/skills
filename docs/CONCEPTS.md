# Delivery model

This repository distributes portable skills, not a workflow runtime. Skills own procedures; the orchestrator uses native host subagents to manage phases, assignments, dependencies and recovery. The host supplies sessions, model choice and credential mechanisms. GitHub holds durable intent, approvals, decisions, claims and evidence. A new session reconciles those records with actual branches, PR heads and checks before acting.

## Two product checkpoints

```text
Owner approves outcome brief + design direction
                    |
Team refines → plans → implements → independent review
                    |
  merge → tag rc/vMAJOR.MINOR.PATCH → test
                    |
  nightly: candidate test runs → vMAJOR.MINOR.PATCH → test channels
                    |
      prepared demo → owner approves exact test release
                    |
  owner publishes release → production → acceptance → engineering health
```

A milestone, titled only `v<MAJOR>`, groups a deliverable outcome, constraints, non-goals and acceptance. New interactions need lightweight prototype direction; established interactions reference an accepted pattern. Approval covers the matching brief revision and delegates story slicing, refinement and engineering decisions. A trusted direct owner request also authorizes its specified work without an artificial milestone-approval loop; retain its source for durable GitHub work. An out-of-intent discovery becomes a proposal without stopping approved work.

Production approval is separate: demonstrate a working test environment or installable candidate, acceptance evidence, limitations and rollback readiness. The owner marks feedback as a blocker or follow-up. Approval binds the artifact and configuration; changed contents require renewed approval. Merge/CI success alone is not production acceptance. Default to a coherent milestone release; propose an earlier valuable subset when justified.

## Language and decision ownership

| Dimension | Meaning |
| --- | --- |
| Lane | Whether implementation needs owner participation: `lane:owner` marks it; an issue without it is delivered through `drive` from the owner's session. |
| Milestone | A production deliverable or its linked engineering health iteration, titled `v<MAJOR>`; each merge in it is an `rc/v<MAJOR>.<MINOR>.<PATCH>` release candidate deployed to test, the candidate test runs becomes the nightly `v<MAJOR>.<MINOR>.<PATCH>` test release, and an owner-published release on a test release promotes it to production. |
| Type | Story, bug, chore, bounded investigation/task or epic. |
| Waiting reason | A temporary missing condition, recorded separately from lane authorization. |

The owner retains product/strategy reversals, new interaction direction, new paid services or budget increases, authority/credential/release-gate changes, quality-gate weakening and production approval. Existing services within explicit budgets are delegated. Independently review other technical choices and ADRs. Technical difficulty triggers bounded diagnosis/replanning, not automatic owner ownership. Fresh technical adjudication settles engineering disagreements without waiving acceptance or checks.

The Product Engineer approves milestone outcomes, constraints, interaction direction, critical exceptions and demonstrated production candidates. The planner refines acceptance and slices epics; the implementer builds and verifies slices; the Reviewer independently gates merge; `release` prepares test delivery, demo and production readiness. `drive` names the agent for each step, without a registry or runtime. `milestone` owns the orchestrator handoff; workers load their assigned skill and return evidence before the orchestrator advances. Keep invocation depth at most two and avoid cycles.

## Enforcement and concurrency

Separate three facts: fresh-context review judgment and its verdict (`review`), GitHub attribution through `review-post` as the configured Reviewer, and credential access supplied by the host. Native subagents may share a machine and existing credential mechanism; that is procedural independence, not secret isolation. The implementer must never exercise reviewer authority. Record approval through the configured reviewer identity, distinct from the PR author and latest pusher, and require it through effective branch protections. Approval count alone does not pin an identity; setup must inspect ownership/rules and bypasses. Preserve additional owner gates. Missing posting or protection capability blocks merge, while refinement, implementation and review can continue. Never infer isolation from an account switch or provision infrastructure to satisfy prose. Keep production credentials behind native promotion controls.

Only `spec` and `plan` wait for the developer; a plan is approved at a 100% reproducibility score. A plan is scored inline, with no scorer agents. Afterwards `drive` delivers it: the implementer builds it, `drive` opens the draft PR with one `risk:R0|R1|R2` label computed from what it touches, and one reviewer agent runs `review` in a single pass over standards and spec (pipeline first, its own findings verified, Blocker/Important/Nit/Pre-existing/Follow-up tags where only Blocker and Important block, delta-only later rounds judged by the PR's own criteria). Nits collect on merged PRs for a sweep (`workflow.mjs nits`). The implementer, resumed, is the only fixer and adds nothing the issue did not ask for; from the third blocking verdict one fresh implementer on the strongest model fixes the whole open set instead, and a blocking verdict after that round sends the issue to the planner, who narrows it to what the PR delivers and moves the unmet criteria to a new issue; the Reviewer then judges the same head against the narrowed criteria, and the PR merges closing the narrowed issue. Every PR links its issue (`Closes #N` or `Part of #N`): `pr ready` and `pr auto-merge` refuse an orphan, the Reviewer flags it Important and `refine` files an issue for one it finds. The owner is asked only on a PR the Reviewer approved at its head (`verdict=owner`: `risk:R2`, an owner hold, or a decision recorded as the owner's), never on a round count. `drive` marks the PR ready and the Reviewer approves it before `drive` turns on auto-merge; a head pushed after that approval gets a new review round. `improve` runs once per delivered epic, together with the Nits sweep. The `deliver` skill is what the session and the implementer follow around `drive`.

`workflow.mjs drive <issue|epic>` (or `drive --next`) is the phase manager the owner's session runs. It reads GitHub state, makes every mechanical change itself (claim, worktree, commit and push from a hand-back, draft PR with `Closes #N`, rise-only risk label, ready, auto-merge, issue close, worktree removal) and prints one JSON line: an `agent` to start (`implementer` or `planner` as a subagent, `reviewer` as a separate session through its `command` argv, run in the background from `cwd`) with its configured host and model (legacy configurations use Sonnet for R0/R1 and Opus for R2) and brief under `.wf/`; a `wait` whose `command` runs in the background; an `owner` step, after which the session ends its turn; or `done`. The session dispatches, then runs `drive` again, with `--hand-back FILE|-` after an implementer. A `fix` with `resume: true` goes to the implementer that built the PR; one without it, at the third blocking verdict, starts a fresh implementer once. A Reviewer claim (`state:reviewing`) older than 60 minutes with no review since is released and the reviewer dispatched again. An epic is sliced by the planner, then its unblocked slices are driven in dependency order (`alsoReady` lists slices that may run side by side) and it closes when all are closed. `check` runs the configured test step with at most two gates per machine.

Work in isolated short-lived branches/worktrees from a fetched base; preserve the main checkout. Parallel implementation requires native coordination that holds each issue once and satisfied dependencies; shared files never block, the later PR resolves conflicts. Waiting work need not idle independent work. Reviews bind to the exact head; blocking findings are verified Blocker and Important threads; Nits and other suggestions stay optional.

## Health and confidence

After production acceptance of each product milestone in the consuming repository, deliver autonomously scoped health work: dependency currency, meaningful testing gaps, duplication, test speed and justified refactoring. Freeze latest-stable targets at kickoff, including majors for direct dependencies, toolchains and CI actions; resolve transitives compatibly. Complete required migrations in bounded slices before the next product milestone. Unsupported combinations permit documented newest-compatible exceptions; external outages permit independent product work while health remains blocked. Later releases wait until next iteration except urgent security fixes.

Use reproducible project mutation, coverage and complexity/risk evidence with stricter changed/critical-code gates. Ratchet assurance; missing required evidence blocks merge. Lowered thresholds, narrower measurement scope, new exclusions or baseline resets require owner approval. Compare like environments and behavior, not test counts or one line-coverage percentage.

Safe configured rollback on agreed failing production checks is delegated, with immediate owner notification. Destructive data reversal and unapproved fix-forward releases are not included.

## Library boundaries

Canonical packages live in `plugins/common/<package>/skills/`. Each skill is self-contained within 800 words; optional references within 600, descriptions within 300 characters. Portable docs use text diagrams; GitHub issue/PR bodies may use Mermaid with an explanation. Host-specific manifests are generated from package metadata; native host code does not belong in common skills.

Use project-native build and quality tools. This library runs `just verify` for unit tests and one plugin validation; distributing health instructions does not authorize installing their toolchain here. The `workflow.mjs project` command reads the nearest `AGENTS.md`; direct project commands remain the normal path. Prefer deleting duplicated checks and instructions over adding scripts, schemas or coordination frameworks.

The board remains Backlog, Todo, In progress, Blocked, Review, Done; Blocked holds only what a person must do. Any change to its columns or membership requires coordinated devcontainer work. Keep one owner decision queue, a daily digest when things change and immediate incident/all-useful-work-blocked alerts through an explicitly authorized channel.

## Delivery host configuration

In `.agents/config.json`, set `delivery.orchestrator` to `codex` or `claude`, and provide `delivery.roles` entries for `implementer`, `reviewer`, `planner`, `devops`, `improver`, and `freshImplementer`, each with `host` and `model` strings. Set `freshImplementer` to the strongest available implementer model for the third blocking round. For example, `"reviewer": {"host": "codex", "model": "gpt-6.1-terra"}`. Subagents must use the orchestrator host; the separate reviewer may use either supported host. Optional `delivery.executables` maps host names to executable paths. Without `delivery`, the legacy Claude assignments remain in effect; add every role to migrate. Verify host dispatch, model availability and intact hand-back in the actual session. Antigravity dispatch is unverified and stops. GitHub identity and exact-head gates remain mandatory.

For a Codex owner, use the native `spawn_agent` tool with a unique task name, the requested model override, and a prompt naming the responsibility and brief. Wait for its final hand-back, preserve it unchanged and pass it to `drive`; stop if host instructions prohibit the override, the role or model cannot be honored, or the hand-back is missing or malformed. For Claude, select the named agent and configured model through its native subagent capability with the same completion checks. These instructions do not override host permissions.
