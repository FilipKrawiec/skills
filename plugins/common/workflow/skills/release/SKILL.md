---
name: release
description: Use when delivering a working test candidate for owner evaluation or promoting an exactly approved artifact and configuration to production.
allowed-tools: Read Bash
---

# Release

## 1. Establish a candidate

Identify the immutable artifact and configuration revision, acceptance evidence, independent review, reproducible project coverage/mutation/risk gates, limitations, and tested rollback. Use stricter project gates for changed and critical behavior. Missing required evidence blocks delivery; never infer a pass from an absent run. A plugin's versioned Git tree can be the artifact; record its exact tree or commit and publication configuration.

Read configured native CI, test delivery and production controls. Implementers and reviewers cannot hold promotion credentials; only the configured promotion mechanism may use them. Do not invent a new release framework. Missing controls block the affected stage and become a setup blocker. For this skill repository, hold stable publication until promotion controls are ready.

**Exit gate:** candidate identity, evidence and applicable configured controls are known; blockers named.

## 2. Deliver test automatically

Run configured test delivery when evidence passes, without waiting for production approval. Provide a working test environment or installable candidate and a reproducible demo, limitations, evidence links and rollback procedure. Separate pending test delivery from completed delivery.

Ask the owner to classify feedback as a release blocker or a follow-up. Resolve blockers and revalidate the candidate; record follow-ups without silently expanding scope. Do not promote while classification is outstanding.

**Exit gate:** working test candidate demonstrated; owner feedback classified and blockers resolved.

## 3. Approve and promote

Present the exact artifact identity plus production configuration, limitations and rollback. Require explicit owner approval for that pair, captured through configured trusted owner evidence and enforced by native production controls. Agent-authored comments, self-attested approvals, CI success and merge approval are not production approval. Verify approver identity, authorization and the evidence's binding to this candidate. If controls cannot establish these facts, stop with a setup blocker.

Any change to the approved artifact or configuration requires fresh owner approval. Recheck identity immediately before running the configured promotion. Observe deployment and acceptance checks for that exact identity; CI or merge success alone proves neither. On failure, use only a safe configured rollback within its granted authority, notify the owner immediately, and record the result. Do not reverse destructive data changes or grant yourself fix-forward authority.

**Exit gate:** exact candidate deployed and accepted with trusted owner approval, or blocked/rolled back with evidence.

## Output

Session replies ≤5 lines; run reports ≤8. Include **Summary** with candidate/configuration, test/demo, limitations, rollback and production state links; **Decision** with blocker/follow-up classification, exact promotion approval requested, or “Nothing needed.” Report commands and exit codes.

```text
Summary: tree a1b2/config c3 passed gates (verify: exit 0); test/demo linked.
Limitations: offline import deferred; rollback: restore tree 9f8e/config c2.
Decision: classify import as blocker/follow-up; recommend follow-up.
```
