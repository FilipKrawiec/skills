# Entities

Everything here applies to aggregate roots too.

- Generate identity before persistence as an ID Value Object (`OrderId`); never rely on database-generated IDs.
- Identity is immutable; equality and hash use the identifier only.
- Every attribute is a Value Object ([value-objects.md](value-objects.md)).
- No public setters. Mutate only through intention-revealing verbs taking Value Objects or identifiers (`cancel(CancellationReason)`, not `setStatus(String)`).
- Validate single fields in the Value Object's creation entry and multi-field invariants in the verb before the transition; report a violation in the domain's failure form from the language profile.
- Move validation needing complex rules or external facts into a separate validator object.
- Never expose a mutable collection; return a read-only view and offer add/remove verbs.
