#!/usr/bin/env python3
"""Deterministic start and end of a scheduled AFK run, so the model spends no tokens on them.

Usage: lanes.py start --me <run id> --runs <command> [--sync <command>]
       lanes.py check --runs <command> [--quiet]
       lanes.py merge [<pr>...]
       lanes.py end --me <run id>
Run in a checkout of the repository; reads .github/lanes.json from origin/<base>.

start  preflights the identities, merges approved PRs, runs --sync in a checkout of origin/<base>
       while no other run is live, then holds the first free piece of work, in Epics view order:
       one issue (a ready issue, its open PR, or its eligibility check) whose scope packet shares
       no path with an issue another live run holds, so runs share an epic; or, when that work
       has no packet, its whole epic, while no other live run works in it. A PR is work while a
       check of its head fails, it conflicts, it has no Reviewer review of its head (any run takes
       that review at once) or it is neither approved nor held for the owner. Nothing is held once
       lanes.json `maxRuns` other runs are live; without `maxRuns` every hold is a whole epic.
       --runs is the host's command that prints the ids of the live runs, one per line. Exit 0 prints the hold and its work;
       2 prints one `Blocked:` line; 3 prints one `Done:` line: nothing for this run; 4 prints one
       `Explore:` line: no work is free for this run, lanes.json `explore.idleHours` is set, no
       other live run explores and the last idle explore began at least that many hours ago, so
       this run plays `explore` unattended instead.
check  for a host's watcher that starts runs on events instead of a schedule, with no model: merges
       approved PRs, then prints `Start: <n>` (exit 0), the runs to start now so that each has free
       work, counting live runs that hold nothing yet as taking some; else one `Done:` line (exit 3).
       With --quiet it first prints `Quiet:` (exit 3) while the newest repository event, the newest
       workflow runs and the live runs are as at the last check, for up to 30 minutes.
merge  squash-merges each open PR (or the named ones) whose newest Reviewer review approves its
       exact head with `verdict=ready`; a review:owner one only once the owner's newest review
       approves that head too.
end    releases every hold of this run.

Runs on one host record their holds, with the held paths, in afk-holds.json in the git common
directory, under a lock, so two starting runs never hold overlapping work.

Markers, each the first line of a comment, name runs by the --me id:
  <!-- afk-epic-hold session=<id> -->      on an epic: that run works in all of it; the oldest
                                            live hold wins, and `end` rewrites it to afk-epic-released.
  <!-- afk-issue-hold session=<id> -->     on an issue: that run works on it alone; the same rules,
                                            and `end` rewrites it to afk-issue-released.
  <!-- afk-claim session=<id> -->           on an issue: the newest names the run delivering it;
                                            `state:claimed` without a live claim is leftover.
  <!-- agent-review eligibility ... -->     the Reviewer's AFK eligibility verdict on an issue
                                            (also `afk-eligibility`, or any form naming `issue=<n>`).
"""
from __future__ import annotations

import argparse
import contextlib
import fcntl
import json
import re
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

HOLD = "<!-- afk-epic-hold session={} -->"
RELEASED = "<!-- afk-epic-released session={} -->"
ISSUE_HOLD = "<!-- afk-issue-hold session={} -->"
ISSUE_RELEASED = "<!-- afk-issue-released session={} -->"
HOLD_RE = re.compile(r"<!-- afk-(?:epic|issue)-hold session=(\S+) -->")
SCOPE_RE = re.compile(r"```scope[ \t]*\n(.*?)\n```", re.S)
CLAIM_RE = re.compile(r"<!-- afk-claim session=(\S+) -->")
ELIGIBILITY_RE = re.compile(r"<!-- agent-review (?:(?:afk-)?eligibility\b|[^>]*\bissue=\d+)")
PRIORITIES = {"P0": 0, "P1": 1, "P2": 2}
GRACE = 600


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
    paths: list[str] | None = None

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
    awaits_review: bool = False
    broken: bool = False


@dataclass
class Unit:
    """One run's share of an epic: `issue` is held, `paths` may change (None: no scope packet)."""
    text: str
    issue: int | None
    paths: list[str] | None


@dataclass
class Epic:
    issue: Issue
    units: list[Unit] = field(default_factory=list)

    @property
    def work(self) -> list[str]:
        return [u.text for u in self.units]


