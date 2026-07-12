# ADR-0006: Package Skills by Plugin Group

## Decision

Split the repository into plugin packages so core domain-modeling skills can be installed without the SDLC, workflow, or authoring packs.

The core package `filipkrawiec-core` contains `ddd` and `hexagonal-architecture`. The standalone `filipkrawiec-sdlc` package contains SDLC orchestration and phase skills. Workflow skills such as `tdd`, `vcs`, and `grill-with-docs` remain in the optional workflow package. Authoring helpers such as `writing-great-skill` and `teach` move into an optional authoring package.

## Context

The previous single root skill tree made every installed plugin opinionated by default. That prevented consumers from using the domain-modeling and architecture guidance without also loading repository workflow skills they may already own.

## Consequences

- Consumers can install the core package without the workflow pack.
- Skill names are package-scoped, and `domain-driven-design` is replaced by `ddd`.
- Repository validation must understand multiple plugin packages and their package-local skill trees.
