---
name: afk
description: One unattended run of the delivery cycle for a repository with .github/lanes.json; invoked by name from a scheduled task.
disable-model-invocation: true
allowed-tools: Skill Read Edit Write Bash(python3:*,git:*,gh:*,just:*,lsof:*)
---

# AFK

One run delivers **at most one** `lane:afk` issue; park instead of asking.

- `<repo>`, `<base>` (default `main`), `branchPrefix` (default `agent/afk-`), `staleClaimHours` (default 3), `alwaysInScope` and `project`: `.github/lanes.json` on `origin/<base>`.
- Never touch the starting checkout; work only in worktrees.
- Run only commands named here and in the skills you invoke; improvised ones stall on permission prompts.
- **Park** an issue: push useful work; replace `lane:afk` and `state:*` with `lane:owner`; comment the question, options and recommendation.
- Reasoning: high `spec`; medium `plan`, `review`, `improve`; low `tdd`; lowest otherwise; raise after two failures.
- Read [setup.md](references/setup.md) without `.github/lanes.json` or when scheduling runs.
- Read [github-safety.md](references/github-safety.md) when setting up or checking the repository's GitHub settings.

## 1. Ship

Invoke `ship`.

**Exit gate:** `ship`'s exit gate.

## 2. Tend

For each open `branchPrefix` PR whose issue has `lane:afk`, in its worktree: fix unanswered blocking reviews, then invoke `vcs` to make it ready to merge. Keep auto-merge on (`gh pr merge <pr> --squash --auto`), never off. Verify fully before every push. Park on a product decision or two failed fixes.

**Exit gate:** each own PR green and conflict-free, or parked.

## 3. Pick

Base red → phase 5. Else:

1. `gh issue list -R <repo> -l lane:afk -s open -L 500 --json number,title,body,labels`, and the issues open PRs close: `gh pr list -R <repo> -s open -L 500 --json closingIssuesReferences,body` (a stacked PR only names `Closes #<N>` in its body).
2. A `state:claimed` issue without an open PR is in flight: pick nothing, go to phase 5. Park it first when its newest `state:claimed` `labeled` event (`gh api repos/<repo>/issues/<N>/events --paginate`) is older than `staleClaimHours`.
3. Candidates: no `state:` label, acceptance criteria, a scope packet (a ```` ```scope ```` block), not `type:epic` or `type:task`, no open PR, every packet dependency closed as completed (`gh issue view <d> -R <repo> --json stateReason`).
4. Rank by the board's Priority (`gh project item-list <number> --owner <owner> -L 1000 --format json`), else a `priority:P*` label, else last; then lowest number.

**Exit gate:** `next: #<N>` → phase 4; none → phase 5.

## 4. Deliver

1. Invoke `vcs` to start (claim) the issue; read the issue, its linked decisions, project rules.
2. Invoke `plan`.
3. `tdd` per step, commit per `vcs`, update tied docs; pass the scope check and full verification.
4. `review` as two fresh-context workers (axes A, B) given only issue and diff; two rounds max. Then invoke `vcs` to open the PR.

Scope check: list `git diff --name-only --no-renames $(git merge-base origin/<base> HEAD)` and `git ls-files -o --exclude-standard`. Each path equals a packet path, sits under a packet path ending in `/`, or under an `alwaysInScope` prefix. Revert any other path, or park when the issue needs it.

Park when the issue is ambiguous or contradicts rules, needs an out-of-scope or owner path, an undecided product or model choice, credentials, settings or a device, or stays red or blocked after two attempts. Verify first: trace the failure to its raising call; list fixes keeping all criteria.

**Exit gate:** PR URL with auto-merge on, or a parked issue.

## 5. Housekeeping

Only when nothing was delivered: comment the failing excerpt on each red Dependabot PR; invoke `spec` for open issues without a `lane:` label. Never start follow-ups; list them.

**Exit gate:** each comment and `spec` result.

## 6. Close

Invoke `improve` for shipped issues awaiting lessons and this run's friction; invoke `vcs` to tidy.

**Exit gate:** `improve`'s exit gates; worktrees removed.

## Output

≤ 8 lines, changed items only. **Summary:** base health, PRs tended, delivered PR (or "queue empty"), lesson PRs, housekeeping, linked. **Decision:** parks, follow-ups and proposed lessons, each with a recommendation, or "Nothing needed."
