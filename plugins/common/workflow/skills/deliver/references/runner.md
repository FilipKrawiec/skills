# Runner

`<cli> runner poll` (no model) starts one headless `drive --next` session per poll (its `-next` claim admits one at a time, and none while one holds it) with drive's model and effort when ready work exists, backs off on low GraphQL quota, and releases the claim of a crashed or hung session; `runner status` prints its health as JSON. The runner has no scheduler or queue logic of its own: drive keeps every rule.
