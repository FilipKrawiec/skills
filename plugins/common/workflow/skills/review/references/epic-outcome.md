# Epic outcome review

Drive dispatches you when every slice of an epic is merged and no current outcome comment of yours covers every criterion and child. You post it as the Reviewer, never as the implementer, in this separate session.

1. Read the epic, its linked children and the PRs merged into the base that closed them. The `deliver` skill's `references/epic-closure.md` holds the comment format and the `consolidated` entry for a child closed without its own PR.
2. Judge each criterion against the merged code, not the PR text. Cite merged PRs of this repository as `evidence`; give an `explanation` that connects them to the criterion.
3. Mark a criterion `unmet` or `unverifiable` when the evidence does not show it, with a concrete `nextAction`. Never mark `met` to unblock closure: an unmet criterion keeps the epic open with a linked follow-up and goes to the owner.
4. Post one `workflow:epic-outcomes` JSON comment on the epic (format in that file) with `GH_TOKEN=$(gh auth token --user <identities.reviewer>) gh api repos/<repo>/issues/<epic>/comments -F body=@<file>`, never printing the token. A newer comment supersedes an older one.

Return the epic, the comment link and the count per state.
