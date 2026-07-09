# SDLC State Schema Reference

This reference document defines the structure and schema of the single-record SDLC file used to track all deliverables, phase transitions, and lifecycle stages.

## File Location
Every SDLC run is managed via a single YAML record located at:
`.sdlc/issues/<ticket-id>-<branch-name>-<iteration-index-doubledigit>.yaml` (e.g. `.sdlc/issues/123-main-00.yaml`).

## YAML Schema & Example

```yaml
ticket: "123"
title: "Enforce Skill Validation Status"
mode: "hil"                  # "afk" or "hil" (auto-detected: "afk" if issue has "afk" label, else "hil")
current_phase: "DEFINE"      # DEFINE, SPEC, PLAN, EXECUTE, REVIEW, SHIP, IMPROVE
lifecycle_stage: "Request"   # Active cursor for the current phase: Request, Assessment, Configuration, Execution, Verification, Improvement, Completion, Failure
iteration: "00"              # Two-digit iteration index

harness:
  topology: "maintainability" # maintainability, architecture-fitness, behavior, full-sdlc
  sandbox:
    strategy: "container"     # container first; devcontainer/nix/kubernetes/microvm later when justified
    image: ""
    limits:
      max_correction_attempts: 3
  guides:
    selected:
      - id: "AGENTS.md"
        purpose: "Project-specific agent rules"
  sensors:
    computational:
      - id: "tests"
        command: "./gradlew test"
        priority: "high"
    inferential:
      - id: "ai-code-review"
        priority: "medium"
  approval:
    human_required: true
  event_log:
    - type: "TaskRequested"
      detail: "Initial request captured"
      at: ""

phases:
  DEFINE:
    status: "PENDING"        # PENDING, IN_PROGRESS, COMPLETED
    lifecycle:
      Request:
        status: "PENDING"
        instructions:
          - "Capture the phase entry trigger, actor, expected phase outcome, and approval mode before doing work."
      Assessment:
        status: "PENDING"
        instructions:
          - "Read the current record, active phase reference, selected guides, constraints, previous events, and relevant sensor results."
      Configuration:
        status: "PENDING"
        instructions:
          - "Select or confirm guides, sensors, sandbox policy, approval gates, target files, boundaries, and retry limits for this phase."
      Execution:
        status: "PENDING"
        instructions:
          - "Perform only the approved work for this phase and append material decisions, changes, and agent activity to the event trail."
      Verification:
        status: "PENDING"
        instructions:
          - "Run selected deterministic sensors first, record pass/fail/skipped results, then run inferential review only when selected."
      Improvement:
        status: "PENDING"
        instructions:
          - "Record lessons, correction history, unresolved risks, and concrete follow-up issues that improve future predictability."
      Completion:
        status: "PENDING"
        instructions:
          - "Complete the phase only after required outputs, approvals, sensor evidence, lifecycle statuses, and next-phase transition fields are updated."
      Failure:
        status: "PENDING"
        instructions:
          - "When work is blocked or unsafe, preserve state, record evidence and risk, stop expansion, and escalate or transition with a corrective plan."
    brief:
      summary: "Add ValidationStatus to the Skill aggregate root and prevent unvalidated skills from being published."
      context: "Currently skills can be published to the catalog without any safety checks. We need a validation process."
      constraints:
        - "No framework dependencies inside the domain layer."
        - "Do not leak persistence models outside the infrastructure adapter."
      acceptance_criteria:
        - "Skills cannot be published unless validation_status is APPROVED."
      non_goals:
        - "Implementing the automatic validator agent itself (out of scope)."
    improvements: []
  SPEC:
    status: "PENDING"
    lifecycle:
      Request:
        status: "PENDING"
        instructions:
          - "Capture the phase entry trigger, actor, expected phase outcome, and approval mode before doing work."
      Assessment:
        status: "PENDING"
        instructions:
          - "Read the current record, active phase reference, selected guides, constraints, previous events, and relevant sensor results."
      Configuration:
        status: "PENDING"
        instructions:
          - "Select or confirm guides, sensors, sandbox policy, approval gates, target files, boundaries, and retry limits for this phase."
      Execution:
        status: "PENDING"
        instructions:
          - "Perform only the approved work for this phase and append material decisions, changes, and agent activity to the event trail."
      Verification:
        status: "PENDING"
        instructions:
          - "Run selected deterministic sensors first, record pass/fail/skipped results, then run inferential review only when selected."
      Improvement:
        status: "PENDING"
        instructions:
          - "Record lessons, correction history, unresolved risks, and concrete follow-up issues that improve future predictability."
      Completion:
        status: "PENDING"
        instructions:
          - "Complete the phase only after required outputs, approvals, sensor evidence, lifecycle statuses, and next-phase transition fields are updated."
      Failure:
        status: "PENDING"
        instructions:
          - "When work is blocked or unsafe, preserve state, record evidence and risk, stop expansion, and escalate or transition with a corrective plan."
    spec:
      design_boundaries: "The Domain Layer owns the Skill aggregate root, ValidationStatus value object, and SkillRepository port. The Application Layer owns the PublishSkillUseCase interactor. The Infrastructure/API layers contain the DB and controller adapters."
      affected_components:
        - "src/main/kotlin/com/example/domain/Skill.kt"
        - "src/main/kotlin/com/example/application/PublishSkillUseCase.kt"
        - "src/main/kotlin/com/example/infrastructure/SqlSkillRepository.kt"
      architectural_decisions:
        - "docs/adr/0002-domain-driven-design-and-hexagonal-architecture.md"
      observability_requirements: 
        - "We need a cumulative counter metric `skills_published_total`"
        - "Grafana dashboard panel showing publication rate."
      guide_requirements:
        - "AGENTS.md"
        - "architecture.md"
      sensor_requirements:
        - "./gradlew test"
        - "formatting/linting"
      grill_results:
        questions:
          - question: "Should a rejected validation allow re-validation?"
            answer: "Yes, transitioning from REJECTED back to PENDING."
            resolved: true
    improvements: []
  PLAN:
    status: "PENDING"
    lifecycle:
      Request:
        status: "PENDING"
        instructions:
          - "Capture the phase entry trigger, actor, expected phase outcome, and approval mode before doing work."
      Assessment:
        status: "PENDING"
        instructions:
          - "Read the current record, active phase reference, selected guides, constraints, previous events, and relevant sensor results."
      Configuration:
        status: "PENDING"
        instructions:
          - "Select or confirm guides, sensors, sandbox policy, approval gates, target files, boundaries, and retry limits for this phase."
      Execution:
        status: "PENDING"
        instructions:
          - "Perform only the approved work for this phase and append material decisions, changes, and agent activity to the event trail."
      Verification:
        status: "PENDING"
        instructions:
          - "Run selected deterministic sensors first, record pass/fail/skipped results, then run inferential review only when selected."
      Improvement:
        status: "PENDING"
        instructions:
          - "Record lessons, correction history, unresolved risks, and concrete follow-up issues that improve future predictability."
      Completion:
        status: "PENDING"
        instructions:
          - "Complete the phase only after required outputs, approvals, sensor evidence, lifecycle statuses, and next-phase transition fields are updated."
      Failure:
        status: "PENDING"
        instructions:
          - "When work is blocked or unsafe, preserve state, record evidence and risk, stop expansion, and escalate or transition with a corrective plan."
    approved: false
    plan:
      test_strategy: "Implement unit tests for the domain and use cases with minimal mock dependencies. Implement integration database tests for the repository adapter."
      observability_plan: 
        - "Implement the `skills_published_total` counter in PublishSkillUseCase."
        - "Write a component test using a mock OTel collector to assert that the counter increments on success."
        - "Add the new panel to config/grafana/dashboards/skills.json."
      guide_selection:
        - "AGENTS.md"
        - "docs/adr/0002-domain-driven-design-and-hexagonal-architecture.md"
      sensor_selection:
        - id: "compile"
          command: "./gradlew compileJava"
          type: "computational"
          priority: "high"
        - id: "test"
          command: "./gradlew test"
          type: "computational"
          priority: "high"
        - id: "ai-code-review"
          command: ""
          type: "inferential"
          priority: "medium"
      execution_steps:
        - step_id: 1
          description: "Implement Domain Logic and Outbound Ports (Inside-Out)"
          threads:
            - thread_id: "domain_core"
              tasks:
                - task_id: "domain_validation_status"
                  description: "Model ValidationStatus (Value Object) and add it to the Skill aggregate root using TDD (failing unit test first, then minimal implementation, then refactor)."
                  skills: ["ddd", "tdd"]
                - task_id: "domain_repository_port"
                  description: "Update the SkillRepository port interface to support retrieving and persisting the new validation status field."
                  skills: ["hexagonal-architecture"]
              verify_command: "./gradlew test --tests *DomainSkillTest*"
        - step_id: 2
          description: "Orchestrate Application Use Cases"
          threads:
            - thread_id: "application_use_cases"
              tasks:
                - task_id: "publish_skill_usecase"
                  description: "Implement PublishSkillUseCase application service, verifying that publish fails if the validation status is not APPROVED (using mocks for the SkillRepository port)."
                  skills: ["hexagonal-architecture", "tdd"]
              verify_command: "./gradlew test --tests *PublishSkillUseCaseTest*"
        - step_id: 3
          description: "Implement Infrastructure Adapters (Outbound & Inbound)"
          threads:
            - thread_id: "database_adapter"
              tasks:
                - task_id: "database_migration"
                  description: "Create DB schema migration to add validation_status column."
                  skills: ["tdd"]
                - task_id: "repository_adapter"
                  description: "Implement the DB adapter mapping in SqlSkillRepository, verifying persistence boundaries do not leak."
                  skills: ["hexagonal-architecture", "tdd"]
              verify_command: "./gradlew test --tests *SqlSkillRepositoryIntegrationTest*"
            - thread_id: "api_adapter"
              tasks:
                - task_id: "controller_adapter"
                  description: "Implement the Inbound REST Controller mapping POST requests to PublishSkillUseCase."
                  skills: ["hexagonal-architecture", "tdd"]
              verify_command: "./gradlew test --tests *SkillControllerTest*"
    improvements: []
  EXECUTE:
    status: "PENDING"
    lifecycle:
      Request:
        status: "PENDING"
        instructions:
          - "Capture the phase entry trigger, actor, expected phase outcome, and approval mode before doing work."
      Assessment:
        status: "PENDING"
        instructions:
          - "Read the current record, active phase reference, selected guides, constraints, previous events, and relevant sensor results."
      Configuration:
        status: "PENDING"
        instructions:
          - "Select or confirm guides, sensors, sandbox policy, approval gates, target files, boundaries, and retry limits for this phase."
      Execution:
        status: "PENDING"
        instructions:
          - "Perform only the approved work for this phase and append material decisions, changes, and agent activity to the event trail."
      Verification:
        status: "PENDING"
        instructions:
          - "Run selected deterministic sensors first, record pass/fail/skipped results, then run inferential review only when selected."
      Improvement:
        status: "PENDING"
        instructions:
          - "Record lessons, correction history, unresolved risks, and concrete follow-up issues that improve future predictability."
      Completion:
        status: "PENDING"
        instructions:
          - "Complete the phase only after required outputs, approvals, sensor evidence, lifecycle statuses, and next-phase transition fields are updated."
      Failure:
        status: "PENDING"
        instructions:
          - "When work is blocked or unsafe, preserve state, record evidence and risk, stop expansion, and escalate or transition with a corrective plan."
    outcome:
      patch_created: false
      sensor_results:
        - id: "test"
          type: "computational"
          command: "./gradlew test"
          status: "PENDING"
          exit_code: null
          finding: ""
          attempt: 0
      retry_history:
        - attempt: 0
          reason: ""
          outcome: ""
      unresolved_risks:
        - risk: ""
          disposition: ""
    improvements: []
  REVIEW:
    status: "PENDING"
    lifecycle:
      Request:
        status: "PENDING"
        instructions:
          - "Capture the phase entry trigger, actor, expected phase outcome, and approval mode before doing work."
      Assessment:
        status: "PENDING"
        instructions:
          - "Read the current record, active phase reference, selected guides, constraints, previous events, and relevant sensor results."
      Configuration:
        status: "PENDING"
        instructions:
          - "Select or confirm guides, sensors, sandbox policy, approval gates, target files, boundaries, and retry limits for this phase."
      Execution:
        status: "PENDING"
        instructions:
          - "Perform only the approved work for this phase and append material decisions, changes, and agent activity to the event trail."
      Verification:
        status: "PENDING"
        instructions:
          - "Run selected deterministic sensors first, record pass/fail/skipped results, then run inferential review only when selected."
      Improvement:
        status: "PENDING"
        instructions:
          - "Record lessons, correction history, unresolved risks, and concrete follow-up issues that improve future predictability."
      Completion:
        status: "PENDING"
        instructions:
          - "Complete the phase only after required outputs, approvals, sensor evidence, lifecycle statuses, and next-phase transition fields are updated."
      Failure:
        status: "PENDING"
        instructions:
          - "When work is blocked or unsafe, preserve state, record evidence and risk, stop expansion, and escalate or transition with a corrective plan."
    approved: false
    review:
      summary_of_changes: "Summary of implemented work"
      git_diff_summary: "List of modified files and lines"
      verification_results: "Test execution output"
      ai_review_findings: []
      reviewer_comments: []
    improvements: []
  SHIP:
    status: "PENDING"
    lifecycle:
      Request:
        status: "PENDING"
        instructions:
          - "Capture the phase entry trigger, actor, expected phase outcome, and approval mode before doing work."
      Assessment:
        status: "PENDING"
        instructions:
          - "Read the current record, active phase reference, selected guides, constraints, previous events, and relevant sensor results."
      Configuration:
        status: "PENDING"
        instructions:
          - "Select or confirm guides, sensors, sandbox policy, approval gates, target files, boundaries, and retry limits for this phase."
      Execution:
        status: "PENDING"
        instructions:
          - "Perform only the approved work for this phase and append material decisions, changes, and agent activity to the event trail."
      Verification:
        status: "PENDING"
        instructions:
          - "Run selected deterministic sensors first, record pass/fail/skipped results, then run inferential review only when selected."
      Improvement:
        status: "PENDING"
        instructions:
          - "Record lessons, correction history, unresolved risks, and concrete follow-up issues that improve future predictability."
      Completion:
        status: "PENDING"
        instructions:
          - "Complete the phase only after required outputs, approvals, sensor evidence, lifecycle statuses, and next-phase transition fields are updated."
      Failure:
        status: "PENDING"
        instructions:
          - "When work is blocked or unsafe, preserve state, record evidence and risk, stop expansion, and escalate or transition with a corrective plan."
    outcome: {}
    improvements: []
  IMPROVE:
    status: "PENDING"
    lifecycle:
      Request:
        status: "PENDING"
        instructions:
          - "Capture the phase entry trigger, actor, expected phase outcome, and approval mode before doing work."
      Assessment:
        status: "PENDING"
        instructions:
          - "Read the current record, active phase reference, selected guides, constraints, previous events, and relevant sensor results."
      Configuration:
        status: "PENDING"
        instructions:
          - "Select or confirm guides, sensors, sandbox policy, approval gates, target files, boundaries, and retry limits for this phase."
      Execution:
        status: "PENDING"
        instructions:
          - "Perform only the approved work for this phase and append material decisions, changes, and agent activity to the event trail."
      Verification:
        status: "PENDING"
        instructions:
          - "Run selected deterministic sensors first, record pass/fail/skipped results, then run inferential review only when selected."
      Improvement:
        status: "PENDING"
        instructions:
          - "Record lessons, correction history, unresolved risks, and concrete follow-up issues that improve future predictability."
      Completion:
        status: "PENDING"
        instructions:
          - "Complete the phase only after required outputs, approvals, sensor evidence, lifecycle statuses, and next-phase transition fields are updated."
      Failure:
        status: "PENDING"
        instructions:
          - "When work is blocked or unsafe, preserve state, record evidence and risk, stop expansion, and escalate or transition with a corrective plan."
    retrospective:
      lessons_learned: []
      actionable_issues: []
    improvements: []
```
