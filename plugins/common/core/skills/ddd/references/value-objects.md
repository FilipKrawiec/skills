# Value Objects

Reference constraints for designing Value Objects, derived from Vaughn Vernon's *Implementing Domain-Driven Design*.

## 1. Vernon's 6 Characteristics of Value Objects

1. **It measures, quantifies, or describes a thing in the domain:**
   - It is not a first-class business entity with a lifecycle; it is a descriptive attribute or quantity (e.g., `Money`, `Color`, `EmailAddress`).
2. **It is immutable:**
   - Its state cannot be changed after creation. All fields must be read-only.
   - To update a Value Object, replace the entire instance with a new one.
3. **It models a conceptual whole:**
   - It binds related properties into a cohesive unit. For example, rather than storing `street`, `city`, and `zip` as raw strings directly on a `User` entity, group them into a single `Address` Value Object.
4. **It is compared by Value Equality:**
   - Value Objects have **no identity**.
   - Two instances are considered identical if all of their attributes hold the exact same values.
5. **It exhibits Side-Effect-Free behavior:**
   - Methods on a Value Object must be pure functions. They perform calculations and return a **new instance** of the Value Object rather than modifying the current one.
6. **It is replaceable:**
   - When an Entity's value changes, the old Value Object is completely discarded and replaced with a new instance.

---

## 2. Code Example: Money Value Object

```pseudocode
class Money {
  private amount: number
  private currency: string

  constructor(amount, currency) {
    // Invariant validation: Value Objects must be fully valid upon creation
    if (amount < 0) raise Error("Amount cannot be negative")
    if (currency == null || currency.isEmpty()) raise Error("Currency is required")

    this.amount = amount
    this.currency = currency
  }

  function getAmount(): number { return this.amount }
  function getCurrency(): string { return this.currency }

  // Side-effect-free arithmetic (returns a new instance)
  function add(otherMoney): Money {
    if (this.currency != otherMoney.getCurrency()) {
      raise Error("Cannot add money of different currencies")
    }
    return new Money(this.amount + otherMoney.getAmount(), this.currency)
  }

  // Value Equality: compares all attributes
  function equals(other): boolean {
    if (other == null || !(other is Money)) return false
    return this.amount == other.getAmount() && this.currency == other.getCurrency()
  }

  function hash(): number {
    return hashOf(this.amount) + hashOf(this.currency)
  }
}
```
