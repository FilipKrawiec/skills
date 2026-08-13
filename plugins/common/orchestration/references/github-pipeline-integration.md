# GitHub Pipeline Integration Reference

This reference documents the integration of GitHub Issues, GitHub Projects V2, and GitHub Pull Requests into the `orchestrate-delivery` workflow as the primary source of truth for features, stories, tasks, bugs, board tracking, and review automation.

---

## 1. GitHub CLI Prerequisites, Auth & Resilience

The orchestration skill uses the GitHub CLI (`gh`).

### Verification & Auth Check
Before executing any stage:
```bash
gh auth status
```
If unauthenticated or missing required scopes (`repo`, `read:org`, `project`), prompt the user to run:
```bash
gh auth login
```

### CLI Retry & Error Resilience Strategy
If a `gh` command fails due to transient network errors or rate limits during automated subagent execution:
- Retry the command up to **10 times** with exponential backoff (e.g. 1s, 2s, 4s, 8s...).
- If all 10 retries fail, log a clear offline warning in `walkthrough.md` and continue execution without halting local code work.

---

## 2. GitHub Projects V2 & Board Auto-Detection

The pipeline maintains item status on GitHub Project V2 Kanban boards across the standard delivery workflow phases:
- **`01 Define`** / **`Backlog`**: Ticket defined or under intent capture.
- **`02 Spec`**: Ticket under interactive specification grilling.
- **`03 Plan`**: Technical implementation plan and DAG published for user approval.
- **`04 Execute`** / **`In Progress`**: Active execution in dedicated worktrees.
- **`05 Review`**: Pull Request opened, undergoing persona review (`quality-engineer`, `solution-architect`, `security-auditor`).
- **`06 Ship`** / **`Done`** / **`07 Improve`**: Verified changes published for merge authorization, followed by post-merge cleanup.

### Project Board Discovery & Field Schema
1. **Discover Project Board**:
   ```bash
   gh project list --owner <owner>
   ```
2. **Discover Field and Option IDs**:
   ```bash
   gh project field-list <project-number> --owner <owner> --format json
   ```
   Note the `id` of the `Status` and `Workflow Phase` fields along with the `id` for each option (e.g. `01 Define`, `02 Spec`, `03 Plan`, `04 Execute`, `05 Review`, `06 Ship`).

### Two-Step Item Creation & Phase Assignment
Adding an issue to a project board only creates an unassigned item (`null` status). You MUST immediately set its phase:
```bash
# Step 1: Add issue to project board
ITEM_ID=$(gh project item-add <project-number> --owner <owner> --url <issue-url> --format json --jq .id)

# Step 2: Assign phase
gh project item-edit --id "$ITEM_ID" --project-id <project-id> --field-id <field-id> --single-select-option-id <option-id>
```

---

## 3. Pipeline Phase Operations & Command Mapping

### Stage 1: DEFINE (Ticket Creation)
- **Board Phase**: `01 Define` (or `Backlog`).
- **CLI Commands**:
  ```bash
  # 1. Create GitHub Issue
  gh issue create --title "<type>(<scope>): <short summary>" --body "<structured intent payload>" --label "type:<feature|story|task|bug>"
  
  # 2. Add to Project Board and set phase to 01 Define
  ITEM_ID=$(gh project item-add <project-number> --owner <owner> --url <issue-url> --format json --jq .id)
  gh project item-edit --id "$ITEM_ID" --project-id <project-id> --field-id <status-field-id> --single-select-option-id <define-option-id>
  ```

### Stage 2: SPECIFY / GRILL (Specification Refinement)
- **Board Phase**: `02 Spec`.
- **CLI Commands**:
  ```bash
  # 1. Update Project Board to 02 Spec
  gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <spec-option-id>

  # 2. Update issue body / acceptance criteria
  gh issue edit <issue-number> --body "<refined body with acceptance criteria checklist>"
  
  # 3. Comment refinement notes / architectural decisions
  gh issue comment <issue-number> --body "### Specification Refinement Summary\n<notes>"
  ```

### Stage 3: PLAN (Technical Planning & DAG Construction)
- **Board Phase**: `03 Plan`.
- **CLI Commands**:
  ```bash
  # 1. Update Project Board to 03 Plan
  gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <plan-option-id>
  ```
- *Note*: Generate `implementation_plan.md` locally with `RequestFeedback: true` and obtain user Proceed approval.

### Stage 4: DISPATCH / EXECUTE (Branching & Worktree Execution)
- **Board Phase**: `04 Execute` (or `In Progress`).
- **CLI Commands**:
  ```bash
  # 1. Update Project Board to 04 Execute
  gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <execute-option-id>

  # 2. Create/checkout feature branch linked to issue
  gh issue develop <issue-number> --name "issue-<issue-number>-<slug>" --checkout
  
  # 3. Assign issue to active developer
  gh issue edit <issue-number> --add-assignee "@me"
  ```

### Stage 5: COLLECT / VERIFY (Deterministic Gate Validation)
- **Board Phase**: `04 Execute` (retained during verification loops).
- **Commands**:
  ```bash
  # Run project deterministic verification
  python3 scripts/project-verify.py verify
  ```

### Stage 6: REVIEW (Pull Request & Multi-Persona Audits)
- **Board Phase**: `05 Review`.
- **CLI Commands**:
  ```bash
  # 1. Open PR linked to issue
  gh pr create --issue <issue-number> --title "<type>(<scope>): <summary>" --body "Closes #<issue-number>\n\n### Summary\n<summary>\n\n### Verification Evidence\n<logs/tests>"

  # 2. Update Project Board to 05 Review
  gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <review-option-id>
  
  # 3. Submit formal persona reviews
  gh pr review <pr-number> --approve --body "### Quality Engineer Review\n- TDD Assertion Strength: PASSED"
  ```

### Stage 7: SHIP / RETURN (Merge Authorization, Improve & Done)
- **Board Phase**: `06 Ship` -> `07 Improve` -> `Done`.
- **CLI Commands**:
  ```bash
  # 1. Update Project Board to 06 Ship
  gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <ship-option-id>

  # 2. Merge PR upon user authorization (auto-closes issue)
  gh pr merge <pr-number> --squash --delete-branch

  # 3. Update Project Board to 07 Improve for retrospective learning capture
  gh project item-edit --id <item-id> --project-id <project-id> --field-id <status-field-id> --single-select-option-id <improve-option-id>

  # 4. Optional: If friction or skill gaps occurred, invoke improve to report upstream to FilipKrawiec/skills
  # gh issue create -R FilipKrawiec/skills --title "friction(<skill>): <summary>" --body "<sanitized-payload>" --label "type:feature,friction"

  # 5. If no follow-up improvement is required, archive item to mark as Done
  gh project item-archive <project-number> --owner <owner> --id <item-id>
  ```

---

## 4. Standard Labeling Schema

All issues managed by the orchestration plugin use a unified label schema:
- **Issue Types**: `type:feature`, `type:story`, `type:task`, `type:bug`
- **Orchestration Marker**: `orchestrated`
