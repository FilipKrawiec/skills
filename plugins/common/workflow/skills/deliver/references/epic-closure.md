# Epic closure evidence

Give each acceptance criterion a stable ID, for example `- [ ] Users can sign in <!-- workflow:criterion sign-in -->`. Gather current evidence for each outcome, including the linked children and their merged closing PRs. Use stable GitHub API URLs such as `https://api.github.com/repos/OWNER/REPO/issues/10` when those records establish the result; drive reads GitHub API evidence with the authenticated `gh` session. Hash the exact bytes returned by `gh api <URL>`. Other HTTP(S) evidence is read directly and must remain accessible.

The configured independent Reviewer examines the current epic, each outcome, the complete linked child inventory, their required work and the evidence. The Reviewer posts one unedited JSON comment on the epic, for example:

```json
{"kind":"workflow:epic-outcomes","version":1,"epic":9,"children":[10,11],"outcomes":[{"criterion":{"id":"sign-in","text":"Users can sign in"},"state":"met","explanation":"The linked evidence demonstrates successful sign-in.","evidence":[{"url":"https://api.github.com/repos/OWNER/REPO/issues/10","sha256":"<sha256 of exact response bytes>"}]}]}
```

Include every current criterion once and every linked child once, including the refinement slice. The Reviewer verifies that the work and evidence cover each outcome; a matching inventory alone does not establish that. Use `unmet` or `unverifiable` with a concrete `nextAction` for any incomplete outcome and include its evidence. Drive keeps it unchecked, creates or reuses a linked follow-up and updates the board. Refresh the review when the new child is linked. Mark a criterion checked only once its outcome is met.

When related issues ship together, retain each issue and its dependencies; record which merged PR delivered its outcomes. Do not create a process-only PR. The independent Reviewer checks every current acceptance criterion of each consolidated child or refinement against that PR and the delivered artifact, including scope, review and approval requirements. For each fully met closed child without its own closing PR, add one entry to the same review comment: `"consolidated":[{"issue":10,"bodySha256":"<sha256 of exact UTF-8 issue body>","pr":25,"state":"met"}]`. The PR number names a PR in this repository merged into the configured base. Hash the exact current issue body, not the API response; changes require a new review. Missing, ambiguous, inaccessible, stale, unmerged or unmet evidence holds delivery and closure. Preserve all existing dependencies and resolve incomplete outcomes before marking them met.

The comment's authenticated GitHub author must be the configured Reviewer, distinct from the configured implementer. Remove superseded outcome review comments and post a new one whenever criteria, child inventory, state, action or evidence changes; edited, duplicate, stale, missing or inaccessible reviews hold closure. Drive re-fetches the epic, children, review and evidence before closing. A failed read, missing merge or incomplete work holds the epic open with a diagnostic.

For an epic using the previous manifest and records protocol, gather and independently review the current evidence as above, then remove its `workflow:epic-manifest`, `workflow:epic-records` and `workflow:epic-record-author` markers. Existing files and old per-criterion comments can remain as historical evidence; they are no longer required. Retain criterion IDs and resolve outstanding follow-ups before closure.

For every outcome, the Reviewer must explain how the linked evidence supports its state. Existing reviews without an explanation fail closed: delete the old review comment and have the independent Reviewer post a new, unedited complete review with explanations and current evidence hashes.
