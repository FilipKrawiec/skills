# Local Plugin Evaluation Report — 2026-07-17

## Scope

Static `plugin-eval` analysis of all 12 skills in the four local plugins. No observed-usage or live benchmark data was supplied. Scores are therefore triage signals, not evidence that a large deferred domain or reference document should be shortened.

## Results

| Plugin | Skill | Score | Trigger | Invoke | Deferred | Follow-up |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| authoring | teach | C / 81 | 35 | 588 | 0 | Fix broken absolute link first; then review invocation text. |
| authoring | writing-great-skill | C / 81 | 37 | 796 | 3,000 | Classify and selectively split the large external guide before shortening core rules. |
| core | ddd | C / 81 | 47 | 683 | 6,160 | Review reference loading and run task-based measurement. |
| core | hexagonal-architecture | C / 81 | 50 | 603 | 4,344 | Review reference loading and run task-based measurement. |
| sdlc | sdlc | B / 86 | 27 | 323 | 7,407 | Shared-contract dependency; custom rubric passes. Do not shorten the specification from this score alone. |
| sdlc | sdlc-define | A / 95 | 19 | 123 | 0 | No static action. |
| sdlc | sdlc-refine | A / 95 | 19 | 127 | 0 | No static action. |
| sdlc | sdlc-execute | A / 95 | 24 | 140 | 0 | No static action. |
| sdlc | sdlc-improve | A / 95 | 19 | 125 | 0 | No static action. |
| workflow | grill-with-docs | A / 100 | 44 | 205 | 0 | No static action. |
| workflow | tdd | C / 81 | 40 | 621 | 3,604 | Review reference loading and run task-based measurement. |
| workflow | vcs | B / 86 | 39 | 448 | 1,915 | Review reference loading and run task-based measurement. |

Token values are static estimates from `plugin-eval`.

## Confirmed defect

`teach` contains a broken absolute placeholder link to `.agents/knowledge/teach-learning.html`. Fix or remove this before any token optimization.

## SDLC interpretation

The root SDLC skill's deferred cost is mostly its shared Autonomous SDLC contract. The custom `sdlc-skill-rubric` reports:

- 436 words of skill instructions;
- 3,024 words of shared-contract dependency;
- one shared authority projection;
- all four stage skills resolve it without local copies.

The core evaluator still reports the shared contract as deferred cost because metric packs add findings but cannot override the core score. Treat this as an evaluator limitation, not an SDLC skill defect.

## Follow-up order

1. Fix `teach`'s broken link and rerun its analysis.
2. Measure representative task runs for `writing-great-skill`, `ddd`, `hexagonal-architecture`, `tdd`, and `vcs` before moving or deleting reference content.
3. Review only references actually loaded by those tasks; split or route them more narrowly where observed usage justifies it.
4. Extend `plugin-eval` with a first-class shared-contract dependency category so that its core score can distinguish contract size from skill-instruction cost.

## Follow-up executed

| Skill | Score | Invoke tokens | Outcome |
| --- | ---: | ---: | --- |
| teach | 81 → 100 | 588 → 227 | Removed the broken placeholder link and compressed the playbook. |
| ddd | 81 → 86 | 683 → 476 | Preserved a broad domain-modeling trigger while trimming redundant invocation prose; deferred reference cost remains for measurement. |
| hexagonal-architecture | 81 → 86 | 603 → 403 | Compressed layer guidance; deferred reference cost remains for measurement. |
| tdd | 81 → 81 | 621 → 518 | Removed obsolete SDLC lifecycle/state-store ownership; deferred reference cost remains for measurement. |
| writing-great-skill | 81 → 81 | 796 → 796 | No content reduction: its deferred external guide requires observed-usage evidence first. |
| vcs | 86 → 86 | 448 → 448 | No change: its active instruction cost is already moderate; measure deferred references before changing them. |

All repository tests, plugin validation, and whitespace validation passed after these changes.
