# Duplication

Search the whole repository, not only the diff, for each new or changed unit (widget, layout, piece of logic). Each of these is **Important**, with the duplicate's `file:line`:

- the unit duplicates one elsewhere in the repository;
- the original was copied beside itself instead of lifted into the shared home for every consumer to use;
- a claim of parity or reuse has no side-by-side evidence that the same unit instance serves both consumers.
