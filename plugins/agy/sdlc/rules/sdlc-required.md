# SDLC Workflow Rule

Use the standalone `sdlc` skill for repository changes that need lifecycle coordination. It owns constraints, phase authorization, recovery, review gates, and shipping approval; use its selected phase skill for the current work.

Direct CLI work keeps compact in-session context and does not require SDLC snapshots or cross-session resume. A harness may persist and coordinate the same phase contract, including atomic state transitions. Preserve unrelated user changes; shipping requires digest-bound human acceptance.
