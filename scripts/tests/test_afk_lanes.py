"""Behaviour of the AFK run gate: which runs are live, which issue or epic a run holds, what it merges."""

from __future__ import annotations

import importlib.util
import json
import contextlib
import io
import sys
import tempfile
import unittest
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

    def test_a_pr_under_no_epic_belongs_to_the_first_epic(self):
        issues = [issue(1, "type:epic", priority=2), issue(4, "type:epic", priority=0)]
        epics = lanes.plan(issues, [pr(10)], nobody_claims)
        self.assertEqual([(e.issue.number, e.work) for e in epics],
                         [(4, ["PR #10 (change 10) is under no epic"]), (1, [])])

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
        self.open_issues, self.open_prs, self.merged = list(issues), list(prs), []

    def issues(self):
        return self.open_issues

    def prs(self):
        return [p for p in self.open_prs if p["number"] not in self.merged]

    def merge(self, number, head):
        self.merged.append(number)
        return "merged"

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
    """Runs share an epic through issues whose scope packets share no path."""
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

    def test_an_issue_whose_packet_overlaps_a_held_one_waits(self):
        code, out, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/a/x.dart"])],
                                 self.other_holds(5, ["lib/a/"]))
        self.assertEqual(code, 3)

    def test_paths_held_in_another_epic_count_too(self):
        code, _, _ = self.take([issue(2, "type:epic", priority=0),
                                issue(6, "lane:afk", parents=[1], paths=["lib/a.dart"])],
                               self.other_holds(5, ["lib/a.dart"], epic=2))
        self.assertEqual(code, 3)

    def test_work_without_a_packet_holds_its_whole_epic_while_no_other_run_works_in_it(self):
        work = [issue(6, "lane:afk", parents=[1])]
        code, out, _ = self.take(work, lanes.Ledger())
        self.assertEqual((code, out[0]), (0, "Hold: epic #1 (comment 101)"))
        code, _, _ = self.take(work, self.other_holds(5, ["lib/a/"]))
        self.assertEqual(code, 3)

    def test_an_epic_another_run_holds_whole_shares_nothing(self):
        code, _, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])], self.other_holds(1, None))
        self.assertEqual(code, 3)

    def test_holds_of_runs_that_are_no_longer_live_are_dropped(self):
        ledger = self.other_holds(5, ["lib/a/"])
        code, _, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/a/x.dart"])], ledger, runs=())
        self.assertEqual((code, list(ledger.runs)), (0, ["local_me"]))

    def test_an_eligibility_check_writes_no_file_so_it_overlaps_nothing(self):
        code, out, _ = self.take([issue(6, "lane:proposed", parents=[1])], self.other_holds(5, ["/"]))
        self.assertEqual((code, out[0]), (0, "Hold: issue #6 in epic #1 (comment 101)"))

    def test_a_pr_takes_its_issues_packets(self):
        prs = [pr_node(9, 6)]
        work = [issue(6, parents=[1], paths=["lib/a.dart"])]
        code, out, _ = self.take(work, self.other_holds(5, ["lib/b.dart"]), prs=prs)
        self.assertEqual(out, ["Hold: issue #6 in epic #1 (comment 101)", "Work: PR #9 (change 9)"])
        code, _, _ = self.take(work, self.other_holds(5, ["lib/a.dart"]), prs=prs)
        self.assertEqual(code, 3)

    def test_without_max_runs_every_hold_is_a_whole_epic(self):
        code, out, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])], lanes.Ledger(), cfg={})
        self.assertEqual((code, out[0]), (0, "Hold: epic #1 (comment 101)"))
        code, _, _ = self.take([issue(6, "lane:afk", parents=[1], paths=["lib/b.dart"])],
                               self.other_holds(5, ["lib/a/"]), cfg={})
        self.assertEqual(code, 3)

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


class PacketTest(unittest.TestCase):
    def test_the_scope_block_names_the_paths(self):
        body = 'x\n```scope\n{"paths": ["./lib/a/", "/b.dart"], "dependencies": ["#3"]}\n```\n'
        self.assertEqual(lanes.packet(body), ["lib/a/", "b.dart"])

    def test_a_missing_empty_or_broken_packet_is_none(self):
        for body in ("", "```scope\n{}\n```", '```scope\n{"paths": []}\n```', "```scope\nnope\n```",
                     '```scope\n["a"]\n```'):
            self.assertIsNone(lanes.packet(body), body)

    def test_a_directory_covers_its_subtree(self):
        self.assertTrue(lanes.overlaps(["lib/a/"], ["lib/a/x.dart"]))
        self.assertTrue(lanes.overlaps(["lib/a.dart"], ["lib/a.dart"]))
        self.assertFalse(lanes.overlaps(["lib/a"], ["lib/ab.dart"]))
        self.assertFalse(lanes.overlaps(["lib/a/"], ["lib/b/"]))


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
