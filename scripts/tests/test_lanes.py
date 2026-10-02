"""Issue lanes: what an agent may pick up, touch and merge on its own."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "plugins/common/workflow/skills/afk/scripts/lanes.py"
spec = importlib.util.spec_from_file_location("lanes", SCRIPT)
lanes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lanes)

OWNER = "acme"
TRACKED = ["src/stage/a.py", "src/justfile", "tests/stage/test_a.py", "tools/gate.py", "justfile",
           "infra/dns.tf", "docs/guide.md"]


def config(**overrides):
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / ".github").mkdir()
        data = {"repo": f"{OWNER}/app", "protected": ["^infra/", "^tools/"],
                "alwaysInScope": ["docs/"], **overrides}
        (Path(tmp) / ".github/lanes.json").write_text(json.dumps(data))
        return lanes.load_config(tmp)


CONFIG = config()


def issue(number=1, labels=("lane:afk",), body=None, state="OPEN"):
    if body is None:
        body = ('### Acceptance criteria\n\n- It works.\n\n```scope\n'
                '{"paths": ["src/stage/", "tests/"], "dependencies": [7, "#8"]}\n```')
    return {"number": number, "title": "feat(stage): a thing", "body": body, "state": state,
            "labels": [{"name": n} for n in labels]}


def pr(files, author=OWNER, **overrides):
    return {"state": "OPEN", "isDraft": False, "baseRefName": "main",
            "headRepositoryOwner": {"login": OWNER}, "author": {"login": author},
            "files": [{"path": f} for f in files], **overrides}


class ConfigTests(unittest.TestCase):
    def test_lists_extend_defaults_and_scalars_replace_them(self) -> None:
        custom = config(base="trunk", chores=["^guide/"])
        self.assertEqual(custom["base"], "trunk")
        self.assertEqual(custom["owner"], OWNER)
        self.assertIn(r"^\.[^/]+/", custom["protected"])
        self.assertEqual((custom["worktrees"], custom["branchPrefix"]), (".worktrees", "agent/afk-"))
        self.assertIn("^infra/", custom["protected"])
        self.assertIn("^guide/", custom["chores"])
        self.assertIn(r"^docs/", custom["chores"])


class PacketTests(unittest.TestCase):
    def test_packet_reads_both_fences_and_dependency_styles(self) -> None:
        self.assertEqual(lanes.packet(issue()["body"])["dependencies"], [7, 8])
        legacy = lanes.packet('```factory\n{"paths": ["docs/"]}\n```')
        self.assertEqual(legacy, {"paths": ["docs/"], "dependencies": []})

    def test_missing_or_broken_packet_is_none(self) -> None:
        self.assertIsNone(lanes.packet("no packet"))
        self.assertIsNone(lanes.packet('```scope\n{"paths": [}\n```'))

    def test_packet_may_not_reach_protected_paths(self) -> None:
        self.assertEqual(lanes.packet_violations(["tools/", ".github/x/"], TRACKED, CONFIG),
                         ["tools/", ".github/x/"])
        self.assertEqual(lanes.packet_violations(["../x", "a/*", "/etc/"], TRACKED, CONFIG),
                         ["../x", "a/*", "/etc/"])
        self.assertEqual(lanes.packet_violations(["src/stage/", "tests/", "docs/"], TRACKED, CONFIG), [])

    def test_a_subtree_holding_protected_files_is_refused(self) -> None:
        self.assertEqual(lanes.packet_violations(["src/"], TRACKED, CONFIG), ["src/"])


class EligibilityTests(unittest.TestCase):
    def test_owner_approved_issue_with_done_dependencies_is_eligible(self) -> None:
        self.assertIsNone(lanes.ineligible(issue(), {7, 8}, False, TRACKED, CONFIG))

    def test_each_gate_refuses_with_its_reason(self) -> None:
        cases = [
            (issue(labels=("lane:proposed",)), "not lane:afk"),
            (issue(labels=("lane:afk", "type:epic")), "epic"),
            (issue(labels=("lane:afk", "state:claimed")), "claimed"),
            (issue(labels=("lane:afk", "state:started")), "started in another session"),
            (issue(body='```scope\n{"paths": ["docs/"]}\n```'), "no acceptance criteria"),
            (issue(body="## Acceptance criteria\n- x"), "no scope packet"),
        ]
        for candidate, reason in cases:
            with self.subTest(reason=reason):
                self.assertEqual(lanes.ineligible(candidate, {7, 8}, False, TRACKED, CONFIG), reason)
        self.assertEqual(lanes.ineligible(issue(), {7}, False, TRACKED, CONFIG), "waiting on #8")
        self.assertEqual(lanes.ineligible(issue(), {7, 8}, True, TRACKED, CONFIG), "has an open PR")

    def test_queue_order_is_priority_then_age(self) -> None:
        issues = [issue(5, ("lane:afk", "priority:P2")), issue(9, ("lane:afk", "priority:P0")),
                  issue(3, ("lane:afk",)), issue(4, ("lane:afk", "priority:P0"))]
        self.assertEqual([i["number"] for i in sorted(issues, key=lanes.rank)], [4, 9, 5, 3])

    def test_branch_slug_drops_the_conventional_prefix(self) -> None:
        self.assertEqual(lanes.slug("feat(stage): Glass setlist drawer to add, remove"),
                         "glass-setlist-drawer-to-add")


class ScopeTests(unittest.TestCase):
    def test_changes_stay_inside_the_packet_plus_always_in_scope(self) -> None:
        self.assertEqual(lanes.out_of_scope(["src/stage/b.py", "docs/guide.md"], ["src/stage/"], CONFIG), [])

    def test_other_and_protected_changes_are_reported(self) -> None:
        changed = ["src/kernel/x.py", "justfile", "AGENTS.md", "tools/gate.py", ".github/workflows/ci.yml"]
        self.assertEqual(lanes.out_of_scope(changed, ["src/"], CONFIG), changed[1:])


class AutomergeTests(unittest.TestCase):
    def test_docs_and_tests_from_the_owner_merge_on_green(self) -> None:
        files = ["docs/guide.md", "tests/stage/test_a.py", "packages/web/README.md"]
        self.assertIsNone(lanes.automerge_refusal(pr(files), CONFIG))

    def test_project_chores_extend_the_defaults(self) -> None:
        self.assertIsNone(lanes.automerge_refusal(pr(["guide/perform.mdx"]), config(chores=["^guide/"])))

    def test_dependency_files_merge_only_from_dependabot(self) -> None:
        files = ["web/package.json", "web/package-lock.json"]
        self.assertIsNone(lanes.automerge_refusal(pr(files, author="app/dependabot"), CONFIG))
        self.assertIn("more than docs", lanes.automerge_refusal(pr(files), CONFIG))

    def test_dependabot_major_versions_wait_for_the_owner(self) -> None:
        files = ["web/package.json", "web/package-lock.json"]
        def bump(title, body=""):
            return lanes.automerge_refusal(pr(files, author="app/dependabot", title=title, body=body), CONFIG)
        self.assertIn("6.1", bump("chore(deps): bump lints from 5.1.1 to 6.1.0 in /libs/music"))
        self.assertIn("0.4", bump("Bump left-pad from 0.3.2 to 0.4.0"))
        self.assertIsNone(bump("chore(deps): bump lints from 5.1.1 to 5.2.0"))
        self.assertIsNone(bump("Bump left-pad from 0.3.2 to 0.3.9"))
        grouped = "Bumps the npm-minor group with 2 updates.\nUpdates `next` from 15.1.0 to 16.0.1\nUpdates `react` from 19.1.0 to 19.2.0"
        self.assertIn("15.1 → 16.0", bump("chore(deps): bump the npm-minor group", grouped))
        notes = "Updates `react` from 19.1.0 to 19.2.0\n\n## Release notes\nMigrated from 1.0 to 2.0 internally"
        self.assertIsNone(bump("chore(deps): bump the npm-minor group", notes))

    def test_approved_chores_merge_now_update_or_queue(self) -> None:
        self.assertEqual(lanes.merge_step("CLEAN"), "merge")
        self.assertEqual(lanes.merge_step("HAS_HOOKS"), "merge")
        self.assertEqual(lanes.merge_step("BEHIND"), "update")
        for state in ("BLOCKED", "UNSTABLE", "UNKNOWN", "DIRTY"):
            self.assertEqual(lanes.merge_step(state), "queue", state)

    def test_owner_prs_are_not_read_as_version_bumps(self) -> None:
        self.assertIsNone(lanes.automerge_refusal(pr(["docs/a.md"], title="docs: move from 1.0 to 2.0 terms"), CONFIG))

    def test_product_automation_and_instructions_wait_for_the_owner(self) -> None:
        for path in ["src/main.py", ".github/workflows/ci.yml", ".github/README.md", "AGENTS.md",
                     ".agents/skills/x/SKILL.md", ".vscode/settings.json", "tools/gate.py",
                     "infra/README.md", "justfile"]:
            with self.subTest(path=path):
                self.assertIsNotNone(lanes.automerge_refusal(pr([path]), CONFIG))

    def test_drafts_forks_strangers_and_truncated_lists_wait(self) -> None:
        for candidate in [pr(["docs/a.md"], isDraft=True), pr(["docs/a.md"], baseRefName="release"),
                          pr(["docs/a.md"], headRepositoryOwner={"login": "fork"}),
                          pr(["docs/a.md"], author="someone"),
                          pr([f"docs/{i}.md" for i in range(100)]), pr([])]:
            self.assertIsNotNone(lanes.automerge_refusal(candidate, CONFIG))


class BoardAndTidyTests(unittest.TestCase):
    def test_each_issue_sits_in_its_phase_and_lanes_stay_labels(self) -> None:
        def closed(*labels, reason="COMPLETED"):
            return {**issue(labels=labels, state="CLOSED"), "stateReason": reason}
        expected = [
            (issue(body="An idea."), False, "01 Define"),
            (issue(labels=(), body="An idea."), False, "01 Define"),
            (issue(), False, "02 Spec"), (issue(labels=("lane:owner", "state:parked")), False, "02 Spec"),
            (issue(labels=("lane:afk", "state:claimed")), False, "03 Plan"),
            (issue(labels=("lane:owner", "state:started", "state:planned")), False, "04 Execute"),
            (issue(labels=("lane:afk", "state:started", "state:planned")), True, "05 Review"),
            (closed("state:planned"), False, "06 Ship"),
            (closed("state:shipped"), False, "07 Improve"),
            (closed("state:learned"), False, "Done"), (closed(), False, "Done"),
            (closed("state:planned", reason="NOT_PLANNED"), False, "Done"),
        ]
        for candidate, has_pr, want in expected:
            with self.subTest(want=want):
                self.assertEqual(lanes.status(candidate, has_pr), want)
                self.assertIn(want, lanes.STATUSES)

    def test_only_planned_issues_closed_before_the_green_commit_ship(self) -> None:
        def closed(number, closed_at, *labels, reason="COMPLETED"):
            return {"number": number, "closedAt": closed_at, "stateReason": reason,
                    "labels": [{"name": n} for n in labels]}
        issues = [closed(1, "2026-10-02T10:00:00Z", "state:planned"),
                  closed(2, "2026-10-02T13:00:00Z", "state:planned"),
                  closed(3, "2026-10-02T10:00:00Z"),
                  closed(4, "2026-10-02T10:00:00Z", "state:shipped"),
                  closed(5, "2026-10-02T10:00:00Z", "state:planned", reason="NOT_PLANNED")]
        self.assertEqual(lanes.newly_shipped(issues, "2026-10-02T12:00:00Z"), [1])

    def test_only_afk_claims_hold_the_one_at_a_time_queue(self) -> None:
        issues = [issue(3, ("lane:owner", "state:started")), issue(4, ("lane:afk",))]
        self.assertEqual(lanes.afk_in_flight(issues, set()), [])
        issues.append(issue(5, ("lane:afk", "state:claimed")))
        self.assertEqual([i["number"] for i in lanes.afk_in_flight(issues, set())], [5])
        self.assertEqual(lanes.afk_in_flight(issues, {5}), [])

    def test_priority_comes_from_its_label(self) -> None:
        self.assertEqual(lanes.priority(issue(labels=("priority:P1",))), "P1")
        self.assertIsNone(lanes.priority(issue(labels=())))

    def test_tidy_touches_only_what_afk_runs_created(self) -> None:
        root = Path("/repo")
        afk_tree = root / CONFIG["worktrees"] / "afk-12"
        self.assertTrue(lanes.afk_owned("agent/afk-12-drawer", afk_tree, root, CONFIG))
        self.assertTrue(lanes.afk_owned("agent/afk-12-drawer", None, root, CONFIG))
        self.assertFalse(lanes.afk_owned("feature/drawer", None, root, CONFIG))
        self.assertFalse(lanes.afk_owned("", None, root, CONFIG))
        self.assertFalse(lanes.afk_owned("agent/afk-12-drawer", root / CONFIG["worktrees"] / "session-a1", root, CONFIG))
        self.assertFalse(lanes.afk_owned("agent/afk-12-drawer", Path("/elsewhere/afk-12"), root, CONFIG))

    def test_only_finished_clean_work_is_removed(self) -> None:
        self.assertEqual(lanes.tidy_action("MERGED", False), "remove")
        self.assertEqual(lanes.tidy_action("CLOSED", False), "remove")
        self.assertEqual(lanes.tidy_action("MERGED", True), "keep: uncommitted changes")
        self.assertEqual(lanes.tidy_action("OPEN", False), "keep: open PR")
        self.assertEqual(lanes.tidy_action(None, False), "keep: no PR yet")


class LabelTests(unittest.TestCase):
    def test_lane_labels_are_created_extras_renamed_and_strays_deleted(self) -> None:
        custom = config(labels={"type:bug": {"color": "d73a4a", "description": "Broken"}},
                        renames={"bug": "type:bug"})
        current = {"bug": {"color": "d73a4a", "description": "Broken"},
                   "wontfix": {"color": "ffffff", "description": ""}}
        steps = {(action, name) for action, name, _, _ in lanes.label_plan(current, custom)}
        self.assertIn(("rename", "bug"), steps)
        self.assertNotIn(("create", "type:bug"), steps)
        self.assertIn(("delete", "wontfix"), steps)
        for name in (lanes.AFK, lanes.PROPOSED, lanes.OWNER_LANE, lanes.CLAIMED, lanes.STARTED, lanes.PARKED,
                     lanes.OWNER_REVIEW, lanes.EPIC):
            self.assertIn(("create", name), steps)


SHA = "a" * 40


def reviewed_pr(files=("src/stage/a.py",), verdict="ready", sha=SHA, **overrides):
    marker = f"<!-- agent-review sha={SHA} round=1 verdict={verdict} -->\nReady to merge."
    fields = {"headRefName": "agent/afk-7-thing", "headRefOid": sha, "labels": [], "comments": [],
              "reviews": [{"author": {"login": OWNER}, "state": "COMMENTED", "body": marker,
                           "submittedAt": "2026-10-02T10:00:00Z"}]}
    return pr(list(files), **{**fields, **overrides})


class ReviewedMergeTests(unittest.TestCase):
    AGENT = config(agentReview=True)

    def refusal(self, candidate, cfg=None):
        return lanes.reviewed_merge_refusal(candidate, cfg or self.AGENT)

    def test_a_ready_review_at_the_head_merges(self) -> None:
        self.assertIsNone(self.refusal(reviewed_pr()))

    def test_only_with_agent_review_on(self) -> None:
        self.assertIn("agentReview", self.refusal(reviewed_pr(), CONFIG))

    def test_the_verdict_must_be_ready_and_at_the_head(self) -> None:
        self.assertIn("ready", self.refusal(reviewed_pr(verdict="owner")))
        self.assertIn("head", self.refusal(reviewed_pr(sha="b" * 40)))
        self.assertIn("head", self.refusal(reviewed_pr(reviews=[])))

    def test_the_newest_agent_review_decides(self) -> None:
        older = {"author": {"login": OWNER}, "state": "COMMENTED", "submittedAt": "2026-10-02T09:00:00Z",
                 "body": f"<!-- agent-review sha={SHA} round=1 verdict=ready -->"}
        newer = {"author": {"login": OWNER}, "state": "COMMENTED", "submittedAt": "2026-10-02T11:00:00Z",
                 "body": f"<!-- agent-review sha={SHA} round=2 verdict=fixes -->"}
        self.assertIn("ready", self.refusal(reviewed_pr(reviews=[older, newer])))

    def test_branches_paths_and_handoffs_outside_afk_wait(self) -> None:
        self.assertIn("AFK branch", self.refusal(reviewed_pr(headRefName="feature/x")))
        self.assertIn("protected", self.refusal(reviewed_pr(files=["infra/dns.tf"])))
        self.assertIn("review:owner", self.refusal(reviewed_pr(labels=[{"name": "review:owner"}])))
        self.assertIn("open, ready", self.refusal(reviewed_pr(isDraft=True)))

    def test_people_after_the_review_hold_the_merge(self) -> None:
        later = "2026-10-02T12:00:00Z"
        person = [{"author": {"login": OWNER}, "body": "Wait, check the iPad.", "createdAt": later}]
        bot = [{"author": {"login": OWNER}, "body": "Ok\n\n_Generated by an agent_", "createdAt": later}]
        self.assertIn("person", self.refusal(reviewed_pr(comments=person)))
        self.assertIsNone(self.refusal(reviewed_pr(comments=bot)))
        quoted = [{"author": {"login": OWNER}, "createdAt": later,
                   "body": "Generated by a bot? No: hold this.\n\n_Generated by an agent_ said earlier."}]
        self.assertIn("person", self.refusal(reviewed_pr(comments=quoted)))
        blocked = {"author": {"login": "reviewer"}, "state": "CHANGES_REQUESTED", "body": "No.",
                   "submittedAt": "2026-10-02T08:00:00Z"}
        ready = reviewed_pr()
        self.assertIn("requests changes", self.refusal({**ready, "reviews": ready["reviews"] + [blocked]}))


class PhaseTests(unittest.TestCase):
    """An agent can always tell an issue's phase, what to do next and what moves it on."""

    def test_every_column_names_its_next_step(self) -> None:
        self.assertEqual(set(lanes.NEXT_STEP), set(lanes.STATUSES))

    def test_spec_lists_what_planning_still_needs(self) -> None:
        self.assertEqual(lanes.spec_gaps(issue()), [])
        self.assertEqual(lanes.spec_gaps(issue(labels=(), body="An idea.")),
                         ["acceptance criteria", "scope packet", "a lane"])

    def test_the_plan_and_lessons_comments_move_the_issue_on(self) -> None:
        plan, lessons = [{"body": "## Plan\n\n1. Test first."}], [{"body": "## Lessons\n\nno lessons"}]
        self.assertEqual(lanes.earned_mark({**issue(), "comments": plan}, "03 Plan"), lanes.PLANNED)
        self.assertIsNone(lanes.earned_mark({**issue(), "comments": []}, "03 Plan"))
        self.assertIsNone(lanes.earned_mark({**issue(), "comments": plan}, "02 Spec"))
        self.assertEqual(lanes.earned_mark({**issue(), "comments": lessons}, "07 Improve"), lanes.LEARNED)


