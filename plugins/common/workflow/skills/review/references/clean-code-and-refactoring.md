# Clean Code Principles & Martin Fowler Refactoring Catalog

This reference details core Clean Code principles, object-oriented design heuristics, Martin Fowler code smells, and matching refactoring recipes for code review.

---

## 1. SOLID & Clean Code Principles

Evaluate changes against foundational object-oriented and functional craftsmanship doctrines:

| Principle | Violation Indicator | Tech Lead Remediation Strategy |
| :--- | :--- | :--- |
| **Single Responsibility (SRP)** | A class, module, or function changes for multiple business reasons or coordinates mixed levels of abstraction. | Decompose into focused single-responsibility units using *Extract Class* or *Extract Method*. |
| **Open / Closed (OCP)** | Adding new behavior requires modifying existing nested conditional blocks (`switch` / `if-else`). | Replace branching with polymorphic strategy objects using *Replace Conditional with Polymorphism*. |
| **Liskov Substitution (LSP)** | Subclasses throw unexpected exceptions, override methods with no-ops, or weaken preconditions. | Favor composition over inheritance; ensure subtypes fully conform to the base contract. |
| **Interface Segregation (ISP)** | Clients are forced to depend on methods or interfaces they do not consume. | Split monolithic interfaces into client-specific role interfaces using *Extract Interface*. |
| **Dependency Inversion (DIP)** | High-level domain policies import low-level infrastructure, database, or UI concretions. | Invert dependencies by declaring ports in the domain/application layer and implementing them in infrastructure. |
| **Law of Demeter (LoD)** | Methods traverse deep object graphs (`a.getB().getC().doAction()`) creating tight coupling. | Apply the Principle of Least Knowledge; delegate action to the immediate collaborator (*Hide Delegate*). |
| **Tell, Don't Ask** | Callers query state from an object, make business decisions externally, then write modified state back. | Move logic into the object holding the state; command the object to perform its own state transitions. |
| **Command-Query Separation (CQS)** | Methods simultaneously mutate internal state and return query data, leading to hidden side effects. | Split method into an idempotent query method and a void/status mutating command method. |
| **Boy Scout Rule** | Code adjacent to the change is left messy, dead code remains, or confusing identifiers are untouched. | Incrementally clean immediate surroundings (*Rename Symbol*, *Extract Method*, *Remove Dead Code*). |

---

## 2. Martin Fowler Code Smells & Refactoring Moves

Inspect diffs for code smells and prescribe the standard Fowler refactoring recipe:

| Code Smell | Warning Signs & Diagnostic Criteria | Prescribed Fowler Refactoring Move |
| :--- | :--- | :--- |
| **Primitive Obsession** | Raw language types (`int`, `str`, `UUID`) representing domain concepts with rules (Email, Money, SKU). | *Replace Primitive with Object / Value Object* — encapsulate validation and behavior inside a typed immutable Value Object. |
| **Feature Envy** | A method queries and operates on another class's data more than its own instance fields. | *Move Method* or *Extract Method* — relocate the method onto the data-owning class. |
| **Data Clump** | The same 2-4 variables (e.g. `startDate`, `endDate`, `timezone`) are repeatedly passed together across signatures. | *Introduce Parameter Object* or *Preserve Whole Object* — encapsulate related parameters into a coherent object. |
| **Long Method / Bloated Body** | Method exceeds 15-20 lines, contains multiple abstraction levels, or requires explanatory inline comments. | *Extract Method* and *Decompose Conditional* — decompose into self-documenting, single-purpose functions. |
| **Large Class / God Object** | Class aggregates excessive fields, handles multiple domain concepts, or exceeds 200-300 lines. | *Extract Class* or *Extract Subclass* — partition responsibilities across dedicated cohesive classes. |
| **Complex Conditional** | Deeply nested `if/else`, complex boolean algebra, or multi-branch switch statements on type codes. | *Decompose Conditional* (extract guard predicates) or *Replace Conditional with Polymorphism*. |
| **Shotgun Surgery** | A single logical feature change requires small modifications scattered across many distinct files. | *Move Method* and *Move Field* — consolidate scattered responsibilities into a single cohesive aggregate. |
| **Divergent Change** | One class is commonly modified in different ways when distinct domain requirements change. | *Extract Class* — partition the class so each distinct variant changes independently. |
| **Inappropriate Intimacy** | Classes access each other's private internals, friend attributes, or tight coupling channels. | *Move Method*, *Extract Class*, or *Hide Delegate* — enforce public port boundaries. |
| **Leaky Encapsulation** | Internal mutable collections or state objects are returned directly to external callers. | *Encapsulate Collection* — return unmodifiable views or defensive copies; expose explicit domain mutators. |
| **Speculative Generality** | Unused hooks, abstract base classes, generic type parameters, or boilerplate anticipating hypothetical features. | *Collapse Hierarchy* and *Remove Parameter* — apply YAGNI and delete unneeded abstractions. |

---

## 3. Structural Refactoring Recipes

Apply these standard transformation blueprints when prescribing remediation:

| Refactoring Recipe | Before Pattern (Smell) | After Pattern (Clean Structure) |
| :--- | :--- | :--- |
| **Decompose Conditional** | `if (user.age > 18 && user.status == 'ACTIVE' && !user.isBlocked) { ... }` | `if (user.isEligibleForPurchase()) { ... }` (intention-revealing domain predicate). |
| **Replace Conditional with Strategy** | `switch(type) { case A: ... case B: ... }` scattered in multiple callers. | Inject `PricingStrategy` interface with concrete `TierAPricing` and `TierBPricing` implementations. |
| **Introduce Value Object** | `void register(String email, String rawZip)` with scattered regex checks. | `void register(EmailAddress email, PostalCode zip)` with self-validating Value Objects. |
| **Encapsulate Collection** | `public List<Item> getItems() { return this.items; }` allowing external `.add()`. | `public List<Item> getItems() { return List.copyOf(items); }` and `public void addItem(Item item)`. |
| **Separate Query from Modifier** | `User authenticateAndLog(String token)` mutating login count and returning user. | `User authenticate(String token)` (query) and `void recordLogin(UserId id)` (modifier). |
