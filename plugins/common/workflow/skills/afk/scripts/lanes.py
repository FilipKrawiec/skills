#!/usr/bin/env python3
"""Issue lanes gates: what an unattended agent may pick up, touch and merge.

Only the decisions an agent must not judge for itself live here; the skills do
everything else with plain `gh` and `git`. A repository opts in with
`.github/lanes.json` (see references/setup.md).

Usage: lanes.py next                 # the next eligible AFK issue; in flight, skipped, untriaged
       lanes.py scope N              # changed files outside N's scope packet (exit 1 when any)
       lanes.py triage PR            # owner (and the rule it matched), chore or reviewed
       lanes.py merge PR             # merge PR on green checks (auto-merge) unless an owner
                                     # rule matches or a review holds it
       lanes.py hold PR              # switch PR's auto-merge off: a review found blocking issues
       lanes.py blockers PR          # every reason PR can't merge now (exit 1 when any); read-only,
                                     # needs no lanes.json
Standard library only; needs git and an authenticated gh.
"""
import json
import re
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

AFK, PROPOSED, OWNER_LANE, CLAIMED = 'lane:afk', 'lane:proposed', 'lane:owner', 'state:claimed'
STARTED, OWNER_REVIEW, EPIC, TASK = 'state:started', 'review:owner', 'type:epic', 'type:task'
PRIORITIES = ('P0', 'P1', 'P2')
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
    # The owner rules beyond `protected`: paths (stored data, security rules), labels that
    # ship or deploy on merge, and the size of a change beyond docs and tests.
    'ownerPaths': [],
    'ownerLabels': [],
    'ownerLines': 800,
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
    paths = data.get('paths', [])
    if not isinstance(paths, list) or not all(isinstance(p, str) for p in paths):
        return None
    return {'paths': paths, 'dependencies': deps}


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
    if TASK in labels:
        return 'task'
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


def rank(issue, board=None):
    """Priority, then age. The board's Priority field decides; without a board value, a priority: label."""
    value = (board or {}).get(issue['number'])
    if value not in PRIORITIES:
        value = next((p for p in PRIORITIES if f'priority:{p}' in names(issue)), None)
    return (PRIORITIES.index(value) if value else len(PRIORITIES)), issue['number']


def out_of_scope(changed, paths, config):
    """Changed files outside the packet and the always-in-scope paths, or protected."""
    allowed = [*paths, *config['alwaysInScope']]
    return [f for f in changed
            if matches(config['protected'], f) or not any(covers(p, f) for p in allowed)]


# --- Triage and merge ------------------------------------------------------

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
    """How an approved PR lands: 'merge' now, 'update' its branch first, or 'queue'."""
    return {'CLEAN': 'merge', 'HAS_HOOKS': 'merge', 'BEHIND': 'update'}.get(merge_state, 'queue')


def renamed(pr):
    """Renamed or copied files, and files whose change type the host left out: their old path is
    not in the file list, so no gate can check it."""
    return [f['path'] for f in pr['files'] if f.get('changeType', 'RENAMED') in ('RENAMED', 'COPIED')]


def open_threads(pr):
    """Why unresolved review threads hold a PR, or None. A base branch that requires
    resolved conversations reports such a PR only as BLOCKED, so name the cause."""
    count = len(pr.get('unresolvedThreads') or [])
    if not count:
        return None
    return f"{count} unresolved review thread{'s' if count > 1 else ''}: answer, then resolve each"


def owner_rule(pr, config, scope):
    """The first owner rule the PR matches, or None.

    The list is closed and each rule reads data, never judgement: a PR that
    matches none merges without the owner. `scope` is the union of the scope
    packets of the issues the PR closes, or None when it closes none or one
    of them has no packet."""
    author = pr['author']['login']
    labels = names(pr)
    files = [f['path'] for f in pr['files']]
    if OWNER_REVIEW in labels:
        return f'labelled {OWNER_REVIEW}'
    if author != config['owner'] and author not in DEPENDABOT:
        return f'author {author} is neither the owner nor Dependabot'
    if not files or len(files) >= 100:
        return 'file list is empty or truncated'
    if renamed(pr):
        return 'renames hide their old path: ' + ', '.join(renamed(pr)[:5])
    owned = [f for f in files if matches(config['protected'] + config['ownerPaths'], f)]
    if owned:
        return 'touches owner paths: ' + ', '.join(owned[:5])
    shipping = sorted(labels & set(config['ownerLabels']))
    if shipping:
        return 'ships on merge: ' + ', '.join(shipping)
    breaking = major_bumps(pr) if author in DEPENDABOT else []
    if breaking:
        return 'major version update, a migration to plan: ' + ', '.join(breaking)
    product = [f for f in pr['files'] if not chore(f['path'], author, config)]
    if not product:
        return None
    lines = sum(f.get('additions', 0) + f.get('deletions', 0) for f in product)
    if lines > config['ownerLines']:
        return f"{lines} changed lines beyond docs and tests (limit {config['ownerLines']})"
    if scope is None:
        return 'closes no issue with a scope packet'
    outside = out_of_scope([f['path'] for f in product], scope, config)
    if outside:
        return "changes outside its issue's scope packet: " + ', '.join(outside[:5])
    return None


