# Gate baselines

A gate baseline entry tagged with an issue (`# #N` in a tracked `*baseline*` file) fails the gate on every PR once `#N` closes. While a PR that closes `#N` is open, drive finds such entries in its worktree, files (or reuses) one open follow-up story under the same epic, marked `<!-- workflow:baseline-follow-up EPIC -->`, and commits the retag to it on that PR before review continues. A baseline retag through a reviewed PR is covered by the standing approval: the owner never picks the target.
