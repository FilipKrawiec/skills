# Approval

Serves a ready PR whose newest Reviewer verdict at its head is `ready`. Find nothing new and start no round.

Only the risk label or the round cap involves the owner; line count never does.

1. Run `<cli> wait <N> --until ci`; approve only a green head.
2. Post `APPROVE` with `<cli> review-post` (as in `SKILL.md` step 5, same round) carrying `verdict=owner` when the PR has `risk:R2`, else `verdict=ready`. `review-post` adds `review:owner` for `owner` and resolves your own Nit, Pre-existing and Follow-up threads.
3. After `ready`, run `<cli> pr auto-merge --pr <N>` as the Reviewer (`GH_TOKEN` from `gh auth token --user <identities.reviewer>`, never printed); never raw `gh pr merge`. Report a refusal.

Approve only as neither the PR author nor its latest pusher. Dismiss only your own outdated change requests whose threads are fixed, never a human's.

Return at most 5 lines: verdict, PR, head, auto-merge state or refusal, next actor.
