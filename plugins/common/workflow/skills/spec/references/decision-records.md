# Decision records

A product, interaction or direction choice within the approved intent never parks work: take the recommendation, record it and continue. The owner reviews later and may challenge.

Comment on the issue (and link it from the PR it shapes):

```text
<!-- decision-record issue=<n> -->
**Decision record:** <question, one line>
Options: <A ...; B ...; C ...>
Chosen: <option>, the recommendation, because <reason and evidence>.
Challenge: reply naming another option; it becomes owner direction for a follow-up slice.
```

Never use a record to reverse an owner decision or to take a reserved effect (a changed milestone outcome or strategy, cost, authority, credentials, release or a weakened gate). A challenged record is an owner correction: `improve` collects it as a lesson about the recommendation that was wrong.

An owner decision is pinned in `workflow-decisions.test.mjs`, which CODEOWNERS assigns to the owner. A decision changes only when the owner records a new one first: never file, slice or implement work that reverses one without that record.
