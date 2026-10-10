# Domain Layer

- No framework, ORM or serialization annotations, and no UI-convenience fields, on domain types.
- Mutate an aggregate only through intention-revealing methods on its root.
- Port names: plural collection for repositories (`Threads`); `Queries` suffix for read ports (`ThreadQueries`); a role suffix for functional ports (`ThreadEventPublisher`, `NotificationSender`, `MergeRequestValidator`).
- Small aggregate-local types and the aggregate's repository port may share the root's file.
- Aggregates and entities never hold adapters, clients or service locators.
- When an invariant needs external state, have the use case or a domain service query the port and pass the resulting fact into the aggregate. Pass a port into an aggregate method only when it is pure, domain-named and exists to enforce that invariant.
