#!/usr/bin/env python3
"""Issue lanes: the AFK queue, chore auto-merge, the board, labels and tidy.

GitHub Issues are the only queue. Every open issue carries one lane label:
`lane:afk` (the owner approved unattended delivery), `lane:proposed` (an agent
recommends AFK) or `lane:owner`. The optional Project board is derived from
issues. A repository opts in with `.github/lanes.json` (see references/setup.md).

Usage: lanes.py next                 # next AFK issue; in flight, skipped, untriaged
       lanes.py claim N              # claim N and create its worktree from origin/<base>
       lanes.py scope N              # changed files outside N's scope packet
       lanes.py park N MESSAGE       # hand N back to the owner with one question
       lanes.py automerge PR         # squash auto-merge PR on green checks if it is a chore
       lanes.py board [--apply]      # derive Project status and priority from issues
       lanes.py labels [--apply]     # sync labels with the lane set plus lanes.json
       lanes.py tidy [--apply]       # remove AFK runs' own worktrees and branches once finished
Standard library only; needs git and an authenticated gh.
"""
import json
import re
import socket
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

AFK, PROPOSED, OWNER_LANE, CLAIMED = 'lane:afk', 'lane:proposed', 'lane:owner', 'state:claimed'
EPIC = 'type:epic'
PRIORITIES = ('priority:P0', 'priority:P1', 'priority:P2')
STATUSES = ('Triage', 'Proposed', 'Owner', 'AFK', 'Running', 'Review', 'Done')
STATUS_COLORS = {'Triage': 'GRAY', 'Proposed': 'PURPLE', 'Owner': 'ORANGE', 'AFK': 'BLUE',
                 'Running': 'YELLOW', 'Review': 'PINK', 'Done': 'GREEN'}
LANE_LABELS = {
    AFK: ('1d76db', 'Owner-approved: an agent may deliver this unattended'),
    PROPOSED: ('8250df', 'An agent recommends AFK; the owner decides'),
    OWNER_LANE: ('d93f0b', 'Needs the owner: a decision, credentials, settings or a device'),
    CLAIMED: ('fbca04', 'An AFK run is working on it now'),
    EPIC: ('3e4b9e', 'Umbrella outcome with sub-issues'),
}
DEPENDABOT = {'app/dependabot', 'dependabot[bot]'}

# Lists in lanes.json extend these; scalars replace them.
DEFAULTS = {
    'base': 'main',
    'worktrees': '.worktrees',
    'branchPrefix': 'agent/afk-',
    'staleClaimHours': 3,
    # Top-level dot-directories hold automation, agent and editor configuration.
    'protected': [r'^\.[^/]+/', r'(^|/)AGENTS\.md$', r'(^|/)([Jj]ustfile|Makefile)$'],
    'alwaysInScope': [],
    'chores': [r'^docs/', r'\.md$', r'(^|/)tests?/'],
    'dependencyFiles': [r'(^|/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|pubspec\.(yaml|lock)'
                        r'|requirements[^/]*\.txt|poetry\.lock|uv\.lock|go\.(mod|sum)|Cargo\.(toml|lock))$'],
    'labels': {},
    'renames': {},
}

PACKET = re.compile(r'```(?:scope|factory)\s*(\{.*?\})\s*```', re.S)
ACCEPTANCE = re.compile(r'^#+\s*Acceptance criteria\s*\n+\s*\S', re.M | re.I)


def load_config(root):
    data = json.loads((Path(root) / '.github' / 'lanes.json').read_text())
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


def slug(title):
    words = re.sub(r'^\w+(\([^)]*\))?:\s*', '', title).lower()
    return '-'.join(re.findall(r'[a-z0-9]+', words)[:5]) or 'task'


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
    product = [f for f in files if not chore(f, author, config)]
    if product:
        return 'changes more than docs, tests or dependencies: ' + ', '.join(product[:5])
    return None


# --- Board and tidy --------------------------------------------------------

def afk_owned(branch, path, root, config):
    """Whether an AFK run created this branch (and worktree, when a path is given)."""
    if not branch or not branch.startswith(config['branchPrefix']):
        return False
    return path is None or (Path(path).parent == Path(root) / config['worktrees']
                            and Path(path).name.startswith('afk-'))


