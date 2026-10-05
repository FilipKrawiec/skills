#!/usr/bin/env python3
"""Pre-tool-use guard for issue lanes: agents build and propose; the owner ships.

Active only in projects with `.github/lanes.json`. Blocks shell commands that
merge PRs, publish releases, dispatch workflows, or change secrets, variables
or repository settings, plus the project's own `guard` rules from lanes.json.
PRs merge through `lanes.py merge`, which hands the owner only what an owner rule matches. `lane:afk` may be added only in a
session the owner is in; scheduled runs (and unreadable transcripts) never add it.
Each issue works in its own worktree: edits to a file in an opted-in project's
main checkout, and `git switch` or `git checkout` run there, are blocked.
An edit to lanes.json, and `lanes.py merge --owner-approved` (a merge past the
owner rules), are blocked, except in an attended session in manual permission
mode, where the host asks the owner to approve them.

Hook input: the host's pre-tool-use event as JSON on stdin (`tool_name`,
`tool_input.command`, `cwd`, `transcript_path`, `permission_mode`). Exit 2
blocks; a `permissionDecision` of `ask` on stdout hands the call to the owner.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

OWNER_RUNS_IT = 'The owner runs this themselves.'

MERGE_IS_OWNERS = 'Merging goes through `lanes.py merge`, or the owner.'
RULES = [
    (r'\bgh\s+pr\s+merge\b', MERGE_IS_OWNERS),
    # A query file, --input or shell substitution hides the mutation, so each counts as a merge.
    (r'\bgh\s+api\b.*(--input\b|\$\(|`)', MERGE_IS_OWNERS),
    (r'\bgh\s+alias\s+(set|import)\b', 'Aliases hide commands from the guard.'),
    (r'\bgh\s+api\b.*(\bpulls/[^/\s]+/merge\b|\brepos/[^/\s]+/[^/\s]+/merges\b|\bmergePullRequest\b'
     r'|\benablePullRequestAutoMerge\b|\bquery=@)', MERGE_IS_OWNERS),
    (r'\bgh\s+release\s+(create|edit|delete|upload)\b', 'Releases are the owner\'s. ' + OWNER_RUNS_IT),
    (r'\bgh\s+(secret|variable)\s+(set|delete|remove)\b', 'Secrets and variables are the owner\'s.'),
    (r'\bgh\s+repo\s+(edit|delete|rename|archive)\b', 'Repository settings are the owner\'s.'),
    (r'\bgh\s+workflow\s+(run|enable|disable)\b', 'Dispatched workflows can publish. ' + OWNER_RUNS_IT),
    (r'\bgh\s+api\b.*\brepos/[^/\s]+/[^/\s]+/(branches/[^\s]+/protection|rulesets|environments|actions/(secrets|variables)'
     r'|dependabot/secrets|codespaces/secrets|collaborators|keys|hooks)\b',
     'Repository security settings are the owner\'s.'),
    (r'\bgh\s+api\b(?=.*(-X|--method)[=\s]*(PATCH|PUT|POST|DELETE)\b).*\brepos/[\w.-]+/[\w.-]+/?(["\'\s]|$)',
     'Repository settings are the owner\'s.'),
]

MARKS_AFK = [
    r'\bgh\b.*(--add-label|--label|\s-l)[=\s]+["\']?[^\s"\']*\blane:afk\b',
    r'\bgh\b.*(--add-label|--label|\s-l)[=\s]+["\']?\$',  # a variable may hold lane:afk
    r'\bgh\s+api\b(?!.*-X\s*DELETE).*(/labels\b|labels\[\]=).*\blane:afk\b',
]
UNATTENDED_AFK = 'Unattended runs never mark an issue AFK; the owner approves it in a session.'


OWN_WORKTREE = ('Each issue works in its own worktree; the main checkout keeps its branch and may hold '
                'the owner\'s work. Enter the issue\'s worktree first (board.md, Claim or Start).')
# `git checkout -- <path>` restores files and leaves the branch alone.
SWITCHES_BRANCH = r'\bgit\s+(switch|checkout)\b(?![^;&|\n]*\s--(\s|$))'

GLOBAL_FLAGS = re.compile(r'\s(?:-R|--repo|--hostname)(?:=|\s+)\S+')
BLOCKED_TOOLS = {'mcp__github__merge_pull_request', 'mcp__github__enable_pr_auto_merge'}
EDIT_TOOLS = ('Edit', 'Write', 'MultiEdit', 'NotebookEdit')
CONFIG_FILE = '.github/lanes.json'
OWNERS_CONFIG = (f'{CONFIG_FILE} is the owner\'s: the owner edits it, or approves the edit in a session '
                 'in manual permission mode.')
ASK_OWNER = f'{CONFIG_FILE} is the owner\'s: approve this edit only if you asked for it.'
# The one form that merges past the owner rules: lanes.py by a literal path (quoted when it holds a space),
# one PR number as it is, nothing else in the command. Matching the whole command keeps the shell from
# rewriting anything between this check and lanes.py's argv.
APPROVED_FORM = re.compile(r'\s*python3\s+(?:"[^"$`\\]*lanes\.py"|\'[^\']*lanes\.py\'|[^\s"\'$`\\;&|<>()]*lanes\.py)'
                           r'\s+merge\s+(\d+)\s+--owner-approved\s*')
LANES_MERGE = r'\blanes\b[^;&|\n]*?\b(?:merge|automerge|merge-reviewed)\b([^;&|\n]*)'
APPROVED_MERGE = ('A merge past the owner rules runs only in a session the owner is in, in manual permission mode, '
                  'where the host asks them.')
APPROVAL_FORM = ('The owner\'s approval merges only as `python3 <path>/lanes.py merge <PR> --owner-approved`, alone '
                 'in its command, and a `lanes merge` takes its PR number as it is, never from a `$` or backtick.')
ASK_MERGE = 'An owner rule holds {pr}: approve this merge only if you approved {pr} in this session.'


def approved_merge(command):
    """'#N' when the command is exactly the form that merges PR N past the owner rules, else None."""
    match = APPROVED_FORM.fullmatch(command)
    return f'#{match.group(1)}' if match else None


def approval_refusal(command):
    """Why a command that may carry the owner's approval in any other form is blocked, or None.

    The guard is the only gate on the flag, so it fails closed: with the shell's quotes, backslashes and
    line continuations dropped, the flag anywhere in the command counts (a variable or a pipe may carry
    it), and so does any `$` or backtick in a lanes merge call's own arguments."""
    plain = re.sub(r'["\'\\]', '', command.replace('\\\n', ' '))
    call = re.search(LANES_MERGE, plain)
    if 'owner-approved' in plain or (call and re.search(r'[$`]', call.group(1))):
        return APPROVAL_FORM
    return None


