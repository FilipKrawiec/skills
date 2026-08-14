---
name: improve
description: Use when capturing workflow friction, debugging pain points, or agent mistakes in any project to generate sanitized, actionable improvements or report issues upstream to FilipKrawiec/skills.
allowed-tools: Bash(gh:*,git:*) Read Edit
---

# Retrospective Learning & Friction Reporting

The **improve** skill captures runtime friction, tool failures, missing rules, and developer corrections in downstream consumer projects, transforming them into sanitized, actionable improvements and upstream issues on `FilipKrawiec/skills`.

## Operational Workflow

1. **Trigger & Context Extraction**:
   - **Stage 7 Retrospective**: Automatically invoke during delivery orchestration (`07 Improve`) to reflect on retries, test failures, or ambiguous guidance during the run.
   - **On-Demand Friction**: Invoke via `/improve` or `/learn` whenever an unexpected hurdle, tool exception, or manual prompt correction occurs.

2. **Structure 5-Point Root Cause Diagnostic**:
   - Extract the 5 core diagnostic fields:
     - **Target Skill / Rule**: Name of the affected skill, persona, or architectural rule.
     - **Failure Symptom / User Correction**: Concrete failure, retry loop, error message, or prompt correction.
     - **Root Cause Analysis**: Why the skill or rule failed to guide execution cleanly.
     - **Proposed Remediation / Diff**: Suggested guideline, prompt tweak, or verification rule.
     - **Sanitized Reproduction**: Minimal, reproducible trace or example.

3. **Automated Privacy Scrubbing**:
   - Redact all sensitive identifiers: API keys, tokens, internal URLs, company names, and local machine file paths.
   - Verify zero proprietary code or secrets remain in the diagnostic payload.

4. **Interactive Preview & Upstream Dispatch**:
   - Render the formatted diagnostic payload to the user in an interactive preview modal.
   - Upon explicit user confirmation, submit the issue upstream:
     ```bash
     gh issue create -R FilipKrawiec/skills --title "friction(<skill>): <summary>" --body-file <payload> --label "type:feature,friction"
     ```
   - Add the created issue to Project 4 (`Agentic Workflow`) in phase **`01 Define`**.

5. **Offline & Fallback Logging**:
   - If GitHub CLI is unauthenticated or network is unavailable, write the structured report to `.agents/friction/friction-<timestamp>.md` and provide manual export instructions.

---

## Context Pointers

- Read [friction-taxonomy.md](references/friction-taxonomy.md) when classifying friction categories, applying privacy scrubbing rules, or structuring issue templates.
