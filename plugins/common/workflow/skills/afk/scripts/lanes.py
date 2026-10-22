#!/usr/bin/env python3
"""Deterministic start and end of a scheduled AFK run, so the model spends no tokens on them.

Usage: lanes.py start --me <run id> --runs <command> [--sync <command>]
       lanes.py merge [<pr>...]
       lanes.py end --me <run id>
Run in a checkout of the repository; reads .github/lanes.json from origin/<base>.

start  preflights the identities, merges approved PRs, runs --sync in a checkout of origin/<base>
       while no other run is live, then holds the first open epic, in Epics view order, that no
       other live run holds and that has work. --runs is the host's command that prints the ids
       of the scheduled task's live runs, one per line. Exit 0 prints the held epic and its work;
       2 prints one `Blocked:` line; 3 prints one `Done:` line: nothing for this run.
merge  squash-merges each open PR (or the named ones) whose newest Reviewer review approves its
       exact head with `verdict=ready`, unless it is labelled review:owner.
end    releases every epic this run holds.

Markers, each the first line of a comment, name runs by the --me id:
  <!-- afk-epic-hold session=<id> -->      on an epic: that run works in it; the oldest live
                                            hold wins, and `end` rewrites it to afk-epic-released.
  <!-- afk-claim session=<id> -->           on an issue: the newest names the run delivering it;
                                            `state:claimed` without a live claim is leftover.
  <!-- agent-review ... issue=<n> ... -->   the Reviewer's AFK eligibility verdict on an issue.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

HOLD = "<!-- afk-epic-hold session={} -->"
RELEASED = "<!-- afk-epic-released session={} -->"
HOLD_RE = re.compile(r"<!-- afk-epic-hold session=(\S+) -->")
CLAIM_RE = re.compile(r"<!-- afk-claim session=(\S+) -->")
ELIGIBILITY_RE = re.compile(r"<!-- agent-review [^>]*\bissue=\d+")
PRIORITIES = {"P0": 0, "P1": 1, "P2": 2}


class Blocked(Exception):
    """A preflight failure: the message is `<cause>; <what unblocks it>`."""


def sh(*args: str, cwd: str | None = None, check: bool = True) -> str:
    done = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    if check and done.returncode:
        raise RuntimeError(f"{' '.join(args[:3])} exited {done.returncode}: {done.stderr.strip()[:300]}")
    return done.stdout.strip()


def ok(*args: str) -> bool:
    return subprocess.run(args, capture_output=True).returncode == 0


class Runs:
    """The scheduled task's live runs, as the host's --runs command lists them; `refresh` lists them again."""

    def __init__(self, ids: list[str], lister=None):
        self.ids, self.lister = set(ids), lister

    def refresh(self) -> Runs:
        if self.lister:
            self.ids = set(self.lister())
        return self

    def live(self, session: str | None) -> bool:
        return session in self.ids

    def others_live(self, me: str) -> list[str]:
        return sorted(self.ids - {me})


# ─── board ─────────────────────────────────────────────────────────────────────


@dataclass
class Issue:
    number: int
    labels: set[str]
    ancestors: list[int]
    blocked: bool
    priority: int
    milestone: tuple
    edited: str = ""

    @property
    def is_epic(self) -> bool:
        return "type:epic" in self.labels


@dataclass
class Pr:
    number: int
    title: str
    head: str
    labels: set[str]
    issues: list[int]
    approved: bool


@dataclass
class Epic:
    issue: Issue
    work: list[str] = field(default_factory=list)


def ancestors(node: dict) -> list[int]:
    chain, parent = [], node.get("parent")
    while parent:
        chain.append(parent["number"])
        parent = parent.get("parent")
    return chain


def to_issue(node: dict, project: int) -> Issue:
    priority = 9
    for item in node["projectItems"]["nodes"]:
        value = item.get("fieldValueByName") or {}
        if item["project"]["number"] == project and value.get("name") in PRIORITIES:
            priority = PRIORITIES[value["name"]]
    ms = node.get("milestone")
    milestone = (0, ms.get("dueOn") or "9999", ms["number"]) if ms else (1, "", 0)
    return Issue(node["number"], {l["name"] for l in node["labels"]["nodes"]}, ancestors(node),
                 any(b["state"] == "OPEN" for b in node["blockedBy"]["nodes"]), priority, milestone,
                 node.get("lastEditedAt") or "")


def epic_order(epics: list[Issue]) -> list[Issue]:
    """The Epics view's order: Priority, then milestone, then number."""
    return sorted(epics, key=lambda e: (e.priority, e.milestone, e.number))


