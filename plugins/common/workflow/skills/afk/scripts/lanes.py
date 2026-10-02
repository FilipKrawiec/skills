#!/usr/bin/env python3
"""Issue lanes gates: what an unattended agent may pick up, touch and merge.

Only the decisions an agent must not judge for itself live here; the skills do
everything else with plain `gh` and `git`. A repository opts in with
`.github/lanes.json` (see references/setup.md).

Usage: lanes.py next                 # the next eligible AFK issue; in flight, skipped, untriaged
       lanes.py scope N              # changed files outside N's scope packet (exit 1 when any)
       lanes.py automerge PR         # squash auto-merge PR on green checks if it is a chore
       lanes.py merge-reviewed PR    # squash-merge an AFK PR whose agent review says ready
Standard library only; needs git and an authenticated gh.
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

AFK, PROPOSED, OWNER_LANE, CLAIMED = 'lane:afk', 'lane:proposed', 'lane:owner', 'state:claimed'
STARTED, OWNER_REVIEW, EPIC = 'state:started', 'review:owner', 'type:epic'
PRIORITIES = ('priority:P0', 'priority:P1', 'priority:P2')
DEPENDABOT = {'app/dependabot', 'dependabot[bot]'}

# Lists in lanes.json extend these; scalars replace them.
DEFAULTS = {
    'base': 'main',
    'branchPrefix': 'agent/afk-',
    'staleClaimHours': 3,
    # Top-level dot-directories hold automation, agent and editor configuration.
    'protected': [r'^\.[^/]+/', r'(^|/)AGENTS\.md$', r'(^|/)([Jj]ustfile|Makefile)$'],
    'alwaysInScope': [],
    'chores': [r'^docs/', r'\.md$', r'(^|/)tests?/'],
    'dependencyFiles': [r'(^|/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pubspec\.(yaml|lock)'
                        r'|requirements[^/]*\.txt|poetry\.lock|uv\.lock|go\.(mod|sum)|Cargo\.(toml|lock))$'],
    # True when an automated reviewer reviews PRs first and hands them over with review:owner.
    'agentReview': False,
    'reviewRounds': 3,
}

PACKET = re.compile(r'```(?:scope|factory)\s*(\{.*?\})\s*```', re.S)
ACCEPTANCE = re.compile(r'^#+\s*Acceptance criteria\s*\n+\s*\S', re.M | re.I)


def load_config(root):
    return parse_config((Path(root) / '.github' / 'lanes.json').read_text())


def parse_config(text):
    data = json.loads(text)
    config = {**DEFAULTS, **data}
    for key, default in DEFAULTS.items():
        if isinstance(default, list):
            config[key] = default + list(data.get(key, []))
    config.setdefault('owner', config['repo'].split('/')[0])
    return config


def matches(patterns, path):
    return any(re.search(p, path) for p in patterns)


def covers(scope_path, path):
    """A packet path ending in / authorizes a subtree; any other path, one file."""
    return path == scope_path or (scope_path.endswith('/') and path.startswith(scope_path))


def names(item):
    return {label['name'] for label in item.get('labels', [])}


# --- Queue -----------------------------------------------------------------

def packet(body):
    """The issue's scope packet: {'paths': [...], 'dependencies': [ints]}, or None."""
    match = PACKET.search(body or '')
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
        deps = [int(str(d).lstrip('#')) for d in data.get('dependencies', [])]
    except (ValueError, AttributeError):
        return None
    return {'paths': list(data.get('paths', [])), 'dependencies': deps}


def packet_violations(paths, tracked, config):
    """Packet paths that are unsafe, protected, or whose subtree reaches a protected file."""
    protected = config['protected']
    return [p for p in paths
            if p.startswith('/') or '..' in p.split('/') or '*' in p or matches(protected, p)
            or any(matches(protected, f) for f in tracked if covers(p, f))]


def ineligible(issue, completed, pr_open, tracked, config):
    """Why an issue cannot be picked up now, or None when it can."""
    labels = names(issue)
    if AFK not in labels:
        return 'not lane:afk'
    if EPIC in labels:
        return 'epic'
    if pr_open:
        return 'has an open PR'
    if CLAIMED in labels:
        return 'claimed'
    if STARTED in labels:
        return 'started in another session'
    if not ACCEPTANCE.search(issue.get('body') or ''):
        return 'no acceptance criteria'
    scope = packet(issue.get('body'))
    if scope is None or not scope['paths']:
        return 'no scope packet'
    bad = packet_violations(scope['paths'], tracked, config)
    if bad:
        return 'packet reaches protected paths: ' + ', '.join(bad)
    waiting = [d for d in scope['dependencies'] if d not in completed]
    if waiting:
        return 'waiting on ' + ', '.join(f'#{d}' for d in waiting)
    return None