def status(issue, pr_open):
    labels = names(issue)
    if issue['state'] == 'CLOSED':
        return 'Done'
    if pr_open:
        return 'Review'
    if CLAIMED in labels:
        return 'Running'
    for label, name in ((AFK, 'AFK'), (PROPOSED, 'Proposed'), (OWNER_LANE, 'Owner'), (EPIC, 'Owner')):
        if label in labels:
            return name
    return 'Triage'


def priority(issue):
    return next((p.split(':')[1] for p in PRIORITIES if p in names(issue)), None)


def tidy_action(pr_state, dirty):
    """'remove' a finished, clean checkout or branch; otherwise why it stays."""
    if pr_state in ('MERGED', 'CLOSED'):
        return 'keep: uncommitted changes' if dirty else 'remove'
    return 'keep: open PR' if pr_state == 'OPEN' else 'keep: no PR yet'


def label_plan(current, config):
    """(action, name, color, description) steps that make GitHub match the lane set."""
    wanted = {name: {'color': c, 'description': d} for name, (c, d) in LANE_LABELS.items()}
    wanted.update(config['labels'])
    current = dict(current)
    steps = []
    for old, new in config['renames'].items():
        if old in current and new not in current:
            steps.append(('rename', old, new, None))
            current[new] = current.pop(old)
    for name, want in wanted.items():
        have = current.get(name)
        if not (have and have['color'].lower() == want['color'].lower()
                and have['description'] == want['description']):
            steps.append(('update' if have else 'create', name, want['color'], want['description']))
    for name in sorted(set(current) - set(wanted)):
        steps.append(('delete', name, None, None))
    return steps


# --- GitHub and Git I/O ----------------------------------------------------

def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=True).stdout


def gh_json(*args):
    return json.loads(run('gh', *args) or 'null')


class Repo:
    def __init__(self):
        self.root = Path(run('git', 'rev-parse', '--show-toplevel').strip())
        self.config = load_config(self.root)
        self.name = self.config['repo']

    def main_checkout(self):
        common = run('git', 'rev-parse', '--path-format=absolute', '--git-common-dir').strip()
        return Path(common).parent

    def tracked(self):
        return run('git', 'ls-files', cwd=self.root).split()

    def open_issues(self):
        return gh_json('issue', 'list', '-R', self.name, '-s', 'open', '-L', '500',
                       '--json', 'number,title,body,labels,state,url')

    def closed_issues(self):
        return gh_json('issue', 'list', '-R', self.name, '-s', 'closed', '-L', '1000',
                       '--json', 'number,labels,state,url,stateReason')

    def issues_with_open_prs(self):
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
    in_flight = [i for i in issues if CLAIMED in names(i) and i['number'] not in with_pr]
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


def cmd_claim(repo, args):
    number = int(args[0])
    issue = gh_json('issue', 'view', str(number), '-R', repo.name,
                    '--json', 'number,title,body,labels,state,url')
    completed = {i['number'] for i in repo.closed_issues() if i['stateReason'] == 'COMPLETED'}
    reason = ineligible(issue, completed, number in repo.issues_with_open_prs(),
                        repo.tracked(), repo.config)
    if reason:
        sys.exit(f'#{number} cannot be claimed: {reason}')
    if any(CLAIMED in names(i) for i in repo.open_issues()):
        sys.exit('Another AFK issue is in flight; run one at a time.')
    root, base = repo.main_checkout(), repo.config['base']
    branch = f"{repo.config['branchPrefix']}{number}-{slug(issue['title'])}"
    worktree = root / repo.config['worktrees'] / f'afk-{number}'
    run('git', 'fetch', '--quiet', 'origin', base, cwd=root)
    run('git', 'worktree', 'add', '--quiet', '-b', branch, str(worktree), f'origin/{base}', cwd=root)
    run('gh', 'issue', 'edit', str(number), '-R', repo.name, '--add-label', CLAIMED)
    run('gh', 'issue', 'comment', str(number), '-R', repo.name, '--body',
        f'Claimed by an AFK run on `{socket.gethostname()}`. Branch `{branch}`.')
    print(f'worktree: {worktree}\nbranch: {branch}')


