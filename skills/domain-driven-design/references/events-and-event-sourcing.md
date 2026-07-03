# Events and Event Sourcing

Reference constraints for Events, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Domain Events (Standard state-persisted aggregates)
A **Domain Event** is a record of a state transition or significant occurrence in the past.
- **Naming:** Past-tense verbs matching the Ubiquitous Language (`OrderPlaced`, `AccountOpened`).
- **Registration:** Aggregates register events internally during command execution. The Application Service/Repository dispatches them *after* a successful transaction commit.

```pseudocode
class Order {
  private status: OrderStatus = OrderStatus.DRAFT
  private events: List<DomainEvent> = []

  // Command method mutates state and registers the event (dumb value list)
  function ship(shipperId) {
    if (this.status != OrderStatus.PAID) raise Error("Order not paid")
    
    this.status = OrderStatus.SHIPPED
    this.events.add(new OrderShippedEvent(this.id, shipperId, currentTimestamp()))
  }

  // Encapsulated dispatcher: passes events to the publisher lambda and clears them on success.
  // If the lambda throws an exception, execution halts, events are not cleared, 
  // and the repository transaction rolls back.
  function publishEvents(publisher: Function<DomainEvent>) {
    for (event in this.events) {
      publisher.apply(event)
    }
    this.events.clear()
  }
}

// Infrastructure Layer: Repository encapsulates transaction and outbox persistence
class SqlOrderRepository {
  function save(order: Order) {
    this.unitOfWork.transaction(() -> {
      // 1. Persist the state snapshot
      database.update("UPDATE orders SET status = ? WHERE id = ?", order.status, order.id)

      // 2. Publish uncommitted events to the Outbox table in the same transaction
      order.publishEvents(event -> {
        database.insert("INSERT INTO outbox (id, event_type, payload) VALUES (?, ?, ?)", 
          event.id, event.type, serialize(event))
      })
    })
  }
}
```

---

## 2. Event-Sourced Aggregates
In Event Sourcing, the aggregate's state is not stored as a snapshot; it is rehydrated by replaying historical events.

### State Mutation Rules
- **No Direct Mutation in Commands:** Command methods must only validate invariants and emit events (via a `raise` method).
- **Mutate in Apply Only:** State variables must be updated **exclusively** inside private `apply` methods, ensuring command execution and historical rehydration share the same code path.

```pseudocode
class Account {
  private id: AccountId
  private balance: number = 0
  private uncommittedEvents: List<DomainEvent> = []

  // 1. Command: Validates invariants and emits event
  function deposit(amount) {
    if (amount <= 0) raise Error("Must deposit positive amount")
    this.raise(new MoneyDepositedEvent(this.id, amount))
  }

  // 2. Raise Mechanism
  private function raise(event) {
    this.uncommittedEvents.add(event)
    this.apply(event)
  }

  // 3. Rehydration (invoked on load)
  function replay(historicalEvents) {
    for (event in historicalEvents) {
      this.apply(event)
    }
  }

  // 4. Mutation Point (Single source of state mutation)
  private function apply(event) {
    if (event is AccountOpenedEvent) {
      this.id = event.accountId
      this.balance = event.initialBalance
    } else if (event is MoneyDepositedEvent) {
      this.balance += event.amount
    }
  }
}
```

---

## 3. Core Architecture Rules
- **Transactional Outbox:** Write events to a persistent outbox table in the same transaction as the aggregate write. A background process publishes them to ensure at-least-once delivery (avoiding dual-writes).
- **Upcasters:** Use event upcasting (converters that translate old event schemas to new formats in-memory) to handle event schema version changes.