def approved_head(pr: dict, reviewer: str) -> bool:
    """The newest review by the Reviewer approves this exact head with `verdict=ready`."""
    head = pr["headRefOid"]
    mine = [r for r in pr.get("reviews", []) if r["author"]["login"] == reviewer]
    if not mine:
        return False
    newest = mine[-1]
    return (newest["state"] == "APPROVED" and (newest.get("commit") or {}).get("oid") == head
            and f"sha={head}" in newest["body"] and "verdict=ready" in newest["body"])


def to_pr(node: dict, reviewer: str) -> Pr:
    numbers = [int(n) for n in re.findall(r"(?<![\w/])#(\d+)\b", node.get("body") or "")]
    return Pr(node["number"], node["title"], node["headRefOid"], {l["name"] for l in node["labels"]},
              list(dict.fromkeys(numbers)), approved_head(node, reviewer))


def needs_work(pr: Pr) -> bool:
    """A PR the run must act on: not left for the owner and not already approved for merge."""
    return "review:owner" not in pr.labels and not pr.approved


def awaits_check(comments: list[dict], edited: str, reviewer: str) -> bool:
    """A proposed issue awaits the Reviewer's eligibility check until one is recorded after its last change."""
    checks = [c["created_at"] for c in comments
              if c["user"]["login"] == reviewer and ELIGIBILITY_RE.search(c["body"])]
    if not checks:
        return True
    return edited > checks[-1] or any(
        c["created_at"] > checks[-1] and c["user"]["login"] != reviewer for c in comments)


def plan(issues: list[Issue], prs: list[Pr], claimed_elsewhere, awaits=lambda issue: True) -> list[Epic]:
    """Every open epic in Epics view order, each with the work a run holding it would do."""
    epics = [Epic(e) for e in epic_order([i for i in issues if i.is_epic])]
    by_number = {i.number: i for i in issues}
    numbers = {e.issue.number for e in epics}

    def epic_of(n: int) -> int | None:
        issue = by_number.get(n)
        return next((a for a in issue.ancestors if a in numbers), None) if issue else None

    in_pr = {n for pr in prs for n in pr.issues}
    for epic in epics:
        for issue in issues:
            if issue.is_epic or epic_of(issue.number) != epic.issue.number or issue.number in in_pr:
                continue
            if "lane:proposed" in issue.labels and awaits(issue):
                epic.work.append(f"#{issue.number} awaits its AFK eligibility check")
            elif "lane:afk" in issue.labels and not issue.blocked and not claimed_elsewhere(issue.number):
                epic.work.append(f"#{issue.number} is ready")
    for pr in prs:
        if not needs_work(pr):
            continue
        owners = [e for e in (epic_of(n) for n in pr.issues) if e]
        if owners and any(claimed_elsewhere(n) for n in pr.issues if epic_of(n)):
            continue
        target = owners[0] if owners else (epics[0].issue.number if epics else None)
        for epic in epics:
            if epic.issue.number == target:
                epic.work.append(f"PR #{pr.number} ({pr.title})" + ("" if owners else " is under no epic"))
    return epics


# ─── GitHub ────────────────────────────────────────────────────────────────────

ISSUES = """query($owner:String!,$name:String!,$page:String){repository(owner:$owner,name:$name){
issues(states:OPEN,first:100,after:$page){pageInfo{hasNextPage endCursor} nodes{number lastEditedAt
labels(first:30){nodes{name}} blockedBy(first:30){nodes{state}} milestone{number dueOn}
parent{number parent{number parent{number parent{number}}}}
projectItems(first:10){nodes{project{number} fieldValueByName(name:"Priority"){
... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}}"""


