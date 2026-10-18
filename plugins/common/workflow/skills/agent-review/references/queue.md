# Review queue

With configured reviewQueue, pin that issue once and update its body with the current decision queue. Include approved milestone progress and next slice, prototype direction awaiting owner input, exact candidate/head and check evidence, production destination/approval, reserved authority decisions, and technical replan/waits with retry conditions. Preserve links to criteria and recorded decisions. An issue-body update is a record, not a guaranteed notification mechanism.

Order entries by first difference:

1. Active incident or all-work-blocked state.
2. Red configured base or a decision unblocking the most approved work.
3. Earliest milestone, then board Priority or priority label; none last.
4. Oldest first.

Include every ready PR carrying review:owner and owner-authored PR with blockers. Count waiting dependent issues, not stacked drafts. Do not route ordinary technical recovery to the owner: retain its lane and list the bounded diagnosis/replan/wait. Separate optional suggestions from blockers.

Use one concise line per entry:

```text
1. Milestone 1.2 / #42: prototype direction; recommend option A; evidence <link>.
2. Candidate abc123 / staging: checks valid; production approval pending for prod-east.
3. #51: technical wait for dependency #49; lane retained; retry when merged.
```

Give owner-reserved entries options and a recommendation. If none, state “Nothing waits for the owner.” Record routine delegated choices without asking again.

Send a daily digest only when state changed. Send immediate notices for incidents or all-work-blocked conditions. Use only the authorized configured notification channel; do not infer permission to email, message or mention people from queue access. Without such a channel, retain the queue and return the notice in the run report. Deduplicate unchanged waits; record last evidence and next retry condition.
