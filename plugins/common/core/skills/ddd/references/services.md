# Services

- Create a domain service only for a stateless business operation no single entity or Value Object owns: a cross-object calculation or a representation transform.
- A domain service never mutates more than one aggregate; it computes, and the aggregate root mutates itself.
- An application service holds no business rules; it owns the transaction, authorization, loading and saving.
- Infrastructure services (mail, SMS, hashing) are adapters behind ports.
