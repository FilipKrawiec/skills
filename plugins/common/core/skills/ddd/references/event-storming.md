# EventStorming

The output is evidence for the model, not an implementation design or an event-sourcing decision.

1. Fix the business scope: outcome, actors, workflows. Defer technical concerns.
2. Collect every in-scope business fact as a past-tense event in the ubiquitous language, including rejection, cancellation, timeout, retry and correction paths.
3. Order them in time; add commands, the actors or policies issuing them, reactions, external systems, read-model needs and open questions. Name no framework or database.
4. Resolve hotspots with domain experts. Split a flow only where language, ownership or consistency rules differ.
5. Derive responsibilities: each event has one owning context; commands enforcing the same immediate rule share an aggregate; a policy or process manager exists only to coordinate a later decision across aggregates or contexts; consumers and projections never own the event.

## Record

In `docs/event-storming.md` keep the timeline and a coverage table with one row per event: trigger, owner context, aggregate or decision, reacting policy/consumer, integration impact, open question.

## Checks

- Events are facts, not commands, intentions or UI actions.
- Boundaries follow language and ownership, not teams, services, tables or queues.
- No component per event; add a policy, integration or read model only when the flow needs one.
- Afterwards, update `docs/context.md`, `docs/context-map.md` and the aggregate and event models.
