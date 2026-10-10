# Java

## Layout

- Packages `com.example.<context>.{domain,application,api,infrastructure}`; enforce direction with ArchUnit or modules.
- Adapters and persistence entities are package-private in `infrastructure`; only ports are public.

## Domain idioms

- Aggregate roots: classes with private constructors and fields, public domain methods.
- Value Objects: `record`, validating in the compact constructor or a static `of(...)`.
- Invariant violations throw domain-specific exceptions; the Java domain uses exceptions, not result types.
- Simple creation is a static `create(...)` on the root returning the aggregate with its creation event.

## Adapters

- Persistence annotations stay on persistence entities; explicit mappers (`UserEntityMapper`) convert to and from aggregates.
- Use cases never return persistence entities; return DTOs or domain Value Objects.
