# Strategic Design

- Fix context boundaries, language and core model before integration, framework or schema choices.
- A term with two meanings ("Account" as login vs. ledger) means two contexts.
- Translate foreign DTOs only in adapters: inbound adapters map to commands, outbound adapters map to schemas or external DTOs. Foreign contracts never reach application or domain.

## Integration patterns

- **ACL:** the downstream context translates an upstream model it cannot change into its own language.
- **OHS/PL:** the upstream exposes a stable interface and published schema in its own language; the downstream's outbound adapter translates it.

## Choosing what to share

1. **Shared Kernel** only for identical business meaning jointly governed by named contexts. Domain concepts only: no workflows, ports, DTOs, adapters, persistence or framework types. Without joint change agreement and synchronized releases, do not use one.
2. **Published Language + ACL** for an interchange schema between independent contexts; translate in adapters.
3. **Layer-specific platform module** (`platform-domain`, `platform-infrastructure`) for context-neutral technical reuse; it is not a Shared Kernel and keeps dependency direction.
4. **Duplicate locally** when concepts are merely similar or will evolve apart.
