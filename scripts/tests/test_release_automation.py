"""Candidate checks use real repositories; environment proof uses explicit API data."""
from __future__ import annotations

import contextlib
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

import yaml
from pathlib import Path

from scripts import release

RELEASE_SCRIPT = Path(__file__).resolve().parents[1] / "release.py"


def git(root, *args):
    return subprocess.run(["git", *args], cwd=root, check=True,
                          capture_output=True, text=True).stdout.strip()


class RepositoryTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        git(base, "init", "--bare", "-b", "main", "origin.git")
        self.root = base / "clone"
        git(base, "clone", str(base / "origin.git"), str(self.root))
        git(self.root, "config", "gc.auto", "0")
        git(self.root, "config", "maintenance.auto", "false")
        git(self.root, "config", "user.name", "Test")
        git(self.root, "config", "user.email", "test@example.com")
        self.paths = []
        for package in ("core", "workflow", "authoring"):
            for name in ("package-metadata.json", "plugin.json",
                         ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"):
                path = self.root / "plugins/common" / package / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps({"name": package, "version": "1.2.3"}))
                self.paths.append(path)
        self.sha = self.commit("prepared version")
        git(self.root, "push", "origin", "HEAD:main")
        git(self.root, "checkout", "--detach", self.sha)

    def commit(self, message):
        git(self.root, "add", ".")
        git(self.root, "commit", "-m", message)
        return git(self.root, "rev-parse", "HEAD")


