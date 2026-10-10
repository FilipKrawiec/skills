# Application Layer

- Split use cases into commands (mutate, own the transaction) and queries.
- A query whose result carries domain behaviour returns domain Value Objects through a domain `Queries` port; flat UI or integration data returns DTOs through an application-level query port, bypassing the domain.
- Load aggregates, call domain methods, save through ports, then dispatch domain events.
- Return explicit results for expected failures (missing aggregate, unchanged); never leak adapter exceptions and never return silently.
- Never import ORM models, DAOs or transport types.
