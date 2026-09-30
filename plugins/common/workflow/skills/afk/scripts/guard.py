#!/usr/bin/env python3
"""PreToolUse guard for issue lanes: agents build and propose; the owner ships.

Active only in projects with `.github/lanes.json`. Blocks shell commands that
merge PRs, publish releases, dispatch workflows, or change secrets, variables
or repository settings, plus the project's own `guard` rules from lanes.json.
Chore PRs merge through `lanes.py automerge`. `lane:afk` may be added only in a
session the owner is in; scheduled runs (and unreadable transcripts) never add it.

Hook input: the Claude Code PreToolUse event as JSON on stdin. Exit 2 blocks.
"""
import json
import os
import re
import sys
from pathlib import Path

OWNER_RUNS_IT = 'The owner runs this: ask them, or they type it with a leading `!`.'

RULES = [
    (r'\bgh\s+pr\s+merge\b', 'Merging is the owner\'s; chore PRs use `lanes.py automerge`.'),
    (r'\bgh\s+release\s+(create|edit|delete|upload)\b', 'Releases are the owner\'s. ' + OWNER_RUNS_IT),
    (r'\bgh\s+(secret|variable)\s+(set|delete|remove)\b', 'Secrets and variables are the owner\'s.'),
    (r'\bgh\s+repo\s+(edit|delete|rename|archive)\b', 'Repository settings are the owner\'s.'),
    (r'\bgh\s+workflow\s+(run|enable|disable)\b', 'Dispatched workflows can publish. ' + OWNER_RUNS_IT),
    (r'\bgh\s+api\b.*\b(protection|rulesets|environments|secrets|variables|collaborators|keys|hooks)\b',
     'Repository security settings are the owner\'s.'),
    (r'\bgh\s+api\b(?=.*(-X|--method)[=\s]*(PATCH|PUT|POST|DELETE)\b).*\brepos/[\w.-]+/[\w.-]+/?(["\'\s]|$)',
     'Repository settings are the owner\'s.'),
]

MARKS_AFK = [
    r'\bgh\b.*(--add-label|--label|\s-l)[=\s]+["\']?[^\s"\']*\blane:afk\b',
    r'\bgh\s+api\b(?!.*-X\s*DELETE).*\blane:afk\b',
]
UNATTENDED_AFK = 'Unattended runs never mark an issue AFK; the owner approves it in a session.'


def refusal(command, unattended=True, extra=()):
    """The reason a shell command is blocked, or None."""
    for pattern, reason in [*RULES, *extra]:
        if re.search(pattern, command):
            return reason
    if unattended and any(re.search(p, command) for p in MARKS_AFK):
        return UNATTENDED_AFK
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


def project_rules(project_dir):
    """The project's extra rules, or None when the project hasn't opted in."""
    try:
        config = json.loads((Path(project_dir) / '.github' / 'lanes.json').read_text())
    except (OSError, TypeError, ValueError):
        return None
    return [(rule['pattern'], rule['reason']) for rule in config.get('guard', [])]


def main():
    event = json.load(sys.stdin)
    if event.get('tool_name') != 'Bash':
        return 0
    extra = project_rules(os.environ.get('CLAUDE_PROJECT_DIR') or event.get('cwd'))
    if extra is None:
        return 0
    reason = refusal(event.get('tool_input', {}).get('command', ''),
                     is_unattended(event.get('transcript_path')), extra)
    if reason:
        print(f'Blocked by the issue-lanes guard: {reason}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
