# Value Objects

- Raw primitives are allowed only at the outer boundary and in application command DTOs; they enter the domain only through a Value Object's creation entry.
- Each Value Object has exactly one validating creation entry; nothing else constructs it. It is immutable, equal by all attributes, and its methods return new instances.
- Outer layers use domain Value Objects as they are and never reshape them.

| Language | Encoding |
| --- | --- |
| Dart | `extension type` or immutable class with a validating factory constructor |
| Kotlin | `value class`, or private constructor behind a validating companion `of(...)`/`invoke` |
| Java | `record` validating in its compact constructor, or private constructor behind static `of(...)` |
| TypeScript | branded type whose one parsing function (`emailAddress(raw)`) is the only producer of the brand |

- Report validation failure in the one failure form the domain already uses (outcome or exception).
