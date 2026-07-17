# Strategic Design: Bounded Contexts and Context Mapping

Reference constraints for strategic design and bounded contexts, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Bounded Context Boundaries

A Bounded Context defines the boundary within which a specific domain model applies.
- **Domain & Language First:** Always define Bounded Context boundaries, the Ubiquitous Language, and the core domain model *before* planning integration details, frameworks, or database schemas. Implementation details belong in the plan and implementation phases.
- **Rule of Singularity:** A term must have exactly one meaning within a given Bounded Context. If a term has multiple meanings (e.g., "Account" meaning user login vs. billing ledger), split them into separate Bounded Contexts.

## 2. Translation Boundaries (Clean Contexts)

External DTOs and contracts from other contexts must never bleed into the Application or Domain layers.
- **Translation Point:** All translation must occur at the API/Infrastructure boundary:
  - **Inbound Adapters (e.g., HTTP Controllers, Event Consumers):** Map incoming external DTOs to internal application Commands/Queries or Domain Models.
  - **Outbound Adapters (e.g., Database Repositories, External Clients):** Map internal Domain Models to database schemas or external API DTOs.
- **The Clean Domain Principle:** The Domain Layer never imports, reference, or relies on outer layers (Application, API, or Infrastructure).

## 3. Integration Patterns

- **Anti-Corruption Layer (ACL):** A translation pattern typically used by a downstream context when integrating with a legacy or external system where the upstream model cannot be changed. Translates external concepts into the downstream's clean Ubiquitous Language.
- **Open Host Service (OHS) / Published Language (PL):** 
  - The **upstream context** defines a stable interface (OHS) and a standardized format (PL) using its own Ubiquitous Language. Exposed via inbound API adapters.
  - The **downstream context** integrates using an outbound adapter/client that translates the Published Language into its own internal models/commands.
### Shared Kernel

A Shared Kernel is a deliberately small, domain-only subset of model shared by specifically named Bounded Contexts. Use it only when the contexts have the same business meaning and jointly govern changes, releases, and compatibility.

- It may contain domain concepts and rules only. It must not contain application workflows or application ports, API DTOs, adapters, persistence models, framework types, or generic cross-layer utilities.
- Every change requires agreement from all consuming contexts. If that agreement or synchronized release process is absent, do not use a Shared Kernel.

### Choosing a Shared Artifact

1. Use a **Shared Kernel** for jointly owned business language with identical meaning.
2. Use a **Published Language** plus an **ACL** for an interchange schema between independent contexts; translate it in adapters, not in either domain model.
3. Put context-neutral technical reuse in a layer-specific platform/foundation module, such as `platform-domain` or `platform-infrastructure`. It is not a Shared Kernel and must preserve Hexagonal dependency direction.
4. Duplicate code locally when the concepts are merely similar or expected to evolve independently.
