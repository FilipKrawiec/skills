# Epic closure evidence

Give each acceptance criterion a stable ID, for example `- [ ] Users can sign in <!-- workflow:criterion sign-in -->`. Put exactly one of each marker on the epic, pointing to distinct raw files in its GitHub repository:

```text
<!-- workflow:epic-manifest https://raw.githubusercontent.com/OWNER/REPO/BRANCH/path/manifest.json -->
<!-- workflow:epic-records https://raw.githubusercontent.com/OWNER/REPO/BRANCH/path/records.json -->
```

The manifest is `{"version":1,"epic":9,"criteria":[{"id":"sign-in","text":"Users can sign in","requiredSlices":[10,11]}]}`. List every current linked child exactly once across the criteria, including the final refinement slice. Every criterion has at least one child. The configured independent Reviewer must verify that each mapping accounts for all required work; an inventory match alone cannot prove completeness.

The records file is `{"version":2,"epic":9,"records":[...]}`. Each record follows `plugins/common/workflow/scripts/lib/epic-evidence-protocol.md`, adds `verificationCommentId` (the numeric GitHub comment ID), and includes the manifest URL and SHA-256 of its current raw bytes among its evidence references. Record the exact criterion text, evidence URLs and byte hashes in the Reviewer's unedited JSON attestation comment as the protocol specifies. The Reviewer's authenticated GitHub identity, not a name in the file, establishes verification. Reverify after any content, mapping or evidence change; remove superseded attestations before posting a replacement.

For `unmet` or `unverifiable`, record a concrete `nextAction`. Drive keeps the criterion unchecked, creates or reuses its marked linked follow-up, and updates the board. Add the follow-up to the manifest and update its evidence and attestation through the normal workflow. Resolve duplicate markers, missing actions, unavailable files, board failures and other diagnostics before retrying; partial updates never authorize closure. Once all required children merge, mark the criteria checked and record current evidence and independent verification. Drive retrieves the epic, both files, evidence, attestations and complete child inventory again before closing.