class CandidateTests(RepositoryTestCase):
    def validate(self, sha=None, tag="v1.2.3"):
        release.validate_candidate(sha or self.sha, tag, self.root)

    def refused(self, reason, **kwargs):
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            with self.assertRaises(SystemExit):
                self.validate(**kwargs)
        self.assertIn(reason, stderr.getvalue())
        self.assertEqual(git(self.root, "tag"), "")

    def test_valid_detached_candidate_is_read_only_and_can_be_behind_main(self):
        (self.root / "later").write_text("later main")
        newer = self.commit("later")
        git(self.root, "push", "origin", "HEAD:main")
        git(self.root, "checkout", "--detach", self.sha)
        self.validate()
        self.assertEqual(git(self.root, "rev-parse", "origin/main"), newer)
        self.assertEqual(git(self.root, "rev-parse", "HEAD"), self.sha)
        self.assertEqual(git(self.root, "status", "--porcelain"), "")
        self.assertEqual(git(self.root, "tag"), "")

    def test_invalid_inputs(self):
        for sha in ("main", self.sha[:12], "-" * 40, self.sha + "0"):
            with self.subTest(sha=sha):
                self.refused("full source SHA", sha=sha)
        for tag in ("1.2.3", "v01.2.3", "v1.2", "v1.2.3;id", "v1.2.3-rc.1"):
            with self.subTest(tag=tag):
                self.refused("tag", tag=tag)

    def test_cli_validates_exact_source_without_publishing(self):
        result = subprocess.run([sys.executable, str(RELEASE_SCRIPT), "candidate",
                                 self.sha, "v1.2.3", "--root", str(self.root)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(git(self.root, "rev-parse", "HEAD"), self.sha)
        self.assertEqual(git(self.root, "status", "--porcelain"), "")
        self.assertEqual(git(self.root, "tag"), "")

    def test_cli_rejects_unreadable_manifest(self):
        self.paths[0].write_text("invalid json")
        sha = self.commit("invalid metadata")
        git(self.root, "push", "origin", "HEAD:main")
        result = subprocess.run([sys.executable, str(RELEASE_SCRIPT), "candidate",
                                 sha, "v1.2.3", "--root", str(self.root)],
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("error:", result.stderr)
        self.assertEqual(git(self.root, "tag"), "")

    def test_dirty_checkout(self):
        (self.root / "untracked").write_text("dirty")
        self.refused("dirty")

    def test_missing_remote_fails_without_publishing(self):
        git(self.root, "remote", "remove", "origin")
        self.refused("origin")

    def test_empty_package_tree_is_rejected(self):
        shutil.rmtree(self.root / "plugins/common")
        sha = self.commit("remove packages")
        git(self.root, "push", "origin", "HEAD:main")
        self.refused("no package metadata", sha=sha)

    def test_wrong_checkout(self):
        (self.root / "later").write_text("later")
        self.commit("later")
        self.refused("HEAD")

    def test_unmerged_candidate_and_stale_remote_tracking_ref(self):
        (self.root / "later").write_text("unmerged")
        unmerged = self.commit("unmerged")
        git(self.root, "update-ref", "refs/remotes/origin/main", unmerged)
        self.refused("ancestor", sha=unmerged)

    def test_every_manifest_must_match_requested_version(self):
        for path in self.paths:
            with self.subTest(path=path):
                path.write_text('{"version": "1.2.2"}')
                sha = self.commit("mismatched manifest")
                git(self.root, "push", "origin", "HEAD:main")
                self.refused("version", sha=sha)
                path.write_text(json.dumps({"version": "1.2.3"}))
                self.commit("restore version")

    def test_missing_metadata_is_rejected(self):
        self.paths[0].unlink()
        sha = self.commit("missing metadata")
        git(self.root, "push", "origin", "HEAD:main")
        self.refused("metadata", sha=sha)

    def test_remote_tag_collision(self):
        git(self.root, "tag", "-a", "v1.2.3", "-m", "release")
        git(self.root, "push", "origin", "refs/tags/v1.2.3")
        git(self.root, "tag", "-d", "v1.2.3")
        (self.root / "later").write_text("later")
        sha = self.commit("later")
        git(self.root, "push", "origin", "HEAD:main")
        with contextlib.redirect_stderr(io.StringIO()) as stderr:
            with self.assertRaises(SystemExit):
                self.validate(sha=sha)
        self.assertIn("different commit", stderr.getvalue())
        self.assertEqual(git(self.root, "rev-parse", "v1.2.3^{}"), self.sha)

    def test_same_remote_annotated_tag_allows_release_retry(self):
        git(self.root, "tag", "-a", "v1.2.3", "-m", "approved release", self.sha)
        tag_object = git(self.root, "rev-parse", "v1.2.3")
        git(self.root, "push", "origin", "refs/tags/v1.2.3")
        self.validate()
        self.validate()
        self.assertEqual(git(self.root, "rev-parse", "v1.2.3"), tag_object)
        self.assertEqual(git(self.root, "rev-parse", "HEAD"), self.sha)


class PromotionTests(RepositoryTestCase):
    def setUp(self):
        super().setUp()
        self.base = self.root.parent
        self.origin = self.base / "origin.git"
        self.state = self.base / "releases.json"
        self.state.write_text('{"releases": {}}')
        bin_dir = self.base / "bin"
        bin_dir.mkdir()
        gh = bin_dir / "gh"
        gh.write_text(f"#!{sys.executable}\n" + r'''import json, os, subprocess, sys
from pathlib import Path
state_file = Path(os.environ["GH_FIXTURE_STATE"])
state = json.loads(state_file.read_text())
args = sys.argv[1:]
if args == ["auth", "setup-git"]:
    sys.exit(0)
if args[:2] == ["release", "view"]:
    sys.exit(0 if args[2] in state["releases"] else 1)
if args[:2] == ["release", "create"]:
    if state.pop("fail_create", False):
        state_file.write_text(json.dumps(state))
        sys.exit(1)
    tag = args[2]
    if tag in state["releases"]:
        sys.exit(1)
    sha = subprocess.check_output(["git", "rev-parse", f"refs/tags/{tag}^{{}}"], text=True).strip()
    state["releases"][tag] = sha
    state_file.write_text(json.dumps(state))
    sys.exit(0)
sys.exit("unsupported gh fixture command")
''')
        gh.chmod(0o755)
        self.env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ["PATH"],
                        GH_FIXTURE_STATE=str(self.state), GH_TOKEN="fixture-token",
                        SOURCE_SHA=self.sha, TAG="v1.2.3", GITHUB_REPOSITORY="fixture/repo",
                        APPROVED_WORKFLOW="a" * 40, WORKFLOW_SHA="a" * 40,
                        HOME=str(self.base), GIT_CONFIG_NOSYSTEM="1")
        workflow = yaml.safe_load((RELEASE_SCRIPT.parents[1] /
                                   ".github/workflows/release.yml").read_text())
        self.shell = next(step["run"] for step in workflow["jobs"]["promote"]["steps"]
                          if step.get("name", "").startswith("Tag approved"))

    def promote(self, **environment):
        return subprocess.run(["bash", "-e", "-o", "pipefail", "-c", self.shell],
                              cwd=self.root, env=dict(self.env, **environment),
                              capture_output=True, text=True)

    def assertPublished(self):
        self.assertEqual(git(self.origin, "rev-parse", "v1.2.3^{}"), self.sha)
        self.assertEqual(git(self.origin, "cat-file", "-t", "v1.2.3"), "tag")
        self.assertEqual(git(self.origin, "rev-parse", "main"), self.sha)
        self.assertEqual(json.loads(self.state.read_text())["releases"], {"v1.2.3": self.sha})

    def test_new_annotated_tag_and_release(self):
        result = self.promote()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertPublished()

    def test_same_tag_and_release_retry_preserves_tag_object(self):
        self.assertEqual(self.promote().returncode, 0)
        tag_object = git(self.origin, "rev-parse", "v1.2.3")
        result = self.promote()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(git(self.origin, "rev-parse", "v1.2.3"), tag_object)
        self.assertPublished()

    def test_different_commit_tag_is_never_rewritten(self):
        (self.root / "later").write_text("later")
        other = self.commit("other source")
        git(self.root, "tag", "-a", "v1.2.3", "-m", "other", other)
        git(self.root, "push", "origin", "refs/tags/v1.2.3")
        git(self.root, "checkout", "--detach", self.sha)
        result = self.promote()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Tag collision", result.stdout)
        self.assertEqual(git(self.origin, "rev-parse", "v1.2.3^{}"), other)
        self.assertEqual(json.loads(self.state.read_text())["releases"], {})

    def test_missing_production_token_cannot_create_tag_or_release(self):
        result = self.promote(GH_TOKEN="")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(git(self.origin, "tag"), "")
        self.assertEqual(json.loads(self.state.read_text())["releases"], {})

    def test_wrong_workflow_revision_cannot_create_tag_or_release(self):
        result = self.promote(APPROVED_WORKFLOW="b" * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(git(self.origin, "tag"), "")
        self.assertEqual(json.loads(self.state.read_text())["releases"], {})

    def test_failed_release_creation_retries_existing_tag(self):
        self.state.write_text('{"releases": {}, "fail_create": true}')
        self.assertNotEqual(self.promote().returncode, 0)
        tag_object = git(self.origin, "rev-parse", "v1.2.3")
        self.assertEqual(json.loads(self.state.read_text())["releases"], {})
        result = self.promote()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(git(self.origin, "rev-parse", "v1.2.3"), tag_object)
        self.assertPublished()


class ProductionGateTests(unittest.TestCase):
    def test_cli_missing_unreadable_or_wrong_shape_proof_fails_closed(self):
        for proof in ("", "not json", "null", "[]", "{}",
                      '{"name":"production","protection_rules":null}'):
            with self.subTest(proof=proof):
                result = subprocess.run([sys.executable, str(RELEASE_SCRIPT),
                                         "production-gate"], input=proof,
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("error:", result.stderr)

    def test_explicit_owner_reviewer(self):
        proof = {"name": "production", "protection_rules": [
            {"type": "required_reviewers", "reviewers": [
                {"type": "User", "reviewer": {"login": "FilipKrawiec"}}]}]}
        result = subprocess.run([sys.executable, str(RELEASE_SCRIPT), "production-gate"],
                                input=json.dumps(proof), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_or_alternative_approval_is_rejected(self):
        owner = {"type": "User", "reviewer": {"login": "FilipKrawiec"}}
        other = {"type": "User", "reviewer": {"login": "other"}}
        for data in ({}, {"name": "production", "protection_rules": []},
                     {"name": "production", "protection_rules": [{"type": "wait_timer"}]},
                     *({"name": "production", "protection_rules": [
                         {"type": "required_reviewers", "reviewers": reviewers}]}
                       for reviewers in ([], [other], [owner, other],
                                         [{"type": "Team", "reviewer": {"login": "FilipKrawiec"}}]))):
            with self.subTest(data=data), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):
                    release.validate_production_environment(data)


if __name__ == "__main__":
    unittest.main()
