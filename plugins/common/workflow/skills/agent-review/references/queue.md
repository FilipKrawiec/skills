# Review queue

With `reviewQueue`, keep that issue the owner's ordered review list: pin it once (`gh issue pin`), then rewrite its body each pass with `gh issue edit <n> --body "<list>"`, which notifies no one. List every open non-draft PR carrying `review:owner`, and the owner's own PRs with blocking findings; first difference wins:

1. Fixes a red `<base>`.
2. Unblocks more: drafts whose body says `Stacked on #<pr>`, plus open issues it blocks or shares packet paths with.
3. Its issues' highest board Priority, else `priority:P*` label; none last.
4. Oldest first.

One line each: `1. #<pr> <title>: <owner rule or finding>; unblocks #<a>, #<b>`. None: "Nothing waits for the owner."
