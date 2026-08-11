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

The pipeline maintains item status on GitHub Project V2 Kanban boards across 5 standard columns:
- **`Backlog`**: Ticket defined or under refinement.
- **`Blocked`**: Ticket blocked by external dependencies or scope questions.
- **`In Progress`**: Ticket active in development on a dedicated feature branch.
- **`Review`**: Pull Request opened, undergoing persona review (`quality-engineer`, `solution-architect`, `security-auditor`).
- **`Done`**: PR merged, GitHub issue auto-closed.

### Project Board Discovery & Initialization
- Auto-detect an existing GitHub Project V2 linked to the repository or organization (`gh project list`).
- If no project board exists, automatically create a new GitHub Project board named `<repo-name> Kanban` (`gh project create --owner <owner> --title "<repo-name> Kanban"`).

---

## 3. Pipeline Phase Operations & Command Mapping

### Stage 1: DEFINE (Ticket Creation)
- **Output**: Primary GitHub Issue created in **Backlog**.
- **CLI Commands**:
  ```bash
  # Create GitHub Issue
  gh issue create --title "<type>(<scope>): <short summary>" --body "<description and initial acceptance criteria>" --label "type:<feature|story|task|bug>"
  ```

### Stage 2: REFINE (Specification & Requirement Challenge)
- **Output**: Refined acceptance criteria on GitHub Issue, item in **Backlog** (or **Blocked**).
- **CLI Commands**:
  ```bash
  # Update issue body / acceptance criteria
  gh issue edit <issue-number> --body "<refined body with acceptance criteria checklist>"
  
  # Comment refinement notes / architectural decisions
  gh issue comment <issue-number> --body "### Refinement Summary\n<notes>"
  ```

### Stage 3: IMPLEMENT (Branching, Technical Planning & Code Execution)
- **Output**: Feature branch created (`issue-<id>-<slug>`), Project column moved to **In Progress**, issue body checklist updated with DAG slices.
- **DAG Sub-Task Representation**: The primary Feature Issue remains parent; DAG slices are tracked as checklist items (`- [ ] <slice-name>`) in the issue body.
- **CLI Commands**:
  ```bash
  # Create/checkout feature branch linked to issue
  gh issue develop <issue-number> --name "issue-<issue-number>-<slug>" --checkout
  
  # Assign issue to active developer
  gh issue edit <issue-number> --add-assignee "@me"
  ```
- *Note*: `implementation_plan.md` and `walkthrough.md` are generated locally during this phase for technical DAG task execution, worktree dispatch, and TDD validation.

### Stage 4: TICKET UNDER REVIEW (Pull Request & Formal Persona Reviews)
- **Output**: GitHub PR opened (`Closes #<id>`), formal persona PR reviews submitted, Project column moved to **Review**.
- **CLI Commands**:
  ```bash
  # Open PR linked to issue
  gh pr create --issue <issue-number> --title "<type>(<scope>): <summary>" --body "Closes #<issue-number>\n\n### Summary\n<walkthrough summary>\n\n### Verification Evidence\n<logs/tests>"
  
  # Submit formal GitHub PR Reviews from persona subagents
  gh pr review <pr-number> --approve --body "### Quality Engineer Review\n- TDD Assertion Strength: PASSED\n- Verification Coverage: PASSED"
  gh pr review <pr-number> --approve --body "### Solution Architect Review\n- DDD Domain Purity: PASSED\n- Hexagonal Layer Isolation: PASSED"
  gh pr review <pr-number> --approve --body "### Security Auditor Review\n- OWASP Audit: PASSED\n- Secret Leak Check: PASSED"
  ```

### Stage 5: DONE (Merge & Auto-Close)
- **Output**: PR merged, Issue auto-closed (`Closes #<id>`), Project column moved to **Done**.
- **CLI Commands**:
  ```bash
  # Merge PR (Product Owner authorized)
  gh pr merge <pr-number> --squash --delete-branch
  ```

---

## 4. Standard Labeling Schema

All issues managed by the orchestration plugin use a unified label schema:
- **Issue Types**: `type:feature`, `type:story`, `type:task`, `type:bug`
- **Orchestration Marker**: `orchestrated`