def triage(pr, config, scope):
    """('owner', rule), ('chore', how) or ('reviewed', how): who lets the PR land."""
    rule = owner_rule(pr, config, scope)
    if rule:
        return 'owner', rule
    author = pr['author']['login']
    if all(chore(f['path'], author, config) for f in pr['files']):
        return 'chore', 'docs, tests or Dependabot dependencies: merges on green checks'
    return 'reviewed', 'merges on green checks unless a review holds it'


REVIEW_MARKER = re.compile(r'<!-- agent-review sha=([0-9a-f]{40}) round=(\d+) verdict=(\w+) -->')
# Agent-written comments end with the host's attribution footer, e.g. `_Generated by <host>_`.
AGENT_FOOTER = re.compile(r'^_Generated by .+_\s*\Z', re.M)


def latest_agent_review(pr, reviewer):
    """(sha, round, verdict, submittedAt) of the PR's newest agent review, or None.

    Only reviews by the account the reviewer runs as count; anyone can type the marker."""
    found = [(m.group(1), int(m.group(2)), m.group(3), r.get('submittedAt') or '')
             for r in pr['reviews'] if r['author']['login'] == reviewer
             for m in [REVIEW_MARKER.search(r.get('body') or '')] if m]
    return max(found, key=lambda f: f[3]) if found else None


def requesting_changes(pr):
    """Reviewers whose newest approval, change request or dismissal requests changes."""
    latest = {}  # a person's later comment leaves their approval or change request standing
    for r in sorted(pr['reviews'], key=lambda r: r.get('submittedAt') or ''):
        if r['state'] in ('APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'):
            latest[r['author']['login']] = r['state']
    return sorted(login for login, state in latest.items() if state == 'CHANGES_REQUESTED')


def review_refusal(pr, config):
    """Why a PR no owner rule matches must not merge on green checks, or None. The
    session that opened it reviewed it first; a later review holds it when it
    requests changes, when the newest agent review finds problems at the head, or
    when a person commented after that review."""
    if requesting_changes(pr):
        return 'a review requests changes'
    review = latest_agent_review(pr, config['owner'])
    if review is None:
        return None
    sha, _, verdict, reviewed_at = review
    if sha == pr['headRefOid'] and verdict != 'ready':
        return f'its agent review says {verdict} at the head commit'
    newer = [c for c in pr['reviews'] + pr['comments']
             if (c.get('submittedAt') or c.get('createdAt') or '') > reviewed_at
             and not AGENT_FOOTER.search(c.get('body') or '')]
    if newer:
        return 'a person commented after the agent review'
    return None


def merge_refusal(pr, config, scope=None):
    """Why the PR may not merge on green checks, or None. An owner rule hands it to
    the owner; a review can hold anything that is not a chore."""
    if pr['state'] != 'OPEN' or pr['isDraft']:
        return 'not an open, ready PR'
    if pr['baseRefName'] != config['base'] or pr['headRepositoryOwner']['login'] != config['repo'].split('/')[0]:
        return f"not a branch of this repository into {config['base']}"
    if open_threads(pr):
        return open_threads(pr)
    kind, why = triage(pr, config, scope)
    if kind == 'owner':
        return 'for the owner: ' + why
    if kind == 'chore':
        return None
    return review_refusal(pr, config)


PASSED = ('SUCCESS', 'NEUTRAL', 'SKIPPED')


def check_state(check):
    """'pass', 'pending' or 'fail' for one entry of a PR's statusCheckRollup."""
    if check.get('__typename') == 'StatusContext':
        return {'SUCCESS': 'pass', 'PENDING': 'pending', 'EXPECTED': 'pending'}.get(check.get('state'), 'fail')
    if check.get('status') != 'COMPLETED':
        return 'pending'
    return 'pass' if check.get('conclusion') in PASSED else 'fail'


def first_line(text):
    return next((l.strip() for l in (text or '').splitlines() if l.strip()), '')[:100]