class HealthTests(unittest.TestCase):
    """After merge, a run finds a red base branch and the merge that turned it red."""

    def run_(self, name, conclusion, status="completed"):
        return {"name": name, "status": status, "conclusion": conclusion}

    def test_failures_turn_a_commit_red_and_unfinished_checks_are_not_green(self) -> None:
        self.assertEqual(lanes.commit_state([self.run_("verify", "failure"), self.run_("lint", "success")], []),
                         ("red", ["verify"]))
        self.assertEqual(lanes.commit_state([], [{"context": "deploy", "state": "error"}]), ("red", ["deploy"]))
        self.assertEqual(lanes.commit_state([self.run_("verify", None, "in_progress")], []), ("pending", []))
        self.assertEqual(lanes.commit_state([self.run_("docs", "skipped")], []), ("none", []))

    def test_a_run_cancelled_by_a_newer_push_is_not_a_failure(self) -> None:
        runs = [self.run_("verify", "cancelled"), self.run_("lint", "success")]
        self.assertEqual(lanes.commit_state(runs, []), ("green", []))

    def test_the_culprit_is_the_oldest_red_after_the_last_green(self) -> None:
        commits = [("d", "fix: d (#4)", "red", ["verify"]), ("c", "docs: c (#3)", "pending", []),
                   ("b", "feat: b (#2)", "red", ["lint"]), ("a", "feat: a (#1)", "green", [])]
        self.assertEqual(lanes.base_health(commits), ("red", ["verify"], ("b", "feat: b (#2)")))
        self.assertEqual(lanes.base_health(commits[:3]), ("red", ["verify"], None))
        self.assertEqual(lanes.base_health([("c", "x", "pending", [])] + commits[3:]), ("green", [], None))


