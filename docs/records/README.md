# Records

Use this directory for dated research notes, implementation records, and follow-up findings that are worth keeping but are not architectural decisions.

Name records as `YYYY-MM-DD-short-topic.md`.

- [Release on main](2026-10-19-release-on-main.md): why the plugin library's publication hold was lifted and automatic releases restored.

- [Reviewer-gated workflow audit](2026-10-19-reviewer-gated-workflow.md): original plan, confirmed instruction conflicts, policy correction, native limits and concrete delivery scenarios.

- [AFK watcher removal](2026-11-11-afk-watcher-removal.md): the one-time commands that remove the launchd watchers, their launchers and `afk-watch` worktrees from the owner's machine.

- [Delivery host capability evidence](2026-11-14-delivery-host-capabilities.md): observed and documented host capabilities, unverified cases, and delivery stops.
- [Supported host delivery refinement](2026-11-14-delivery-refinement.md): epic audit and gate timing evidence.

- [Library host portability audit](2026-11-14-library-host-portability.md): package and instruction inventory, native validation findings and unverified capabilities.

- [Integrated host refinement](2026-11-14-integrated-host-refinement.md): assessment of the combined portability and delivery outcome.

- [Portability epic refinement](2026-11-14-portability-epic-refinement.md): merged epic assessment and gate timing evidence.

- [Parent portability refinement](2026-11-14-parent-portability-refinement.md): final integrated assessment and timing evidence.

- [Epic closure refinement](2026-11-14-epic-closure-refinement.md): outcome assessment and timing evidence.

- [Measured review epic refinement](2026-11-16-measured-review-refinement.md): epic #560 assessment, timing, usage, benchmark and packet cost evidence.

- [Reviewer model and effort bench](2026-11-17-reviewer-model-effort-bench.md): Sonnet, Opus and Fable settings compared per risk, with a recommendation ([results](2026-11-17-reviewer-bench-results.json)).
- [Drive transcript check](2026-11-17-drive-transcript-check.md): agent-run `gh` edits in stagely-pro#1611; not met as worded.
- [Targets measured, stagely-pro#1611](2026-11-17-stagely-pro-1611-targets-measured.md): cost, agents, rounds and refusals per merged PR against #409; cost and rounds met, agents and refusals missed.
- [Sonnet-low epic measured against #606](2026-11-17-sonnet-low-epic-measured.md): #615's verdict for epic #635: session and owner steps met, cost not shown below baseline, recall waiver cited.
- [Approval-free setup delivery, epic #635](2026-11-17-approval-free-setup-delivery.md): the Sonnet-low drive session, owner steps, dispatch failures and reviewer cost per merged PR, measured for #615.
- [Implementer bench baseline](2026-11-23-implementer-bench-baseline.md): seeded implementer tasks, setting, checks and spend cap of `bench --implementer`; both arms and the cost, from a $0.72 run.
- [Implementer bench, one doubles rule](2026-11-23-tdd-doubles-bench.md): `tdd` with one doubles rule and tool-neutral profiles against the base commit; pass rate 8/8 in both arms, $0.16 against $0.17 per task, from a $0.67 run.
- [Implementer bench for #772](2026-11-23-implementer-bench-772.md): pass rate and cost per task with the ddd and hexagonal-architecture rules folded into SKILL.md against origin/main, from a $0.63 run.
- [Preferences-delivery epic refinement](2026-11-23-preferences-delivery-refinement.md): epic #769 assessment, dead exports dropped, CI timing, preloaded words per role before and after, final implementer bench (8/8 both arms, $0.16 against $0.18 per task), flow and two improvements.
