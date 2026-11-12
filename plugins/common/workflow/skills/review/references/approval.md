# Approval

Serves a ready PR whose newest Reviewer verdict at its head is `ready`. Find nothing new and start no round.

The owner sees a PR only after this approval; review rounds and line count never involve them.

1. Run `<cli> wait <N> --until ci`; approve only a green head.
2. Post `APPROVE` with `<cli> review-post` (as in `SKILL.md` step 5, same round) carrying `verdict=owner` when the PR has `risk:R2` or `review:owner`, or an earlier verdict recorded an `Owner decision`, naming in the body what the owner decides; else `verdict=ready`. `review-post` refuses `owner` on any event but `APPROVE`, adds `review:owner` for it and resolves your own Nit, Pre-existing and Follow-up threads.
3. After `ready`, run `<cli> pr auto-merge --pr <N>` as the Reviewer (`GH_TOKEN` from `gh auth token --user <identities.reviewer>`, never printed); never merge through `gh` directly. Report a refusal.

Approve only as neither the PR author nor its latest pusher. Dismiss only your own outdated change requests whose threads are fixed, never a human's.

Return at most 5 lines: verdict, PR, head, auto-merge state or refusal, next actor.
