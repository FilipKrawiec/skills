# ADR-0003: Adopt Test-Driven Development (TDD) for Agent Workflows

## Decision

We will adopt Test-Driven Development (TDD) as the standard engineering process for all feature implementation and bug fixing.

The detailed process guidelines are maintained in the canonical [tdd SKILL.md](../../plugins/common/workflow/skills/tdd/SKILL.md) and its partitioned reference files.

## Context

Agents struggle with large, monolithic implementations that are hard to debug and verify. Without TDD, they often write untested code or create overly mock-heavy unit tests that mock the entire universe, failing to verify actual integration and logic invariants.

## Consequences

- Agents must write test code before implementation code.
- Mocks are reduced, leading to more robust and less brittle test suites.
- We must provide a concrete skill (`tdd`) to guide agents in this process.
