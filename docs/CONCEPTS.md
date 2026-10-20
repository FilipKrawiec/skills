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
  nightly: newest candidate → vMAJOR.MINOR.PATCH → test channels
                    |
      prepared demo → owner approves exact candidate
                    |
  owner publishes release → production → acceptance → engineering health
```

A milestone, titled only `v<MAJOR>`, groups a deliverable outcome, constraints, non-goals and acceptance. New interactions need lightweight prototype direction; established interactions reference an accepted pattern. Approval covers the matching brief revision and delegates story slicing, refinement and engineering decisions. A trusted direct owner request also authorizes its specified work without an artificial milestone-approval loop; retain its source for durable GitHub work. An out-of-intent discovery becomes a proposal without stopping approved work.

Production approval is separate: demonstrate a working test environment or installable candidate, acceptance evidence, limitations and rollback readiness. The owner marks feedback as a blocker or follow-up. Approval binds the artifact and configuration; changed contents require renewed approval. Merge/CI success alone is not production acceptance. Default to a coherent milestone release; propose an earlier valuable subset when justified.

## Language and decision ownership

| Dimension | Meaning |
| --- | --- |
| Lane | Whether implementation needs owner participation: authorized autonomous work (`lane:afk`), proposed authorization (`lane:proposed`), or required owner participation (`lane:owner`). |
| Milestone | A production deliverable or its linked engineering health iteration, titled `v<MAJOR>`; each merge in it is an `rc/v<MAJOR>.<MINOR>.<PATCH>` release candidate deployed to test, the newest candidate becomes the nightly `v<MAJOR>.<MINOR>.<PATCH>` test release, and an owner-published release on a test release promotes it to production. |
| Type | Story, bug, chore, bounded investigation/task or epic. |
| Waiting reason | A temporary missing condition, recorded separately from lane authorization. |

The owner retains product/strategy reversals, new interaction direction, new paid services or budget increases, authority/credential/release-gate changes, quality-gate weakening and production approval. Existing services within explicit budgets are delegated. Independently review other technical choices and ADRs. Technical difficulty triggers bounded diagnosis/replanning, not automatic owner ownership. Fresh technical adjudication settles engineering disagreements without waiving acceptance or checks.

The Product Engineer approves milestone outcomes, constraints, interaction direction, critical exceptions and demonstrated production candidates. The Product partner refines acceptance; Craftsman implements and verifies slices; Reviewer independently gates merge; Delivery steward prepares test delivery, demo and production readiness. Assign these responsibilities with native subagents, without a registry or runtime. `milestone` owns the orchestrator handoff; workers load their assigned skill and return evidence before the orchestrator advances. Keep invocation depth at most two and avoid cycles.

## Enforcement and concurrency

Separate three facts: fresh-context review judgment (`review`), GitHub attribution and approval (`agent-review`), and credential access supplied by the host. Native subagents may share a machine and existing credential mechanism; that is procedural independence, not secret isolation. Craftsman must never exercise reviewer authority. Record approval through the configured reviewer identity, distinct from the PR author and latest pusher, and require it through effective branch protections. Approval count alone does not pin an identity; setup must inspect ownership/rules and bypasses. Preserve additional owner gates. Missing posting or protection capability blocks merge, while refinement, implementation and review can continue. Never infer isolation from an account switch or provision infrastructure to satisfy prose. Keep production credentials behind native promotion controls.

Work in isolated short-lived branches/worktrees from a fetched base; preserve the main checkout. Start serially. Parallel implementation requires native coordination, disjoint assigned scope including tests and satisfied dependencies; when coordination is unproven, stay serial. Waiting work need not idle independent work. Reviews bind to the exact head; blocking findings request changes, optional suggestions stay optional.

## Health and confidence

After production acceptance of each product milestone in the consuming repository, deliver autonomously scoped health work: dependency currency, meaningful testing gaps, duplication, test speed and justified refactoring. Freeze latest-stable targets at kickoff, including majors for direct dependencies, toolchains and CI actions; resolve transitives compatibly. Complete required migrations in bounded slices before the next product milestone. Unsupported combinations permit documented newest-compatible exceptions; external outages permit independent product work while health remains blocked. Later releases wait until next iteration except urgent security fixes.

Use reproducible project mutation, coverage and complexity/risk evidence with stricter changed/critical-code gates. Ratchet assurance; missing required evidence blocks merge. Lowered thresholds, narrower measurement scope, new exclusions or baseline resets require owner approval. Compare like environments and behavior, not test counts or one line-coverage percentage.

Safe configured rollback on agreed failing production checks is delegated, with immediate owner notification. Destructive data reversal and unapproved fix-forward releases are not included.

## Library boundaries

Canonical packages live in `plugins/common/<package>/skills/`. Each skill is self-contained within 800 words; optional references within 600, descriptions within 300 characters. Portable docs use text diagrams; GitHub issue/PR bodies may use Mermaid with an explanation. Host-specific manifests are generated from package metadata; native host code does not belong in common skills.

Use project-native build and quality tools. This library runs `just verify` for unit tests and one plugin validation; distributing health instructions does not authorize installing their toolchain here. The legacy `scripts/project-verify.py` entrypoint remains for compatibility; it does not orchestrate work. Prefer deleting duplicated checks and instructions over adding scripts, schemas or coordination frameworks.

The board remains Backlog, Todo, In progress, Review, Done. Any change to its columns or membership requires coordinated devcontainer work. Keep one owner decision queue, a daily digest when things change and immediate incident/all-useful-work-blocked alerts through an explicitly authorized channel.
