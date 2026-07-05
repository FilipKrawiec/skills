# SDLC State Schema Reference

This reference document defines the structure and schema of the single-record SDLC file used to track all deliverables, state transitions, and subphase lifecycles.

## File Location
Every SDLC run is managed via a single YAML record located at:
`.sdlc/issues/<ticket-id>-<iteration-index-doubledigit>.yaml` (e.g. `.sdlc/issues/123-00.yaml`).

## YAML Schema & Example

```yaml
ticket: "123"
title: "Enforce Skill Validation Status"
mode: "hil"                  # "afk" or "hil" (auto-detected: "afk" if issue has "afk" label, else "hil")
current_phase: "DEFINE"      # DEFINE, SPEC, PLAN, EXECUTE, REVIEW, SHIP, IMPROVE
lifecycle_stage: "INITIALIZATION"  # Each phase is composed of these subphases (lifecycles)
iteration: "00"              # Two-digit iteration index

phases:
  DEFINE:
    status: "PENDING"        # PENDING, IN_PROGRESS, COMPLETED
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
      grill_results:
        questions:
          - question: "Should a rejected validation allow re-validation?"
            answer: "Yes, transitioning from REJECTED back to PENDING."
            resolved: true
    improvements: []
  PLAN:
    status: "PENDING"
    approved: false
    plan:
      test_strategy: "Implement unit tests for the domain and use cases with minimal mock dependencies. Implement integration database tests for the repository adapter."
      observability_plan: 
        - "Implement the `skills_published_total` counter in PublishSkillUseCase."
        - "Write a component test using a mock OTel collector to assert that the counter increments on success."
        - "Add the new panel to config/grafana/dashboards/skills.json."
      execution_steps:
        - step_id: 1
          description: "Implement Domain Logic and Outbound Ports (Inside-Out)"
          threads:
            - thread_id: "domain_core"
              tasks:
                - task_id: "domain_validation_status"
                  description: "Model ValidationStatus (Value Object) and add it to the Skill aggregate root using TDD (failing unit test first, then minimal implementation, then refactor)."
                  skills: ["domain-driven-design", "tdd"]
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
    outcome: {}
    improvements: []
  REVIEW:
    status: "PENDING"
    approved: false
    review:
      summary_of_changes: "Summary of implemented work"
      git_diff_summary: "List of modified files and lines"
      verification_results: "Test execution output"
      reviewer_comments: []
    improvements: []
  SHIP:
    status: "PENDING"
    outcome: {}
    improvements: []
  IMPROVE:
    status: "PENDING"
    retrospective:
      lessons_learned: []
      actionable_issues: []
    improvements: []
```
