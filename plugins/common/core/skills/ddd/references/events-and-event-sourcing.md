# Events and Event Sourcing

- Name events in the past tense of the ubiquitous language (`ThreadResolved`); payload fields are Value Objects.
- Aggregates record events during the command; the application service dispatches them only after the state is saved. Clear them after delivery or outbox insertion, never on failure.
- For external publication, write events to an outbox in the same transaction as the aggregate; never publish from inside the aggregate.
- Event-sourced aggregates: commands validate and emit events only; state changes only in private `apply` handlers, which replay also uses without emitting new events.
- Handle event schema changes with upcasters, never by rewriting stored events.
