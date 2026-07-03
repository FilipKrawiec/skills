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
- **Shared Kernel:** A shared subset of model/code. Use sparingly to avoid tight coupling. Any change requires agreement across all consuming contexts.
