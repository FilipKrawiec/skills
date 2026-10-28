"""Behaviour of the AFK run gate: which runs are live, which issue or epic a run holds, what it merges."""

from __future__ import annotations

import importlib.util
import json
import contextlib
import io
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "lanes", ROOT / "plugins/common/workflow/skills/afk/scripts/lanes.py")
lanes = importlib.util.module_from_spec(spec)
sys.modules["lanes"] = lanes
spec.loader.exec_module(lanes)

def issue(number, *labels, parents=(), blocked=False, priority=9, milestone=(1, "", 0), paths=None):
    return lanes.Issue(number, set(labels), list(parents), blocked, priority, milestone, "", paths)


def pr(number, *issues, labels=(), approved=False):
    return lanes.Pr(number, f"change {number}", "abc", set(labels), list(issues), approved)


def nobody_claims(_number):
    return False


class PlanTest(unittest.TestCase):
    def test_epics_follow_priority_then_milestone_then_number(self):
        order = lanes.epic_order([
            issue(9, "type:epic", priority=1, milestone=(0, "9999", 4)),
            issue(3, "type:epic", priority=9),
            issue(7, "type:epic", priority=1, milestone=(0, "2026-01-01", 5)),
            issue(2, "type:epic", priority=1, milestone=(0, "9999", 4)),
        ])
        self.assertEqual([e.number for e in order], [7, 2, 9, 3])

    def test_ready_unblocked_unclaimed_sub_issues_at_any_depth_are_work(self):
        issues = [issue(1, "type:epic"), issue(2, "lane:afk", parents=[5, 1]),
                  issue(3, "lane:afk", parents=[1], blocked=True), issue(4, "lane:owner", parents=[1]),
                  issue(6, "lane:afk", parents=[1])]
        [epic] = lanes.plan(issues, [], lambda n: n == 6)
        self.assertEqual(epic.work, ["#2 is ready"])

    def test_a_proposed_issue_awaits_its_eligibility_check(self):
        [epic] = lanes.plan([issue(1, "type:epic"), issue(2, "lane:proposed", parents=[1])], [], nobody_claims)
        self.assertEqual(epic.work, ["#2 awaits its AFK eligibility check"])

    def test_a_checked_proposed_issue_waits_for_a_change(self):
        def comment(who, at, body="note"):
            return {"user": {"login": who}, "created_at": at, "body": body}

        check = comment("rev", "2026-10-21T10:00:00Z", "<!-- agent-review issue=2 base=1a2b verdict=owner -->")
        for marker in ("<!-- agent-review eligibility issue=2 base=1a2b verdict=fixes -->",
                       "<!-- agent-review afk-eligibility issue=2 base=1a2b verdict=owner -->",
                       "<!-- agent-review eligibility verdict=REQUEST_CHANGES base=1a2b -->",
                       "<!-- agent-review afk-eligibility base=1a2b verdict=APPROVED -->"):
            self.assertFalse(lanes.awaits_check([comment("rev", "2026-10-21T10:00:00Z", marker)], "", "rev"))
        for marker in ("<!-- agent-review sha=1a2b round=1 verdict=ready -->",
                       "<!-- agent-review adjudication pr=7 -->",
                       "<!-- agent-review fork pr=7 -->", "<!-- agent-review fork sha=1a2b -->"):
            self.assertTrue(lanes.awaits_check([comment("rev", "2026-10-21T10:00:00Z", marker)], "", "rev"))
        self.assertTrue(lanes.awaits_check([comment("bot", "2026-10-20T10:00:00Z")], "", "rev"))
        self.assertFalse(lanes.awaits_check([check], "2026-10-20T10:00:00Z", "rev"))
        self.assertTrue(lanes.awaits_check([check], "2026-10-22T10:00:00Z", "rev"))
        self.assertTrue(lanes.awaits_check([check, comment("owner", "2026-10-22T10:00:00Z")], "", "rev"))
        [epic] = lanes.plan([issue(1, "type:epic"), issue(2, "lane:proposed", parents=[1])], [],
                            nobody_claims, lambda _issue: False)
        self.assertEqual(epic.work, [])

    def test_an_issue_with_an_open_pr_is_tended_through_the_pr(self):
        issues = [issue(1, "type:epic"), issue(2, "lane:afk", parents=[1])]
        [epic] = lanes.plan(issues, [pr(10, 2)], nobody_claims)
        self.assertEqual(epic.work, ["PR #10 (change 10)"])

    def test_owner_held_and_approved_prs_are_not_work(self):
        issues = [issue(1, "type:epic"), issue(2, parents=[1]), issue(3, parents=[1])]
        [epic] = lanes.plan(issues, [pr(10, 2, labels=["review:owner"]), pr(11, 3, approved=True)], nobody_claims)
        self.assertEqual(epic.work, [])

    def test_a_pr_whose_issues_all_wait_on_the_owner_is_not_work(self):
        issues = [issue(1, "type:epic"), issue(2, "lane:owner", parents=[1]), issue(3, "lane:afk", parents=[1])]
        [epic] = lanes.plan(issues, [pr(10, 2, 1), pr(11, 2, 3)], nobody_claims)
        self.assertEqual(epic.work, ["PR #11 (change 11)"])

    def test_a_pr_whose_issues_wait_on_the_owner_still_gets_its_first_review(self):
        issues = [issue(1, "type:epic"), issue(2, "lane:owner", parents=[1])]
        unreviewed = pr(10, 2)
        unreviewed.awaits_review = True
        [epic] = lanes.plan(issues, [unreviewed], nobody_claims)
        self.assertEqual(epic.work, ["PR #10 (change 10) awaits its review"])

    def test_a_broken_pr_whose_issues_wait_on_the_owner_is_not_work(self):
        issues = [issue(1, "type:epic"), issue(2, "lane:owner", parents=[1])]
        broken = pr(10, 2)
        broken.awaits_review, broken.broken = True, True
        [epic] = lanes.plan(issues, [broken], nobody_claims)
        self.assertEqual(epic.work, [])

    def test_a_pr_under_no_epic_belongs_to_the_first_epic(self):
        issues = [issue(1, "type:epic", priority=2), issue(4, "type:epic", priority=0)]
        epics = lanes.plan(issues, [pr(10)], nobody_claims)
        self.assertEqual([(e.issue.number, e.work) for e in epics],
                         [(4, ["PR #10 (change 10) (under no epic)"]), (1, [])])

    def test_an_issue_under_no_epic_is_work_of_the_first_epic(self):
        issues = [issue(1, "type:epic", priority=2), issue(4, "type:epic", priority=0),
                  issue(7, "lane:afk"), issue(8, "lane:proposed")]
        epics = lanes.plan(issues, [], nobody_claims)
        self.assertEqual([(e.issue.number, e.work) for e in epics],
                         [(4, ["#7 is ready under no epic", "#8 awaits its AFK eligibility check under no epic"]),
                          (1, [])])

    def test_a_pr_whose_issue_another_live_run_claimed_is_skipped(self):
        issues = [issue(1, "type:epic"), issue(2, parents=[1])]
        [epic] = lanes.plan(issues, [pr(10, 2)], lambda n: n == 2)
        self.assertEqual(epic.work, [])