def rank(issue):
    labels = names(issue)
    priority = next((i for i, p in enumerate(PRIORITIES) if p in labels), len(PRIORITIES))
    return priority, issue['number']


def out_of_scope(changed, paths, config):
    """Changed files outside the packet and the always-in-scope paths, or protected."""
    allowed = [*paths, *config['alwaysInScope']]
    return [f for f in changed
            if matches(config['protected'], f) or not any(covers(p, f) for p in allowed)]


# --- Chore auto-merge ------------------------------------------------------

def chore(path, author, config):
    """Docs, tests and Dependabot dependency files: safe to merge on green checks."""
    if matches(config['protected'], path):
        return False
    return (matches(config['chores'], path)
            or (author in DEPENDABOT and matches(config['dependencyFiles'], path)))


BUMP = re.compile(r'\bfrom v?(\d+)\.(\d+)\S* to v?(\d+)\.(\d+)')


def major_bumps(pr):
    """Version changes in a Dependabot PR that cross a breaking boundary.

    Reads the title and the body's own "Bumps"/"Updates" lines (not release
    notes). Below 1.0 a minor change counts as breaking, as semver allows.
    """
    lines = [pr.get('title', '')] + [l for l in (pr.get('body') or '').splitlines()
                                     if l.startswith(('Bumps ', 'Updates '))]
    return [f'{a}.{b} → {c}.{d}' for line in lines for a, b, c, d in BUMP.findall(line)
            if a != c or (a == '0' and b != d)]


def merge_step(merge_state):
    """How an approved chore lands: 'merge' now, 'update' its branch first, or 'queue'."""
    return {'CLEAN': 'merge', 'HAS_HOOKS': 'merge', 'BEHIND': 'update'}.get(merge_state, 'queue')


def renamed(pr):
    """Renamed or copied files: their old path is not in the file list, so no gate can check it."""
    return [f['path'] for f in pr['files'] if f.get('changeType') in ('RENAMED', 'COPIED')]


def automerge_refusal(pr, config):
    """Why a PR must wait for the owner, or None when it may auto-merge."""
    author = pr['author']['login']
    if pr['state'] != 'OPEN' or pr['isDraft']:
        return 'not an open, ready PR'
    if pr['baseRefName'] != config['base'] or pr['headRepositoryOwner']['login'] != config['repo'].split('/')[0]:
        return f"not a branch of this repository into {config['base']}"
    if author != config['owner'] and author not in DEPENDABOT:
        return f'author {author} is neither the owner nor Dependabot'
    breaking = major_bumps(pr) if author in DEPENDABOT else []
    if breaking:
        return 'major version update, a migration to plan: ' + ', '.join(breaking)
    files = [f['path'] for f in pr['files']]
    if not files or len(files) >= 100:
        return 'file list is empty or truncated'
    if renamed(pr):
        return 'renames hide their old path: ' + ', '.join(renamed(pr)[:5])
    product = [f for f in files if not chore(f, author, config)]
    if product:
        return 'changes more than docs, tests or dependencies: ' + ', '.join(product[:5])
    return None


REVIEW_MARKER = re.compile(r'<!-- agent-review sha=([0-9a-f]{40}) round=(\d+) verdict=(\w+) -->')
# Agent-written comments end with the host's attribution footer, e.g. `_Generated by <host>_`.
AGENT_FOOTER = re.compile(r'^_Generated by .+_\s*\Z', re.M)


def latest_agent_review(pr):
    """(sha, round, verdict, submittedAt) of the PR's newest agent review, or None."""
    found = [(m.group(1), int(m.group(2)), m.group(3), r['submittedAt'])
             for r in pr['reviews'] for m in [REVIEW_MARKER.search(r.get('body') or '')] if m]
    return max(found, key=lambda f: f[3]) if found else None