class GitHub:
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.repo = cfg["repo"]

    def issues(self) -> list[Issue]:
        owner, name = self.repo.split("/")
        project = self.cfg.get("project", {}).get("number", 0)
        found, page_after = [], None
        while True:
            args = ["gh", "api", "graphql", "-f", f"query={ISSUES}", "-F", f"owner={owner}", "-F", f"name={name}"]
            if page_after:
                args += ["-F", f"page={page_after}"]
            page = json.loads(sh(*args))["data"]["repository"]["issues"]
            found += [to_issue(n, project) for n in page["nodes"]]
            if not page["pageInfo"]["hasNextPage"]:
                return found
            page_after = page["pageInfo"]["endCursor"]

    def prs(self) -> list[dict]:
        return json.loads(sh("gh", "pr", "list", "--repo", self.repo, "--state", "open", "--limit", "1000",
                             "--json", "number,title,body,labels,headRefOid,reviews"))

    def comments(self, number: int) -> list[dict]:
        pages = sh("gh", "api", "--paginate", "--slurp", f"repos/{self.repo}/issues/{number}/comments")
        return [c for page in json.loads(pages) for c in page]

    def comment(self, number: int, body: str) -> int:
        return json.loads(sh("gh", "api", f"repos/{self.repo}/issues/{number}/comments", "-f", f"body={body}"))["id"]

    def edit(self, comment: int, body: str) -> None:
        sh("gh", "api", "-X", "PATCH", f"repos/{self.repo}/issues/comments/{comment}", "-f", f"body={body}")

    def merge(self, number: int, head: str) -> str:
        base = ["gh", "pr", "merge", str(number), "--repo", self.repo, "--squash", "--match-head-commit", head]
        if ok(*base):
            return "merged"
        if ok(*base, "--auto"):
            return "set to merge when its checks pass"
        return "refused by GitHub"


def newest_session(comments: list[dict], pattern: re.Pattern) -> str | None:
    for c in reversed(comments):
        found = pattern.search(c["body"])
        if found:
            return found.group(1)
    return None


# ─── commands ──────────────────────────────────────────────────────────────────


def load_config() -> dict:
    sh("git", "fetch", "--quiet", "origin")
    base = "main"
    try:
        cfg = json.loads(sh("git", "show", f"origin/{base}:.github/lanes.json"))
    except RuntimeError as err:
        raise Blocked(f"no .github/lanes.json on origin/{base}; run in a checkout of a lanes repository") from err
    if cfg.get("base", base) != base:
        cfg = json.loads(sh("git", "show", f"origin/{cfg['base']}:.github/lanes.json"))
    cfg.setdefault("base", base)
    return cfg


def preflight(cfg: dict) -> None:
    repo, project = cfg["repo"], cfg.get("project")
    remote = sh("git", "remote", "get-url", "--push", "origin")
    if not remote.startswith("https://") or repo not in remote:
        raise Blocked(f"origin pushes to {remote}; set it to https://github.com/{repo}")
    login = sh("gh", "api", "user", "--jq", ".login", check=False)
    if login != cfg["implementer"]:
        raise Blocked(f"gh acts as {login or 'nobody'}; make it act as {cfg['implementer']}")
    if not ok("gh", "auth", "token", "--user", cfg["reviewer"]):
        raise Blocked(f"no gh login for {cfg['reviewer']}; run gh auth login as {cfg['reviewer']}")
    perms = sh("gh", "api", f"repos/{repo}", "--jq", "[.permissions.admin, .permissions.maintain]", check=False)
    if perms.replace(" ", "") != "[false,false]":
        raise Blocked(f"{login} has admin or maintain on {repo} ({perms}); drop it to write")
    if project and not ok("gh", "project", "view", str(project["number"]), "--owner", project["owner"]):
        raise Blocked(f"{login} cannot read project {project['number']}; gh auth refresh -s project")


def merge_approved(gh: GitHub, nodes: list[dict], only: set[int] | None = None) -> list[str]:
    done = []
    for node in nodes:
        pr = to_pr(node, gh.cfg["reviewer"])
        if (only is None or pr.number in only) and pr.approved and "review:owner" not in pr.labels:
            done.append(f"PR #{pr.number} {gh.merge(pr.number, pr.head)}")
    return done


