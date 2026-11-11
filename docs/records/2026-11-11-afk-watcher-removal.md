# AFK watcher removal: owner-machine cleanup — 2026-11-11

Epic [#409](https://github.com/FilipKrawiec/skills/issues/409) removed the unattended AFK factory in [#421](https://github.com/FilipKrawiec/skills/issues/421): the `afk` command and skill, `issue queue`, the `Review queue` issue, the `lane:afk`, `lane:proposed` and `state:claimed` labels and the `afk` and `reviewQueue` config keys. Delivery now runs only through `drive` from an open owner session. The CLI no longer reads an `afk` block in `.agents/config.json`; a leftover block is ignored.

The launchd watchers installed by the removed `afk install` keep running from their own tooling checkout until they are removed by hand. Run these once on the owner's machine. `REPO` is each repository's main checkout.

```sh
launchctl bootout gui/$(id -u)/dev.workflow.afk.FilipKrawiec.skills
launchctl bootout gui/$(id -u)/dev.workflow.afk.FilipKrawiec.stagely-pro
rm ~/Library/LaunchAgents/dev.workflow.afk.FilipKrawiec.*.plist
```

Then, for each of `REPO=~/Developer/github.com/FilipKrawiec/skills` and `REPO=~/Developer/github.com/FilipKrawiec/stagely-pro`:

```sh
rm "$REPO/.git/afk-launch.mjs"
git -C "$REPO" worktree remove .worktrees/afk-watch
```

`git worktree remove` refuses a dirty worktree; inspect it before adding `--force`. Optionally delete the watcher's leftovers: `~/Library/Logs/dev.workflow.afk.FilipKrawiec.*.log` and the ledgers `$REPO/.git/afk-holds.json`, `$REPO/.git/afk-spent.json` and `$REPO/.git/afk-idle-explore.json`.

Keep `com.filipkrawiec.skills-main-refresh`: it only updates the installed plugins and has nothing to do with the watcher.

Check: `launchctl list | grep dev.workflow.afk` prints nothing, and `git -C "$REPO" worktree list` shows no `afk-watch` entry.

stagely-pro's `.agents/config.json` drops its `afk` block in a companion PR.
