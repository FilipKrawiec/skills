# Infrastructure Layer (Outbound Adapters)

- Persistence models, DAOs, mappers and client models live here; map them to domain types inside the adapter and never pass them inward. Persistence shape need not match domain shape.
- A DAO is a private helper behind an adapter, never a port.
- Keep adapters and their helpers non-public where the language allows; only the ports they implement are public.
- Wire adapters at the composition root, through the framework's scanning or one public registration function per infrastructure module.
