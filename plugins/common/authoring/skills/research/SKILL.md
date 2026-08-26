---
name: research
description: Use when conducting deep-dive technical research, verifying third-party SDKs/APIs, comparing library trade-offs, or investigating unfamiliar codebase subsystems to produce an evidence-backed dossier.
allowed-tools: Read Bash(git:*,python3:*)
---

# Deep Technical Research & Dossier Generation

Conduct structured, source-backed technical research across official documentation, code examples, and repository internals to produce cited evidence dossiers that eliminate hallucination before architecture design or implementation.

## Research Protocol

Follow three sequential affirmative phases to gather, verify, and synthesize technical evidence.

### Phase 1: Research Inquiry Decomposition
Decompose the incoming inquiry into verifiable questions:
1. Define the primary technical question and target version constraints (e.g., "How to implement idempotent consumers with Kafka v3.8 in Go?").
2. Identify 2–3 competing library alternatives or implementation strategies.
3. Establish key trade-off dimensions: latency, concurrency safety, memory footprint, maintenance status, and architectural complexity.

### Phase 2: Evidence Gathering & Verification
Collect and verify facts using primary sources:
1. Query official documentation, package APIs, and changelogs.
2. Cross-reference claims against active repository patterns and existing dependencies.
3. Validate API method signatures, return types, error contracts, and lifecycle behaviors.
4. Extract minimal, self-contained verification code snippets demonstrating the recommended pattern.

### Phase 3: Dossier Synthesis & Verification
Synthesize findings into an evidence-backed dossier:
1. Format findings using the standard schema in [dossier-template.md](references/dossier-template.md).
2. Save the compiled artifact to `.agents/research/<topic-kebab-case>.md` (or output directly when operating interactively).
3. Verify that all technical assertions are backed by concrete source citations or verified code behaviors.

## Output Envelope

Emit findings using this structured compact envelope:

```text
📚 Technical Research Completed: `<topic>`
🎯 Core Inquiry: <1-line inquiry statement>
🏆 Recommendation: <primary recommended tool, API, or architectural approach>
⚖️ Trade-off Highlights:
- <Alternative A vs Alternative B: core trade-off>
- <Key operational or version constraint>
📄 Evidence Dossier: [.agents/research/<topic>.md](.agents/research/<topic>.md)
➡️ Next Action: <transition to `define`, `specify`, or `ddd`>
```

---

## Context Pointers

- Read [dossier-template.md](references/dossier-template.md) when structuring and formatting the technical research dossier.
