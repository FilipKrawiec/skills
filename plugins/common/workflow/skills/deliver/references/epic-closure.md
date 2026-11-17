# Epic closure

Drive adds a stable ID to any criterion without one and ticks each criterion the Reviewer's newest comment marks `met` before closing, so no epic needs a hand edit. To choose your own, give each acceptance criterion a stable ID, for example `- [ ] Users can sign in <!-- workflow:criterion sign-in -->`. Drive closes the epic when every linked child is closed with a merged PR into the base (or is a consolidated child, below), every criterion is checked, and the newest outcome comment by the configured Reviewer covers every criterion and child with state `met` and an explanation.

When every slice is merged and lessons are recorded but no current outcome comment exists (none, or one that misses a child or criterion), drive dispatches the Reviewer in a separate session to post it (`review`'s `epic-outcome.md`) instead of asking the owner. Drive returns an owner step only when the Reviewer marks a criterion `unmet` or `unverifiable`, or the epic is `lane:owner`.

The Reviewer posts a JSON comment on the epic (raw JSON, or JSON in one fenced block, with or without a leading `<!-- workflow:epic-outcomes -->` marker; `drive` reads both); a newer comment supersedes an older one without deleting it:

```json
{"kind":"workflow:epic-outcomes","version":1,"epic":9,"children":[10,11],"outcomes":[{"criterion":{"id":"sign-in","text":"Users can sign in"},"state":"met","explanation":"Why the evidence shows it.","evidence":["https://github.com/OWNER/REPO/pull/12"]}]}
```

Evidence is a list of links. Drive checks that each cited PR or issue of this repository exists and each cited PR is merged into the base; it does not hash or re-read content. `unmet` or `unverifiable` needs a `nextAction`: the epic stays open with a linked follow-up. A closed child without its own closing PR adds `"consolidated":[{"issue":10,"pr":25,"state":"met"}]`, naming a PR merged into the base.
