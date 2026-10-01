"""Issue lanes: what an agent may pick up, touch and merge on its own."""

from __future__ import annotations

import importlib.util
import json
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
    def test_status_is_derived_from_state_pr_and_lane(self) -> None:
        expected = [
            (issue(state="CLOSED"), True, "Done"), (issue(), True, "Review"),
            (issue(labels=("lane:afk", "state:claimed")), False, "Running"), (issue(), False, "AFK"),
            (issue(labels=("lane:proposed",)), False, "Proposed"),
            (issue(labels=("lane:owner",)), False, "Owner"), (issue(labels=("type:epic",)), False, "Owner"),
            (issue(labels=()), False, "Triage"),
        ]
        for candidate, pr_open, want in expected:
            self.assertEqual(lanes.status(candidate, pr_open), want)
            self.assertIn(want, lanes.STATUSES)

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
        for name in (lanes.AFK, lanes.PROPOSED, lanes.OWNER_LANE, lanes.CLAIMED, lanes.EPIC):
            self.assertIn(("create", name), steps)


if __name__ == "__main__":
    unittest.main()
