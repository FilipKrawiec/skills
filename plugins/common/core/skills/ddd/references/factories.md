# Aggregate Creation

- Each aggregate has exactly one creation entry in the domain. It returns a fully valid aggregate or the domain's failure form, assigns identity and records the creation event (`OrderPlaced`).
- It takes Value Objects only; the caller converts boundary input first.
- Place it on or beside the root: a factory constructor, static or companion `create`, or a pure `createX` function in the aggregate file.
- Use a separate domain factory (`OrderFactory`, one `create`) only when creation needs collaborators the root must not hold: identity or clock ports, policies, checks against other objects.
- Creation is not reconstitution: loading from storage belongs to the repository adapter.
