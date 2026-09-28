"""Behavior checks for the opt-in issue factory's trust and delivery boundary."""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "plugins/common/workflow/skills/issue-factory/scripts/issue_factory.py"
spec = importlib.util.spec_from_file_location("issue_factory", SCRIPT)
factory = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = factory
spec.loader.exec_module(factory)


def issue(**overrides):
    value = {
        "number": 12, "title": "Fix a bounded behavior", "state": "OPEN",
        "author": {"login": "owner"},
        "labels": [{"name": "agent:ready"}, {"name": "agent:codex"}],
        "body": '## Acceptance criteria\nThe behavior is corrected.\n\n'
                '```factory\n{"paths": ["src/", "tests/"], "dependencies": []}\n```',
    }
    value.update(overrides)
    return value


class FactoryPolicyTests(unittest.TestCase):
    def test_github_issue_form_acceptance_heading_is_supported(self):
        body = issue()["body"].replace("## Acceptance criteria", "### Acceptance criteria")
        self.assertEqual(factory.Task.from_issue(issue(body=body), "owner").number, 12)

    def test_owner_ready_issue_has_a_bounded_packet(self):
        task = factory.Task.from_issue(issue(), "owner")
        self.assertEqual(task.number, 12)
        self.assertEqual(task.agent, "codex")
        self.assertEqual(task.paths, ("src/", "tests/"))

    def test_unapproved_or_conflicting_states_are_rejected(self):
        for labels in ([], ["agent:ready"],
                       ["agent:ready", "agent:codex", "agent:claude"],
                       ["agent:ready", "agent:codex", "agent:blocked"],
                       ["agent:ready", "agent:codex", "agent:running"]):
            with self.subTest(labels=labels), self.assertRaises(factory.FactoryError):
                factory.Task.from_issue(issue(labels=[{"name": name} for name in labels]), "owner")

    def test_other_authors_and_incomplete_packets_are_rejected(self):
        for changes in ({"author": {"login": "someone"}}, {"state": "CLOSED"},
                        {"body": "Do anything you like"}, {"body": "```factory\n{}\n```"}):
            with self.subTest(changes=changes), self.assertRaises(factory.FactoryError):
                factory.Task.from_issue(issue(**changes), "owner")

    def test_paths_cannot_escape_or_modify_the_automation_boundary(self):
        for path in ("/tmp/", "../", "src/../", ".", ".github/", "justfile",
                     "AGENTS.md", "src/*.py", ".env", "src\\file", "--all"):
            body = '## Acceptance criteria\nFixed.\n```factory\n' + json.dumps({"paths": [path], "dependencies": []}) + '\n```'
            with self.subTest(path=path), self.assertRaises(factory.FactoryError):
                factory.Task.from_issue(issue(body=body), "owner")

    def test_path_boundary_matches_components_not_prefixes(self):
        task = factory.Task.from_issue(issue(), "owner")
        self.assertTrue(task.allows("src/song.py"))
        self.assertFalse(task.allows("src-other/song.py"))
        self.assertFalse(task.allows("src/../secret"))

    def test_nested_automation_and_infrastructure_paths_are_rejected(self):
        for path in ("components/app/tool/", "components/web/scripts/",
                     "src/.github/", "infra/cloudflare/"):
            body = '## Acceptance criteria\nFixed.\n```factory\n' + json.dumps({"paths": [path], "dependencies": []}) + '\n```'
            with self.subTest(path=path), self.assertRaises(factory.FactoryError):
                factory.Task.from_issue(issue(body=body), "owner")

    def test_dependencies_are_positive_issue_numbers(self):
        for dependencies in ([0], [-2], [True], ["12"], [12]):
            body = '## Acceptance criteria\nFixed.\n```factory\n' + json.dumps({"paths": ["src/"], "dependencies": dependencies}) + '\n```'
            with self.subTest(dependencies=dependencies), self.assertRaises(factory.FactoryError):
                factory.Task.from_issue(issue(body=body), "owner")

    def test_worker_environment_is_allowlisted_not_inherited(self):
        env = factory.worker_environment({"HOME": "/worker", "PATH": "/bin",
                                          "GH_TOKEN": "private", "FIREBASE_TOKEN": "private",
                                          "ASC_API_KEY_ID": "private", "SSH_AUTH_SOCK": "private",
                                          "OTHER_SECRET": "private"})
        self.assertEqual(env["HOME"], "/worker")
        self.assertEqual(env["PATH"], "/bin")
        self.assertEqual(set(env), {"HOME", "PATH"})

    def test_launch_uses_noninteractive_sandbox_without_bypass_flags(self):
        codex = factory.agent_command("codex")
        self.assertIn("workspace-write", codex)
        self.assertIn("never", codex)
        claude = factory.agent_command("claude")
        self.assertIn("--safe-mode", claude)
        self.assertIn("dontAsk", claude)
        settings = json.loads(claude[claude.index("--settings") + 1])
        self.assertTrue(settings["sandbox"]["failIfUnavailable"])
        self.assertFalse(settings["sandbox"]["allowUnsandboxedCommands"])
        for command in (codex, claude):
            self.assertFalse(any("danger" in item or "bypassPermissions" in item for item in command))

    def test_state_directory_cannot_be_a_broad_parent_or_home(self):
        for state in (Path("/"), Path.home(), Path("/private/tmp")):
            with self.subTest(state=state), self.assertRaises(factory.FactoryError):
                factory.Factory("owner/project", Path("/private/tmp/source"), state, factory.Commands())


