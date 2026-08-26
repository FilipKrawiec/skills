---
name: handoff
description: Use when compacting, serializing, or transferring active task context, architectural decisions, uncommitted git state, and next steps across sessions, agents, or worktrees.
allowed-tools: Read Edit Bash(git:*)
---

# Agent Session & Context Handoff

Serialize the active turn, task packet, uncommitted working state, and load-bearing decisions into a self-contained handoff artifact to resume execution without context loss across agent sessions or harnesses.

## Handoff Protocol

Execute four sequential affirmative phases to compact and serialize the session state.

### Phase 1: Working State & Diff Triage
Inspect the immediate workspace to establish the exact physical progress:
1. Run `git status -s` and `git diff HEAD` to capture uncommitted changes and modified file paths.
2. Identify the active branch, base commit, and recent commit history.
3. Record current working directory, open test failures, and environment variables.

### Phase 2: Decision & Invariant Compression
Extract the architectural decisions made during the current conversation:
1. State the overarching goal and primary business intent.
2. Document load-bearing architectural decisions and explicit invariants established.
3. Record rejected alternatives and trade-off rationales to prevent the receiving agent from repeating explored dead ends.
4. List unresolved questions, pending gates, or active blockers.

### Phase 3: Handoff Artifact Serialization
Write the structured handoff document:
1. Format findings using the standard schema in [handoff-template.md](references/handoff-template.md).
2. Save the artifact to `.agents/handoff.md` within the workspace root (or `/tmp/agent-handoff-<timestamp>.md` with restrictive `0600` permissions if operating outside a repository).
3. Verify file write exit status.

### Phase 4: Resumption Envelope
Output a high-density, action-oriented briefing for the receiving agent.

## Output Envelope

Emit the following compact resumption block:

```text
📋 Handoff Artifact Created: [handoff.md](.agents/handoff.md)
🎯 Primary Goal: <1-line objective>
🛠️ Working State: <branch> @ <short-hash> | <N modified files> | <clean | uncommitted diffs>
⚖️ Load-Bearing Decisions: <key decision 1>, <key decision 2>
🛑 Open Blockers / Active Gates: <none | blocker description>
➡️ Immediate Next Step: <exact 1-sentence action for resuming agent>
```

---

## Context Pointers

- Read [handoff-template.md](references/handoff-template.md) when formatting the serialized handoff markdown file.