def reviewed_merge_refusal(pr, config):
    """Why an agent-reviewed AFK PR must wait for the owner, or None when it may merge.

    The reviewer judges criticality and records it as its verdict; this gate
    checks everything a script can: the branch, the base, protected paths,
    the verdict at the current head, and nothing newer from a person."""
    if not config['agentReview']:
        return 'agentReview is off in lanes.json'
    if pr['state'] != 'OPEN' or pr['isDraft']:
        return 'not an open, ready PR'
    if pr['baseRefName'] != config['base'] or pr['headRepositoryOwner']['login'] != config['repo'].split('/')[0]:
        return f"not a branch of this repository into {config['base']}"
    if not pr['headRefName'].startswith(config['branchPrefix']):
        return f"not an AFK branch ({config['branchPrefix']}*)"
    if OWNER_REVIEW in names(pr):
        return f'labelled {OWNER_REVIEW}'
    files = [f['path'] for f in pr['files']]
    if not files or len(files) >= 100:
        return 'file list is empty or truncated'
    if renamed(pr):
        return 'renames hide their old path: ' + ', '.join(renamed(pr)[:5])
    protected = [f for f in files if matches(config['protected'], f)]
    if protected:
        return 'touches protected paths: ' + ', '.join(protected[:5])
    review = latest_agent_review(pr)
    if review is None or review[0] != pr['headRefOid'] or review[2] != 'ready':
        return 'no "ready" agent review at the head commit'
    latest = {}  # a person's later comment leaves their approval or change request standing
    for r in sorted(pr['reviews'], key=lambda r: r.get('submittedAt') or ''):
        if r['state'] in ('APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'):
            latest[r['author']['login']] = r['state']
    if 'CHANGES_REQUESTED' in latest.values():
        return 'a review requests changes'
    newer = [c for c in pr['reviews'] + pr['comments']
             if (c.get('submittedAt') or c.get('createdAt')) > review[3]
             and not AGENT_FOOTER.search(c.get('body') or '')]
    if newer:
        return 'a person commented after the agent review'
    return None


def afk_in_flight(issues, with_pr):
    """AFK claims still being built; person-led starts never hold the queue."""
    return [i for i in issues if CLAIMED in names(i) and i['number'] not in with_pr]


# --- GitHub and Git I/O ----------------------------------------------------

def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=True).stdout


def gh_json(*args):
    return json.loads(run('gh', *args) or 'null')


class Repo:
    """The repository as its remote base branch has it.

    The checkout a run starts in is often the owner's: on any branch, dirty or
    behind. Runs never switch, pull or reset it; queue decisions read the
    fetched base branch, and builds happen in worktrees made from it."""

    def __init__(self):
        self.root = Path(run('git', 'rev-parse', '--show-toplevel').strip())
        local = load_config(self.root)
        self.base_ref = f"origin/{local['base']}"
        try:
            run('git', 'fetch', '--quiet', 'origin', local['base'], cwd=self.root)
        except subprocess.CalledProcessError:
            pass  # offline: the last fetched base still answers
        self.config = self._base_config() or local
        self.name = self.config['repo']

    def _base_config(self):
        try:
            return parse_config(run('git', 'show', f'{self.base_ref}:.github/lanes.json',
                                    cwd=self.root))
        except (subprocess.CalledProcessError, ValueError):
            return None

    def tracked(self):
        try:
            return run('git', 'ls-tree', '-r', '--name-only', self.base_ref, cwd=self.root).split()
        except subprocess.CalledProcessError:
            return run('git', 'ls-files', cwd=self.root).split()

    def open_issues(self):
        return gh_json('issue', 'list', '-R', self.name, '-s', 'open', '-L', '500',
                       '--json', 'number,title,body,labels,state,url')

    def closed_issues(self):
        return gh_json('issue', 'list', '-R', self.name, '-s', 'closed', '-L', '1000',
                       '--json', 'number,stateReason')

    def issues_with_open_prs(self):
        """Numbers of the issues an open PR closes."""
        prs = gh_json('pr', 'list', '-R', self.name, '-s', 'open', '-L', '200',
                      '--json', 'closingIssuesReferences')
        return {ref['number'] for pr in prs for ref in pr['closingIssuesReferences']}

    def claimed_at(self, number):
        times = run('gh', 'api', f'repos/{self.name}/issues/{number}/events', '--paginate', '--jq',
                    f'.[] | select(.event == "labeled" and .label.name == "{CLAIMED}") | .created_at').split()
        return datetime.fromisoformat(times[-1].replace('Z', '+00:00')) if times else None