class BaseBranchTests(unittest.TestCase):
    """Runs read the remote base branch and never depend on the owner's checkout."""

    def git(self, cwd, *args):
        subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)

    def test_queue_reads_origin_main_while_the_checkout_holds_other_work(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            origin, seed, owner = (Path(tmp) / n for n in ("origin.git", "seed", "owner"))
            ident = ["-c", "user.name=t", "-c", "user.email=t@t"]
            self.git(tmp, "init", "--quiet", "--bare", "-b", "main", str(origin))
            self.git(tmp, "clone", "--quiet", str(origin), str(seed))
            (seed / ".github").mkdir()
            (seed / ".github/lanes.json").write_text(json.dumps(
                {"repo": f"{OWNER}/app", "protected": ["^infra/"]}))
            (seed / "app.py").write_text("main\n")
            self.git(seed, "add", ".")
            self.git(seed, *ident, "commit", "--quiet", "-m", "base")
            self.git(seed, "push", "--quiet", "origin", "HEAD:main")
            self.git(tmp, "clone", "--quiet", str(origin), str(owner))
            # The owner works on a branch with its own config and uncommitted edits.
            self.git(owner, "checkout", "--quiet", "-b", "owner-work")
            (owner / ".github/lanes.json").write_text(json.dumps(
                {"repo": f"{OWNER}/app", "protected": ["^old/"]}))
            (owner / "app.py").write_text("conflicting edit\n")
            (owner / "draft.py").write_text("untracked\n")
            # Main moves on after the owner's clone.
            (seed / "infra").mkdir()
            (seed / "infra/dns.tf").write_text("dns\n")
            self.git(seed, "add", ".")
            self.git(seed, *ident, "commit", "--quiet", "-m", "infra")
            self.git(seed, "push", "--quiet", "origin", "HEAD:main")
            here = os.getcwd()
            os.chdir(owner)
            try:
                repo = lanes.Repo()
            finally:
                os.chdir(here)
            self.assertIn("^infra/", repo.config["protected"])
            self.assertNotIn("^old/", repo.config["protected"])
            self.assertIn("infra/dns.tf", repo.tracked())
            self.assertNotIn("draft.py", repo.tracked())
            self.assertEqual((owner / "app.py").read_text(), "conflicting edit\n")
            branch = subprocess.run(["git", "branch", "--show-current"], cwd=owner,
                                    capture_output=True, text=True, check=True).stdout.strip()
            self.assertEqual(branch, "owner-work")


if __name__ == "__main__":
    unittest.main()