def sync(cfg: dict, me: str, command: str) -> list[str]:
    """Run the host's install of the base's prompts and plugins, so a merged process change needs nobody."""
    root = Path(sh("git", "rev-parse", "--path-format=absolute", "--git-common-dir")).parent
    tree = root / ".worktrees" / f"sync-{me}"
    sh("git", "worktree", "add", "--detach", "--force", str(tree), f"origin/{cfg['base']}")
    try:
        subprocess.run(command, shell=True, cwd=tree, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as err:
        raise Blocked(f"`{command}` failed on origin/{cfg['base']}: {err.stderr.strip()[-200:]}; fix it on the base") from err
    finally:
        sh("git", "worktree", "remove", "--force", str(tree), check=False)
    return [f"Synced: ran `{command}` on origin/{cfg['base']}"]


def live_holds(comments: list[dict], runs: Runs, me: str) -> list[tuple[int, str]]:
    """(comment id, run) of each hold by a live run or by this run, oldest first."""
    return sorted((c["id"], s) for c in comments for s in HOLD_RE.findall(c["body"])
                  if s == me or runs.live(s))


def hold(gh: GitHub, runs: Runs, me: str, epic: int) -> int | None:
    """Post this run's hold on the epic; None when another live run holds it. The oldest live hold wins."""
    if any(s != me for _, s in live_holds(gh.comments(epic), runs.refresh(), me)):
        return None
    mine = gh.comment(epic, HOLD.format(me) + "\nAn AFK run works in this epic; it releases this hold when it ends.")
    holds = live_holds(gh.comments(epic), runs.refresh(), me)
    if holds and holds[0][1] != me:
        gh.edit(mine, RELEASED.format(me))
        return None
    return mine


def own_hold(gh: GitHub, epic: int, me: str) -> int | None:
    return next((c["id"] for c in gh.comments(epic) if HOLD.format(me) in c["body"]), None)


def start(args: argparse.Namespace, me: str) -> int:
    cfg = load_config()
    preflight(cfg)
    sync_base = (lambda: sync(cfg, me, args.sync)) if args.sync else None
    return take_epic(GitHub(cfg), Runs([], lambda: list_runs(args.runs)), me, sync_base)


def list_runs(command: str) -> list[str]:
    listed = subprocess.run(command, shell=True, capture_output=True, text=True)
    if listed.returncode:
        raise Blocked(f"`{command}` exited {listed.returncode}: {listed.stderr.strip()[-200:]}; fix the host's run listing")
    return listed.stdout.split()


def take_epic(gh: GitHub, runs: Runs, me: str, sync_base=None) -> int:
    """Merge approved PRs, sync while no other run is live, then hold the first free epic with work."""
    reviewer = gh.cfg["reviewer"]
    out = merge_approved(gh, gh.prs())
    if sync_base and not runs.refresh().others_live(me):
        out += sync_base()
    nodes = gh.prs()
    threads: dict[int, list[dict]] = {}

    def thread(n: int) -> list[dict]:
        if n not in threads:
            threads[n] = gh.comments(n)
        return threads[n]

    def claimed_elsewhere(n: int) -> bool:
        claim = newest_session(thread(n), CLAIM_RE)
        return claim not in (None, me) and runs.live(claim)

    def awaits(issue: Issue) -> bool:
        return awaits_check(thread(issue.number), issue.edited, reviewer)

    epics = plan(gh.issues(), [to_pr(n, reviewer) for n in nodes], claimed_elsewhere, awaits)
    for epic in epics:
        if not epic.work:
            continue
        number = epic.issue.number
        comment = own_hold(gh, number, me) or hold(gh, runs, me, number)
        if comment:
            print(f"Hold: epic #{number} (comment {comment})")
            print("\n".join(out + [f"Work: {w}" for w in epic.work]))
            return 0
    print("Done: every epic with work has its runner.")
    print("\n".join(out))
    return 3


def end(me: str) -> int:
    return release(GitHub(load_config()), me)


def release(gh: GitHub, me: str) -> int:
    for epic in (i.number for i in gh.issues() if i.is_epic):
        for c in gh.comments(epic):
            if HOLD.format(me) in c["body"]:
                gh.edit(c["id"], RELEASED.format(me))
                print(f"Released: epic #{epic}")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("start")
    s.add_argument("--runs", required=True, help="command printing the ids of the task's live runs")
    s.add_argument("--sync", help="command that installs the base's prompts, run in a checkout of it")
    m = sub.add_parser("merge")
    m.add_argument("prs", nargs="*", type=int)
    for command in (s, sub.add_parser("end")):
        command.add_argument("--me", required=True, help="this run's id, as --runs and the markers name it")
    try:
        args = parser.parse_args(argv)
    except SystemExit as err:
        if not err.code:
            return 0
        print("Blocked: lanes.py was called with the wrong arguments; fix the host's call to match its usage")
        return 2
    try:
        if args.command != "merge" and not args.me:
            raise Blocked("--me is empty; pass this run's id from the host")
        if args.command == "start":
            return start(args, args.me)
        if args.command == "merge":
            gh = GitHub(load_config())
            print("\n".join(merge_approved(gh, gh.prs(), set(args.prs) or None)) or "Merged nothing.")
            return 0
        return end(args.me)
    except Blocked as err:
        print(f"Blocked: {err}")
        return 2
    except RuntimeError as err:
        print(f"Blocked: {err}; the next run retries")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