class ReviewTest(unittest.TestCase):
    HEAD = "f00d"

    def node(self, *reviews):
        return {"headRefOid": self.HEAD, "reviews": [
            {"author": {"login": who}, "state": state, "commit": {"oid": oid},
             "body": f"<!-- agent-review sha={oid} round=1 verdict={verdict} -->"}
            for who, state, oid, verdict in reviews]}

    def test_the_reviewers_ready_approval_of_the_exact_head_is_approval(self):
        self.assertTrue(lanes.approved_head(self.node(("rev", "APPROVED", self.HEAD, "ready")), "rev"))

    def test_an_approval_of_an_older_head_or_for_the_owner_is_not(self):
        self.assertFalse(lanes.approved_head(self.node(("rev", "APPROVED", "beef", "ready")), "rev"))
        self.assertFalse(lanes.approved_head(self.node(("rev", "APPROVED", self.HEAD, "owner")), "rev"))
        self.assertFalse(lanes.approved_head(self.node(("bot", "APPROVED", self.HEAD, "ready")), "rev"))

    def test_a_newer_request_for_changes_overrides_the_approval(self):
        self.assertFalse(lanes.approved_head(self.node(
            ("rev", "APPROVED", self.HEAD, "ready"), ("rev", "CHANGES_REQUESTED", self.HEAD, "fixes")), "rev"))

    def test_pr_bodies_name_their_issues(self):
        node = {"number": 3, "title": "t", "headRefOid": "x", "labels": [], "reviews": [],
                "body": "Closes #12\nPart of #4, see https://x/issues/99 and #12"}
        self.assertEqual(lanes.to_pr(node, "rev").issues, [12, 4])


