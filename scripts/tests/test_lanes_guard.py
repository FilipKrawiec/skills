"""The lanes guard blocks shipping and self-authorization, only where opted in."""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "plugins/common/workflow/skills/afk/scripts/guard.py"
spec = importlib.util.spec_from_file_location("guard", GUARD)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

BLOCKED = [
    "gh pr merge 12 --squash", "cd x && gh pr merge 12 --auto", "gh release create v1.2.0",
    "gh secret set TOKEN", "gh variable set FLAG --body true", "gh repo edit --enable-wiki=false",
    "gh workflow run deploy.yml", "gh api -X PUT repos/o/r/branches/main/protection",
    "gh api repos/o/r/rulesets", "gh api -X PATCH repos/o/r -f allow_merge_commit=false",
    "gh api --method DELETE repos/o/r",
    "gh api -X PUT repos/o/r/pulls/3/merge", "gh api repos/o/r/pulls/3/merge -X PUT",
    "gh api -X PUT repos/o/r/pulls/$N/merge", "gh api -X PUT repos/o/r/pulls/${N}/merge",
    "gh api -X POST repos/o/r/merges -f base=main -f head=x", "gh api graphql -F query=@m.graphql",
    "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'",
    "gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }'",
    "gh pr -R o/r merge 1", "gh --repo o/r pr merge 1", "gh api graphql --input m.json",
    'gh api graphql -f query="$(cat m.graphql)"', "gh alias set m 'pr merge'",
    "git push origin HEAD:main", "git push -f origin main", "git push origin --delete main",
]
ALLOWED = [
    "gh pr create --fill", "gh pr view 12 --json files", "gh issue edit 5 --add-label lane:proposed",
    "gh issue edit 5 --remove-label lane:afk,state:claimed --add-label lane:owner",
    "gh api -X DELETE repos/o/r/issues/5/labels/lane:afk", "gh release view v1.2.0", "gh api repos/o/r",
    "gh api -X PATCH repos/o/r/issues/5 -f state=closed", "git push -u origin agent/afk-5-x",
    "python3 lanes.py automerge 12", "python3 lanes.py merge 12", "python3 lanes.py triage 12",
    'gh api repos/o/r/pulls/5/reviews -X POST -f body="missing keys in dict; see hooks.json and secrets handling"',
]
MERGE = "gh pr " + "merge 1"
MARKS_AFK = ["gh issue edit 5 --add-label lane:afk", 'gh issue edit 5 --add-label "type:chore,lane:afk"',
             "gh issue create -t x --label lane:afk", "gh issue create -t x -l lane:afk",
             'gh api repos/o/r/issues/5/labels -f "labels[]=lane:afk"',
             'gh api repos/o/r/issues/5 -X PATCH -f "labels[]=lane:afk"', "gh issue edit 5 --add-label $L"]
COMMENTS_AFK = ['gh api repos/o/r/issues/5/comments -X POST -f body="Apply lane:afk to let a run take it."',
                "gh issue comment 5 --body 'Apply `lane:afk` to let an AFK run take it.'"]


def transcript(directory, first_message):
    path = Path(directory) / "t.jsonl"
    path.write_text('{"type": "summary"}\n' + json.dumps(
        {"type": "user", "message": {"role": "user", "content": first_message}}) + "\n")
    return str(path)