def packet(body: str) -> list[str] | None:
    """The paths of an issue's ```scope block, or None when it has none that parse."""
    found = SCOPE_RE.search(body or "")
    try:
        paths = json.loads(found.group(1)).get("paths") if found else None
    except (ValueError, AttributeError):
        return None
    if not paths or not all(isinstance(p, str) and p.strip("./") for p in paths):
        return None
    return [p[2:] if p.startswith("./") else p.lstrip("/") for p in paths]


def overlaps(mine: list[str], theirs: list[str]) -> bool:
    """Two path lists share a file; a path ending in `/` covers its subtree."""
    def covers(a: str, b: str) -> bool:
        return a == b or (a.endswith("/") and b.startswith(a))
    return any(covers(a, b) or covers(b, a) for a in mine for b in theirs)


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
                 node.get("lastEditedAt") or "", packet(node.get("body") or ""))


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


def owner_approved(pr: dict, owner: str) -> bool:
    """The owner's newest review approves this exact head, as a review:owner PR needs on top of the Reviewer's."""
    mine = [r for r in pr.get("reviews", []) if r["author"]["login"] == owner]
    return bool(owner and mine) and mine[-1]["state"] == "APPROVED" and (
        mine[-1].get("commit") or {}).get("oid") == pr["headRefOid"]


def reviewed_head(pr: dict, reviewer: str) -> bool:
    """The Reviewer has reviewed this exact head."""
    return any(r["author"]["login"] == reviewer and (r.get("commit") or {}).get("oid") == pr["headRefOid"]
               for r in pr.get("reviews", []))


FAILED = {"FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"}


def broken(pr: dict) -> bool:
    """A check of the head failed, or the PR conflicts with its base."""
    checks = pr.get("statusCheckRollup") or []
    return pr.get("mergeable") == "CONFLICTING" or any(
        (c.get("conclusion") or c.get("state") or "").upper() in FAILED for c in checks)


def to_pr(node: dict, reviewer: str) -> Pr:
    numbers = [int(n) for n in re.findall(r"(?<![\w/])#(\d+)\b", node.get("body") or "")]
    return Pr(node["number"], node["title"], node["headRefOid"], {l["name"] for l in node["labels"]},
              list(dict.fromkeys(numbers)), approved_head(node, reviewer), not reviewed_head(node, reviewer),
              broken(node))


def needs_work(pr: Pr) -> bool:
    """A PR the run must act on: a red check or a conflict, else not left for the owner and not approved."""
    return pr.broken or ("review:owner" not in pr.labels and not pr.approved)


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
    first = epics[0].issue.number if epics else None
    for epic in epics:
        for issue in issues:
            owner = epic_of(issue.number)
            if issue.is_epic or (owner or first) != epic.issue.number or issue.number in in_pr:
                continue
            where = "" if owner else " under no epic"
            if "lane:proposed" in issue.labels and awaits(issue):
                # A check writes no file, so it overlaps nothing.
                epic.units.append(Unit(f"#{issue.number} awaits its AFK eligibility check{where}", issue.number, []))
            elif "lane:afk" in issue.labels and not issue.blocked and not claimed_elsewhere(issue.number):
                epic.units.append(Unit(f"#{issue.number} is ready{where}", issue.number, issue.paths))
    def parked(pr: Pr) -> bool:
        stories = [by_number[n] for n in pr.issues if n in by_number and not by_number[n].is_epic]
        return bool(stories) and all("lane:owner" in i.labels for i in stories)

    for pr in prs:
        if not needs_work(pr) or parked(pr):
            continue
        owners = [e for e in (epic_of(n) for n in pr.issues) if e]
        if owners and any(claimed_elsewhere(n) for n in pr.issues if epic_of(n)):
            continue
        target = owners[0] if owners else first
        stories = [by_number[n] for n in pr.issues if n in by_number and not by_number[n].is_epic]
        paths = [p for s in stories for p in s.paths or []]
        known = bool(stories) and all(s.paths for s in stories)
        where = "" if owners else " (under no epic)"
        # A review writes no file, so any free run takes it at once, held on the PR itself.
        state = " has a red check or a conflict" if pr.broken else ""
        unit = (Unit(f"PR #{pr.number} ({pr.title}){where} awaits its review", pr.number, [])
                if pr.awaits_review and not pr.broken
                else Unit(f"PR #{pr.number} ({pr.title}){where}{state}", stories[0].number if known else None,
                          paths if known else None))
        for epic in epics:
            if epic.issue.number == target:
                epic.units.append(unit)
    return epics


