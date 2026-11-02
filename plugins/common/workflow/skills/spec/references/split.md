# Splitting an issue

An issue found to need several PRs is split into an epic with one-PR sub-issues, never sliced by `Part of` PRs. Its own authority approves the epic. First set `type:epic`, drop its lane and rewrite its body in the epic form, so an interrupted split leaves an epic to slice, not a story to rebuild. Then create its one-PR sub-issues as for an epic slice, each packet within the issue's packet (the run's push checks that copy), with blocked-by links where order matters. A run builds the first sub-issue under its hold, and the epic closes through its close check.
