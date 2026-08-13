---
name: rephrase
description: Use when resetting and simplifying the agent's explanation or proposal into concise plain English.
disable-model-invocation: true
---

# Plain-Language Clarification & Alignment Reset

Reset the active conversation and state the core technical proposal or blocker in Simplified Technical English.

## Execution Phases

### Phase 1: Context Distillation
1. Identify the single unresolved technical decision, blocker, or proposed architecture change in the current turn.
2. Strip out conversational preambles, meta-commentary, and speculative code sketches.

### Phase 2: Simplified Restatement
1. Re-pitch the proposal using terms defined in the project glossary or `CONTEXT.md`.
2. Formulate exactly one concrete decision question for the human operator.

## Output Envelope

```text
💡 Core Intent: <1-2 sentences explaining the proposal in plain English without jargon>
⚖️ Key Trade-off: <1 sentence summarizing the primary pro/con>
❓ Decision Needed: <Single, unambiguous choice question with recommended option>
```
