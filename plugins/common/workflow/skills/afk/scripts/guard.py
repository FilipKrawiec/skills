#!/usr/bin/env python3
"""Pre-tool-use guard for issue lanes: agents build and propose; the owner ships.

Active only in projects with `.github/lanes.json`. Blocks shell commands that
merge PRs, publish releases, dispatch workflows, or change secrets, variables
or repository settings, plus the project's own `guard` rules from lanes.json.
PRs merge through `lanes.py merge`, which hands the owner only what an owner rule matches. `lane:afk` may be added only in a
session the owner is in; scheduled runs (and unreadable transcripts) never add it.

Hook input: the host's pre-tool-use event as JSON on stdin (`tool_name`,
`tool_input.command`, `cwd`, `transcript_path`). Exit 2 blocks.
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


GLOBAL_FLAGS = re.compile(r'\s(?:-R|--repo|--hostname)(?:=|\s+)\S+')
BLOCKED_TOOLS = {'mcp__github__merge_pull_request', 'mcp__github__enable_pr_auto_merge'}
CONFIG_FILE = '.github/lanes.json'


def refusal(command, unattended=True, extra=(), base='main'):
    """The reason a shell command is blocked, or None."""
    plain = GLOBAL_FLAGS.sub(' ', command)  # `gh -R o/r pr merge` reads as `gh pr merge`
    # The push rule reads only its own command: it stops at `&&`, `||`, `;`, `|` and newlines.
    rules = [*RULES, *extra, (rf'\bgit\s+push\b[^;&|\n]*(\s|:){re.escape(base)}(\s|$|[;&|])',
                              f'Pushing to {base} is the owner\'s; work lands through a PR.')]
    for pattern, reason in rules:
        if re.search(pattern, plain):
            return reason
    if unattended and any(re.search(p, plain) for p in MARKS_AFK):
        return UNATTENDED_AFK
    return None


def tool_refusal(tool_name, tool_input):
    """Why a non-shell tool call is blocked, or None."""
    if tool_name in BLOCKED_TOOLS:
        return MERGE_IS_OWNERS
    if tool_name in ('Edit', 'Write', 'MultiEdit', 'NotebookEdit') \
            and str(tool_input.get('file_path', '')).endswith(CONFIG_FILE):
        return f'{CONFIG_FILE} is the owner\'s.'
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
        reason = refusal(tool_input.get('command', ''), is_unattended(event.get('transcript_path')), extra, base)
    else:
        reason = tool_refusal(event.get('tool_name'), tool_input)
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
