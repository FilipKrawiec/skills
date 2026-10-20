"""Black-box check that GitHub safety setup requires the Reviewer on every CODEOWNERS rule."""

from __future__ import annotations

import base64
import json
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
import subprocess
import sys


def jq(document, query):
    return subprocess.run(["jq", "-r", query], input=document, capture_output=True,
                          text=True, check=True).stdout.strip()


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
    value = jq(os.environ["RULESET"], query)
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
    value = jq(os.environ["ENVIRONMENTS"], query)
elif endpoint.endswith("/deployment-branch-policies"):
    value = jq(os.environ["POLICIES"], query)
elif "/contents/" in endpoint:
    value = base64.b64encode(os.environ["CODEOWNERS"].encode()).decode()
else:
    print(f"unexpected endpoint: {endpoint}", file=sys.stderr)
    raise SystemExit(2)
print(value)
'''


RELEASE_TAGS = """{"conditions": {"ref_name": {"include": ["refs/tags/v*", "refs/tags/rc/*"]}},
  "rules": [{"type": "creation"}, {"type": "update"}, {"type": "deletion"}],
  "bypass_actors": [{"actor_type": "RepositoryRole", "actor_id": 5},
                    {"actor_type": "Integration", "actor_id": 4242}]}"""

NO_ENVIRONMENTS = '{"environments": []}'


def environment(policy: object, reviewer: str | None = None) -> str:
    rules = [{"type": "required_reviewers", "reviewers": [{"type": "User", "reviewer": {"login": reviewer}}]}] \
        if reviewer else []
    return json.dumps({"environments": [{"name": "deploy", "deployment_branch_policy": policy,
                                         "protection_rules": rules}]})


CUSTOM = {"protected_branches": False, "custom_branch_policies": True}


def policies(*named: tuple[str, str]) -> str:
    return json.dumps({"branch_policies": [{"type": kind, "name": name} for kind, name in named]})


class GitHubSafetyCodeownersTests(unittest.TestCase):
    def check(self, codeowners: str, script: Path = SCRIPT,
              ruleset: str = RELEASE_TAGS, environments: str = NO_ENVIRONMENTS,
              branch_policies: str = '{"branch_policies": []}',
              app: str = "") -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            gh = root / "gh"
            gh.write_text(FAKE_GH, encoding="utf-8")
            gh.chmod(0o755)
            env = os.environ | {"PATH": f"{root}:{os.environ['PATH']}", "CODEOWNERS": codeowners,
                                "RULESET": ruleset, "ENVIRONMENTS": environments,
                                "POLICIES": branch_policies, "RELEASE_APP_ID": app}
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

    def test_release_tags_cover_candidates_and_allow_only_admins_and_the_versioning_app(self) -> None:
        for ruleset in (
            RELEASE_TAGS.replace(', "refs/tags/rc/*"', ""),
            RELEASE_TAGS.replace('"refs/tags/v*"', '"refs/tags/v*-x"'),
            RELEASE_TAGS.replace('"actor_id": 4242', '"actor_id": 15368'),
            RELEASE_TAGS.replace('"RepositoryRole", "actor_id": 5', '"RepositoryRole", "actor_id": 4'),
            RELEASE_TAGS.replace('{"type": "deletion"}', '{"type": "non_fast_forward"}'),
            RELEASE_TAGS.replace('"refs/tags/rc/*"]', '"refs/tags/rc/*"], "exclude": ["refs/tags/v9*"]'),
            RELEASE_TAGS.replace('"actor_id": 4242}', '"actor_id": 4242}, {"actor_type": "Integration", "actor_id": 77}'),
        ):
            with self.subTest(ruleset=ruleset):
                result = self.check("* @reviewer\n", ruleset=ruleset)
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertIn("DRIFT  release tag ruleset for v* and rc/*", result.stdout)

    def test_environments_deploy_only_from_the_base_branch_release_tags_or_owner_review(self) -> None:
        cases = (
            (environment(None, reviewer="Alice"), policies(), RELEASE_TAGS, True),
            (environment(CUSTOM), policies(("branch", "main")), RELEASE_TAGS, True),
            (environment(CUSTOM), policies(("branch", "main"), ("tag", "v*"), ("tag", "rc/*")), RELEASE_TAGS, True),
            (environment(None), policies(), RELEASE_TAGS, False),
            (environment({"protected_branches": True, "custom_branch_policies": False}), policies(), RELEASE_TAGS, False),
            (environment(CUSTOM), policies(("branch", "main"), ("branch", "feature/*")), RELEASE_TAGS, False),
            (environment(CUSTOM), policies(("branch", "main")),
             RELEASE_TAGS.replace('"actor_id": 4242', '"actor_id": 15368'), True),
            (environment(CUSTOM), policies(("tag", "rc/**")), RELEASE_TAGS, False),
            (environment(CUSTOM), policies(("tag", "v*/*")), RELEASE_TAGS, False),
            (environment(CUSTOM), policies(("tag", "v*")),
             RELEASE_TAGS.replace('"actor_id": 4242', '"actor_id": 15368'), False),
        )
        for environments, branch_policies, ruleset, safe in cases:
            with self.subTest(environments=environments, policies=branch_policies, ruleset=ruleset):
                result = self.check("* @reviewer\n", ruleset=ruleset, environments=environments,
                                    branch_policies=branch_policies)
                line = "ok     environment deploy" if safe else "DRIFT  environment deploy"
                self.assertIn(line, result.stdout, result.stdout + result.stderr)

    def test_a_named_versioning_app_is_the_only_app_allowed(self) -> None:
        self.assertEqual(self.check("* @reviewer\n", app="4242").returncode, 0)
        result = self.check("* @reviewer\n", app="77")
        self.assertIn("DRIFT  release tag ruleset for v* and rc/*", result.stdout, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