def blockers(pr):
    """Every reason the PR can't merge now; empty when nothing holds it. GitHub reports
    most of them only as BLOCKED, so an attended session reads them here before it
    calls the PR ready, hands it over, switches on auto-merge or merges it."""
    if pr['state'] != 'OPEN':
        return [f"not open: {pr['state']}"]
    base, found = pr['baseRefName'], []
    if pr['isDraft']:
        found.append('draft: mark it ready for review')
    states = [(check_state(c), c.get('name') or c.get('context')) for c in pr.get('statusCheckRollup') or []]
    found += [f'check failing: {name}' for state, name in states if state == 'fail']
    found += [f'check pending: {name}' for state, name in states if state == 'pending']
    merge_state = pr.get('mergeStateStatus')
    if pr.get('mergeable') == 'CONFLICTING' or merge_state == 'DIRTY':
        found.append(f'conflicts with {base}: merge origin/{base} and resolve')
    elif merge_state == 'BEHIND':
        found.append(f'behind {base}: update the branch')
    elif pr.get('mergeable') == 'UNKNOWN' or merge_state == 'UNKNOWN':
        found.append('mergeability not computed yet: run again')
    if open_threads(pr):
        found.append(open_threads(pr))
        for t in pr['unresolvedThreads']:
            where = t['path'] + (f":{t['line']}" if t.get('line') else '')
            writer = 'agent-written' if AGENT_FOOTER.search(t.get('body') or '') else f"@{t['author']}"
            found.append(f"  {where} ({writer}): {first_line(t.get('body'))}")
    found += [f'changes requested by @{login}' for login in requesting_changes(pr)]
    if not found and merge_state == 'BLOCKED':
        found.append('blocked by a rule of the base branch this command does not read (a required review?)')
    return found


def afk_in_flight(issues, with_pr):
    """AFK claims still being built; person-led starts never hold the queue."""
    return [i for i in issues if CLAIMED in names(i) and i['number'] not in with_pr]


# --- GitHub and Git I/O ----------------------------------------------------

def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=True).stdout


def paths(nul_separated):
    """Paths from `-z` git output; a path may hold spaces."""
    return [p for p in nul_separated.split('\0') if p]


def gh_json(*args):
    return json.loads(run('gh', *args) or 'null')


THREADS = ('query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) '
           '{ pullRequest(number: $number) { reviewThreads(first: 100) { nodes { isResolved path line '
           'originalLine comments(first: 1) { nodes { body author { login } } } } } } } }')


def unresolved_threads(repo_name, number):
    """The PR's open review threads, each {path, line, body, author} of its first comment;
    `gh pr view` doesn't report them."""
    owner, name = repo_name.split('/')
    data = gh_json('api', 'graphql', '-f', f'query={THREADS}', '-F', f'owner={owner}',
                   '-F', f'name={name}', '-F', f'number={number}')
    threads = data['data']['repository']['pullRequest']['reviewThreads']['nodes']
    found = []
    for t in threads:
        if t['isResolved']:
            continue
        first = (t['comments']['nodes'] or [{}])[0]
        found.append({'path': t['path'], 'line': t.get('line') or t.get('originalLine'),
                      'body': first.get('body') or '', 'author': (first.get('author') or {}).get('login', 'ghost')})
    return found


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
            return paths(run('git', 'ls-tree', '-r', '--name-only', '-z', self.base_ref, cwd=self.root))
        except subprocess.CalledProcessError:
            return paths(run('git', 'ls-files', '-z', cwd=self.root))

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

    def board_priorities(self):
        """Issue number -> the board's Priority value; empty without a board."""
        project = self.config.get('project')
        if not project:
            return {}
        try:
            items = gh_json('project', 'item-list', str(project['number']), '--owner', project['owner'],
                            '-L', '1000', '--format', 'json')['items']
        except (subprocess.CalledProcessError, ValueError, KeyError, TypeError):
            return {}  # no project scope or no board: labels still rank
        return {i['content']['number']: i.get('priority') for i in items
                if i.get('content', {}).get('type') == 'Issue' and i['content'].get('repository') == self.name}

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
    ready, board = None, repo.board_priorities()
    for issue in sorted((i for i in issues if AFK in names(i)), key=lambda i: rank(i, board)):
        reason = ineligible(issue, completed, issue['number'] in with_pr, tracked, repo.config)
        if reason:
            print(f"skipped: #{issue['number']} {reason}")
        elif ready is None:
            ready = issue
    if in_flight:
        print('next: none (one AFK issue at a time)')
    else:
        print(f"next: #{ready['number']} {ready['title']}" if ready else 'next: none')