class FakeGitHub:
    def __init__(self, comments=None, issues=(), prs=()):
        self.threads = comments or {}
        self.next_id = 100
        self.cfg = {"reviewer": "rev"}
        self.open_issues, self.open_prs, self.merged, self.readied = list(issues), list(prs), [], []

    def issues(self):
        return self.open_issues

    def prs(self):
        return [p for p in self.open_prs if p["number"] not in self.merged]

    def merge(self, number, head):
        self.merged.append(number)
        return "merged"

    def ready(self, number):
        self.readied.append(number)

    def comments(self, number):
        return list(self.threads.get(number, []))

    def comment(self, number, body):
        self.next_id += 1
        self.threads.setdefault(number, []).append({"id": self.next_id, "body": body})
        return self.next_id

    def edit(self, comment, body):
        for thread in self.threads.values():
            for c in thread:
                if c["id"] == comment:
                    c["body"] = body


def LiveSet(*sessions):
    return lanes.Runs(list(sessions))


def pr_node(number, *issues, labels=(), verdict=None, reviewed="head"):
    reviews = [] if verdict is None else [{
        "author": {"login": "rev"}, "state": "APPROVED" if verdict == "ready" else "CHANGES_REQUESTED",
        "commit": {"oid": reviewed}, "body": f"<!-- agent-review sha={reviewed} round=1 verdict={verdict} -->"}]
    return {"number": number, "title": f"change {number}", "headRefOid": "head", "reviews": reviews,
            "labels": [{"name": l} for l in labels], "body": " ".join(f"Closes #{n}" for n in issues)}


class MergeTest(unittest.TestCase):
    def test_only_ready_approvals_of_the_exact_head_outside_owner_review_merge(self):
        gh = FakeGitHub(prs=[pr_node(1, verdict="ready"), pr_node(2, verdict="ready", labels=["review:owner"]),
                             pr_node(3, verdict="ready", reviewed="older"), pr_node(4, verdict="fixes"),
                             pr_node(5)])
        self.assertEqual(lanes.merge_approved(gh, gh.prs()), ["PR #1 merged"])
        self.assertEqual(gh.merged, [1])

    def test_a_draft_turns_ready_only_once_every_check_of_its_head_passed(self):
        def draft(number, checks, mergeable="MERGEABLE"):
            return {**pr_node(number), "isDraft": True, "mergeable": mergeable,
                    "statusCheckRollup": [{"status": "COMPLETED", "conclusion": c} if c else {"status": "IN_PROGRESS"}
                                          for c in checks]}
        gh = FakeGitHub(prs=[draft(1, ["SUCCESS", "SKIPPED"]), draft(2, ["SUCCESS", None]), draft(3, ["FAILURE"]),
                             draft(4, []), draft(5, ["SUCCESS"], "CONFLICTING"), {**pr_node(6), "isDraft": False}])
        self.assertEqual(lanes.merge_approved(gh, gh.prs()), ["PR #1 marked ready for review: its checks pass"])
        self.assertEqual(gh.readied, [1])

    def test_merge_can_be_limited_to_named_prs(self):
        gh = FakeGitHub(prs=[pr_node(1, verdict="ready"), pr_node(2, verdict="ready")])
        lanes.merge_approved(gh, gh.prs(), {2})
        self.assertEqual(gh.merged, [2])