# ─── GitHub ────────────────────────────────────────────────────────────────────

ISSUES = """query($owner:String!,$name:String!,$page:String){repository(owner:$owner,name:$name){
issues(states:OPEN,first:100,after:$page){pageInfo{hasNextPage endCursor} nodes{number lastEditedAt body
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
                             "--json", "number,title,body,labels,headRefOid,reviews,mergeable,statusCheckRollup"))

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
        held = "review:owner" in pr.labels and not owner_approved(node, gh.cfg.get("owner", ""))
        if (only is None or pr.number in only) and pr.approved and not held:
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


def explore_due(path: Path | None, hours, now: float) -> bool:
    """Whether the idle explore's record lets a new run take it: `hours` set and the last began that long ago."""
    if hours is None or path is None:
        return False
    try:
        started = json.loads(path.read_text() or "{}").get("started")
    except (OSError, ValueError):
        started = None
    return started is None or now - started >= float(hours) * 3600


def idle_explore(path: Path, runs: Runs, me: str, hours: float, now: float) -> bool:
    """Claim this host's idle explore when no other live run has it and the last began `hours` ago or more."""
    with path.open("a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.seek(0)
        try:
            last = json.loads(f.read() or "{}")
        except ValueError:
            last = {}
        session, started = last.get("session"), last.get("started")
        if session == me:
            return True
        if (session and runs.refresh().live(session)) or (started is not None and now - started < hours * 3600):
            return False
        f.seek(0)
        f.truncate()
        f.write(json.dumps({"session": me, "started": now}))
        return True


def live_holds(comments: list[dict], runs: Runs, me: str) -> list[tuple[int, str]]:
    """(comment id, run) of each hold by a live run or by this run, oldest first."""
    return sorted((c["id"], s) for c in comments for s in HOLD_RE.findall(c["body"])
                  if s == me or runs.live(s))


def hold(gh: GitHub, runs: Runs, me: str, number: int, marker: str = HOLD) -> int | None:
    """Post this run's hold on the epic or issue; None when another live run holds it. The oldest live hold wins."""
    if any(s != me for _, s in live_holds(gh.comments(number), runs.refresh(), me)):
        return None
    what = "epic" if marker == HOLD else "issue"
    mine = gh.comment(number, marker.format(me) + f"\nAn AFK run works on this {what}; it releases this hold when it ends.")
    holds = live_holds(gh.comments(number), runs.refresh(), me)
    if holds and holds[0][1] != me:
        gh.edit(mine, (RELEASED if marker == HOLD else ISSUE_RELEASED).format(me))
        return None
    return mine


class Ledger:
    """This host's holds by run, each {number, comment, epic, paths}; `paths` is None for a whole epic.
    Kept in `path` under an exclusive lock, so starting runs pick work one at a time; in memory without one."""

    def __init__(self, path: Path | None = None):
        self.path, self.runs = path, {}

    @contextlib.contextmanager
    def locked(self):
        if self.path is None:
            yield self
            return
        with self.path.open("a+") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            f.seek(0)
            try:
                self.runs = json.loads(f.read() or "{}")
            except ValueError:
                self.runs = {}
            yield self
            f.seek(0)
            f.truncate()
            f.write(json.dumps(self.runs))

    def of(self, me: str) -> list[dict]:
        return self.runs.get(me, [])

    def add(self, me: str, hold: dict) -> None:
        self.runs.setdefault(me, []).append(hold)

    def drop(self, me: str) -> list[dict]:
        return self.runs.pop(me, [])

    def others(self, runs: Runs, me: str, now: float | None = None) -> list[dict]:
        """The holds of other runs; a run the listing has missed for GRACE seconds loses its holds,
        so one listing that misses a live run frees none of its paths."""
        now = time.time() if now is None else now
        for run, holds in list(self.runs.items()):
            if run == me:
                continue
            if runs.live(run):
                for h in holds:
                    h.pop("gone", None)
            elif not holds or now - min(h.setdefault("gone", now) for h in holds) >= GRACE:
                del self.runs[run]
        return [h for s, holds in self.runs.items() if s != me for h in holds]


def host_file(name: str) -> Path:
    return Path(sh("git", "rev-parse", "--path-format=absolute", "--git-common-dir")) / name


def start(args: argparse.Namespace, me: str) -> int:
    cfg = load_config()
    preflight(cfg)
    sync_base = (lambda: sync(cfg, me, args.sync)) if args.sync else None
    runs = Runs([], lambda: list_runs(args.runs))
    hours = cfg.get("explore", {}).get("idleHours")
    explore = None
    if hours is not None:
        state = host_file("afk-idle-explore.json")
        explore = lambda: idle_explore(state, runs, me, float(hours), time.time())
    return take_work(GitHub(cfg), runs, me, Ledger(host_file("afk-holds.json")), sync_base, explore)


def list_runs(command: str) -> list[str]:
    listed = subprocess.run(command, shell=True, capture_output=True, text=True)
    if listed.returncode:
        raise Blocked(f"`{command}` exited {listed.returncode}: {listed.stderr.strip()[-200:]}; fix the host's run listing")
    return listed.stdout.split()


def show(held: dict, epics: list[Epic], out: list[str]) -> int:
    epic = next((e for e in epics if e.issue.number == held["epic"]), None)
    units = epic.units if epic else []
    if held["paths"] is None:
        print(f"Hold: epic #{held['epic']} (comment {held['comment']})")
    else:
        print(f"Hold: issue #{held['number']} in epic #{held['epic']} (comment {held['comment']})")
        units = [u for u in units if u.issue == held["number"]]
    print("\n".join(out + [f"Work: {u.text}" for u in units]))
    return 0


def survey(gh: GitHub, runs: Runs, me: str) -> tuple[list[Epic], object]:
    """The open epics with their work as `me` sees it, and a cached reader of issue comments."""
    reviewer = gh.cfg["reviewer"]
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

    return plan(gh.issues(), [to_pr(n, reviewer) for n in gh.prs()], claimed_elsewhere, awaits), thread


def candidates(epics: list[Epic], theirs: list[dict], share: bool, held_elsewhere):
    """Each hold a new run could take beside `theirs`, in order: {number, epic, paths}, `paths` None for a
    whole epic. `held_elsewhere(epic)` says whether a live hold comment of another run is on the epic."""
    taken = {h["number"] for h in theirs}
    busy = {h["epic"] for h in theirs}
    whole = {h["epic"] for h in theirs if h["paths"] is None}
    held_paths = [p for h in theirs for p in h["paths"] or []]
    for epic in epics:
        number = epic.issue.number
        if not epic.units or number in whole or held_elsewhere(number):
            continue
        for unit in epic.units:
            if unit.paths is None or not share:
                if number not in busy:
                    yield {"number": number, "epic": number, "paths": None}
                    break
            elif unit.issue not in taken and not overlaps(unit.paths, held_paths):
                yield {"number": unit.issue, "epic": number, "paths": unit.paths}


def take_work(gh: GitHub, runs: Runs, me: str, ledger: Ledger | None = None, sync_base=None, explore=None) -> int:
    """Merge approved PRs, sync while no other run is live, then hold the first free work (see `start`),
    else claim the idle explore when `explore` grants it."""
    ledger = ledger or Ledger()
    out = merge_approved(gh, gh.prs())
    if sync_base and not runs.refresh().others_live(me):
        out += sync_base()
    epics, thread = survey(gh, runs, me)
    with ledger.locked():
        if ledger.of(me):
            return show(ledger.of(me)[0], epics, out)
        cap, live = gh.cfg.get("maxRuns"), runs.refresh().others_live(me)
        if cap and len(live) >= cap:
            print(f"Done: {len(live)} other runs are live, as many as lanes.json maxRuns allows.")
            print("\n".join(out))
            return 3
        elsewhere = lambda n: any(s != me for _, s in live_holds(thread(n), runs, me))
        for held in candidates(epics, ledger.others(runs, me), bool(cap), elsewhere):
            whole = held["paths"] is None
            comment = hold(gh, runs, me, held["number"], HOLD if whole else ISSUE_HOLD)
            if comment:
                held["comment"] = comment
                ledger.add(me, held)
                return show(held, epics, out)
    if explore and explore():
        print("Explore: no work is free for this run; play `explore` unattended.")
        print("\n".join(out))
        return 4
    print("Done: every free piece of work has its runner.")
    print("\n".join(out))
    return 3


def signal(gh: GitHub, runs: Runs) -> str:
    """What changes when there may be new work: the newest repository event, the newest workflow runs'
    states, and which runs are live."""
    event = sh("gh", "api", f"repos/{gh.repo}/events?per_page=1", "--jq", ".[0].id // empty")
    checks = sh("gh", "api", f"repos/{gh.repo}/actions/runs?per_page=10", "--jq",
                '[.workflow_runs[] | "\\(.id):\\(.status):\\(.conclusion)"] | join(",")')
    return " ".join([event, checks, *sorted(runs.refresh().ids)])


def quiet(state: Path, now_signal: str, now: float, hours: float = 0.5) -> bool:
    """Nothing changed since the last full check, which was less than `hours` ago; records a change."""
    try:
        last = json.loads(state.read_text())
    except (OSError, ValueError):
        last = {}
    if last.get("signal") == now_signal and now - last.get("at", 0) < hours * 3600:
        return True
    state.write_text(json.dumps({"signal": now_signal, "at": now}))
    return False


def check(gh: GitHub, runs: Runs, ledger: Ledger | None = None, state: Path | None = None, now=time.time,
          explored: Path | None = None) -> int:
    """For a host's free watcher: when GitHub or the live runs changed, merge approved PRs and say how many
    new runs have work, or one for the idle explore when nothing is free, no run is live and it is due.
    Exit 0 prints `Start: <n>`; 3 prints one `Quiet:` or `Done:` line."""
    ledger = ledger or Ledger()
    if state and quiet(state, signal(gh, runs), now()):
        print("Quiet: nothing changed since the last check.")
        return 3
    out = merge_approved(gh, gh.prs())
    epics, thread = survey(gh, runs, "")
    with ledger.locked():
        live = sorted(runs.refresh().ids)
        theirs = ledger.others(runs, "")
        booting = [s for s in live if not ledger.of(s)]
        cap = gh.cfg.get("maxRuns")
        slots = cap - len(live) if cap else len(epics)
        elsewhere = lambda n: bool(live_holds(thread(n), runs, ""))
        chosen: list[dict] = []
        while len(chosen) < slots + len(booting):
            held = next(candidates(epics, theirs + chosen, bool(cap), elsewhere), None)
            if held is None:
                break
            chosen.append(held)
    start = max(0, min(slots, len(chosen) - len(booting)))
    if not start and not live and explore_due(explored, gh.cfg.get("explore", {}).get("idleHours"), now()):
        start = 1
    if start:
        print(f"Start: {start}")
    else:
        print(f"Done: no new run has work ({len(live)} live).")
    if out:
        print("\n".join(out))
    return 0 if start else 3


def end(me: str) -> int:
    return release(GitHub(load_config()), me, Ledger(host_file("afk-holds.json")))


def release(gh: GitHub, me: str, ledger: Ledger | None = None) -> int:
    ledger = ledger or Ledger()
    with ledger.locked():
        for held in ledger.drop(me):
            whole = held["paths"] is None
            gh.edit(held["comment"], (RELEASED if whole else ISSUE_RELEASED).format(me))
            print(f"Released: {'epic' if whole else 'issue'} #{held['number']}")
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
    c = sub.add_parser("check")
    c.add_argument("--runs", required=True, help="command printing the ids of the task's live runs")
    c.add_argument("--quiet", action="store_true", help="skip the check while GitHub and the live runs are unchanged")
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
        if args.command == "check":
            runs = Runs([], lambda: list_runs(args.runs))
            state = host_file("afk-check.json") if args.quiet else None
            return check(GitHub(load_config()), runs, Ledger(host_file("afk-holds.json")), state,
                         explored=host_file("afk-idle-explore.json"))
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
