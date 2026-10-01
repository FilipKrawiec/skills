"""The issue-lanes guard blocks shipping and self-authorization, only where opted in."""

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
]
ALLOWED = [
    "gh pr create --fill", "gh pr view 12 --json files", "gh issue edit 5 --add-label lane:proposed",
    "gh issue edit 5 --remove-label lane:afk,state:claimed --add-label lane:owner",
    "gh api -X DELETE repos/o/r/issues/5/labels/lane:afk", "gh release view v1.2.0", "gh api repos/o/r",
    "gh api -X PATCH repos/o/r/issues/5 -f state=closed", "git push -u origin agent/afk-5-x",
    "python3 lanes.py automerge 12",
]
MERGE = "gh pr " + "merge 1"
MARKS_AFK = ["gh issue edit 5 --add-label lane:afk", 'gh issue edit 5 --add-label "type:chore,lane:afk"',
             "gh issue create -t x --label lane:afk", "gh issue create -t x -l lane:afk",
             'gh api repos/o/r/issues/5/labels -f "labels[]=lane:afk"']


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
            self.assertIn("automerge", blocked.stderr)
            self.assertIn("CI deploys.", self.call(tmp, "just deploy web").stderr)
            self.assertEqual(self.call(tmp, "git status").returncode, 0)

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
        self.assertEqual(entry["matcher"], "Bash")
        self.assertIn("skills/afk/scripts/guard.py", entry["hooks"][0]["command"])


if __name__ == "__main__":
    unittest.main()