class MemoryCommands:
    def __init__(self, failure=None, revoke=False, changed="src/fixed.py", dependency=None,
                 claim_revocation=None):
        self.calls = []
        self.failure = failure
        self.revoke = revoke
        self.changed = changed
        self.dependency = dependency
        self.claim_revocation = claim_revocation
        self.current = issue()
        self.events = [{"id": 100, "event": "labeled", "label": {"name": "agent:ready"},
                        "actor": {"login": "owner"}}]

    def revoke_readiness(self, reapply=False):
        self.current["labels"] = [label for label in self.current["labels"] if label["name"] != "agent:ready"]
        self.events.append({"id": 101, "event": "unlabeled", "label": {"name": "agent:ready"},
                            "actor": {"login": "owner"}})
        if reapply:
            self.current["labels"].append({"name": "agent:ready"})
            self.events.append({"id": 102, "event": "labeled", "label": {"name": "agent:ready"},
                                "actor": {"login": "owner"}})

    def run(self, args, cwd, **options):
        self.calls.append((args, options))
        if args[:3] == ["gh", "issue", "edit"]:
            if "agent:running" in args and "--add-label" in args and self.claim_revocation in ("during", "reapply"):
                self.revoke_readiness(self.claim_revocation == "reapply")
            labels = {label["name"] for label in self.current["labels"]}
            if "--remove-label" in args:
                labels.discard(args[args.index("--remove-label") + 1])
            if "--add-label" in args:
                labels.add(args[args.index("--add-label") + 1])
            self.current["labels"] = [{"name": label} for label in sorted(labels)]
        if args[:3] == ["gh", "issue", "edit"] and "agent:review" in args and self.failure == "label":
            raise factory.FactoryError("tracker unavailable after publication")
        if args[:2] == ["just", "verify"] and self.failure == "verify":
            raise factory.FactoryError("verification failed")
        if args[:2] == ["gh", "pr"]:
            if args[2] == "list":
                return "[]"
            if args[2] == "create":
                return "https://github.com/owner/project/pull/13\n"
        if args[:3] == ["gh", "issue", "view"]:
            if self.claim_revocation == "before":
                self.revoke_readiness()
            current = dict(self.current)
            if self.revoke:
                current["body"] = "Changed after approval"
            return json.dumps(current)
        if args[:2] == ["gh", "api"] and args[2].endswith("/events"):
            return json.dumps([self.events])
        if args[:3] == ["git", "rev-parse", "HEAD"] or args[:3] == ["git", "rev-parse", "origin/main"]:
            return "abc123\n"
        if args[:2] == ["git", "write-tree"] or args[:3] == ["git", "rev-parse", "HEAD^{tree}"]:
            return "tree123\n"
        if args[:3] == ["git", "diff", "--cached"]:
            return ":100644 100644 abc def M\0" + self.changed + "\0" if "--raw" in args else ""
        if args[:3] == ["git", "diff", "--name-only"]:
            return self.changed + "\0" if "abc123" in args else ""
        if args[0] in ("codex", "claude") and self.failure == "agent":
            raise factory.FactoryError("agent unavailable")
        return ""