class TakeWorkTest(unittest.TestCase):
    EPICS = [issue(1, "type:epic", priority=1), issue(2, "type:epic", priority=0)]

    def take(self, gh, runs=(), synced=None, ledger=None):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = lanes.take_work(gh, LiveSet(*runs), "local_me", ledger,
                                   (lambda: synced.append(1) or ["Synced"]) if synced is not None else None)
        return code, out.getvalue()

    def test_nothing_to_do_exits_3(self):
        code, out = self.take(FakeGitHub(issues=self.EPICS))
        self.assertEqual((code, out.splitlines()[0]), (3, "Done: every free piece of work has its runner."))

    def test_an_idle_run_explores_when_the_idle_explore_grants_it(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = lanes.take_work(FakeGitHub(issues=self.EPICS), LiveSet(), "local_me", explore=lambda: True)
        self.assertEqual((code, out.getvalue().splitlines()[0]),
                         (4, "Explore: no work is free for this run; play `explore` unattended."))

    def test_a_run_the_idle_explore_refuses_ends_with_done(self):
        with contextlib.redirect_stdout(io.StringIO()):
            code = lanes.take_work(FakeGitHub(issues=self.EPICS), LiveSet(), "local_me", explore=lambda: False)
        self.assertEqual(code, 3)

    def test_a_run_with_an_epic_to_hold_never_explores(self):
        asked = []
        gh = FakeGitHub(issues=self.EPICS + [issue(5, "lane:afk", parents=[1])])
        with contextlib.redirect_stdout(io.StringIO()):
            code = lanes.take_work(gh, LiveSet(), "local_me", explore=lambda: asked.append(1) or True)
        self.assertEqual((code, asked), (0, []))

    def test_the_first_free_epic_with_work_is_held_after_approved_prs_merge(self):
        gh = FakeGitHub(issues=self.EPICS + [issue(5, "lane:afk", parents=[1]), issue(6, "lane:afk", parents=[2]),
                                             issue(7, parents=[1])],
                        prs=[pr_node(9, 7, verdict="ready")],
                        comments={2: [{"id": 1, "body": lanes.HOLD.format("local_other")}]})
        code, out = self.take(gh, runs=["local_other"])
        self.assertEqual(code, 0)
        self.assertEqual(out.splitlines()[:3], ["Hold: epic #1 (comment 101)", "PR #9 merged", "Work: #5 is ready"])

    def test_a_run_that_already_holds_work_keeps_that_hold(self):
        gh = FakeGitHub(issues=self.EPICS + [issue(6, "lane:afk", parents=[2], paths=["a"]),
                                             issue(5, "lane:afk", parents=[2], paths=["b"])],
                        comments={6: [{"id": 7, "body": lanes.ISSUE_HOLD.format("local_me")}]})
        ledger = lanes.Ledger()
        ledger.add("local_me", {"number": 6, "epic": 2, "paths": ["a"], "comment": 7})
        code, out = self.take(gh, ledger=ledger)
        self.assertEqual((code, out.splitlines(), len(gh.comments(6))),
                         (0, ["Hold: issue #6 in epic #2 (comment 7)", "Work: #6 is ready"], 1))

    def test_the_base_syncs_only_while_no_other_run_is_live(self):
        synced = []
        self.take(FakeGitHub(issues=self.EPICS), runs=["local_other"], synced=synced)
        self.assertEqual(synced, [])
        self.take(FakeGitHub(issues=self.EPICS), runs=["local_me"], synced=synced)
        self.assertEqual(synced, [1])

    def test_the_base_does_not_sync_once_a_later_run_is_live(self):
        synced, listings = [], iter([["local_later"]])
        with contextlib.redirect_stdout(io.StringIO()):
            lanes.take_work(FakeGitHub(issues=self.EPICS), lanes.Runs([], lambda: next(listings, ["local_later"])),
                            "local_me", sync_base=lambda: synced.append(1) or ["Synced"])
        self.assertEqual(synced, [])

    def test_release_rewrites_only_this_runs_holds(self):
        gh = FakeGitHub(issues=self.EPICS, comments={1: [{"id": 3, "body": lanes.HOLD.format("local_me")}],
                                                     2: [{"id": 4, "body": lanes.HOLD.format("local_other")}]})
        with contextlib.redirect_stdout(io.StringIO()):
            lanes.release(gh, "local_me")
        self.assertEqual([gh.comments(1)[0]["body"], gh.comments(2)[0]["body"]],
                         [lanes.RELEASED.format("local_me"), lanes.HOLD.format("local_other")])

    def test_wrong_arguments_print_a_blocked_line(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            code = lanes.main(["start"])
        self.assertEqual((code, out.getvalue()[:8]), (2, "Blocked:"))


class ShareEpicTest(unittest.TestCase):
    """Runs share an epic, one run per issue, even where scope packets overlap."""
    EPIC = issue(1, "type:epic")

    def take(self, issues, ledger, runs=("local_other",), cfg=None, prs=()):
        gh = FakeGitHub(issues=[self.EPIC, *issues], prs=prs)
        gh.cfg.update({"maxRuns": 10} if cfg is None else cfg)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = lanes.take_work(gh, LiveSet(*runs), "local_me", ledger)
        return code, out.getvalue().splitlines(), gh

    def other_holds(self, number, paths, epic=1):
        ledger = lanes.Ledger()
        ledger.add("local_other", {"number": number, "epic": epic, "paths": paths, "comment": 1})
        return ledger

    def test_an_issue_whose_packet_shares_no_path_is_held_beside_another_run(self):
        ledger = self.other_holds(5, ["lib/a/"])
        code, out, gh = self.take([issue(5, "lane:afk", parents=[1], paths=["lib/a/"]),
                                   issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])], ledger)
        self.assertEqual((code, out), (0, ["Hold: issue #6 in epic #1 (comment 101)", "Work: #6 is ready"]))
        self.assertTrue(gh.comments(6)[0]["body"].startswith(lanes.ISSUE_HOLD.format("local_me")))
        self.assertEqual(ledger.of("local_me"), [{"number": 6, "epic": 1, "paths": ["lib/b.dart"], "comment": 101}])

    def test_an_issue_whose_packet_overlaps_a_held_one_still_runs_beside_it(self):
        code, out, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/a/x.dart"])],
                                 self.other_holds(5, ["lib/a/"]))
        self.assertEqual((code, out[0]), (0, "Hold: issue #6 in epic #1 (comment 101)"))

    def test_an_issue_another_live_run_holds_waits(self):
        code, _, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/a.dart"])],
                               self.other_holds(6, ["lib/a.dart"]))
        self.assertEqual(code, 3)

    def test_work_without_a_packet_holds_only_its_issue_beside_another_run(self):
        code, out, _ = self.take([issue(6, "lane:afk", parents=[1])], self.other_holds(5, ["lib/a/"]))
        self.assertEqual((code, out[0]), (0, "Hold: issue #6 in epic #1 (comment 101)"))

    def test_an_epic_another_run_holds_whole_shares_nothing(self):
        code, _, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])], self.other_holds(1, None))
        self.assertEqual(code, 3)

    def test_holds_of_runs_that_are_no_longer_live_are_dropped_after_a_grace(self):
        ledger = self.other_holds(6, ["lib/a/"])
        work = [issue(6, "lane:afk", parents=[1], paths=["lib/a/x.dart"])]
        code, _, _ = self.take(work, ledger, runs=())
        self.assertEqual(code, 3)
        ledger.of("local_other")[0]["gone"] -= lanes.GRACE
        code, _, _ = self.take(work, ledger, runs=())
        self.assertEqual((code, list(ledger.runs)), (0, ["local_me"]))

    def test_a_run_listed_again_keeps_its_holds(self):
        ledger = self.other_holds(5, ["lib/a/"])
        ledger.others(LiveSet(), "local_me", now=0)
        self.assertEqual(len(ledger.others(LiveSet("local_other"), "local_me", now=lanes.GRACE)), 1)
        self.assertNotIn("gone", ledger.of("local_other")[0])

    def test_an_eligibility_check_writes_no_file_so_it_overlaps_nothing(self):
        code, out, _ = self.take([issue(6, "lane:proposed", parents=[1])], self.other_holds(5, ["/"]))
        self.assertEqual((code, out[0]), (0, "Hold: issue #6 in epic #1 (comment 101)"))

    def test_a_pr_takes_its_issues_packets(self):
        prs = [pr_node(9, 6, verdict="fixes")]
        work = [issue(6, parents=[1], paths=["lib/a.dart"])]
        code, out, _ = self.take(work, self.other_holds(5, ["lib/b.dart"]), prs=prs)
        self.assertEqual(out, ["Hold: issue #6 in epic #1 (comment 101)", "Work: PR #9 (change 9)"])
        code, _, _ = self.take(work, self.other_holds(6, ["lib/a.dart"]), prs=prs)
        self.assertEqual(code, 3)

    def test_without_max_runs_every_hold_is_a_whole_epic(self):
        code, out, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])], lanes.Ledger(), cfg={})
        self.assertEqual((code, out[0]), (0, "Hold: epic #1 (comment 101)"))
        code, _, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])],
                               self.other_holds(5, ["lib/a/"]), cfg={})
        self.assertEqual(code, 3)

    def test_a_pr_with_no_review_of_its_head_is_free_to_any_run_at_once(self):
        prs = [pr_node(9, 6), pr_node(10, verdict="fixes", reviewed="older")]
        code, out, gh = self.take([issue(6, parents=[1], paths=["lib/a.dart"])],
                                  self.other_holds(5, ["lib/a.dart"]), prs=prs)
        self.assertEqual(out, ["Hold: issue #9 in epic #1 (comment 101)", "Work: PR #9 (change 9) awaits its review"])
        self.assertTrue(gh.comments(9)[0]["body"].startswith(lanes.ISSUE_HOLD.format("local_me")))

    def test_a_reviewed_head_awaits_no_review(self):
        node = pr_node(9, 6, verdict="fixes")
        self.assertFalse(lanes.to_pr(node, "rev").awaits_review)
        self.assertTrue(lanes.to_pr(pr_node(9, 6, verdict="fixes", reviewed="older"), "rev").awaits_review)

    def test_no_work_is_held_once_max_runs_other_runs_are_live(self):
        work = [issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])]
        code, out, _ = self.take(work, lanes.Ledger(), runs=("local_a", "local_b"), cfg={"maxRuns": 2})
        self.assertEqual((code, out[0]), (3, "Done: 2 other runs are live, as many as lanes.json maxRuns allows."))
        code, _, _ = self.take(work, lanes.Ledger(), runs=("local_a",), cfg={"maxRuns": 2})
        self.assertEqual(code, 0)

    def test_release_drops_this_runs_ledger_holds_and_rewrites_their_comments(self):
        gh = FakeGitHub({6: [{"id": 3, "body": lanes.ISSUE_HOLD.format("local_me")}]})
        ledger = self.other_holds(5, ["a"])
        ledger.add("local_me", {"number": 6, "epic": 1, "paths": ["b"], "comment": 3})
        with contextlib.redirect_stdout(io.StringIO()):
            lanes.release(gh, "local_me", ledger)
        self.assertEqual((gh.comments(6)[0]["body"], list(ledger.runs)),
                         (lanes.ISSUE_RELEASED.format("local_me"), ["local_other"]))

    def test_the_ledger_file_keeps_holds_between_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "holds.json"
            with lanes.Ledger(path).locked() as ledger:
                ledger.add("local_a", {"number": 6, "epic": 1, "paths": ["b"], "comment": 3})
            with lanes.Ledger(path).locked() as ledger:
                self.assertEqual(ledger.others(LiveSet("local_a"), "local_me")[0]["number"], 6)
            path.write_text("not json")
            with lanes.Ledger(path).locked() as ledger:
                self.assertEqual(ledger.runs, {})