def cmd_scope(repo, args):
    number = args[0]
    scope = packet(gh_json('issue', 'view', number, '-R', repo.name, '--json', 'body')['body'])
    if scope is None:
        sys.exit(f'#{number} has no scope packet.')
    merge_base = run('git', 'merge-base', f"origin/{repo.config['base']}", 'HEAD').strip()
    changed = set(run('git', 'diff', '--name-only', merge_base, cwd=repo.root).split())
    changed |= set(run('git', 'ls-files', '--others', '--exclude-standard', cwd=repo.root).split())
    outside = out_of_scope(sorted(changed), scope['paths'], repo.config)
    for path in outside:
        print(f'outside scope: {path}')
    if outside:
        sys.exit(1)
    print(f'✓ {len(changed)} changed files within #{number} scope')


def cmd_park(repo, args):
    number, message = args[0], ' '.join(args[1:])
    if not message:
        sys.exit('park needs the question for the owner.')
    run('gh', 'issue', 'edit', number, '-R', repo.name, '--remove-label', f'{AFK},{CLAIMED}',
        '--add-label', OWNER_LANE)
    run('gh', 'issue', 'comment', number, '-R', repo.name, '--body',
        f'**Parked for the owner by an AFK run.**\n\n{message}\n\n'
        f'Answer here and re-apply `{AFK}` to hand it back.')
    print(f'#{number} parked as {OWNER_LANE}')


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


PROJECT_QUERY = '''query($login:String!,$number:Int!){repositoryOwner(login:$login){
  ... on ProjectV2Owner{projectV2(number:$number){id fields(first:50){nodes{
  ... on ProjectV2SingleSelectField{id name options{id name}}}}}}}}'''
OPTIONS_MUTATION = '''mutation($field:ID!,$options:[ProjectV2SingleSelectFieldOptionInput!]){
  updateProjectV2Field(input:{fieldId:$field,singleSelectOptions:$options}){clientMutationId}}'''


def project_fields(project):
    data = gh_json('api', 'graphql', '-f', f'query={PROJECT_QUERY}',
                   '-f', f"login={project['owner']}", '-F', f"number={project['number']}")
    found = data['data']['repositoryOwner']['projectV2']
    return found['id'], {f['name']: f for f in found['fields']['nodes'] if f}


def ensure_status_options(project, field, apply):
    if [o['name'] for o in field['options']] == list(STATUSES):
        return field
    print('status options: ' + ' → '.join(STATUSES))
    if not apply:
        return None
    options = [{'name': s, 'color': STATUS_COLORS[s], 'description': ''} for s in STATUSES]
    body = {'query': OPTIONS_MUTATION, 'variables': {'field': field['id'], 'options': options}}
    subprocess.run(['gh', 'api', 'graphql', '--input', '-'], input=json.dumps(body),
                   check=True, text=True, capture_output=True)
    return project_fields(project)[1]['Status']


def set_option(project_id, item_id, field, name):
    option = next(o['id'] for o in field['options'] if o['name'] == name)
    run('gh', 'project', 'item-edit', '--project-id', project_id, '--id', item_id,
        '--field-id', field['id'], '--single-select-option-id', option)


def cmd_board(repo, args):
    project = repo.config.get('project')
    if not project:
        sys.exit('lanes.json has no "project": {"owner": ..., "number": ...}.')
    apply = '--apply' in args
    project_id, fields = project_fields(project)
    status_field = ensure_status_options(project, fields['Status'], apply)
    items = gh_json('project', 'item-list', str(project['number']), '--owner', project['owner'],
                    '-L', '1000', '--format', 'json')['items']
    on_board = {i['content'].get('url'): i for i in items if i.get('content')}
    with_pr = repo.issues_with_open_prs()
    closed = [c for c in repo.closed_issues() if c['url'] in on_board]
    changes = 0
    for issue in repo.open_issues() + closed:
        item = on_board.get(issue['url'])
        want, want_priority = status(issue, issue['number'] in with_pr), priority(issue)
        # Without a priority label, a priority set on the board stays.
        if item and item.get('status') == want and want_priority in (None, item.get('priority')):
            continue
        changes += 1
        print(f"#{issue['number']}: {item.get('status') if item else 'not on board'} → {want}")
        if not apply or status_field is None:
            continue
        if item is None:
            item = gh_json('project', 'item-add', str(project['number']), '--owner', project['owner'],
                           '--url', issue['url'], '--format', 'json')
        set_option(project_id, item['id'], status_field, want)
        if want_priority and 'Priority' in fields:
            set_option(project_id, item['id'], fields['Priority'], want_priority)
    print(f'{changes} board changes' + ('' if apply else ' (dry run; --apply to write)'))