class GuardRuleTests(unittest.TestCase):
    def test_shipping_and_settings_are_blocked(self) -> None:
        for command in BLOCKED:
            self.assertIsNotNone(guard.refusal(command, unattended=False), command)

    def test_building_proposing_and_reading_are_allowed(self) -> None:
        for command in ALLOWED:
            self.assertIsNone(guard.refusal(command), command)

    def test_only_attended_sessions_mark_an_issue_afk(self) -> None:
        for command in MARKS_AFK:
            self.assertEqual(guard.refusal(command), guard.UNATTENDED_AFK, command)
        for command in COMMENTS_AFK:
            self.assertIsNone(guard.refusal(command), command)
            self.assertIsNone(guard.refusal(command, unattended=False), command)

    def test_project_rules_extend_the_built_in_ones(self) -> None:
        extra = [(r"\bnpm\s+run\s+deploy\b", "Deploys run from CI.")]
        self.assertEqual(guard.refusal("npm run deploy", False, extra), "Deploys run from CI.")
        self.assertIsNone(guard.refusal("npm run build", False, extra))

    def test_scheduled_or_unreadable_transcripts_count_as_unattended(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertTrue(guard.is_unattended(transcript(tmp, '<scheduled-task name="afk">run')))
            self.assertFalse(guard.is_unattended(transcript(tmp, "Create an issue for the drawer")))
        self.assertTrue(guard.is_unattended("/nonexistent/t.jsonl"))
        self.assertTrue(guard.is_unattended(None))

    def test_the_base_branch_comes_from_the_project(self) -> None:
        self.assertIsNotNone(guard.refusal("git push origin HEAD:develop", False, base="develop"))
        self.assertIsNone(guard.refusal("git push origin HEAD:main", False, base="develop"))
        self.assertIsNone(guard.refusal("git push -u origin agent/afk-5-x", False, base="develop"))

    def test_the_main_checkout_keeps_its_branch(self) -> None:
        for command in ("git switch -c claude/5-x origin/main", "git switch main", "git checkout -b x",
                        "git checkout main", "cd . && git switch -c x"):
            self.assertEqual(guard.refusal(command, False, in_main_checkout=True), guard.OWN_WORKTREE, command)
            self.assertIsNone(guard.refusal(command, False), command)
        for command in ("git checkout -- lib/a.dart", "git worktree add .worktrees/5-x -b x origin/main",
                        "git status", "git restore lib/a.dart"):
            self.assertIsNone(guard.refusal(command, False, in_main_checkout=True), command)

    def test_a_push_is_judged_by_its_own_command(self) -> None:
        for command in ("git push -u origin agent/afk-5-x && gh pr create --base main",
                        "git push origin agent/afk-5-x; gh pr create --base main",
                        "git push origin agent/afk-5-x | tee log && echo main",
                        "git push origin agent/afk-5-x\ngh pr create --base main"):
            self.assertIsNone(guard.refusal(command, False), command)
        for command in ("cd x && git push origin main", "git push origin main && echo done",
                        "git push origin HEAD:main; echo done", "git push -f origin main|cat"):
            self.assertIsNotNone(guard.refusal(command, False), command)


class GuardHookTests(unittest.TestCase):
    def call(self, project, command):
        event = json.dumps({"tool_name": "Bash", "tool_input": {"command": command}, "cwd": project})
        return subprocess.run([sys.executable, str(GUARD)], input=event, text=True, capture_output=True)

    def test_hook_is_inactive_without_lanes_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(self.call(tmp, "gh pr merge 1").returncode, 0)

    def test_hook_blocks_with_exit_2_where_opted_in(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".github").mkdir()
            (Path(tmp) / ".github/lanes.json").write_text(json.dumps(
                {"repo": "o/r", "guard": [{"pattern": "just deploy", "reason": "CI deploys."}]}))
            blocked = self.call(tmp, "gh pr merge 1")
            self.assertEqual(blocked.returncode, 2)
            self.assertIn("lanes.py merge", blocked.stderr)
            self.assertIn("CI deploys.", self.call(tmp, "just deploy web").stderr)
            self.assertEqual(self.call(tmp, "git status").returncode, 0)

    def test_hook_fails_closed_on_broken_input_or_rules(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["git", "init", "-q", tmp], check=True)
            (Path(tmp) / ".github").mkdir()
            (Path(tmp) / ".github/lanes.json").write_text(json.dumps(
                {"repo": "o/r", "guard": [{"patern": "x"}]}))
            self.assertEqual(self.call(tmp, "git status").returncode, 2)
            broken = subprocess.run([sys.executable, str(GUARD)], input="not json", capture_output=True, text=True)
            self.assertEqual(broken.returncode, 2)

    def test_hook_covers_github_tools_and_the_config_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["git", "init", "-q", tmp], check=True)
            (Path(tmp) / ".github").mkdir()
            (Path(tmp) / ".github/lanes.json").write_text(json.dumps({"repo": "o/r"}))
            merge = {"tool_name": "mcp__github__merge_pull_request", "tool_input": {"pullNumber": 1}, "cwd": tmp}
            edit = {"tool_name": "Edit", "tool_input": {"file_path": f"{tmp}/.github/lanes.json"}, "cwd": tmp}
            read = {"tool_name": "Read", "tool_input": {"file_path": f"{tmp}/.github/lanes.json"}, "cwd": tmp}
            for event, code in ((merge, 2), (edit, 2), (read, 0)):
                result = subprocess.run([sys.executable, str(GUARD)], input=json.dumps(event),
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, code, event["tool_name"])

    def test_the_owner_approves_a_config_edit_only_in_manual_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["git", "init", "-q", tmp], check=True)
            (Path(tmp) / ".github").mkdir()
            (Path(tmp) / ".github/lanes.json").write_text(json.dumps({"repo": "o/r"}))
            # transcript() always writes t.jsonl, so the scheduled one moves aside first.
            scheduled = str(Path(transcript(tmp, '<scheduled-task name="afk">run')).rename(Path(tmp) / "s.jsonl"))
            attended = transcript(tmp, "Add ownerPaths to lanes.json")

            def edit(mode, transcript_path):
                event = {"tool_name": "Edit", "tool_input": {"file_path": f"{tmp}/.github/lanes.json"}, "cwd": tmp,
                         "permission_mode": mode, "transcript_path": transcript_path}
                return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(event),
                                      capture_output=True, text=True)

            asked = edit("default", attended)
            self.assertEqual(asked.returncode, 0)
            decision = json.loads(asked.stdout)["hookSpecificOutput"]
            self.assertEqual(decision["permissionDecision"], "ask")
            for mode, path in (("acceptEdits", attended), ("auto", attended), ("bypassPermissions", attended),
                               ("default", scheduled), ("default", None), (None, attended)):
                refused = edit(mode, path)
                self.assertEqual(refused.returncode, 2, (mode, path))
                self.assertIn("manual permission mode", refused.stderr)

    def test_the_owner_approves_a_merge_past_the_owner_rules_only_in_manual_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["git", "init", "-q", tmp], check=True)
            (Path(tmp) / ".github").mkdir()
            (Path(tmp) / ".github/lanes.json").write_text(json.dumps({"repo": "o/r"}))
            scheduled = str(Path(transcript(tmp, '<scheduled-task name="afk">run')).rename(Path(tmp) / "s.jsonl"))
            attended = transcript(tmp, "Merge the lessons I approved")

            def run(command, mode, transcript_path):
                event = {"tool_name": "Bash", "tool_input": {"command": command}, "cwd": tmp,
                         "permission_mode": mode, "transcript_path": transcript_path}
                return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(event),
                                      capture_output=True, text=True)

            for command in ("python3 lanes.py merge 12 --owner-approved",
                            'python3 "/Users/o/Application Support/afk/scripts/lanes.py" merge 12 --owner-approved'):
                asked = run(command, "default", attended)
                self.assertEqual(asked.returncode, 0, command)
                decision = json.loads(asked.stdout)["hookSpecificOutput"]
                self.assertEqual(decision["permissionDecision"], "ask")
                self.assertIn("#12", decision["permissionDecisionReason"])
            for mode, path in (("acceptEdits", attended), ("auto", attended), ("bypassPermissions", attended),
                               ("default", scheduled), ("default", None), (None, attended)):
                refused = run("python3 lanes.py merge 12 --owner-approved", mode, path)
                self.assertEqual(refused.returncode, 2, (mode, path))
                self.assertIn("manual permission mode", refused.stderr)
            # The shell turns each of these into the flag or hides the PR, so each is refused in every mode.
            for hidden in ("python3 lanes.py merge 12 \\\n  --owner-approved", 'python3 lanes.py merge 12 --owner-app""roved',
                           "python3 lanes.py merge 12 --own'er'-approved", "python3 lanes.py merge 12 --owner-approv\\ed",
                           "F=--owner-approved; python3 lanes.py merge 12 $F", 'python3 lanes.py "merge" 12 --owner-approved',
                           "just lanes merge 12 --owner-approved", 'python3 "$S/lanes.py" merge 12 --owner-approved',
                           "echo --owner-approved | xargs python3 lanes.py merge 12", "python3 l.py merge 12 --owner-approved",
                           "python3 lanes.py merge --owner-approved 12", "python3 lanes.py automerge 12 --owner-approved",
                           "python3 lanes.py merge 12 --owner-approved; python3 lanes.py merge 13 --owner-approved",
                           "python3 lanes.py merge 12 --owner{-approved,-approved}", "python3 *lanes.py merge 12 --owner-approved",
                           "python3 lanes.py merge 12\n--owner-approved"):
                for mode in ("default", "auto"):
                    refused = run(hidden, mode, attended)
                    self.assertEqual(refused.returncode, 2, (hidden, mode))
                    self.assertIn("alone in its command", refused.stderr)
            for allowed in ("python3 lanes.py merge 12", 'python3 "$LANES" merge 12', "just lanes merge 12",
                            "for p in 1 2; do python3 lanes.py merge $p; done", "grep -rn owner-approved .",
                            "git commit -m 'feat: merge takes --owner-approved'"):
                plain = run(allowed, "auto", attended)
                self.assertEqual((plain.returncode, plain.stdout), (0, ""), allowed)

    def test_hook_keeps_edits_and_branch_switches_out_of_the_main_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root, linked = Path(tmp) / "root", Path(tmp) / "root/.worktrees/5-x"
            git = ["git", "-c", "user.name=t", "-c", "user.email=t@t"]
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / ".github").mkdir()
            (root / ".github/lanes.json").write_text(json.dumps({"repo": "o/r"}))
            subprocess.run([*git, "-C", str(root), "add", "."], check=True)
            subprocess.run([*git, "-C", str(root), "commit", "-qm", "init"], check=True)
            subprocess.run([*git, "-C", str(root), "worktree", "add", "-q", str(linked), "-b", "x"], check=True)
            plain = Path(tmp) / "elsewhere/a.md"

            def run(event):
                return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(event),
                                      capture_output=True, text=True)

            def edit(path, cwd):
                return run({"tool_name": "Write", "tool_input": {"file_path": str(path)}, "cwd": str(cwd)})

            def shell(command, cwd):
                return run({"tool_name": "Bash", "tool_input": {"command": command}, "cwd": str(cwd)})

            refused = edit(root / "lib/a.dart", root)
            self.assertEqual(refused.returncode, 2)
            self.assertIn("own worktree", refused.stderr)
            self.assertEqual(edit(root / "lib/a.dart", linked).returncode, 2)
            self.assertEqual(shell("git switch -c y origin/main", root).returncode, 2)
            self.assertEqual(edit(linked / "lib/a.dart", linked).returncode, 0)
            self.assertEqual(edit(plain, root).returncode, 0)
            self.assertEqual(shell("git switch -c y", linked).returncode, 0)
            self.assertEqual(shell("git status", root).returncode, 0)

    def test_hook_finds_the_repository_from_a_subdirectory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(["git", "init", "-q", tmp], check=True)
            (Path(tmp) / ".github").mkdir()
            (Path(tmp) / ".github/lanes.json").write_text(json.dumps({"repo": "o/r"}))
            (Path(tmp) / "src").mkdir()
            self.assertEqual(self.call(str(Path(tmp) / "src"), MERGE).returncode, 2)

    def test_plugin_wires_the_guard_to_every_shell_command(self) -> None:
        package = ROOT / "plugins/common/workflow"
        manifest = json.loads((package / ".claude-plugin/plugin.json").read_text())
        hooks = json.loads((package / manifest["hooks"]).read_text())
        entry = hooks["hooks"]["PreToolUse"][0]
        for tool in ("Bash", "Edit", "Write", "mcp__github__merge_pull_request"):
            self.assertRegex(tool, entry["matcher"])
        self.assertIn("skills/afk/scripts/guard.py", entry["hooks"][0]["command"])


if __name__ == "__main__":
    unittest.main()
