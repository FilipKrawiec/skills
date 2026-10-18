# Delivery model

This repository distributes portable skills, not a workflow runtime. Skills own procedures; the host owns sessions, model choice, scheduling, isolated credentials and coordination. GitHub holds durable intent, approvals, decisions, claims and evidence. A new session reconciles those records with actual branches, PR heads and checks before acting.

## Two product checkpoints

```text
Owner approves outcome brief + design direction
                    |
Team refines → plans → implements → independent review
                    |
       merge → automatic test delivery
                    |
      prepared demo → owner approves exact candidate
                    |
       production → acceptance → engineering health
```

A milestone groups a deliverable outcome, constraints, non-goals and acceptance. New interactions need lightweight prototype direction; established interactions reference an accepted pattern. Approval covers the matching brief revision and delegates story slicing, refinement and engineering decisions. An out-of-intent discovery becomes a proposal without stopping approved work.

Production approval is separate: demonstrate a working test environment or installable candidate, acceptance evidence, limitations and rollback readiness. The owner marks feedback as a blocker or follow-up. Approval binds the artifact and configuration; changed contents require renewed approval. Merge/CI success alone is not production acceptance. Default to a coherent milestone release; propose an earlier valuable subset when justified.

## Language and decision ownership

| Dimension | Meaning |
| --- | --- |
| Lane | Whether implementation needs owner participation: authorized autonomous work (`lane:afk`), proposed authorization (`lane:proposed`), or required owner participation (`lane:owner`). |
| Milestone | A production deliverable or its linked engineering health iteration. |
| Type | Story, bug, chore, bounded investigation/task or epic. |
| Waiting reason | A temporary missing condition, recorded separately from lane authorization. |

The owner retains product/strategy reversals, new interaction direction, new paid services or budget increases, authority/credential/release-gate changes, quality-gate weakening and production approval. Existing services within explicit budgets are delegated. Independently review other technical choices and ADRs. Technical difficulty triggers bounded diagnosis/replanning, not automatic owner ownership. Fresh technical adjudication settles engineering disagreements without waiving acceptance or checks.

The Product partner refines outcomes; Craftsman implements; Reviewer judges independently; Delivery steward reconciles progress and release evidence. These are assignments, not a separate agent framework. Dispatch complete role-specific briefs using the owning skills. Required worker instructions never depend on an unread shared reference. Keep invocation depth at most two and avoid cycles.

## Enforcement and concurrency

Implementer and Reviewer need separate contexts and credentials inaccessible to each other where their authorities differ. Selecting a different account in a shared secret store is not isolation. GitHub protections enforce required review/checks; production controls enforce owner approval of the exact candidate. Skill text cannot supply these controls. Missing setup is a visible capability gap.

Work in isolated short-lived branches/worktrees from a fetched base; preserve the main checkout. Start serially. Parallel implementation requires enforced claims, disjoint scope including tests and satisfied dependencies. Waiting work need not idle independent work. Reviews bind to the exact head; blocking findings request changes, optional suggestions stay optional.

## Health and confidence

After each product milestone, deliver autonomously scoped health work: dependency currency, meaningful testing gaps, duplication, test speed and justified refactoring. Freeze latest-stable targets at kickoff, including majors for direct dependencies, toolchains and CI actions; resolve transitives compatibly. Complete required migrations in bounded slices before the next product milestone. Unsupported combinations permit documented newest-compatible exceptions; external outages permit independent product work while health remains blocked. Later releases wait until next iteration except urgent security fixes.

Use reproducible project mutation, coverage and complexity/risk evidence with stricter changed/critical-code gates. Ratchet assurance; missing required evidence blocks merge. Lowered thresholds, narrower measurement scope, new exclusions or baseline resets require owner approval. Compare like environments and behavior, not test counts or one line-coverage percentage.

Safe configured rollback on agreed failing production checks is delegated, with immediate owner notification. Destructive data reversal and unapproved fix-forward releases are not included.

## Library boundaries

Canonical packages live in `plugins/common/<package>/skills/`. Each skill is self-contained within 800 words; optional references within 600, descriptions within 300 characters. Portable docs use text diagrams; GitHub issue/PR bodies may use Mermaid with an explanation. Host-specific manifests are generated from package metadata; native host code does not belong in common skills.

Use project-native build and quality tools. This repository runs `just verify` for unit tests and one plugin validation. The legacy `scripts/project-verify.py` entrypoint remains for compatibility; it does not orchestrate work. Prefer deleting duplicated checks and instructions over adding scripts, schemas or coordination frameworks.

The board remains Backlog, Todo, In progress, Review, Done. Any change to its columns or membership requires coordinated devcontainer work. Keep one owner decision queue, a daily digest when things change and immediate incident/all-useful-work-blocked alerts through an explicitly authorized channel.
