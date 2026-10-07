#!/usr/bin/env python3
"""Post-tool-use hook: after a shell call pushes a branch, name the review threads and change
requests open on its PR, draft or ready.

A review agent posts threads while a session works, and nothing tells the session they came:
it learns of them only by asking. So every push asks for it, and the answer lands in the
session's context beside the push, where board.md's Merge gate says to settle each one before
the PR is reported.

Hook input: the host's post-tool-use event as JSON on stdin (`tool_name`, `tool_input`, `cwd`).
Prints a `hookSpecificOutput` with `additionalContext` when anything is open; never fails the call.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import guard  # noqa: E402
import lanes  # noqa: E402

PUSH_VALUED = {'--repo', '-o', '--push-option', '--receive-pack', '--exec'}


def commands(script):
    """Every simple command `script` runs, its substitutions' included."""
    yield from script.commands
    for nested in script.substituted:
        yield from commands(nested)


def pushed_branches(text, cwd):
    """The branches the shell line `text` pushes, as named on the remote; `HEAD` reads as the branch
    checked out where it runs. A line the parser can't read pushes nothing it can name."""
    try:
        script = guard.parse(text)
    except guard.MISREAD:
        return []
    found = []
    for command in commands(script):
        argv = guard.unwrap([guard.literal(word) for word in command.argv])
        if not argv or os.path.basename(argv[0]) != 'git':
            continue
        args, directory = argv[1:], cwd
        while args and args[0].startswith('-'):
            flag = args.pop(0)
            if flag in guard.GIT_VALUED and args:
                value = args.pop(0)
                if flag == '-C':
                    directory = str(Path(directory or '.') / value)
        if args[:1] != ['push'] or {'--delete', '-d', '--tags'} & set(args):
            continue
        for refspec in guard.positionals(args[1:], PUSH_VALUED)[1:] or ['HEAD']:
            branch = re.sub(r'^(refs/)?heads/', '', refspec.lstrip('+').split(':')[-1])
            if branch in ('HEAD', '@'):
                branch = guard.current_branch(directory)
            if branch and not guard.unknown(branch) and branch not in found:
                found.append(branch)
    return found


def open_review(branch, cwd):
    """(PR url, lines naming each open thread and change request) for `branch`'s open PR, or None."""
    try:
        pr = json.loads(subprocess.run(['gh', 'pr', 'view', branch, '--json', 'url,state,reviews'], cwd=cwd,
                                       capture_output=True, text=True, check=True).stdout)
        if pr['state'] != 'OPEN':
            return None
        pr['unresolvedThreads'] = lanes.unresolved_threads(*lanes.pr_ref(pr['url']))
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError):
        return None
    lines = lanes.review_holds(pr)
    return (pr['url'], lines) if lines else None


def context(text, cwd):
    """What the session reads after the push, or None when its PRs have nothing open."""
    found = [held for branch in pushed_branches(text, cwd) if (held := open_review(branch, cwd))]
    if not found:
        return None
    parts = [f'{url} still has review items open after this push. Settle each one (board.md, Merge gate) '
             'before reporting this PR, draft or ready:\n' + '\n'.join(lines) for url, lines in found]
    return '\n\n'.join(parts)


def main(event):
    if event.get('tool_name') != 'Bash':
        return
    text = (event.get('tool_input') or {}).get('command', '')
    if not re.search(r'\bpush\b', text):
        return
    note = context(text, event.get('cwd') or os.getcwd())
    if note:
        print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PostToolUse', 'additionalContext': note}}))


if __name__ == '__main__':
    try:
        main(json.load(sys.stdin))
    except Exception:  # a note that can't be read never fails the push that already ran
        pass
    sys.exit(0)
