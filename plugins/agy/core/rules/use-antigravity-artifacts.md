# Custom Rule: Use Antigravity Interactive Artifacts

Follow this protocol to trigger Antigravity's native interactive review UI (with **Proceed** button and inline comments) instead of prompting in plain chat text.

## Context

Antigravity renders an interactive review pane with an executable **Proceed** button and inline comment fields whenever a change proposal or plan is presented as a user-facing artifact with feedback requested.

## Protocol for Antigravity Agents

1. **Artifact-First Change Approvals:**
   - Whenever proposing repository changes, design decisions, or multi-step execution plans, create or update an `implementation_plan.md` artifact.
   - Set `RequestFeedback: true` and `UserFacing: true` in `ArtifactMetadata`.

2. **Native UI Controls:**
   - Do NOT ask for manual confirmation via plain chat text (e.g. asking the user to type "go" or "yes").
   - Allow the user to review the plan in the native Antigravity Artifact pane, leave inline feedback comments, and click **Proceed**.

3. **Human Operator Micro-Copy Guidance:**
   - When presenting an artifact for review, include standard visual review guidance in your natural language response pointing the human operator to the interactive pane:
     > **Review Instructions for Human Operator:**
     > - Review the proposal/contract in the right-hand panel.
     > - Add inline comments on specific lines if adjustments are required.
     > - Click **Proceed** at the top right to approve execution.

4. **Universal Data Format:**
   - Keep all underlying skill and plugin manifests in `plugins/common` formatted as portable YAML and standard markdown.
   - Use Antigravity-native Artifact metadata strictly at execution time in `plugins/agy`.

