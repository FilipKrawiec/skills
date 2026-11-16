# Review packet

Drive writes `review-packet.md` beside your brief before each round. Its sections, in order: the issue's criteria verbatim and scope packet; CI per check with failing excerpts; the project gate result; the diff at head by area, pure renames marked mechanical; for a later round, the delta since your last verdict and open threads with file and line; call sites of changed exported symbols from `git grep`.

- It carries no PR description, implementer note or hand-back: judge the diff against the issue, never against the author's account.
- `[truncated: ...]` marks a part cut for size; read the rest with the `git diff` it names.
- A packet marked unavailable means drive could not build it: gather the context with `review-context`.
- It is facts only. Blast radius outside it (callers, contracts, configuration) stays yours to check with `git grep` and Read.
- Large diff: read one area at a time and skip renames marked mechanical. For scripted mechanical edits, check the script and the hand-written remainder.
- Inline findings: `review-post` keys each by its path, `criterion` and `failure` (else its first line) and skips a key an open thread already carries, so retrying after an error never duplicates a thread.
