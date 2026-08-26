---
name: spike
description: Use when conducting time-boxed exploratory prototyping, proving feasibility of unfamiliar APIs or algorithms, or experimenting before committing to formal TDD and domain architecture.
allowed-tools: Read Edit Bash(git:*,python3:*,just:*)
---

# Exploratory Prototyping & Spike

Execute time-boxed, focused code spikes to de-risk unknown APIs, prove algorithmic feasibility, or evaluate external integrations before writing production code or committing to architectural designs.

## Spike Protocol

Follow three affirmative phases with an explicit promotion or discard exit gate.

### Phase 1: Hypothesis & Timebox Framing
Establish the boundaries of the spike before modifying any code:
1. Define the single core technical hypothesis to prove or disprove (e.g., "Can Library X parse stream Y under 50ms without buffering in memory?").
2. Set an explicit exploration timebox (default: 30 minutes or 100 lines of exploratory code).
3. Create an isolated spike branch or worktree: `git checkout -b spike/<topic-name>`.
4. Identify 1–2 minimal success criteria that unambiguously validate the hypothesis.

### Phase 2: Rapid Exploratory Prototyping
Build the minimal viable proof of concept:
1. Write the smallest possible harness, script, or test case that exercises the unknown capability.
2. Allow relaxed structural constraints: inline mocks, direct SDK invocations, and hardcoded test data are permitted.
3. Observe and document runtime behaviors, performance numbers, error modes, and edge cases.
4. Stop as soon as the hypothesis is conclusively proven or disproven.

### Phase 3: Clean-Room Evaluation & Exit Gate
Evaluate findings against the promotion rubric in [evaluation-criteria.md](references/evaluation-criteria.md):
1. **Decision: PROMOTE**:
   - The hypothesis succeeded and the approach is viable.
   - Extract learnings, API signatures, and performance constraints into a clean-room specification.
   - Discard the spike code or preserve it as a reference branch.
   - Transition to `define` / `specify` and build the production implementation via clean `tdd` and `ddd` loops.
2. **Decision: DISCARD**:
   - The hypothesis failed or revealed unacceptable trade-offs.
   - Record the findings and rejected architectural path in the project knowledge or ADR.
   - Delete the spike branch: `git checkout - && git branch -D spike/<topic-name>`.

## Output Envelope

Emit findings using this structured compact envelope:

```text
🧪 Spike Completed: `spike/<topic-name>`
🎯 Core Hypothesis: <1-line hypothesis statement>
📊 Outcome: [PROVEN | DISPROVEN | INCONCLUSIVE]
🔍 Key Findings:
- <finding 1: latency, API quirk, or dependency constraint>
- <finding 2: operational insight or limitation>
⚖️ Verdict & Gate: [PROMOTE TO SPECIFICATION | DISCARD WITH DECISION RECORD]
➡️ Next Action: <transition command or cleanup step>
```

---

## Context Pointers

- Read [evaluation-criteria.md](references/evaluation-criteria.md) when deciding whether to promote spike findings or discard an exploratory prototype.
