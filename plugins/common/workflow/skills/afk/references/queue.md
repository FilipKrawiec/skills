# AFK Queue

`<repo>`, `<base>`, `staleClaimHours` (default 3), `alwaysInScope`, `project`: lanes.json on `origin/<base>`.

## Pick

1. `gh issue list -R <repo> -l lane:afk -s open -L 500 --json number,title,body,labels`, and the issues open PRs close: `gh pr list -R <repo> -s open -L 500 --json closingIssuesReferences,body` (a stacked PR only names `Closes #<N>` in its body).
2. A `state:claimed` issue without an open PR is in flight: pick nothing. Park it first when its newest `state:claimed` `labeled` event (`gh api repos/<repo>/issues/<N>/events --paginate`) is older than `staleClaimHours`.
3. Candidates: board.md's Ready state, no epic or task, no open PR, every packet dependency closed as completed (`gh issue view <d> -R <repo> --json stateReason`).
4. Rank by the board's Priority (`gh project item-list <number> --owner <owner> -L 1000 --format json`), else a `priority:P*` label, else last; then lowest number.

**Output:** `next: #<N> <title>`, `in flight: #<N>` (with "parked" when stale) or `next: none`.

## Scope check

Before Open PR, list `git diff --name-only --no-renames $(git merge-base origin/<base> HEAD)` and `git ls-files -o --exclude-standard`. Each path equals a packet path, sits under a packet path ending in `/`, or under an `alwaysInScope` prefix. Revert any other path, or park when the issue needs it.