class FactoryDeliveryTests(unittest.TestCase):
    def test_revoked_readiness_cannot_be_overwritten_by_claim(self):
        for timing in ("before", "during", "reapply"):
            with self.subTest(timing=timing), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                commands = MemoryCommands(claim_revocation=timing)
                service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
                service.state.mkdir()
                with self.assertRaises(factory.FactoryError):
                    service.run_task(factory.Task.from_issue(issue(), "owner"))
                self.assertFalse(any(call[0] in ("codex", "claude") or call[:2] == ["git", "push"]
                                     for call, opts in commands.calls))
                if timing == "before":
                    self.assertFalse(any(call[:3] == ["gh", "issue", "edit"] and "--add-label" in call
                                         and call[call.index("--add-label") + 1] == "agent:running"
                                         for call, opts in commands.calls))

    def test_success_publishes_only_a_draft_after_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = MemoryCommands()
            service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
            service.state.mkdir()
            result = service.run_task(factory.Task.from_issue(issue(), "owner"))
            self.assertEqual(result, {"issue": 12, "phase": "review", "pr": "https://github.com/owner/project/pull/13"})
            calls = [call for call, options in commands.calls]
            verify_index = next(i for i, call in enumerate(calls) if call[:2] == ["just", "verify"])
            push_index = next(i for i, call in enumerate(calls) if call[:2] == ["git", "push"])
            self.assertLess(verify_index, push_index)
            pr = next(call for call in calls if call[:3] == ["gh", "pr", "create"])
            self.assertIn("--draft", pr)
            self.assertIn("Closes #12", pr[pr.index("--body") + 1])
            self.assertFalse(any("merge" in call for call in calls))
            state = json.loads((service.state / "issue-12.json").read_text())
            self.assertEqual(state["phase"], "review")

    def test_failed_agent_gate_or_scope_prevents_push_and_records_blocker(self):
        for options in ({"failure": "agent"}, {"failure": "verify"},
                        {"changed": "other/private.py"}, {"revoke": True}):
            with self.subTest(options=options), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                commands = MemoryCommands(**options)
                service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
                service.state.mkdir()
                with self.assertRaises(factory.FactoryError):
                    service.run_task(factory.Task.from_issue(issue(), "owner"))
                self.assertFalse(any(call[:2] == ["git", "push"] for call, opts in commands.calls))
                state = json.loads((service.state / "issue-12.json").read_text())
                self.assertEqual(state["phase"], "blocked")

    def test_existing_run_requires_explicit_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = MemoryCommands()
            service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
            service.state.mkdir()
            (service.state / "issue-12.json").write_text('{"phase":"running"}')
            with self.assertRaises(factory.FactoryError):
                service.run_task(factory.Task.from_issue(issue(), "owner"))
            self.assertEqual(commands.calls, [])

    def test_partial_publication_keeps_the_pr_and_base_in_recovery_record(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            service = factory.Factory("owner/project", root / "checkout", root / "state", MemoryCommands(failure="label"))
            service.state.mkdir()
            with self.assertRaises(factory.FactoryError):
                service.run_task(factory.Task.from_issue(issue(), "owner"))
            state = json.loads((service.state / "issue-12.json").read_text())
            self.assertEqual(state["phase"], "blocked")
            self.assertEqual(state["pr"], "https://github.com/owner/project/pull/13")
            self.assertEqual(state["base"], "abc123")


class GitDeliveryCommands(MemoryCommands):
    """Real temporary Git state, with network and agent boundaries kept offline."""

    def __init__(self, checkout, attack=None):
        super().__init__()
        self.git = factory.Commands()
        self.attack = attack
        checkout.mkdir()
        self.git.run(["git", "-c", "init.templateDir=", "init", "--quiet"], checkout)
        for key, value in (("user.name", "Factory Test"), ("user.email", "factory@example.invalid"),
                           ("commit.gpgsign", "false"), ("core.hooksPath", "/dev/null")):
            self.git.run(["git", "config", key, value], checkout)
        for name in ("src/fixed.py", ".github/workflows/trusted.yml"):
            path = checkout / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("original\n")
        self.git.run(["git", "add", "--all"], checkout)
        self.git.run(["git", "commit", "--quiet", "-m", "Initial fixture"], checkout)
        self.git.run(["git", "update-ref", "refs/remotes/origin/main", "HEAD"], checkout)

    def run(self, args, cwd, **options):
        if args[0] == "git" and args[1] not in ("fetch", "push"):
            self.calls.append((args, options))
            result = self.git.run(args, cwd, **options)
            if args[:2] == ["git", "add"] and "issue-12" in cwd.parts:
                if self.attack in ("inject-index-after-stage", "inject-symlink-after-stage"):
                    name = "src/fixed.py" if "symlink" in self.attack else ".github/workflows/trusted.yml"
                    path = cwd / name
                    verified = path.read_text()
                    if "symlink" in self.attack:
                        path.unlink()
                        path.symlink_to("target")
                    else:
                        path.write_text("unexpected index content\n")
                    self.git.run(["git", "add", "--", name], cwd)
                    if path.is_symlink():
                        path.unlink()
                    path.write_text(verified)
            return result
        if args[0] in ("codex", "claude"):
            (cwd / "src/fixed.py").write_text("verified fix\n")
        if args[:2] == ["just", "verify"] and self.attack in (
                "modify-protected", "delete-protected", "stale-approved-content"):
            name = "src/fixed.py" if self.attack == "stale-approved-content" else ".github/workflows/trusted.yml"
            path = cwd / name
            verified = path.read_text()
            if self.attack == "delete-protected":
                path.unlink()
            else:
                path.write_text("unverified staged payload\n")
            self.git.run(["git", "add", "--", name], cwd)
            path.write_text(verified)
        return super().run(args, cwd, **options)


class GitPublicationTests(unittest.TestCase):
    def test_index_only_changes_never_reach_publication(self):
        for attack in ("modify-protected", "delete-protected", "stale-approved-content"):
            with self.subTest(attack=attack), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                commands = GitDeliveryCommands(root / "checkout", attack)
                service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
                service.state.mkdir()
                with self.assertRaises(factory.FactoryError):
                    service.run_task(factory.Task.from_issue(issue(), "owner"))
                self.assertFalse(any(call[:2] == ["git", "push"] for call, opts in commands.calls))

    def test_exact_publishing_index_rejects_unexpected_paths_and_symlink_modes(self):
        for attack in ("inject-index-after-stage", "inject-symlink-after-stage"):
            with self.subTest(attack=attack), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                commands = GitDeliveryCommands(root / "checkout", attack)
                service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
                service.state.mkdir()
                with self.assertRaisesRegex(factory.FactoryError, "unauthorized path or file mode"):
                    service.run_task(factory.Task.from_issue(issue(), "owner"))
                self.assertFalse(any(call[:2] == ["git", "push"] for call, opts in commands.calls))

    def test_approved_deletion_and_rename_survive_index_reconstruction(self):
        for operation in ("delete", "rename"):
            with self.subTest(operation=operation), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                commands = GitDeliveryCommands(root / "checkout")
                service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
                task = factory.Task.from_issue(issue(), "owner")
                base = commands.git.run(["git", "rev-parse", "HEAD"], service.checkout).strip()
                path = service.checkout / "src/fixed.py"
                if operation == "delete":
                    path.unlink()
                else:
                    path.rename(service.checkout / "src/renamed.py")
                paths = service.changed_paths(task, service.checkout, base)
                tree = service.publication_tree(task, service.checkout, base, paths)
                names = commands.git.run(["git", "ls-tree", "-r", "--name-only", tree], service.checkout).splitlines()
                self.assertNotIn("src/fixed.py", names)
                self.assertEqual("src/renamed.py" in names, operation == "rename")

    def test_valid_delivery_commits_only_verified_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = GitDeliveryCommands(root / "checkout")
            service = factory.Factory("owner/project", root / "checkout", root / "state", commands)
            service.state.mkdir()
            service.run_task(factory.Task.from_issue(issue(), "owner"))
            workspace = service.state / "worktrees/issue-12"
            self.assertEqual(commands.git.run(["git", "show", "HEAD:src/fixed.py"], workspace), "verified fix\n")
            self.assertEqual(commands.git.run(["git", "diff", "--name-only", "HEAD^", "HEAD"], workspace), "src/fixed.py\n")


class ProcessBoundaryTests(unittest.TestCase):
    def test_real_process_receives_no_arbitrary_controller_secret(self):
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, {"FACTORY_TEST_SECRET": "controller-only"}):
            output = factory.Commands().run(
                [sys.executable, "-c", "import os; print(os.environ.get('FACTORY_TEST_SECRET', 'absent'))"],
                Path.cwd(), worker=True,
            )
        self.assertEqual(output.strip(), "absent")

    def test_nonzero_exit_returns_failure_without_echoing_raw_output(self):
        with self.assertRaises(factory.FactoryError) as failure:
            factory.Commands().run([sys.executable, "-c", "print('private-content'); raise SystemExit(42)"], Path.cwd())
        self.assertIn("42", str(failure.exception))
        self.assertNotIn("private-content", str(failure.exception))

    def test_timed_out_process_is_stopped(self):
        with self.assertRaises(factory.FactoryError):
            factory.Commands().run([sys.executable, "-c", "import time; time.sleep(60)"], Path.cwd(), timeout=0.05)


if __name__ == "__main__":
    unittest.main()
