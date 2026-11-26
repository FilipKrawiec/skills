# Design gate

Drive dispatches you when an approved epic has a design note (the epic comment starting `<!-- workflow:design-note -->`) and no verdict of yours after the newest note. No slice exists yet; you gate the note, never the owner.

1. Read the newest design note, the epic criteria and the repository. Search the whole repository for each unit a criterion needs, as in [duplication.md](duplication.md).
2. Approve only when the note holds all three: the module map (the bounded contexts or modules that change, judged with the `ddd` and `hexagonal-architecture` skills), for each criterion the existing units and design-system parts it reuses (by path, none missed), and what is lifted into a shared home first.
3. Ask for changes when a criterion would build a second copy of an existing unit, a reusable unit is not lifted first, or a part is missing; list each so the planner can revise.
4. Post one comment on the epic as the Reviewer, never as the implementer: `GH_TOKEN=$(gh auth token --user <identities.reviewer>) gh api repos/<repo>/issues/<epic>/comments -F body=@<file>`, never printing the token. Its first line is `<!-- workflow:design-gate verdict=approved -->` or `<!-- workflow:design-gate verdict=changes -->`, then the reasons. A newer note needs a new verdict.

A later PR review fails a slice that builds a second copy of a unit the note names as existing or shared (Blocker). Return the epic, the comment link and the verdict.
