"""Black-box tests for the workflow CLI's credential and evidence boundaries."""
import json
import os
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest

ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / 'plugins/common/workflow/skills/vcs/scripts/workflow.mjs'


class WorkflowCLITest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.repo = self.root / 'repo'
        self.repo.mkdir()
        subprocess.run(['git', 'init', '-q', '-b', 'main', str(self.repo)], check=True)
        subprocess.run(['git', '-C', str(self.repo), 'remote', 'add', 'origin', 'https://github.com/acme/app.git'], check=True)
        (self.repo / '.github').mkdir()
        (self.repo / '.github/lanes.json').write_text(json.dumps({'repo': 'acme/app', 'implementer': 'builder', 'reviewer': 'reviewer', 'owner': 'owner'}))
        subprocess.run(['git', '-C', str(self.repo), 'add', '.github/lanes.json'], check=True)
        subprocess.run(['git', '-C', str(self.repo), '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'initial'], check=True)
        subprocess.run(['git', '-C', str(self.repo), 'update-ref', 'refs/remotes/origin/main', 'HEAD'], check=True)
        subprocess.run(['git', '-C', str(self.repo), 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'], check=True)
        self.main_repo = self.repo
        self.repo = self.root / 'linked'
        subprocess.run(['git', '-C', str(self.main_repo), 'worktree', 'add', '-q', '-b', 'feature/test', str(self.repo), 'HEAD'], check=True)
        self.write_fake('gh', r'''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
if args[:2] == ['auth', 'token']:
    if os.environ.get('GH_TOKEN') or os.environ.get('GH_HOST'):
        sys.exit(1)
    print('SECRET_TOKEN')
elif args[:2] == ['api', 'graphql']:
    if any('ref(qualifiedName:' in arg for arg in args):
        if os.environ.get('GH_TOKEN') != 'SECRET_TOKEN': sys.exit(1)
        if os.environ.get('HOOK_TO_REPLACE'):
            open(os.environ['HOOK_TO_REPLACE'], 'w').write('#!/bin/sh\\nprintf replaced > \"$HOOK_RECORD\"\\n')
        oid = os.environ.get('REMOTE_BRANCH_SHA')
        print(json.dumps({'errors': [{'message': 'missing access'}], 'data': {'repository': {'ref': None}}} if os.environ.get('BRANCH_QUERY_ERROR') else {'data': {'repository': {'ref': {'target': {'oid': oid}} if oid else None}}}))
    else:
        print(json.dumps({'data': {'repository': {'pullRequest': {'reviewThreads': {'pageInfo': {'hasNextPage': False}, 'nodes': [{'isResolved': False, 'isOutdated': False}]}}}}}))
elif args[:1] == ['api']:
    if os.environ.get('GH_TOKEN') != 'SECRET_TOKEN':
        sys.exit(1)
    if 'repos/acme/app' in args:
        print(json.dumps({'default_branch': 'main', 'owner': {'type': os.environ.get('FAKE_OWNER_KIND', 'Organization'), 'login': 'acme'}}))
    elif 'repos/acme/app/branches/main' in args:
        print(json.dumps({'commit': {'sha': os.environ['REMOTE_BASE_SHA']}}))
    else:
        actor = os.environ.get('FAKE_ACTOR', 'builder')
        print(actor if '--jq' in args else json.dumps({'login': actor}))
elif args[:2] == ['pr', 'view']:
    print(json.dumps({'url':'https://github.com/acme/app/pull/1', 'baseRefOid': os.environ['BASE_SHA'], 'headRefOid': os.environ['HEAD_SHA'], 'files': [], 'reviews': [], 'reviewDecision': 'REVIEW_REQUIRED', 'statusCheckRollup': []}))
elif args[:2] == ['pr', 'list']:
    print(json.dumps([{'number': 4, 'autoMergeRequest': {'enabledAt': 'now'}}] if os.environ.get('AUTO_MERGE') else []))
elif args[:2] == ['issue', 'view']:
    print(json.dumps({'url':'https://github.com/acme/app/issues/1', 'body': 'Acceptance', 'comments': [{'url':'https://example.test/1', 'body':'Decision: reuse prior policy'}]}))
else:
    sys.exit(1)
''')
        self.write_fake('git', r'''#!/usr/bin/env python3
import json, os, subprocess, sys
args = sys.argv[1:]
if 'commit' in args and os.environ.get('TEST_CONCURRENT_STAGE'):
    subprocess.run([os.environ['REAL_GIT'], 'add', 'unrelated.txt'], check=True)
if 'push' in args:
    if os.environ.get('TEST_PUSH_FAILURE'):
        print(os.environ.get('FAKE_PUSH_STDERR', 'SECRET_TOKEN'), file=sys.stderr)
        sys.exit(1)
    if os.environ.get('TEST_NATIVE_REMOTE'):
        replacement = [os.environ['TEST_NATIVE_REMOTE'] if a.startswith('https://github.com/') else a for a in args]
        process = subprocess.run([os.environ['REAL_GIT'], *replacement], capture_output=True, text=True)
        open(os.environ['PUSH_RECORD'], 'w').write(json.dumps({'git_status': process.returncode}))
        sys.stderr.write(process.stderr)
        sys.exit(process.returncode)
    if os.environ.get('TEST_PUSH_URL'):
        replacement = [os.environ['TEST_PUSH_URL'] if a.startswith('https://github.com/') else a for a in args]
        process = subprocess.run([os.environ['REAL_GIT'], *replacement], capture_output=True, text=True)
        open(os.environ['PUSH_RECORD'], 'w').write(json.dumps({'git_status': process.returncode}))
        sys.exit(process.returncode)
    output = subprocess.check_output([os.environ['REAL_GIT'], '-c', 'credential.helper=', 'credential', 'fill'], input='protocol=https\nhost=github.com\n\n', text=True)
    secret = next(line.split('=', 1)[1] for line in output.splitlines() if line.startswith('password='))
    open(os.environ['PUSH_RECORD'], 'w').write(json.dumps({'args': args, 'secret': secret, 'environment_has_token': 'WORKFLOW_PUSH_TOKEN' in os.environ}))
    print('remote says SECRET_TOKEN')
else:
    os.execv(os.environ['REAL_GIT'], [os.environ['REAL_GIT'], *args])
''')
        self.env = os.environ.copy()
        self.env.update(PATH=str(self.bin) + os.pathsep + self.env['PATH'], REAL_GIT=subprocess.check_output(['which', 'git'], text=True).strip(), PUSH_RECORD=str(self.root / 'push.json'), GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM='1')
        self.env['REMOTE_BASE_SHA'] = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()

    def write_fake(self, name, contents):
        path = self.bin / name
        path.write_text(contents)
        path.chmod(0o755)

    def run_cli(self, *args):
        return subprocess.run(['node', str(CLI), *args], cwd=self.repo, env=self.env, text=True, capture_output=True)

    def test_push_reads_versioned_workflow_config_from_base(self):
        git = self.env['REAL_GIT']
        config = {'version': 1, 'identities': {'owner': 'owner', 'implementer': 'builder', 'reviewer': 'reviewer'}, 'github': {'repo': 'acme/app'}}
        (self.repo / '.github/agent-workflow.json').write_text(json.dumps(config))
        subprocess.run([git, 'rm', '-q', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([git, 'add', '.github/agent-workflow.json'], cwd=self.repo, check=True)
        subprocess.run([git, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'config'], cwd=self.repo, check=True)
        subprocess.run([git, 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        self.env['REMOTE_BASE_SHA'] = subprocess.check_output([git, 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_commit_and_push_refuse_main_checkout(self):
        (self.main_repo / 'assigned.txt').write_text('assigned')
        for arguments in [('commit', '--message', 'fix: guard checkout', '--', 'assigned.txt'), ('push',)]:
            result = subprocess.run(['node', str(CLI), *arguments], cwd=self.main_repo, env=self.env, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('linked worktree', result.stderr)
        self.assertFalse((self.root / 'push.json').exists())

    def test_commit_only_assigned_paths(self):
        git = self.env['REAL_GIT']
        subprocess.run([git, 'config', 'user.name', 'Test'], cwd=self.repo, check=True)
        subprocess.run([git, 'config', 'user.email', 'test@example.test'], cwd=self.repo, check=True)
        (self.repo / 'assigned.txt').write_text('assigned')
        (self.repo / 'unrelated.txt').write_text('unrelated')
        result = self.run_cli('commit', '--message', 'fix: protect actor', '--', 'assigned.txt')
        self.assertEqual(result.returncode, 0, result.stderr)
        files = subprocess.check_output([git, 'show', '--format=', '--name-only', 'HEAD'], cwd=self.repo, text=True).splitlines()
        self.assertEqual(files, ['assigned.txt'])
        self.assertTrue((self.repo / 'unrelated.txt').exists())
        self.assertEqual(json.loads(result.stdout)['result'], 'committed')

    def test_commit_excludes_concurrently_staged_path(self):
        git = self.env['REAL_GIT']
        subprocess.run([git, 'config', 'user.name', 'Test'], cwd=self.repo, check=True)
        subprocess.run([git, 'config', 'user.email', 'test@example.test'], cwd=self.repo, check=True)
        (self.repo / 'assigned.txt').write_text('assigned')
        (self.repo / 'unrelated.txt').write_text('unrelated')
        self.env['TEST_CONCURRENT_STAGE'] = '1'
        result = self.run_cli('commit', '--message', 'fix: protect actor', '--', 'assigned.txt')
        self.assertEqual(result.returncode, 0, result.stderr)
        committed = subprocess.check_output([git, 'show', '--format=', '--name-only', 'HEAD'], cwd=self.repo, text=True).splitlines()
        self.assertEqual(committed, ['assigned.txt'])
        staged = subprocess.check_output([git, 'diff', '--cached', '--name-only'], cwd=self.repo, text=True).splitlines()
        self.assertEqual(staged, ['unrelated.txt'])

    def test_commit_refuses_existing_staged_changes(self):
        git = self.env['REAL_GIT']
        (self.repo / 'previous.txt').write_text('preserve')
        (self.repo / 'assigned.txt').write_text('assigned')
        subprocess.run([git, 'add', 'previous.txt'], cwd=self.repo, check=True)
        result = self.run_cli('commit', '--message', 'fix: protect actor', '--', 'assigned.txt')
        self.assertNotEqual(result.returncode, 0)
        staged = subprocess.check_output([git, 'diff', '--cached', '--name-only'], cwd=self.repo, text=True).splitlines()
        self.assertEqual(staged, ['previous.txt'])

    def test_commit_rejects_invalid_message_and_parent_paths(self):
        (self.repo / 'assigned.txt').write_text('assigned')
        for arguments in [('bad message', 'assigned.txt'), ('fix: test', '../outside')]:
            result = self.run_cli('commit', '--message', arguments[0], '--', arguments[1])
            self.assertNotEqual(result.returncode, 0)
        staged = subprocess.check_output([self.env['REAL_GIT'], 'diff', '--cached', '--name-only'], cwd=self.repo, text=True)
        self.assertEqual(staged, '')

    def test_push_binds_verified_credential_and_redacts_output(self):
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)
        record = json.loads((self.root / 'push.json').read_text())
        self.assertEqual(record['secret'], 'SECRET_TOKEN')
        self.assertFalse(record['environment_has_token'])
        self.assertTrue(any(arg.endswith(':refs/heads/feature/test') for arg in record['args']))
        self.assertIn('--no-follow-tags', record['args'])
        self.assertIn('--recurse-submodules=no', record['args'])
        self.assertNotIn('SECRET_TOKEN', result.stdout + result.stderr)

    def test_wrong_actor_never_pushes(self):
        self.env['FAKE_ACTOR'] = 'reviewer'
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())
        self.assertNotIn('SECRET_TOKEN', result.stdout + result.stderr)

    def test_git_push_failure_never_reports_success_or_exposes_token(self):
        self.env['TEST_PUSH_FAILURE'] = '1'
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('"result":"pushed"', result.stdout)
        self.assertNotIn('SECRET_TOKEN', result.stdout + result.stderr)

    def test_unrelated_url_rewrites_do_not_block_push(self):
        subprocess.run([self.env['REAL_GIT'], 'config', 'url.https://example.invalid/.insteadOf', 'example:'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_target_url_rewrite_cannot_redirect_checked_credential(self):
        subprocess.run([self.env['REAL_GIT'], 'remote', 'set-url', 'origin', 'git@github.com:acme/app.git'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'config', 'url.https://attacker.invalid/.insteadOf', 'https://github.com/'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('URL rewrite', result.stderr)
        self.assertFalse((self.root / 'push.json').exists())

    def test_reviewer_as_implementer_is_rejected_before_credentials(self):
        (self.repo / '.github/lanes.json').write_text(json.dumps({'repo': 'acme/app', 'implementer': 'reviewer', 'reviewer': 'reviewer', 'owner': 'owner'}))
        subprocess.run([self.env['REAL_GIT'], 'add', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'unsafe base'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())

    def test_push_ignores_uncommitted_identity_configuration(self):
        (self.repo / '.github/lanes.json').write_text(json.dumps({'repo': 'acme/app', 'implementer': 'reviewer', 'reviewer': 'builder', 'owner': 'owner'}))
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['actor'], 'builder')

    def test_push_ignores_replacement_refs_for_base_roles(self):
        git = self.env['REAL_GIT']
        original = subprocess.check_output([git, 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        lanes = {'repo': 'acme/app', 'implementer': 'reviewer', 'reviewer': 'builder', 'owner': 'owner'}
        (self.repo / '.github/lanes.json').write_text(json.dumps(lanes))
        subprocess.run([git, 'add', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([git, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'replacement'], cwd=self.repo, check=True)
        replacement = subprocess.check_output([git, 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        subprocess.run([git, 'reset', '--hard', '-q', original], cwd=self.repo, check=True)
        subprocess.run([git, 'replace', original, replacement], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['actor'], 'builder')

    def test_push_refuses_owner_as_implementer(self):
        (self.repo / '.github/lanes.json').write_text(json.dumps({'repo': 'acme/app', 'implementer': 'owner', 'reviewer': 'reviewer', 'owner': 'owner'}))
        subprocess.run([self.env['REAL_GIT'], 'add', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'unsafe base'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())

    def test_missing_explicit_owner_fails_closed(self):
        lanes = {'repo': 'acme/app', 'implementer': 'builder', 'reviewer': 'reviewer'}
        (self.repo / '.github/lanes.json').write_text(json.dumps(lanes))
        subprocess.run([self.env['REAL_GIT'], 'add', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'unsafe base'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())

    def test_configured_base_other_than_verified_default_fails_closed(self):
        lanes = {'repo': 'acme/app', 'implementer': 'builder', 'reviewer': 'reviewer', 'owner': 'owner', 'base': 'release'}
        (self.repo / '.github/lanes.json').write_text(json.dumps(lanes))
        subprocess.run([self.env['REAL_GIT'], 'add', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'different base'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())

    def test_push_refuses_when_auto_merge_enabled(self):
        self.env['AUTO_MERGE'] = '1'
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())

    def test_stale_base_configuration_is_rejected(self):
        self.env['REMOTE_BASE_SHA'] = 'f' * 40
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())

    def test_push_ignores_inherited_gh_actor_and_host(self):
        self.env.update(GH_TOKEN='WRONG_REVIEWER_TOKEN', GH_HOST='invalid.example')
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads((self.root / 'push.json').read_text())['secret'], 'SECRET_TOKEN')
        self.assertNotIn('WRONG_REVIEWER_TOKEN', result.stdout + result.stderr)

    def test_push_isolates_url_scoped_credential_helper(self):
        marker = self.root / 'helper-ran'
        subprocess.run([self.env['REAL_GIT'], 'config', 'credential.https://github.com.helper', f'!touch {marker}'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(marker.exists())
        self.assertEqual(json.loads((self.root / 'push.json').read_text())['secret'], 'SECRET_TOKEN')

    def test_git_push_refuses_to_send_token_to_non_github_host(self):
        received = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                received.append(self.headers.get('Authorization'))
                self.send_response(403 if received[-1] else 401)
                if not received[-1]:
                    self.send_header('WWW-Authenticate', 'Basic realm="fixture"')
                self.end_headers()

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        marker = self.root / 'unsafe-helper'
        helper = f'!touch {marker}; echo username=reviewer; echo password=WRONG'
        subprocess.run([self.env['REAL_GIT'], 'config', 'credential.https://github.com.helper', helper], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'config', 'credential.https://github.com/acme/app.git.helper', helper], cwd=self.repo, check=True)
        self.env['TEST_PUSH_URL'] = f'http://127.0.0.1:{server.server_port}/acme/app.git'
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(marker.exists())
        expected = 'Basic ' + base64.b64encode(b'x-access-token:SECRET_TOKEN').decode()
        self.assertNotIn(expected, received)
        self.assertNotIn('SECRET_TOKEN', result.stdout + result.stderr)

    def test_push_refuses_scoped_authorization_header(self):
        subprocess.run([self.env['REAL_GIT'], 'config', 'http.https://github.com/.extraheader', 'Authorization: secret'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())
        self.assertNotIn('Authorization: secret', result.stderr)

    def native_remote(self):
        remote = self.root / 'remote.git'
        subprocess.run([self.env['REAL_GIT'], 'init', '--bare', '-q', str(remote)], check=True)
        self.env['TEST_NATIVE_REMOTE'] = str(remote)
        return remote

    def test_git_runs_installed_hook_normally(self):
        remote = self.native_remote()
        hook = Path(subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', '--git-path', 'hooks/pre-push'], cwd=self.repo, text=True).strip())
        if not hook.is_absolute(): hook = self.repo / hook
        hook.write_text('#!/usr/bin/env python3\nimport json,os\nopen(os.environ["HOOK_RECORD"],"w").write(json.dumps({"token": bool(os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or os.environ.get("WORKFLOW_CREDENTIAL_SOCKET"))}))\n')
        hook.chmod(0o755)
        self.env['HOOK_RECORD'] = str(self.root / 'hook.txt')
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads((self.root / 'hook.txt').read_text())['token'])
        actual = subprocess.check_output([self.env['REAL_GIT'], '--git-dir', str(remote), 'rev-parse', 'refs/heads/feature/test'], text=True).strip()
        self.assertEqual(actual, self.env['REMOTE_BASE_SHA'])

    def test_git_stops_push_when_installed_hook_fails(self):
        remote = self.native_remote()
        hook = Path(subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', '--git-path', 'hooks/pre-push'], cwd=self.repo, text=True).strip())
        if not hook.is_absolute(): hook = self.repo / hook
        hook.write_text('#!/bin/sh\nexit 13\n')
        hook.chmod(0o755)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        actual = subprocess.run([self.env['REAL_GIT'], '--git-dir', str(remote), 'rev-parse', '--verify', 'refs/heads/feature/test'], capture_output=True)
        self.assertNotEqual(actual.returncode, 0)

    def test_git_runs_installed_hook_with_ssh_origin(self):
        remote = self.native_remote()
        subprocess.run([self.env['REAL_GIT'], 'remote', 'set-url', 'origin', 'git@github.com:acme/app.git'], cwd=self.repo, check=True)
        hook = Path(subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', '--git-path', 'hooks/pre-push'], cwd=self.repo, text=True).strip())
        if not hook.is_absolute(): hook = self.repo / hook
        hook.write_text('#!/bin/sh\nprintf "ran" > "$HOOK_RECORD"\n')
        hook.chmod(0o755)
        self.env['HOOK_RECORD'] = str(self.root / 'hook.txt')
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.root / 'hook.txt').read_text(), 'ran')
        actual = subprocess.check_output([self.env['REAL_GIT'], '--git-dir', str(remote), 'rev-parse', 'refs/heads/feature/test'], text=True).strip()
        self.assertEqual(actual, self.env['REMOTE_BASE_SHA'])

    def test_push_failure_classifies_without_disclosing_diagnostics(self):
        self.env.update(TEST_PUSH_FAILURE='1', FAKE_PUSH_STDERR='rejected non-fast-forward SECRET_TOKEN private-detail')
        result = self.run_cli('push')
        self.assertIn('remote branch changed or is ahead', result.stderr)
        self.assertNotIn('SECRET_TOKEN', result.stderr)
        self.assertNotIn('private-detail', result.stderr)

    def test_review_context_reports_identical_tree_and_unresolved_threads(self):
        base = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '--allow-empty', '-qm', 'same tree'], cwd=self.repo, check=True)
        head = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        self.env.update(BASE_SHA=base, HEAD_SHA=head)
        result = self.run_cli('review-context', '--pr', '1', '--previous', base, '--previous-base', base, '--issue', '1')
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertTrue(data['comparison']['identicalTree'])
        self.assertTrue(data['comparison']['identicalBaseTree'])
        self.assertTrue(data['comparison']['treesUnchanged'])
        self.assertFalse(data['reviewThreads'][0]['isResolved'])
        self.assertIn('Decision:', data['issue']['decisions'][0]['body'])
        self.assertTrue(data['issue']['decisionsMayBeIncomplete'])

    def test_identical_head_without_prior_base_never_marks_evidence_carryable(self):
        head = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        self.env.update(BASE_SHA=head, HEAD_SHA=head)
        result = self.run_cli('review-context', '--pr', '1', '--previous', head)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(json.loads(result.stdout)['comparison']['treesUnchanged'])

    def test_changed_base_tree_does_not_mark_evidence_carryable(self):
        previous = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        (self.repo / 'new-file').write_text('change')
        subprocess.run([self.env['REAL_GIT'], 'add', 'new-file'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'change'], cwd=self.repo, check=True)
        current_base = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        self.env.update(BASE_SHA=current_base, HEAD_SHA=previous)
        result = self.run_cli('review-context', '--pr', '1', '--previous', previous, '--previous-base', previous)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)['comparison']
        self.assertTrue(data['identicalTree'])
        self.assertFalse(data['identicalBaseTree'])
        self.assertFalse(data['treesUnchanged'])

    def test_review_context_works_without_lanes(self):
        subprocess.run([self.env['REAL_GIT'], 'rm', '-q', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'no config'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        head = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        self.env.update(BASE_SHA=head, HEAD_SHA=head)
        result = self.run_cli('review-context', '--pr', '1')
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(data['headRefOid'], head)
        self.assertFalse(data['baseConfigurationAvailable'])

    def test_push_without_base_roles_fails_closed(self):
        subprocess.run([self.env['REAL_GIT'], 'rm', '-q', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'no config'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('.github/lanes.json', result.stderr)
        self.assertFalse((self.root / 'push.json').exists())

    def roles_file(self, roles):
        path = self.root / 'trusted-roles.json'
        path.write_text(json.dumps(roles))
        path.chmod(0o600)
        return path

    def test_push_without_lanes_uses_external_owned_roles(self):
        git = self.env['REAL_GIT']
        subprocess.run([git, 'rm', '-q', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([git, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'no config'], cwd=self.repo, check=True)
        head = subprocess.check_output([git, 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        subprocess.run([git, 'update-ref', 'refs/remotes/origin/main', head], cwd=self.repo, check=True)
        self.env['REMOTE_BASE_SHA'] = head
        roles = self.roles_file({'repo': 'acme/app', 'implementer': 'builder', 'reviewer': 'reviewer', 'owner': 'owner'})
        result = self.run_cli('push', '--roles-file', str(roles))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)['actor'], 'builder')

    def test_external_roles_cannot_override_base(self):
        roles = self.roles_file({'repo': 'acme/app', 'implementer': 'reviewer', 'reviewer': 'builder', 'owner': 'owner'})
        result = self.run_cli('push', '--roles-file', str(roles))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('cannot override', result.stderr)
        self.assertFalse((self.root / 'push.json').exists())

    def test_external_roles_reject_repo_file_and_insecure_permissions(self):
        path = self.repo / 'roles.json'
        path.write_text('{}')
        self.assertNotEqual(self.run_cli('push', '--roles-file', str(path)).returncode, 0)
        path = self.roles_file({})
        path.chmod(0o666)
        self.assertNotEqual(self.run_cli('push', '--roles-file', str(path)).returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())

    def test_missing_owner_defaults_to_verified_personal_owner(self):
        lanes = {'repo': 'acme/app', 'implementer': 'builder', 'reviewer': 'reviewer'}
        (self.repo / '.github/lanes.json').write_text(json.dumps(lanes))
        subprocess.run([self.env['REAL_GIT'], 'add', '.github/lanes.json'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'personal base'], cwd=self.repo, check=True)
        subprocess.run([self.env['REAL_GIT'], 'update-ref', 'refs/remotes/origin/main', 'HEAD'], cwd=self.repo, check=True)
        self.env['REMOTE_BASE_SHA'] = subprocess.check_output([self.env['REAL_GIT'], 'rev-parse', 'HEAD'], cwd=self.repo, text=True).strip()
        self.env['FAKE_OWNER_KIND'] = 'User'
        result = self.run_cli('push')
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_push_failure_reports_safe_class_and_exit(self):
        self.env['TEST_PUSH_FAILURE'] = '1'
        result = self.run_cli('push')
        self.assertIn('exit 1', result.stderr)
        self.assertIn('unclassified Git failure', result.stderr)
        self.assertNotIn('SECRET_TOKEN', result.stderr)

    def test_remote_destination_mismatch_is_rejected(self):
        subprocess.run([self.env['REAL_GIT'], 'remote', 'set-url', 'origin', 'https://github.com/other/project.git'], cwd=self.repo, check=True)
        result = self.run_cli('push')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'push.json').exists())


if __name__ == '__main__':
    unittest.main()