def cmd_next(repo, _args):
    issues, with_pr = repo.open_issues(), repo.issues_with_open_prs()
    completed = {i['number'] for i in repo.closed_issues() if i['stateReason'] == 'COMPLETED'}
    tracked = repo.tracked()
    stale_after = timedelta(hours=repo.config['staleClaimHours'])
    in_flight = afk_in_flight(issues, with_pr)
    for issue in in_flight:
        since = repo.claimed_at(issue['number'])
        stale = since and datetime.now(timezone.utc) - since > stale_after
        note = f'stale since {since:%Y-%m-%d %H:%M}Z; park it' if stale else 'running'
        print(f"in flight: #{issue['number']} {issue['title']} ({note})")
    untriaged = sorted(i['number'] for i in issues if not names(i) & {AFK, PROPOSED, OWNER_LANE})
    if untriaged:
        print('untriaged: ' + ' '.join(f'#{n}' for n in untriaged))
    ready = None
    for issue in sorted((i for i in issues if AFK in names(i)), key=rank):
        reason = ineligible(issue, completed, issue['number'] in with_pr, tracked, repo.config)
        if reason:
            print(f"skipped: #{issue['number']} {reason}")
        elif ready is None:
            ready = issue
    if in_flight:
        print('next: none (one AFK issue at a time)')
    else:
        print(f"next: #{ready['number']} {ready['title']}" if ready else 'next: none')


def cmd_scope(repo, args):
    number = args[0]
    scope = packet(gh_json('issue', 'view', number, '-R', repo.name, '--json', 'body')['body'])
    if scope is None:
        sys.exit(f'#{number} has no scope packet.')
    merge_base = run('git', 'merge-base', f"origin/{repo.config['base']}", 'HEAD').strip()
    # --no-renames lists a moved file's old path too, so a move out of a protected path is caught.
    changed = set(run('git', 'diff', '--name-only', '--no-renames', merge_base, cwd=repo.root).split())
    changed |= set(run('git', 'ls-files', '--others', '--exclude-standard', cwd=repo.root).split())
    outside = out_of_scope(sorted(changed), scope['paths'], repo.config)
    for path in outside:
        print(f'outside scope: {path}')
    if outside:
        sys.exit(1)
    print(f'✓ {len(changed)} changed files within #{number} scope')


def cmd_automerge(repo, args):
    number = args[0]
    pr = gh_json('pr', 'view', number, '-R', repo.name, '--json',
                 'state,isDraft,baseRefName,headRepositoryOwner,author,files,title,body,mergeStateStatus')
    reason = automerge_refusal(pr, repo.config)
    if reason:
        print(f'#{number} waits for the owner: {reason}')
        return
    step = merge_step(pr['mergeStateStatus'])
    if step == 'merge':
        run('gh', 'pr', 'merge', number, '-R', repo.name, '--squash')
        print(f'#{number} merged: green and up to date')
        return
    if step == 'update':
        # Auto-merge never updates a branch that fell behind; do it so it can land.
        run('gh', 'pr', 'update-branch', number, '-R', repo.name)
    run('gh', 'pr', 'merge', number, '-R', repo.name, '--auto', '--squash')
    print(f'#{number} will squash-merge when required checks pass'
          + (' (branch updated)' if step == 'update' else ''))


def cmd_merge_reviewed(repo, args):
    number = args[0]
    pr = gh_json('pr', 'view', number, '-R', repo.name, '--json',
                 'state,isDraft,baseRefName,headRefName,headRefOid,headRepositoryOwner,labels,'
                 'files,reviews,comments,mergeStateStatus')
    reason = reviewed_merge_refusal(pr, repo.config)
    if reason:
        print(f'#{number} waits for the owner: {reason}')
        return
    if merge_step(pr['mergeStateStatus']) != 'merge':
        print(f"#{number} not mergeable yet: {pr['mergeStateStatus']}")
        return
    run('gh', 'pr', 'merge', number, '-R', repo.name, '--squash',
        '--match-head-commit', pr['headRefOid'])
    print(f'#{number} merged after agent review')


COMMANDS = {'next': cmd_next, 'scope': cmd_scope, 'automerge': cmd_automerge,
            'merge-reviewed': cmd_merge_reviewed}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](Repo(), sys.argv[2:])
