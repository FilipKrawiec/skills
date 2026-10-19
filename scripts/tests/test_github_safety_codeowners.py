"""Black-box check that GitHub safety setup requires the Reviewer on every CODEOWNERS rule."""

from __future__ import annotations

import base64
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "plugins/common/workflow/skills/afk/scripts/github-safety.sh"


FAKE_GH = r'''#!/usr/bin/env python3
import base64
import os
import sys

args = sys.argv[1:]
endpoint = next((arg for arg in args if arg.startswith(("repos/", "users/"))), "")
query = args[args.index("--jq") + 1] if "--jq" in args else ""
if endpoint.startswith("users/"):
    raise SystemExit(0)
if endpoint == "repos/acme/app":
    value = "main" if query == ".default_branch" else "true,false,false,true,true"
elif endpoint.endswith("/rulesets"):
    value = "1"
elif endpoint.endswith("/rulesets/1"):
    value = "true"
elif endpoint.endswith("/actions/permissions/workflow"):
    value = '"read",false'
elif endpoint.endswith("/collaborators/alice/permission"):
    value = "admin"
elif endpoint.endswith("/collaborators/builder/permission") or endpoint.endswith("/collaborators/reviewer/permission"):
    value = "write"
elif endpoint.endswith("/invitations"):
    value = "[]"
elif endpoint.endswith("/branches/main/protection"):
    if not query:
        value = '{"required_pull_request_reviews":{"required_approving_review_count":1,"require_code_owner_reviews":true,"require_last_push_approval":true,"dismiss_stale_reviews":true},"required_status_checks":{"contexts":["verify"]},"required_linear_history":{"enabled":true},"required_conversation_resolution":{"enabled":true},"allow_force_pushes":{"enabled":false},"allow_deletions":{"enabled":false},"enforce_admins":{"enabled":false}}'
    elif "required_pull_request_reviews" in query:
        value = "1,true,true,true"
    elif "required_status_checks.contexts" in query:
        value = "verify"
    elif ".required_linear_history.enabled" in query:
        value = "true,true"
    elif ".allow_force_pushes.enabled" in query:
        value = "false,false"
    else:
        value = "false"
elif endpoint.endswith("/actions/secrets"):
    value = "0"
elif endpoint.endswith("/environments"):
    value = ""
elif "/contents/" in endpoint:
    value = base64.b64encode(os.environ["CODEOWNERS"].encode()).decode()
else:
    print(f"unexpected endpoint: {endpoint}", file=sys.stderr)
    raise SystemExit(2)
print(value)
'''


class GitHubSafetyCodeownersTests(unittest.TestCase):
    def check(self, codeowners: str, script: Path = SCRIPT) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            gh = root / "gh"
            gh.write_text(FAKE_GH, encoding="utf-8")
            gh.chmod(0o755)
            env = os.environ | {"PATH": f"{root}:{os.environ['PATH']}", "CODEOWNERS": codeowners}
            return subprocess.run(
                ["bash", str(script), "check", "acme/app", "alice", "builder", "reviewer", "verify"],
                capture_output=True,
                text=True,
                env=env,
            )

    def test_requires_reviewer_as_sole_codeowner_for_every_rule(self) -> None:
        result = self.check("* @reviewer\n/.github/workflows/ @reviewer\n")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_rejects_owner_only_or_alternative_codeowners(self) -> None:
        for codeowners in (
            "/.github/ @reviewer\n",
            "* @reviewer\n/.github/ @alice\n",
            "* @reviewer\n/docs/ @alice @reviewer\n",
        ):
            with self.subTest(codeowners=codeowners):
                result = self.check(codeowners)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("DRIFT  Reviewer is sole CODEOWNER on every path", result.stdout)

    def test_rejects_later_broad_rule_without_reviewer(self) -> None:
        result = self.check("* @reviewer\n*.yml @alice\n")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
