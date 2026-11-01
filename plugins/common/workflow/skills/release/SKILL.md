---
name: release
description: Use when delivering a release candidate for owner evaluation or promoting an exactly approved candidate to production.
allowed-tools: Read Bash
---

# Release

## 1. Identify the candidate

Read the project's actual versioning, CI, test-delivery and production controls before acting; do not invent tag conventions or a release framework. Verify the source is merged to the configured base. Identify the immutable artifact or versioned Git tree, configuration, independent review, required checks, acceptance evidence, limitations and tested rollback. A skipped or missing configured gate is not a pass. Never reuse or move a version or rebuild an approved artifact; production must run the tested bytes.

Only the owner publishes a production release; only the configured promotion mechanism may use promotion credentials. Implementers and reviewers cannot hold them. If native controls or evidence are missing, stop the affected stage and report the setup gap.

**Exit gate:** exact candidate, configuration, evidence and release controls known, or blocker named.

## 2. Deliver for evaluation

Observe or run the configured authorized test delivery for the exact candidate; reuse a valid deployment. Missing test integration is a setup wait, not permission to create infrastructure. Provide an installable candidate or working test environment, reproducible demo, limitations, evidence and rollback. Distinguish pending from completed delivery.

Have the owner classify feedback as release blockers or follow-ups. Fix blockers and revalidate the candidate; never silently expand scope. Do not promote while classification is outstanding.

**Exit gate:** exact test candidate demonstrated and feedback classified, or a named wait.

## 3. Promote and observe

Present the exact candidate, production configuration, limitations and rollback. Require explicit owner approval for that pair, captured through trusted evidence and enforced by native controls. Merge approval, CI and agent-authored comments are not production approval. A changed artifact or configuration needs fresh approval. Verify the approver's identity and authority. If controls cannot prove approval, stop; never bypass them or create a tag or release outside the configured mechanism. Do not trigger automatic production publishing through a merge without the required approval and native controls.

The owner publishes through the configured authorized mechanism; observe deployment and acceptance for that identity. A merge or green CI is not deployment or acceptance. On failure, use only an authorized safe rollback, notify the owner immediately and record evidence; do not reverse destructive data changes or invent fix-forward authority.

**Exit gate:** exact candidate deployed and accepted, or blocked/rolled back with evidence.

## Output

At most 5 lines: **Summary:** candidate/configuration, test evidence, limitations, rollback and production state. **Decision:** next action/actor or exact owner decision with recommendation. Include commands/exits in run reports (at most 8 lines).
