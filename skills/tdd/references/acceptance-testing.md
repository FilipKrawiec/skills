# Acceptance Testing (BDD)

## 1. Specification by Example Lifecycle
- Write acceptance criteria inside specification files (such as Gherkin feature files, Markdown specifications, or executable BDD code templates) and commit them to version control *before* implementation starts.
- Run the acceptance tests to verify they fail (Red) before beginning the inner TDD loop, and ensure they pass (Green) to verify the vertical slice is complete.
- Execute acceptance tests at the most efficient level required by the story (e.g., Unit level for complex business calculations, Component level for service validation, System level for end-to-end integration).

## 2. Non-Technical Specifications
- Keep specifications focused strictly on business requirements and user behavior, avoiding technical details like HTTP methods, URLs, SQL queries, or database tables.
