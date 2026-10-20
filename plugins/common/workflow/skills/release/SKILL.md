---
name: release
description: Use when versioning base merges, delivering a working test or release candidate for owner evaluation, or promoting an exactly approved candidate to production.
allowed-tools: Read Bash
---

# Release

## 1. Establish a candidate

Verify the source is merged to the configured base, then identify the immutable artifact and configuration revision, acceptance evidence, independent GitHub review, configured reproducible project coverage/mutation/risk gates, limitations, and tested rollback. Use stricter project gates for changed and critical behavior. Missing evidence for a configured gate blocks delivery; never infer a pass from a skipped configured run. A plugin's versioned Git tree can be the artifact; record its exact tree or commit and publication configuration.

Tags show how far a version got. Every verified merge to the base branch is a release candidate: the configured mechanism tags it `rc/v<MAJOR.MINOR.PATCH>` and builds one immutable artifact. Take MAJOR from the open milestone title `v<MAJOR>`; the milestone's first version is `<MAJOR>.0.0`, then bump MINOR for a `feat` merge and PATCH for any other. Commit types never bump MAJOR. A missed run tags every unversioned base merge in order, never skipping one. On the configured schedule (typically nightly), once the test environment passes its checks, the candidate it runs becomes the test release `v<MAJOR.MINOR.PATCH>`, which feeds slower or metered channels such as native app test distribution; its own and every older candidate tag are deleted. Never version a commit at or behind the newest version again. A published release marks production. Never reuse a version, move a tag or rebuild a version's artifact; production runs the bytes test ran.

Read configured native CI, test delivery and production controls. Implementers and reviewers cannot hold promotion credentials; only the configured promotion mechanism may use them. Do not invent a new release framework. Missing controls block the affected stage and become a setup blocker.

**Exit gate:** candidate identity, evidence and applicable configured controls are known; blockers named.

## 2. Deliver test automatically

Observe configured automatic test delivery of every release candidate and of each scheduled test release; the test environment runs the newest candidate. Reuse a valid deployment for the exact candidate or run its authorized retry. Missing test integration is a setup wait, not authority to build a platform. Production setup/approval never blocks authorized test delivery. Provide a working test environment or installable candidate and a reproducible demo, limitations, evidence links and rollback procedure. Separate pending test delivery from completed delivery.

Ask the owner to classify feedback as a release blocker or a follow-up. Resolve blockers and revalidate the candidate; record follow-ups without silently expanding scope. Do not promote while classification is outstanding.

**Exit gate:** working test candidate demonstrated; owner feedback classified and blockers resolved.

## 3. Approve and promote

Present the exact test release identity plus production configuration, limitations and rollback. Require explicit owner approval for that pair, captured through configured trusted owner evidence and enforced by native production controls. Agent-authored comments, self-attested approvals, CI success and merge approval are not production approval. Verify approver identity, authorization and the evidence's binding to this candidate. If controls cannot establish these facts, stop with a setup blocker.

Any change to the approved artifact or configuration requires fresh owner approval. The owner promotes by publishing a release in the host's UI on an existing test release tag `v<MAJOR.MINOR.PATCH>`; production controls verify the publisher and the version's base verification, then deploy the already-built artifact, never a rebuild. A published release is the only production trigger, and only the owner publishes it. Never create a release, or a candidate or test release tag outside the configured mechanism. Observe deployment and acceptance checks for that exact identity; CI or merge success alone proves neither. On failure, use only a safe configured rollback within its granted authority, notify the owner immediately, and record the result. Do not reverse destructive data changes or grant yourself fix-forward authority.

**Exit gate:** exact candidate deployed and accepted with trusted owner approval, or blocked/rolled back with evidence.

## Output

Session replies ≤5 lines; run reports ≤8. Include **Summary** with candidate/configuration, test/demo, limitations, rollback and production state links; **Decision** with blocker/follow-up classification, exact promotion approval requested, or next action and responsible actor. Use “Nothing needed” only with no pending action. Report commands and exit codes.

```text
Summary: 3.4.1 (tree a1b2)/config c3 passed gates (verify: exit 0); test/demo linked.
Limitations: offline import deferred; rollback: redeploy 3.3.0/config c2.
Decision: classify import as blocker/follow-up (recommend follow-up); publish release on test release v3.4.1.
```
