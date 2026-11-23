# Java

## Layout

- Packages `com.example.<context>.{domain,application,api,infrastructure}`; enforce direction with the project's configured boundary tool, else Java modules.
- Adapters and persistence entities are package-private in `infrastructure`; only ports are public.

## Domain idioms

- Aggregate roots: mutable classes with private constructors and fields, changed only by public named behaviours.
- Rebuild entry: a static `restore(...)`, public and used only by the persistence adapter (the adapter lives in another package); package-private only when the adapter shares the root's package.
- Value Objects: `record`, validating in the compact constructor or a static `of(...)`.
- Expected failures use the project's established form, else domain-specific exceptions.
- Simple creation is a static `create(...)` on the root returning the aggregate with its creation event.

## Adapters

- Persistence annotations stay on persistence entities; explicit mappers (`UserEntityMapper`) convert to and from aggregates.
- Use cases never return persistence entities; return application-owned read models.