class EventTest(unittest.TestCase):
    """The free watcher's check: which PRs are work, what merges, how many runs to start."""
    EPIC = issue(1, "type:epic")

    def check(self, issues=(), prs=(), runs=(), ledger=None, cfg=None):
        gh = FakeGitHub(issues=[self.EPIC, *issues], prs=prs)
        gh.cfg.update({"maxRuns": 3, "owner": "boss"} if cfg is None else cfg)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = lanes.check(gh, LiveSet(*runs), ledger or lanes.Ledger())
        return code, out.getvalue().splitlines(), gh

    def ready(self, *numbers):
        return [issue(n, "lane:afk", parents=[1], paths=[f"lib/{n}.dart"]) for n in numbers]

    def test_one_run_starts_for_each_free_piece_up_to_max_runs(self):
        self.assertEqual(self.check(self.ready(5, 6))[:2], (0, ["Start: 2"]))
        self.assertEqual(self.check(self.ready(5, 6, 7, 8))[:2], (0, ["Start: 3"]))
        self.assertEqual(self.check(self.ready(5, 6, 7), runs=["local_a", "local_b"],
                                    ledger=self.holding("local_a", 5, "local_b", 6))[:2], (0, ["Start: 1"]))

    def holding(self, *pairs):
        ledger = lanes.Ledger()
        for run, number in zip(pairs[::2], pairs[1::2]):
            ledger.add(run, {"number": number, "epic": 1, "paths": [f"lib/{number}.dart"], "comment": 1})
        return ledger

    def test_a_live_run_that_holds_nothing_yet_counts_as_taking_a_piece(self):
        self.assertEqual(self.check(self.ready(5, 6), runs=["local_booting"])[:2], (0, ["Start: 1"]))
        code, out, _ = self.check(self.ready(5), runs=["local_booting"])
        self.assertEqual((code, out[0]), (3, "Done: no new run has work (1 live)."))

    def test_nothing_free_starts_nothing(self):
        self.assertEqual(self.check()[:2], (3, ["Done: no new run has work (0 live)."]))

    def test_approved_prs_merge_before_anything_starts(self):
        code, out, gh = self.check(prs=[pr_node(9, verdict="ready")])
        self.assertEqual((code, out, gh.merged), (3, ["Done: no new run has work (0 live).", "PR #9 merged"], [9]))

    def test_a_red_check_or_conflict_is_work_even_on_an_approved_pr(self):
        red = pr_node(9, 6, verdict="ready")
        red["statusCheckRollup"] = [{"conclusion": "FAILURE"}]
        conflict = pr_node(10, 7, verdict="fixes")
        conflict["mergeable"] = "CONFLICTING"
        self.assertTrue(lanes.to_pr(red, "rev").broken and lanes.to_pr(conflict, "rev").broken)
        self.assertFalse(lanes.to_pr(pr_node(11, verdict="ready"), "rev").broken)
        [epic] = lanes.plan([self.EPIC, issue(6, parents=[1]), issue(7, parents=[1])],
                            [lanes.to_pr(red, "rev"), lanes.to_pr(conflict, "rev")], nobody_claims)
        self.assertEqual(epic.work, ["PR #9 (change 9) has a red check or a conflict",
                                     "PR #10 (change 10) has a red check or a conflict"])

    def test_an_owner_held_pr_merges_once_the_owner_approves_its_head(self):
        held = pr_node(9, verdict="ready", labels=["review:owner"])
        gh = FakeGitHub(prs=[held])
        gh.cfg["owner"] = "boss"
        self.assertEqual(lanes.merge_approved(gh, gh.prs()), [])
        held["reviews"].append({"author": {"login": "boss"}, "state": "APPROVED", "commit": {"oid": "older"}, "body": ""})
        self.assertEqual(lanes.merge_approved(gh, gh.prs()), [])
        held["reviews"].append({"author": {"login": "boss"}, "state": "APPROVED", "commit": {"oid": "head"}, "body": ""})
        self.assertEqual(lanes.merge_approved(gh, gh.prs()), ["PR #9 merged"])

    def test_one_run_starts_for_a_due_idle_explore_when_nothing_is_live(self):
        with tempfile.TemporaryDirectory() as tmp:
            record = Path(tmp) / "explore.json"
            gh = FakeGitHub(issues=[self.EPIC])
            gh.cfg.update({"maxRuns": 3, "explore": {"idleHours": 1}})
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                due = lanes.check(gh, LiveSet(), lanes.Ledger(), now=lambda: 7200, explored=record)
                record.write_text('{"started": 5000}')
                early = lanes.check(gh, LiveSet(), lanes.Ledger(), now=lambda: 7200, explored=record)
                busy = lanes.check(gh, LiveSet("local_a"), lanes.Ledger(), now=lambda: 99999, explored=record)
            self.assertEqual((due, early, busy), (0, 3, 3))

    def test_an_unchanged_signal_is_quiet_for_half_an_hour(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "check.json"
            self.assertFalse(lanes.quiet(state, "e1", 0))
            state.write_text('{"signal": "e1", "at": 0}')
            self.assertTrue(lanes.quiet(state, "e1", 1000))
            self.assertFalse(lanes.quiet(state, "e2", 1001))
            self.assertFalse(lanes.quiet(state, "e1", 1800))

    def test_a_failed_preflight_merges_nothing_and_the_next_check_retries(self):
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "check.json"
            gh = FakeGitHub(issues=[self.EPIC], prs=[pr_node(9, verdict="ready")])

            def refuse():
                raise lanes.Blocked("gh acts as boss")
            with mock.patch.object(lanes, "signal", lambda gh, runs: "e1"):
                with self.assertRaises(lanes.Blocked):
                    lanes.check(gh, LiveSet(), lanes.Ledger(), state, now=lambda: 0, ready=refuse)
                self.assertEqual(gh.merged, [])
                with contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(lanes.check(gh, LiveSet(), lanes.Ledger(), state, now=lambda: 60), 3)
                self.assertEqual(gh.merged, [9])
                with contextlib.redirect_stdout(io.StringIO()) as out:
                    lanes.check(gh, LiveSet(), lanes.Ledger(), state, now=lambda: 120)
                self.assertTrue(out.getvalue().startswith("Quiet:"))


class PacketTest(unittest.TestCase):
    def test_the_scope_block_names_the_paths(self):
        body = 'x\n```scope\n{"paths": ["./lib/a/", "/b.dart"], "dependencies": ["#3"]}\n```\n'
        self.assertEqual(lanes.packet(body), ["lib/a/", "b.dart"])

    def test_a_missing_empty_or_broken_packet_is_none(self):
        for body in ("", "```scope\n{}\n```", '```scope\n{"paths": []}\n```', "```scope\nnope\n```",
                     '```scope\n["a"]\n```'):
            self.assertIsNone(lanes.packet(body), body)



class HoldTest(unittest.TestCase):
    def test_a_free_epic_gets_this_runs_hold(self):
        gh = FakeGitHub({1: [{"id": 1, "body": lanes.HOLD.format("local_gone")}]})
        mine = lanes.hold(gh, LiveSet(), "local_me", 1)
        self.assertTrue(gh.comments(1)[-1]["body"].startswith(lanes.HOLD.format("local_me")))
        self.assertEqual(mine, gh.comments(1)[-1]["id"])

    def test_an_epic_another_live_run_holds_is_skipped(self):
        gh = FakeGitHub({1: [{"id": 1, "body": lanes.HOLD.format("local_other")}]})
        self.assertIsNone(lanes.hold(gh, LiveSet("local_other"), "local_me", 1))
        self.assertEqual(len(gh.comments(1)), 1)

    def test_the_oldest_live_hold_wins_whichever_run_checks_first(self):
        class Racing(FakeGitHub):
            """Another run posts its hold just before or just after this run's."""

            def __init__(self, other_first):
                super().__init__()
                self.other_first = other_first

            def comment(self, number, body):
                other = lanes.HOLD.format("local_other")
                if self.other_first:
                    super().comment(number, other)
                    return super().comment(number, body)
                mine = super().comment(number, body)
                super().comment(number, other)
                return mine

        lost = Racing(other_first=True)
        self.assertIsNone(lanes.hold(lost, LiveSet("local_other"), "local_me", 1))
        self.assertEqual(lost.comments(1)[1]["body"], lanes.RELEASED.format("local_me"))
        won = Racing(other_first=False)
        self.assertEqual(lanes.hold(won, LiveSet("local_other"), "local_me", 1), won.comments(1)[0]["id"])
        # The other run, checking now, sees this hold and gives way before posting.
        self.assertIsNone(lanes.hold(FakeGitHub({1: won.comments(1)[:1]}), LiveSet("local_me"), "local_other", 1))

    def test_a_run_started_after_this_runs_listing_still_wins_with_the_older_hold(self):
        class Later(FakeGitHub):
            def comment(self, number, body):
                super().comment(number, lanes.HOLD.format("local_later"))
                return super().comment(number, body)

        listings = iter([[], ["local_later"]])
        gh = Later()
        self.assertIsNone(lanes.hold(gh, lanes.Runs([], lambda: next(listings)), "local_me", 1))
        self.assertEqual(gh.comments(1)[1]["body"], lanes.RELEASED.format("local_me"))



class IdleExploreTest(unittest.TestCase):
    HOUR = 3600

    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = Path(self.dir.name) / "idle.json"

    def tearDown(self):
        self.dir.cleanup()

    def claim(self, me, now, *live, hours=24):
        return lanes.idle_explore(self.path, LiveSet(*live), me, hours, now)

    def test_the_first_idle_run_explores(self):
        self.assertTrue(self.claim("local_a", 0))

    def test_no_second_run_explores_while_the_first_is_live_or_within_the_cadence(self):
        self.claim("local_a", 0)
        self.assertFalse(self.claim("local_b", 30 * self.HOUR, "local_a"))
        self.assertFalse(self.claim("local_b", 23 * self.HOUR))

    def test_the_next_explore_starts_once_the_cadence_has_passed_and_its_run_ended(self):
        self.claim("local_a", 0)
        self.assertTrue(self.claim("local_b", 24 * self.HOUR))
        self.assertEqual(json.loads(self.path.read_text())["session"], "local_b")

    def test_the_run_that_holds_the_explore_keeps_it_within_the_cadence(self):
        self.claim("local_a", 0)
        self.assertTrue(self.claim("local_a", self.HOUR, "local_a"))

    def test_an_unreadable_record_counts_as_none(self):
        self.path.write_text("not json")
        self.assertTrue(self.claim("local_a", 0))


if __name__ == "__main__":
    unittest.main()
