---
name: scaffold-monorepo
description: Use when initializing or scaffolding a new Trunk-Based Development monorepository with justfile, .devcontainer, co-located Helm and Ansible infrastructure, and AGENTS.md rules.
disable-model-invocation: true
allowed-tools: Read Edit Bash
---

# Scaffold Monorepo

Use this skill to initialize or upgrade a monorepository for Trunk-Based Development. It copies production-proven template assets for `.devcontainer/`, `justfile`, `AGENTS.md`, co-located component infrastructure (`.deploy/helm`, `.deploy/ansible`), and `deploy/umbrella-chart/`.

## Steps

1. Inspect the target repository root to verify if `.devcontainer/`, `justfile`, and `AGENTS.md` exist.
2. Read [monorepo-structure.md](references/monorepo-structure.md) to understand the component and deployment hierarchy.
3. Copy scaffold template assets from `assets/` into the target repository:
   - Copy `assets/devcontainer.json` and `assets/Dockerfile` into `.devcontainer/`.
   - Copy `assets/justfile` to the repository root.
   - Copy `assets/AGENTS.md` to the repository root.
   - Copy `assets/umbrella-chart/` into `deploy/umbrella-chart/`.
4. Define application components inside `components/`:
   - Microservices use `components/<name>/.deploy/helm/` for Helm charts.
   - Monoliths use `components/<name>/.deploy/ansible/` for Ansible playbooks.
5. Verify the scaffolded environment by running `just verify` or the configured project verification command.

## Context Pointers

- Read [monorepo-structure.md](references/monorepo-structure.md) when setting up component boundaries, shared libraries (`shared/`), or umbrella charts.