def main_checkout(path):
    """The main checkout holding `path`, or None in a linked worktree (`.git` is a file) or outside a repository."""
    path = Path(path).absolute()
    for directory in (path, *path.parents):
        marker = directory / '.git'
        if marker.exists():
            return directory if marker.is_dir() else None
    return None


def refusal(command, unattended=True, extra=(), base='main', in_main_checkout=False):
    """The reason a shell command is blocked, or None."""
    plain = GLOBAL_FLAGS.sub(' ', command)  # `gh -R o/r pr merge` reads as `gh pr merge`
    # The push rule reads only its own command: it stops at `&&`, `||`, `;`, `|` and newlines.
    rules = [*RULES, *extra, (rf'\bgit\s+push\b[^;&|\n]*(\s|:){re.escape(base)}(\s|$|[;&|])',
                              f'Pushing to {base} is the owner\'s; work lands through a PR.')]
    for pattern, reason in rules:
        if re.search(pattern, plain):
            return reason
    if in_main_checkout and re.search(SWITCHES_BRANCH, plain):
        return OWN_WORKTREE
    if unattended and any(re.search(p, plain) for p in MARKS_AFK):
        return UNATTENDED_AFK
    return None


def tool_refusal(tool_name, tool_input):
    """Why a non-shell tool call is blocked, or None."""
    if tool_name in BLOCKED_TOOLS:
        return MERGE_IS_OWNERS
    target = str(tool_input.get('file_path') or tool_input.get('notebook_path') or '')
    if tool_name not in EDIT_TOOLS or not target:
        return None
    if target.endswith(CONFIG_FILE):
        return OWNERS_CONFIG
    checkout = main_checkout(target)
    if checkout and (checkout / CONFIG_FILE).is_file():
        return OWN_WORKTREE
    return None


def is_unattended(transcript_path):
    """A scheduled-task run, or a transcript that can't be read (fail closed)."""
    try:
        with open(transcript_path) as transcript:
            for line in transcript:
                entry = json.loads(line)
                if entry.get('type') == 'user':
                    return '<scheduled-task' in json.dumps(entry.get('message', ''))
    except (OSError, TypeError, ValueError):
        pass
    return True


def owner_approves(event):
    """An attended session in manual permission mode, where the host asks the owner before each edit."""
    return event.get('permission_mode') == 'default' and not is_unattended(event.get('transcript_path'))


def project_root(cwd):
    """The repository containing the session's working directory, or the directory itself."""
    try:
        top = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=cwd,
                             capture_output=True, text=True, check=True).stdout.strip()
        return Path(top)
    except (OSError, TypeError, ValueError, subprocess.CalledProcessError):
        return Path(cwd) if cwd else None


def project_config(project_dir):
    """(extra rules, base branch), or None when the project hasn't opted in.

    A rule without `pattern` and `reason` strings raises, and main() then fails closed."""
    try:
        config = json.loads((Path(project_dir) / CONFIG_FILE).read_text())
    except (OSError, TypeError, ValueError):
        return None
    rules = [(rule['pattern'], rule['reason']) for rule in config.get('guard', [])]
    if not all(isinstance(x, str) for rule in rules for x in rule):
        raise ValueError('every lanes.json guard rule needs string `pattern` and `reason`')
    return rules, config.get('base', 'main')


def main():
    event = json.load(sys.stdin)
    project = project_config(project_root(event.get('cwd')))
    if project is None:
        return 0
    extra, base = project
    tool_input = event.get('tool_input') or {}
    if event.get('tool_name') == 'Bash':
        in_main = bool(event.get('cwd')) and main_checkout(event['cwd']) is not None
        command = tool_input.get('command', '')
        reason = refusal(command, is_unattended(event.get('transcript_path')), extra, base, in_main)
        approved = None if reason else approved_merge(command)
        if approved and owner_approves(event):
            print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'ask',
                                                     'permissionDecisionReason': ASK_MERGE.format(pr=approved)}}))
            return 0
        reason = reason or (APPROVED_MERGE if approved else approval_refusal(command))
    else:
        reason = tool_refusal(event.get('tool_name'), tool_input)
        if reason == OWNERS_CONFIG and owner_approves(event):
            print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'permissionDecision': 'ask',
                                                     'permissionDecisionReason': ASK_OWNER}}))
            return 0
    if reason:
        print(f'Blocked by the lanes guard: {reason}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:  # fail closed: a guard that cannot decide blocks
        print(f'Blocked by the lanes guard: it could not run ({error})', file=sys.stderr)
        sys.exit(2)
