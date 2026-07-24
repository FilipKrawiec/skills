# EventStorming for DDD Refinement

Use EventStorming to discover behavior before designing the model. Its output is evidence for the DDD model, not an implementation design or an event-sourcing decision.

## Session flow

1. Set a business scope and time boundary. State the outcome, actors, and workflows in scope; postpone cross-cutting technical concerns.
2. With domain experts, collect every meaningful in-scope business fact that has happened. Name each event in the past tense and the ubiquitous language (`OrderPlaced`, `PaymentDeclined`). Include normal, rejection, cancellation, timeout, retry, and correction paths that matter to the business.
3. Arrange events in time order, then add commands that cause them, the people or policies that issue those commands, and reactions to those events. Mark external systems, read-model needs, and unresolved questions without translating them into framework or database choices.
4. Resolve hotspots with domain experts. Split flows only when the language, ownership, or consistency rules genuinely differ.
5. Derive responsibilities from the completed flow:
   - An event has one owning bounded context and one source of truth.
   - Commands that must enforce the same immediate business rule belong behind the same Aggregate boundary.
   - A policy, process manager, or application service is justified when it reacts to an event and coordinates a later decision across aggregate or context boundaries.
   - Consumers, projections, and integrations are downstream responsibilities; they do not own the originating event.

## Record the coverage

Keep the event timeline and a coverage table in `EVENT-STORMING.md` or an equivalent shared artifact. For each event, record its trigger, owner context, invariant-bearing decision or Aggregate, reacting policy/consumer, integration impact, and open question. The table should make it possible to see that every in-scope event has an accountable owner and that each proposed component exists to cover a responsibility in the flow.

## Quality checks

- Events describe facts in the past, rather than commands, intentions, or UI actions.
- The timeline covers meaningful alternate and failure paths, not only the happy path.
- Context boundaries follow language and ownership evidence from the flow; they do not mirror teams, services, tables, or queues by default.
- Do not create one component per event. Keep a responsibility within its Aggregate or application service unless a separate policy, integration, or read model is needed.

After the session, update `CONTEXT.md`, `CONTEXT-MAP.md`, and the relevant aggregate and event models with the decisions that survived challenge.