def changed_files(root, base_ref):
    """Files changed since the merge base with base_ref, untracked ones included.

    --no-renames lists a moved file's old path too, so a move out of a protected path is caught."""
    merge_base = run('git', 'merge-base', base_ref, 'HEAD', cwd=root).strip()
    changed = set(paths(run('git', 'diff', '--name-only', '--no-renames', '-z', merge_base, cwd=root)))
    changed |= set(paths(run('git', 'ls-files', '--others', '--exclude-standard', '-z', cwd=root)))
    return sorted(changed)


def cmd_scope(repo, args):
    number = args[0]
    scope = packet(gh_json('issue', 'view', number, '-R', repo.name, '--json', 'body')['body'])
    if scope is None:
        sys.exit(f'#{number} has no scope packet.')
    changed = changed_files(repo.root, f"origin/{repo.config['base']}")
    outside = out_of_scope(changed, scope['paths'], repo.config)
    for path in outside:
        print(f'outside scope: {path}')
    if outside:
        sys.exit(1)
    print(f'✓ {len(changed)} changed files within #{number} scope')


PR_FIELDS = ('state,isDraft,baseRefName,headRefName,headRefOid,headRepositoryOwner,author,files,'
             'title,body,labels,reviews,comments,mergeStateStatus,closingIssuesReferences')


def closing_scope(repo, pr):
    """The union of the scope packets of the issues the PR closes, or None."""
    refs = pr.get('closingIssuesReferences') or []
    if not refs:
        return None
    scope = []
    for ref in refs:
        body = gh_json('issue', 'view', str(ref['number']), '-R', repo.name, '--json', 'body')['body']
        found = packet(body)
        if found is None or not found['paths']:
            return None
        scope += found['paths']
    return scope


def read_pr(repo, number):
    pr = gh_json('pr', 'view', number, '-R', repo.name, '--json', PR_FIELDS)
    pr['unresolvedThreads'] = unresolved_threads(repo.name, number)
    return pr, closing_scope(repo, pr)


def cmd_triage(repo, args):
    number = args[0]
    pr, scope = read_pr(repo, number)
    kind, why = triage(pr, repo.config, scope)
    print(f'#{number} {kind}: {why}')


def cmd_merge(repo, args):
    number = args[0]
    pr, scope = read_pr(repo, number)
    reason = merge_refusal(pr, repo.config, scope)
    if reason:
        print(f'#{number} waits: {reason}')
        return
    step = merge_step(pr['mergeStateStatus'])
    if step == 'merge':
        # The gate read this head; a commit pushed since lands only through the next run.
        run('gh', 'pr', 'merge', number, '-R', repo.name, '--squash',
            '--match-head-commit', pr['headRefOid'])
        print(f'#{number} merged: green and up to date')
        return
    if step == 'update':
        # Auto-merge never updates a branch that fell behind; do it so it can land.
        run('gh', 'pr', 'update-branch', number, '-R', repo.name)
    run('gh', 'pr', 'merge', number, '-R', repo.name, '--auto', '--squash')
    print(f'#{number} will squash-merge when required checks pass'
          + (' (branch updated)' if step == 'update' else ''))


def cmd_hold(repo, args):
    number = args[0]
    pr = gh_json('pr', 'view', number, '-R', repo.name, '--json', 'autoMergeRequest')
    if pr['autoMergeRequest'] is None:
        print(f'#{number} holds: auto-merge is off')
        return
    run('gh', 'pr', 'merge', number, '-R', repo.name, '--disable-auto')
    print(f'#{number} holds: auto-merge switched off until `lanes.py merge` runs again')


BLOCKER_FIELDS = 'url,state,isDraft,baseRefName,mergeable,mergeStateStatus,statusCheckRollup,reviews'


def cmd_blockers(args):
    """Read-only, and works in any repository gh can read: no lanes.json needed."""
    pr = gh_json('pr', 'view', args[0], '--json', BLOCKER_FIELDS)
    owner, name, _, number = pr['url'].split('/')[-4:]
    pr['unresolvedThreads'] = unresolved_threads(f'{owner}/{name}', number)
    found = blockers(pr)
    for line in found:
        print(line)
    if found:
        sys.exit(1)


# `automerge` and `merge-reviewed` are the names older wrappers call.
COMMANDS = {'next': cmd_next, 'scope': cmd_scope, 'triage': cmd_triage, 'merge': cmd_merge, 'hold': cmd_hold,
            'automerge': cmd_merge, 'merge-reviewed': cmd_merge}

if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == 'blockers':
        cmd_blockers(sys.argv[2:])
    elif len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    else:
        COMMANDS[sys.argv[1]](Repo(), sys.argv[2:])
