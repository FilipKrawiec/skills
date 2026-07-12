# Factories

Reference constraints for Factories, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. When to Use a Factory
Use a Factory to encapsulate the creation of a complex Aggregate Root or Entity. A Factory is responsible for returning a **fully valid object** with all invariants met.

## 2. Vernon's 3 Factory Patterns

### A. Factory Method on another Aggregate Root
Use when the creation of a new Aggregate depends directly on the state or lifecycle of an existing Aggregate Root.
```pseudocode
class Customer {
  private isActive: boolean = true

  // Customer (AR) acts as a factory for Order (AR)
  function placeOrder(orderId, itemsList): Order {
    if (!this.isActive) {
      raise Error("Inactive customers cannot place orders")
    }
    return Order.create(orderId, this.id, itemsList)
  }
}
```

### B. Static Factory Method
Expose descriptive static methods on the class itself, keeping the constructor private or protected.
```pseudocode
class User {
  private constructor(id, email, status) {
    this.id = id
    this.email = email
    this.status = status
  }

  // Clear intent-revealing static factories
  static function registerPending(id, email): User {
    user = new User(id, email, UserStatus.PENDING)
    user.events.add(new UserRegisteredEvent(id, email))
    return user
  }

}
```

### C. Standalone Factory Class/Service
Use when the instantiation requires dependencies (e.g., Domain Services, calculators) or translation from complex external configurations.
```pseudocode
class OrderFactory {
  constructor(taxCalculator) {
    this.taxCalculator = taxCalculator
  }

  function create(id, customerId, rawItemsList): Order {
    domainItems = []
    for (item in rawItemsList) {
      taxRate = this.taxCalculator.calculate(item.productCategory)
      domainItems.add(new OrderItem(item.productId, item.quantity, item.price, taxRate))
    }
    return Order.create(id, customerId, domainItems)
  }
}
```