def cmd_labels(repo, args):
    apply = '--apply' in args
    current = {l['name']: l for l in gh_json('label', 'list', '-R', repo.name, '-L', '500',
                                              '--json', 'name,color,description')}
    for action, name, color, description in label_plan(current, repo.config):
        print(f'{action} {name}' + (f' → {color}' if action == 'rename' else ''))
        if not apply:
            continue
        if action == 'rename':
            run('gh', 'label', 'edit', name, '-R', repo.name, '--name', color)
        elif action == 'delete':
            run('gh', 'label', 'delete', name, '-R', repo.name, '--yes')
        else:
            run('gh', 'label', 'create', name, '-R', repo.name, '--force',
                '--color', color, '--description', description)
    if not apply:
        print('(dry run; --apply to write)')


def worktrees(root):
    entries, entry = [], {}
    for line in run('git', 'worktree', 'list', '--porcelain', cwd=root).splitlines() + ['']:
        if not line:
            if entry:
                entries.append(entry)
            entry = {}
            continue
        key, _, value = line.partition(' ')
        entry[key] = value or True
    return entries


def cmd_tidy(repo, args):
    apply = '--apply' in args
    root, here = repo.main_checkout(), Path.cwd().resolve()
    prs = {}
    for pr in gh_json('pr', 'list', '-R', repo.name, '-s', 'all', '-L', '1000',
                      '--json', 'headRefName,state'):
        if prs.get(pr['headRefName']) != 'OPEN':
            prs[pr['headRefName']] = pr['state']
    run('git', 'fetch', '--quiet', '--prune', 'origin', cwd=root)
    kept = set()
    for wt in worktrees(root)[1:]:
        path, branch = Path(wt['worktree']), wt.get('branch', '').replace('refs/heads/', '')
        # Only AFK runs' own worktrees: other sessions may still be working in theirs.
        if not afk_owned(branch, path, root, repo.config):
            continue
        if wt.get('prunable') or not path.exists():
            print(f'prune missing worktree {path}')
            if apply:
                run('git', 'worktree', 'prune', cwd=root)
            continue
        if here == path or path in here.parents:
            kept.add(branch)
            continue
        dirty = bool(run('git', 'status', '--porcelain', cwd=path).strip())
        action = tidy_action(prs.get(branch), dirty)
        print(f'{action}: worktree {path} ({branch})')
        if action == 'remove' and apply:
            run('git', 'worktree', 'remove', str(path), cwd=root)
        elif action != 'remove':
            kept.add(branch)
    for branch in run('git', 'for-each-ref', '--format=%(refname:short)', 'refs/heads', cwd=root).split():
        if (afk_owned(branch, None, root, repo.config) and branch not in kept
                and tidy_action(prs.get(branch), False) == 'remove'):
            print(f'remove: branch {branch}')
            if apply:
                run('git', 'branch', '-D', branch, cwd=root)
    remote = run('git', 'for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin', cwd=root)
    for branch in remote.split():
        if afk_owned(branch, None, root, repo.config) and prs.get(branch) in ('MERGED', 'CLOSED'):
            print(f'remove: origin/{branch}')
            if apply:
                run('git', 'push', '--quiet', 'origin', '--delete', branch, cwd=root)
    if not apply:
        print('(dry run; --apply to remove)')


COMMANDS = {'next': cmd_next, 'claim': cmd_claim, 'scope': cmd_scope, 'park': cmd_park,
            'automerge': cmd_automerge, 'board': cmd_board, 'labels': cmd_labels, 'tidy': cmd_tidy}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        sys.exit(__doc__)
    COMMANDS[sys.argv[1]](Repo(), sys.argv[2:])
