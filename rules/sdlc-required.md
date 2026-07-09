# Custom Rule: Mandatory SDLC Workflow for Edits

Follow this protocol to ensure that all changes made to the repository files are properly tracked and executed through the Software Development Life Cycle (SDLC) workflow.

## Context
To keep the codebase stable and well-documented, all file modifications (code, configuration, and documentation) in the repository must go through the structured SDLC phases.

## Protocol for Agents
When executing any task that modifies files in this repository:

1. **You MUST use the `sdlc` workflow skill:**
   - Execute the task strictly through the `sdlc` workflow skill. You are NOT allowed to bypass it.
   
2. **Follow the SDLC Phases:**
   - Steer your execution sequentially through the **DEFINE**, **SPEC**, **PLAN**, **EXECUTE**, **REVIEW**, **SHIP**, and **IMPROVE** phases.
   - Maintain the single YAML tracking record at `.sdlc/issues/<issue-id>-<branch-name>-<attempt-doubledigit>.yaml` and update it at each phase transition.

3. **Observe Feature Branch Workflow:**
   - Ensure all work is committed to a short-lived feature branch off the main trunk before squashing and fast-forward merging.
