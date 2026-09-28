# Operating the Local Issue Factory

## Runtime and security boundary

The dispatcher uses Python 3.9+ standard library, Git, GitHub CLI, Just, and one
installed authenticated agent CLI. It is separate from a GitHub Actions runner.
The apps need not be open: the dispatcher starts non-interactive CLI sessions.

Use a dedicated macOS worker account or VM with a repository-scoped GitHub
credential, agent login, and the required development toolchain. Give that
account access only to the target checkout, factory state, and development
caches. Keep Firebase, Apple signing, SSH, cloud, and personal credentials out of
the worker account. Review configured Git transport authentication separately.

Worktrees isolate changes, not personal data. Environment allowlisting and
agent sandbox flags are defense in depth, not a guarantee that an agent cannot
read files, credentials, or keychain entries available to its OS account.
Claude safe mode disables host customizations; trusted bundled TDD/review text
is supplied explicitly. Codex ignores user configuration and execution rules.
Sandbox/tool restrictions can block legitimate work; blocked work returns to
the owner instead of gaining additional permissions or switching executors.

The dispatcher itself can publish feature branches and edit issues. Review its
credential scope, CLI binaries, local hooks, and Git configuration as trusted
operator inputs. Execution requires `--acknowledge-local-access`; this records
an operator decision, not a security attestation.

## Issue contract

Create these labels in the target repository: `agent:ready`, `agent:codex`,
`agent:claude`, `agent:running`, `agent:blocked`, `agent:review`, `agent:stop`.
Keep one executor label on each task. The owner authors the issue and applies
the latest readiness label. The CLI uses the issue's number for its branch name.

An issue needs a nonempty `## Acceptance criteria` section (the `###` heading
produced by GitHub issue forms is also accepted) and one packet:

```factory
{"paths": ["src/", "tests/"], "dependencies": []}
```

Paths ending in `/` authorize a directory subtree; other paths authorize one
file. Use explicit relative paths without wildcard or parent traversal.
Dependencies are issue numbers in the same repository and must be closed as
completed. Scope excludes top-level infrastructure, plus factory, instruction,
workflow, and command-runner paths at every nesting level. The verifier always
comes from the local trusted policy: `just verify`.
Issue text cannot choose an arbitrary executable verification command.

Use narrowly bounded tasks with existing test commands. Publishing includes
only reviewed path-boundary changes after the deterministic gate passes.
New or changed symlinks and agent-created commits return for manual inspection.
Staged content that differs from working files also returns for inspection. The
controller rebuilds the publishing index from the pinned base, validates every
changed path and file mode, and matches the commit tree to that validated index.
This is a boundary check, not semantic or secret-scanning certification.

## Commands

From the installed skill directory, use its bundled script. Absolute paths are
recommended; keep a dedicated state directory outside the source checkout.

```sh
python3 scripts/issue_factory.py --repo OWNER/REPO \
  --checkout /absolute/source --state-dir /absolute/factory-state
```

The default is read-only: inspect eligible/rejected tasks without claims, agent
calls, checkout changes, or state creation. After worker isolation and credential
review, append `--execute --acknowledge-local-access` to process one task.

For a finite queue session, add `--max-tasks 3 --idle-polls 10 --interval 60
--timeout 1800`. Each subprocess has a time limit; the queue has a task and idle
poll ceiling. These are runtime bounds, not a provider spending cap. Subscription
limits still apply. A second dispatcher using the same state directory fails its
exclusive local lock. Use exactly one state directory per repository; this is not
a distributed multi-laptop claim service. Selection considers at most 100 ready
issues, ordered by issue number; larger queues require explicit batching.

Keep the laptop awake, powered, and online. Start the foreground dispatcher in
an operator-controlled terminal session. OS sleep/remote-access settings and
launch-at-login installation are separate operator decisions.

## Stop and recover

Readiness stays present while running; the running label prevents selection by
the serial dispatcher. Claiming rechecks the issue, dependencies, and owner's
latest readiness event. Every delivery checkpoint requires that same event;
removal followed by reapplication requires owner recovery of the existing run.

Ctrl-C cancels the active process group and preserves changes. Inspect the worker
session for detached or lingering children before ending it. Removing `agent:ready` or
`agent:running`, applying `agent:stop`, changing the executor, closing the issue,
or editing its specification revokes authorization at the next delivery
checkpoint; it does not interrupt an agent immediately over GitHub.

The private state directory stores one journal and local logs per issue.
Interrupted, blocked, or previously published tasks are never retried
automatically. Inspect the recorded phase, worktree, remote branch, and PR before
recovery. If a failure happened after push, the remote branch may exist without
a PR; if it happened after PR creation, a draft may already exist. Reconcile the
issue state with that evidence. Archive the original journal, use a new bounded
follow-up issue when appropriate, and let the owner reauthorize it explicitly.

Successful worktrees remain for review. After an owner-authorized merge, remove
only the corresponding clean worktree and merged branch using the VCS workflow.
Private logs may contain source text; share only a reviewed, redacted summary.

## Verified interfaces

- [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)
- [Claude programmatic execution](https://code.claude.com/docs/en/headless)
- [Claude sandbox configuration](https://code.claude.com/docs/en/sandboxing)
