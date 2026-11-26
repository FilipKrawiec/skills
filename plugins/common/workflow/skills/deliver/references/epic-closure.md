# Epic closure

Drive adds a stable ID to any criterion without one and ticks each `met` criterion before closing. To choose your own, give each acceptance criterion a stable ID, for example `- [ ] Users can sign in <!-- workflow:criterion sign-in -->`. Drive closes the epic when every linked child is closed with a merged PR into the base (or is folded with `<!-- workflow:consolidated-into N -->` into an issue so delivered or a PR merged into the base, says it makes no repository changes, or is a consolidated child, below), every criterion is checked, and the newest outcome comment by the configured Reviewer covers every criterion and child with state `met` and an explanation.

When every slice is merged and lessons are recorded but no current outcome comment exists (none, or one that misses a child or criterion), drive dispatches the Reviewer in a separate session to post it (`review`'s `epic-outcome.md`) instead of asking the owner. Drive returns an owner step only when the Reviewer marks a criterion `unmet` or `unverifiable`, or the epic is `lane:owner`.

The Reviewer posts a JSON comment on the epic (raw JSON, or JSON in a fenced block, prose around the fence is ignored, with or without a leading `<!-- workflow:epic-outcomes -->` marker; `drive` reads both; a Reviewer comment naming the marker that cannot be parsed makes `drive` ask for a repost in this format); a newer comment supersedes an older one without deleting it:

```json
{"kind":"workflow:epic-outcomes","version":1,"epic":9,"children":[10,11],"outcomes":[{"criterion":{"id":"sign-in","text":"Users can sign in"},"state":"met","explanation":"Why the evidence shows it.","evidence":["https://github.com/OWNER/REPO/pull/12"]}]}
```

Evidence is a list of links. Drive checks that each cited PR or issue of this repository exists and each cited PR is merged into the base; it does not hash or re-read content. `unmet` or `unverifiable` needs a `nextAction`: the epic stays open with a linked follow-up. A closed child without its own closing PR adds `"consolidated":[{"issue":10,"pr":25,"state":"met"}]`, naming a PR merged into the base.

## Closure metrics

Before closing, drive posts once, led by `<!-- workflow:epic-metrics -->`: the `feat` vs `fix`/`refactor` share of the epic's merged PRs, their count and net lines. It then labels them `nits:swept`: the refinement PR fixed their Nits. A failure never blocks closure.

## Parity and reuse claims

An epic whose outcome claims parity or reuse (two consumers share one unit) runs an adversarial whole-area review over the areas it touched (`review`'s `area-audit.md`) before it is reported done. The epic-outcome Reviewer runs that audit (`epic-outcome.md` step 4); its findings are fixed or filed first, and the outcome comment cites the review.

## Refinement with nothing to change

A refinement slice (`workflow:epic-refinement`) whose review finds nothing to change makes no commit. The implementer writes the evidence to a file and hands back `status: done`, empty `paths` and `body: <file>`. Drive posts the file as a comment on the issue, closes it as completed with no PR, and counts it delivered for the epic. Other issues still need a commit.

## Board sweep

Every `drive` run first moves each closed issue's board card not yet in Done to Done, and `wait <pr> --until merged` does so when the PR merges, so a merged issue never waits for a rerun. `<cli> issue sweep-board` does the same alone and prints the count; open issues stay.

A child closed as completed without its own PR needs a `<!-- workflow:consolidated-into N -->` marker or the statement "Make no repository changes."; `issue close` refuses otherwise (spec's `split.md`).

`<cli> bugs [--days N] [--repo OWNER/NAME]` prints the bug trend per repo: opened, closed, open, median time to close and duplicates (target 0); `status` shows it as one `Bugs (14d):` line.
