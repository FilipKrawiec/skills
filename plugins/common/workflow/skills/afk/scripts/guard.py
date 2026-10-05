#!/usr/bin/env python3
"""Pre-tool-use guard for issue lanes: agents build and propose; the owner ships.

Active only in projects with `.github/lanes.json`. Catches calls that merge or
approve PRs, push to the base branch, publish releases, dispatch workflows, or
change secrets, variables or repository settings, plus the project's own
`guard` rules from lanes.json. PRs merge through `lanes.py merge`, which hands
the owner only what an owner rule matches. Each issue works in its own
worktree: edits to a file in an opted-in project's main checkout, and
`git switch` or `git checkout` run there, are caught too, as is an edit to
lanes.json. `lane:afk` may be added only in a session the owner is in.

Shell commands are parsed, not searched: a rule judges the commands a line
runs (including `$(...)`, `bash -c`, launchers such as `env` or `npx`, scripts
fed to a shell or written and run in one call, and the process calls of inline
programs and of the files they write), never the text it writes, quotes or
reads, and GitHub API calls by endpoint, method and body. A call whose effect
the guard can't read (a script piped to a shell, a request body on stdin it
can't see) is caught.

In a session the owner attends, a caught call goes to the owner to approve,
in every permission mode where the host asks before a call. Bypass mode
approves an ask unseen, so there the call is refused. A scheduled run (or a
session whose transcript can't be read) is refused too.

Hook input: the host's pre-tool-use event as JSON on stdin (`tool_name`,
`tool_input`, `cwd`, `transcript_path`, `permission_mode`). Exit 2 refuses; a
`permissionDecision` of `ask` on stdout hands the call to the owner.
"""
import fnmatch
import json
import os
import re
import shlex
import subprocess
import sys
from collections import namedtuple
from enum import Enum
from pathlib import Path

OWNER_RUNS_IT = 'The owner runs this themselves.'
MERGE_IS_OWNERS = 'Merging and approving go through `lanes.py merge`, or the owner.'
RELEASE = 'Releases are the owner\'s. ' + OWNER_RUNS_IT
SECRETS = 'Secrets and variables are the owner\'s.'
SETTINGS = 'Repository settings are the owner\'s.'
SECURITY = 'Repository security settings are the owner\'s.'
DISPATCH = 'Dispatched workflows can publish. ' + OWNER_RUNS_IT
ALIAS = 'Aliases hide commands from the guard.'
UNREADABLE = 'The guard can\'t read what this command runs; write it out inline.'
UNKNOWN_QUERY = 'The guard can\'t read this GraphQL query; pass it inline with `-f query=...`.'
UNATTENDED_AFK = 'Unattended runs never mark an issue AFK; the owner approves it in a session.'
OWN_WORKTREE = ('Each issue works in its own worktree; the main checkout keeps its branch and may hold '
                'the owner\'s work. Enter the issue\'s worktree first (board.md, Claim or Start).')
CONFIG_FILE = '.github/lanes.json'
OWNERS_CONFIG = f'{CONFIG_FILE} is the owner\'s: the owner edits it, or approves the edit in a session.'
UNSURE = (UNREADABLE, UNKNOWN_QUERY)


def push_to(base):
    return f'Pushing to {base} is the owner\'s; work lands through a PR.'


# ---------------------------------------------------------------- shell parsing

class Unparsable(ValueError):
    pass


SUBST = '$(…)'  # stands in for a command substitution's output
PROCSUB = '<(…)'  # stands in for the file a process substitution reads from
LITERAL = '\ue000'  # a `$` the shell keeps as it is (quoted or escaped), so not an expansion


def literal(text):
    """`text` as the program it is passed to sees it: a kept `$` is a plain `$` again."""
    return text.replace(LITERAL, '$')


def unknown(text):
    """`text` holds an expansion the guard can't fill in."""
    return '$' in text


class Command:
    """A simple command: its words, its input, and the files it writes and reads by redirect."""

    def __init__(self, argv=None):
        self.argv = argv or []
        self.stdin = None  # a heredoc or here-string's text
        self.stdin_kept = False  # its `$` are kept as they are (a quoted heredoc delimiter)
        self.piped = False  # its input comes from the command before it
        self.writes = []  # (path, appends) of each `>`, `>>` and `&>`
        self.reads = None  # the file of a `<`

    def running(self, argv):
        """The command `argv` that this one runs, with this one's input."""
        command = Command(argv)
        command.stdin, command.stdin_kept = self.stdin, self.stdin_kept
        command.piped, command.reads = self.piped, self.reads
        return command


class Script:
    """A parsed shell script: its simple commands, in order, and the scripts it substitutes."""

    def __init__(self):
        self.commands, self.substituted = [], []


def parse(text):
    """The Script `text` runs; raises Unparsable."""
    return _Parser(text).run(0)[0]


def _substitution(text, i, script):
    """At a `$(` or backquote opening at `i`, parse the command it runs into `script`; return
    (the index after it, the word it stands for), or None when no substitution opens there. The
    word is SUBST, except that `$(cat <<'EOF' ...)` stands for its text. `$((...))` is arithmetic: only
    the substitutions inside it run, unless it reads as words (`$((gh pr merge 1))`), which bash
    runs as a subshell."""
    if text.startswith('$((', i):
        inner, end, depth = Script(), i + 3, 0
        while end < len(text) and not (depth == 0 and text.startswith('))', end)):
            after = _substitution(text, end, inner)
            if after is not None:
                end = after[0]
                continue
            depth += {'(': 1, ')': -1}.get(text[end], 0)
            end += 1
        if end >= len(text):
            raise Unparsable('unbalanced $((')
        if not re.search(r'[A-Za-z_][\w./-]*\s+[\w./-]', re.sub(r'\$\(.*\)', '', text[i + 3:end])):
            script.substituted += inner.substituted
            return end + 2, SUBST
    if text.startswith('$(', i):
        inner, end = _Parser(text, ')').run(i + 2)
    elif text.startswith('`', i):
        end, body = i + 1, ''
        while end < len(text) and text[end] != '`':
            if text[end] == '\\' and end + 1 < len(text):
                body += text[end + 1] if text[end + 1] in '`$\\' else text[end:end + 2]
                end += 2
            else:
                body += text[end]
                end += 1
        if end >= len(text):
            raise Unparsable('unbalanced `')
        inner, end = parse(body), end + 1
    else:
        return None
    script.substituted.append(inner)
    only = inner.commands[0] if len(inner.commands) == 1 else None
    if only and only.argv == ['cat'] and only.stdin is not None and not only.writes:
        return end, only.stdin.replace('$', LITERAL) if only.stdin_kept else only.stdin
    return end, SUBST


def _expansions(body, script):
    """Parse the commands an unquoted heredoc body runs."""
    i = 0
    while i < len(body):
        if body[i] == '\\':
            i += 2
        else:
            after = _substitution(body, i, script)
            i = after[0] if after else i + 1


class _Parser:
    """Parses up to an unmatched `stop` (`)` for `$(`). Quotes are removed, heredoc bodies and
    here-strings become a command's stdin, and `(`/`)` stay as commands so a `cd` inside a
    subshell ends there."""

    def __init__(self, text, stop=None):
        self.s, self.stop = text, stop
        self.script, self.heredocs, self.depth = Script(), [], 0
        self.command, self.word, self.raw, self.redirect = Command(), None, '', None

    def add(self, text, raw):
        self.word = (self.word or '') + text
        self.raw += raw

    def end_word(self):
        word, redirect, command = self.word, self.redirect, self.command
        if word is None:
            return
        if redirect in ('<<', '<<-'):
            self.heredocs.append((command, word, redirect == '<<-', not re.search('[\'"\\\\]', self.raw)))
        elif redirect == '<<<':
            command.stdin = word
        elif redirect is None:
            command.argv.append(word)
        elif redirect in ('>', '>|', '&>', '>>', '&>>'):
            command.writes.append((word, redirect.endswith('>>')))
        elif redirect == '<':
            command.reads = word
        self.word, self.raw, self.redirect = None, '', None

    def end_command(self, piped=False):
        self.end_word()
        if self.command.argv or self.command.stdin is not None:
            self.script.commands.append(self.command)
        self.command = Command()
        self.command.piped = piped

    def heredoc_bodies(self, i):
        """Read the bodies of the line's heredocs, starting at `i`; return the index after them."""
        s = self.s
        for owner, delimiter, tabs, expands in self.heredocs:
            lines = []
            while i < len(s):
                end = s.find('\n', i)
                line = s[i:] if end < 0 else s[i:end]
                i = len(s) if end < 0 else end + 1
                if (line.lstrip('\t') if tabs else line) == delimiter:
                    break
                lines.append(line)
            owner.stdin, owner.stdin_kept = '\n'.join(lines), not expands
            if expands:
                _expansions(owner.stdin, self.script)
        self.heredocs.clear()
        return i

    def double_quoted(self, i):
        """Add the double-quoted word opening at `i`; return the index after it."""
        s, j, text = self.s, i + 1, ''
        while j < len(s) and s[j] != '"':
            after = _substitution(s, j, self.script)
            if after is not None:
                j, text = after[0], text + after[1]
            elif s[j] == '\\' and j + 1 < len(s):
                text += {'$': LITERAL}.get(s[j + 1], s[j + 1]) if s[j + 1] in '$`"\\\n' else s[j:j + 2]
                j += 2
            else:
                text += s[j]
                j += 1
        if j >= len(s):
            raise Unparsable('unbalanced "')
        self.add(text, s[i:j + 1])
        return j + 1

    def ansi_quoted(self, i):
        """Add the `$'...'` word opening at `i`; return the index after it."""
        s, end = self.s, i + 2
        while end < len(s) and s[end] != "'":
            end += 2 if s[end] == '\\' else 1
        if end >= len(s):
            raise Unparsable("unbalanced $'")
        try:
            body = s[i + 2:end].encode('latin-1', 'backslashreplace').decode('unicode_escape')
        except UnicodeDecodeError:
            body = s[i + 2:end]
        self.add(body.replace('$', LITERAL), s[i:end + 1])
        return end + 1

    def redirection(self, i):
        """Start the redirect at `i`; return the index after its operator."""
        if self.word is not None and self.word.isdigit() and self.redirect is None:
            self.word, self.raw = None, ''  # the fd number of `2>&1`
        self.end_word()
        op = re.match(r'<<<|<<-|<<|&>>|&>|>>|>&|<&|>\||<>|>|<', self.s[i:]).group(0)
        if op in ('>&', '<&'):
            fd = re.match(r'[0-9-]+', self.s[i + 2:])
            return i + 2 + (fd.end() if fd else 0)
        self.redirect = op if op in ('<<', '<<-', '<<<', '>', '>|', '&>', '>>', '&>>', '<') else 'target'
        return i + len(op)

    def run(self, i):
        """Parse from `i`; return (Script, index after the stop)."""
        s = self.s
        while i < len(s):
            c = s[i]
            if c in ' \t\r':
                self.end_word()
                i += 1
            elif c == '\n':
                self.end_command()
                i = self.heredoc_bodies(i + 1)
            elif c == '#' and self.word is None:
                end = s.find('\n', i)
                i = len(s) if end < 0 else end
            elif c == '\\':
                if not s.startswith('\\\n', i):
                    self.add({'$': LITERAL}.get(s[i + 1:i + 2], s[i + 1:i + 2]), s[i:i + 2])
                i += 2
            elif c == "'":
                end = s.find("'", i + 1)
                if end < 0:
                    raise Unparsable("unbalanced '")
                self.add(s[i + 1:end].replace('$', LITERAL), s[i:end + 1])
                i = end + 1
            elif s.startswith("$'", i):
                i = self.ansi_quoted(i)
            elif c == '"':
                i = self.double_quoted(i)
            elif s.startswith('$(', i) or c == '`':
                i, word = _substitution(s, i, self.script)
                self.add(word, SUBST)
            elif s.startswith(('<(', '>('), i):
                inner, i = _Parser(s, ')').run(i + 2)
                self.script.substituted.append(inner)
                self.add(PROCSUB, PROCSUB)
            elif c in '<>' or s.startswith('&>', i):
                i = self.redirection(i)
            elif c in ';&|':
                op = re.match(r';;|&&|\|\||\|&|[;&|]', s[i:]).group(0)
                self.end_command(piped=op in ('|', '|&'))
                i += len(op)
            elif c == ')' and self.stop == ')' and self.depth == 0:
                self.end_command()
                return self.script, i + 1
            elif c in '()':
                self.end_command()
                self.depth += 1 if c == '(' else -1
                self.script.commands.append(Command([c]))
                i += 1
            else:
                self.add(c, c)
                i += 1
        if self.stop:
            raise Unparsable('unbalanced $(')
        self.end_command()
        return self.script, i


# ---------------------------------------------------------------- command rules

NAME = r'[A-Za-z_][A-Za-z0-9_]*'
ASSIGNMENT = re.compile(rf'^({NAME})=(.*)$', re.S)
KEYWORDS = {'!', '{', '}', 'then', 'else', 'elif', 'do', 'if', 'while', 'until', 'coproc'}
# Commands that run their arguments as a command, each with its options that take a value.
WRAPPERS = {'command': set(), 'builtin': set(), 'exec': {'-a'}, 'nohup': set(), 'noglob': set(), 'time': set(),
            'caffeinate': {'-t', '-w'}, 'env': {'-u', '-C', '-S'}, 'nice': {'-n'}, 'timeout': {'-s', '-k'},
            'sudo': {'-u', '-g', '-C', '-D', '-h', '-p', '-r', '-T', '-U'}, 'xargs': {'-I', '-E', '-d', '-L', '-n',
            '-P', '-s'}, 'watch': {'-n', '-d'}, 'stdbuf': {'-i', '-o', '-e'}, 'arch': {'-arch'}}
DECLARES = {'export', 'local', 'readonly', 'declare', 'typeset'}
SHELLS = {'bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'csh', 'tcsh'}
SCHEDULERS = {'at', 'batch'}  # run the commands on their input later
INTERPRETERS = re.compile(r'^(python[0-9.]*|node|nodejs|deno|bun|ruby|perl|php|osascript)$')
# What starts a process in each language; backquotes run commands only in the last group.
SPAWNS = {
    'python': r'\b(subprocess\.\w+|os\.(system|popen|exec\w*|spawn\w*|posix_spawn\w*)|pty\.spawn)\b',
    'node': r'\b(exec|execSync|spawn|spawnSync|execFile|execFileSync|Bun\.spawn|Deno\.(run|Command))\b',
    'osascript': r'\bdo\s+shell\s+script\b',
    'other': r'\b(system|exec|spawn|popen|IO\.popen|Open3\.\w+|qx|proc_open|shell_exec|passthru)\b|`',
}
# A program that can start processes some other way (an imported `run`, an aliased module).
STARTS_PROCESSES = {
    'python': r'\b(subprocess|pty)\b|\bos\.(system|popen|exec|spawn)|\bfrom\s+os\s+import\b',
    'node': r'\bchild_process\b|\bBun\.spawn\b|\bDeno\.(run|Command)\b',
}
# Each interpreter's flag that takes the program as text, and its flags that take a value: the script is
# the first other operand. A cluster holds only flags without a value (`perl -ne`, not `ruby -rdate`).
PYTHON_SWITCHES = '[bBdEhiIOPqsSuvVx]*'
CODE_FLAGS = {'python': rf'-{PYTHON_SWITCHES}c', 'node': r'-e|--eval|-p|--print|-pe',
              'perl': r'-[aclnpsStTuUwWxX0-9]*[eE]', 'ruby': r'-[acdlnpsvwWxy]*e', 'php': r'-r', 'osascript': r'-e',
              'other': r'-c|-e|--eval'}
PROGRAM_VALUES = {'python': {'-W', '-X', '--check-hash-based-pycs'}, 'ruby': {'-I', '-r', '-C', '-E', '-F'},
                  'perl': {'-I'}, 'php': {'-c', '-d', '-z'},
                  'node': {'-r', '--require', '--import', '--loader', '--experimental-loader', '-C', '--conditions',
                           '--input-type'}}
QUOTED = re.compile(r'"[+<>]*([^"\s\\]+)"|\'[+<>]*([^\'\s\\]+)\'')  # a file a program may name (perl `">m.sh"`)
# a program that may write a file
WRITES = re.compile(r'\bopen\s*\([^)]*(,\s*|mode\s*=\s*)["\'][^"\']*[wax+]|(?<!stdout)\.write|'
                    r'\bwrite_?(text|bytes|file)|appendFile|createWriteStream|\bdump\(|'
                    r'\b(shutil|fs|os|FileUtils)\.(copy|move|rename|symlink|cp|mv)|\.(rename|symlink_to)\(|'
                    r'\bFile\.new\(|["\']\s*>|file_put_contents|fputs', re.IGNORECASE)
# A downloader's options: for the file it writes (`-` is stdout), for the file the URL names, and for the
# directory that one goes in; whether it writes the file the URL names unless given a file (wget); and
# whether its directory holds the files it is given too (curl).
Downloader = namedtuple('Downloader', 'output remote directory names_by_default directory_holds_output')
DOWNLOADS = {'curl': Downloader(r'-[a-np-zA-Z]*o(.*)|--output(?:=(.*))?', r'-[a-zA-Z]*O|--remote-name(-all)?',
                                r'--output-dir(?:=(.*))?', False, True),
             'wget': Downloader(r'-[a-zA-NP-Z]*O(.*)|--output-document(?:=(.*))?', None,
                                r'-[a-zA-OQ-Z]*P(.*)|--directory-prefix(?:=(.*))?', True, False)}
# A string a program compares is text, not a command line it runs; so is one it edits or prints.
COMPARES = re.compile(r'\bassert\b|["\']\s+(not\s+)?in\s+\w|\.(startswith|endswith|find|index|count|includes)\(')
TEXT_USE = re.compile(COMPARES.pattern + r'|\.(replace|write|write_text|sub|split|join)\(|\bprint\b|'
                      r'\bconsole\.\w+|\blogg(ing|er)\.|\.(debug|info|warning|warn|error)\(|\braise\b|'
                      r'\bthrow\b|\bsys\.exit\b')
# A program's string (`f'...'`, `\'\'\'...\'\'\'` too); a bracket, the end of a statement or a comma,
# outside one.
STRING = re.compile(r'(?:(?<!\w)[fbrFBR]{1,2})?(?P<string>\'\'\'(?:[^\\]|\\.)*?\'\'\'|"""(?:[^\\]|\\.)*?"""|'
                    r'"(?:[^"\\\n]|\\.)*"|\'(?:[^\'\\\n]|\\.)*\')', re.DOTALL)
STATEMENT_PART = re.compile(STRING.pattern + r'|(?P<open>[\[({])|(?P<close>[\])}])|(?P<newline>\n)|;|&&|\|\||,',
                            re.DOTALL)
# What a `{` follows when it opens a block, not a literal: a statement's start, `)`, `=>` or a keyword.
BLOCK_START = re.compile(r'(^|[;{})]|=>|\b(else|try|finally|do))\s*$')
# The code before a list's item, and the code the item's string is joined to (`, c + `).
LIST_ITEM = re.compile(r',[\s\[(]*(?P<code>[\w.]+\s*(\+|\.\.?)\s*)?$')
CALL = re.compile(r'\w\s*\(')  # a function called: `s.run(`
GH_OR_GIT = re.compile(r'\b(gh|git)\b')
# A string that runs a gh or git command: one it starts, or one past a shell separator (`'ls; gh …'`).
SHELL_COMMAND = re.compile(r'(^|[;&|\n(`]|\$\()\s*(gh|git)\b')
# Commands that run none of their arguments; `tee` writes files, but a file it writes runs nothing.
RUNS_NOTHING = {'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'wc', 'ls',
                'diff', 'cmp', 'file', 'stat', 'echo', 'printf', 'jq', 'yq', 'sort', 'uniq', 'cut', 'tr', 'column',
                'nl', 'tee', 'true', 'false', 'test', '[', 'basename', 'dirname', 'realpath', 'readlink', 'which',
                'type', 'man', 'pwd', 'base64', 'shasum', 'md5'}

GRAPHQL_OWNER = re.compile(r'\b(mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest|mergeBranch)\b')
GRAPHQL_SECURITY = re.compile(r'\b((create|update|delete)(BranchProtectionRule|RepositoryRuleset)|'
                              r'(update|archive|unarchive)Repository)\b')
GRAPHQL_APPROVE = re.compile(r'\b(addPullRequestReview|submitPullRequestReview)\b')
GRAPHQL_PUSH = re.compile(r'\b(createCommitOnBranch|updateRefs?)\b')
GRAPHQL_LABELS = re.compile(r'\b(addLabelsToLabelable|labelIds)\b')  # labels by id: lane:afk can't be told apart
GUESSED = '\ue001'  # an expansion read in a GraphQL value's place
REPO = r'(?:repos/[^/\s]+/[^/\s]+|repositories/[^/\s]+)'
EXPANSION = re.compile(r'\$\(…\)|\$\{[^}]*\}|\$\w+|\$[@*]|\$')
MISREAD = (ValueError, IndexError, RecursionError)  # Unparsable, or a NUL byte in a path
MAX_NESTING = 8  # shells, evals and substitutions within one another; deeper is unreadable
STRING_NESTING = MAX_NESTING // 2  # a program's string may start shells within shells, a few deep

# (path pattern, reason): API writes caught whatever their body; pushes to the base branch are judged per call.
API_RULES = [
    (rf'^{REPO}/pulls/[^/]+/merge$|^{REPO}/merges$', MERGE_IS_OWNERS),
    (rf'^{REPO}$|^{REPO}/(transfer|vulnerability-alerts|automated-security-fixes|'
     r'private-vulnerability-reporting)$', SETTINGS),
    (rf'^{REPO}/(branches/[^/]+/protection|rulesets|environments|actions/(secrets|variables|permissions)|'
     r'dependabot/secrets|codespaces/secrets|collaborators|invitations|keys|hooks)\b', SECURITY),
    (rf'^{REPO}/releases\b', RELEASE),
    (rf'^{REPO}/(dispatches|actions/workflows/[^/]+/(dispatches|enable|disable))$', DISPATCH),
]

# (group, actions, reason): the gh commands caught whatever their arguments.
GH_RULES = [
    ('release', {'create', 'new', 'edit', 'delete', 'upload', 'delete-asset'}, RELEASE),
    ('secret', {'set', 'delete', 'remove'}, SECRETS),
    ('variable', {'set', 'delete', 'remove'}, SECRETS),
    ('repo', {'edit', 'delete', 'rename', 'archive', 'unarchive'}, SETTINGS),
    ('workflow', {'run', 'enable', 'disable'}, DISPATCH),
    ('alias', {'set', 'import'}, ALIAS),
]


def unwrap(argv):
    """argv without leading variable assignments, keywords and wrappers that run their arguments.

    `watch` and `env -S` hand a command line to a shell, so they become `sh -c`."""
    argv = list(argv)
    while argv:
        head = argv.pop(0)
        name, line = os.path.basename(head), None
        if name in WRAPPERS:
            while argv and (argv[0].startswith('-') or ASSIGNMENT.match(argv[0])):
                flag = argv.pop(0)
                if flag == '--':
                    break
                if name == 'command' and flag in ('-v', '-V'):
                    return []  # looks the command up; runs nothing
                if name == 'env' and flag.startswith('-S') and len(flag) > 2:
                    line = flag[2:]
                elif flag in WRAPPERS[name] and argv:
                    value = argv.pop(0)
                    line = value if (name, flag) == ('env', '-S') else line
            if name == 'timeout' and argv:
                argv.pop(0)  # the duration
            if name == 'watch' or line is not None:
                return ['sh', '-c', ' '.join(([line] if line is not None else []) + argv)]
        elif not (ASSIGNMENT.match(head) or head in KEYWORDS):
            return [head] + argv
    return argv


def statements(code, items=False):
    """A program's statements, split at its `;`, `&&`, `||` and newlines outside its strings. A newline inside
    `(`, `[` or a `{` literal continues the statement (a list over lines); one inside a `{` block does not.
    With `items`, each item of a `{` literal is a statement of its own."""
    found, start, opened = [], 0, []  # per open bracket: `(`, `[`, `{` for a literal, or 'block'
    for match in STATEMENT_PART.finditer(code):
        if match.group('open'):
            block = match.group('open') == '{' and BLOCK_START.search(code[start:match.start()])
            opened.append('block' if block else match.group('open'))
        elif match.group('close'):
            opened = opened[:-1]
        elif match.group('string') is not None or match.group('newline') and opened[-1:] not in ([], ['block']):
            continue
        elif match.group(0) != ',' or items and opened[-1:] == ['{']:
            found.append(code[start:match.start()])
            start = match.end()
    return found + [code[start:]]


def statements_running(code, text_use):
    """A program's statements, except those that only use their strings as `text_use` text, or are only a
    string (a docstring). Of a statement that uses some as text, the items of its `{` literals that call
    something still run (`{'a': print(x), 'b': s.run([…])}`)."""
    for statement in statements(literal(code)):
        if not text_use.search(statement):
            if not re.fullmatch(rf'\s*{STRING.pattern}\s*', statement, re.DOTALL):
                yield statement
            continue
        yield from (item for item in statements(statement, items=True)
                    if CALL.search(item) and not text_use.search(item))


def string_text(string):
    """The text a program's string literal holds: `\\n` is a line break."""
    quotes = 3 if string[:3] in ("'''", '"""') and len(string) >= 6 else 1
    return re.sub(r'\\(.)', lambda escape: {'n': '\n', 't': ' '}.get(escape.group(1), escape.group(1)),
                  string[quotes:-quotes])


def code_words(code):
    """Program code as plain words on one line: quotes, backquotes, brackets, commas and `\\n` dropped."""
    return ' '.join(re.sub(r'["\'`\[\](),]+|\\[nt]', ' ', code).split())


class Join(Enum):
    """How a program's string joins the command line of the string before it."""
    ARGUMENT = 'one word of it'  # `['git', 'commit', '-m', 'x; y']`, `input='…'`
    CONCATENATED = 'the same word'  # `'gh pr ' + 'merge 1'`, `'gh pr ' + n + ' merge'`
    LINE = 'a command line of its own'


class Word:
    """A word of the command line a program spells: shell text, or one argument (`quoted`)."""

    def __init__(self, text, quoted=False):
        self.text, self.quoted = text, quoted

    def __str__(self):
        return shlex.quote(self.text) if self.quoted else self.text


def program_of(line):
    """The program a spelled command line runs, past its wrappers (`env bash`)."""
    argv = [part for word in line for part in ([word.text] if word.quoted else word.text.split())]
    return os.path.basename((unwrap(argv) or [''])[0])


def joining(before, previous, text, program):
    """How the string `text` joins the line of `program`, after the string `previous` and the code `before`.
    In a list, a string that starts a gh or git command starts a line of its own unless an option names it
    (`['ls', 'gh …']`, not `['-m', 'gh …']`), and any other is an argument, joined to code or not
    (`['bash', '-c', c + ' && gh …']`); a keyword's value is an argument, except the command it
    names, or the script a shell reads (`input=`)."""
    keyword = re.search(r',\s*(\w+)\s*=\s*$', before)
    if keyword:
        shell = keyword.group(1) == 'input' and program in SHELLS
        return Join.LINE if shell or keyword.group(1) in ('args', 'cmd', 'command') else Join.ARGUMENT
    if LIST_ITEM.search(before):
        own = re.match(r'\s*(gh|git)\s', text) and not previous.startswith('-')
        return Join.LINE if own else Join.ARGUMENT
    if re.fullmatch(r'\s*(\+|\.\.?)?\s*', before) or re.match(r'\s*(\+|\.\.?\s)', before) \
            or re.search(r'(\+|\s\.\.?)\s*$', before):
        return Join.CONCATENATED
    return Join.LINE


def joined(code):
    """The words of code a string is joined to (`c + `), its `+`, `.` and `..` dropped."""
    return code_words(re.sub(r'\+|(?<!\S)\.\.?(?!\S)', ' ', code))


def spelled(code):
    """The command lines program code spells: each string is shell text on a line of its own, unless it
    joins the one before (see `joining`). The words between strings stay, and a list item's code is part
    of its argument (`['-c', c + ' && gh …']` runs `c && gh …`)."""
    lines, end, previous = [[]], 0, None
    for match in STRING.finditer(code):
        before, text = code[end:match.start()], string_text(match.group('string'))
        how = Join.LINE if previous is None else joining(before, previous, text, program_of(lines[-1]))
        if how is Join.CONCATENATED:
            between = joined(before)
            lines[-1][-1].text += f' {between} {text}' if between else text
        elif how is Join.ARGUMENT:
            item = LIST_ITEM.search(before)
            code_before = item.group('code') if item else None
            head = before[:item.start('code')] if code_before else before
            lines[-1] += [Word(code_words(head)), Word(joined(code_before or '') + text, quoted=True)]
        else:
            lines[-1].append(Word(code_words(before)))
            lines.append([Word(text)])
        end, previous = match.end(), text
    lines[-1].append(Word(code_words(code[end:])))
    return [' '.join(map(str, line)) for line in lines]


def matched_value(match, args, i, default=''):
    """The value of the option `match` read at `args[i]`, in a cluster: attached (`-sSom.sh`, `--output=m.sh`)
    or the next argument."""
    attached = next((group for group in match.groups() if group), None)
    return attached or (args[i + 1] if i + 1 < len(args) else default)


def option_values(args, names):
    """Values of the named options in `--name value`, `--name=value` and `-nvalue` forms."""
    values = []
    for i, arg in enumerate(args):
        for name in names:
            if arg == name and i + 1 < len(args):
                values.append(args[i + 1])
            elif arg.startswith(name + '=') and name.startswith('--'):
                values.append(arg[len(name) + 1:])
            elif not name.startswith('--') and arg.startswith(name) and len(arg) > len(name):
                values.append(arg[len(name):])
    return values


def positionals(args, valued):
    """Arguments that aren't options or option values."""
    out, skip = [], False
    for arg in args:
        if skip:
            skip = False
        elif arg == '--':
            continue
        elif arg.startswith('-'):
            skip = arg in valued
        else:
            out.append(arg)
    return out


def labels_add_afk(values):
    """`lane:afk` among label values, or a value whose content is unknown (a variable)."""
    for value in values:
        for label in re.split(r'[,\n]', value):
            if literal(label).strip().strip('"\'').lower() == 'lane:afk' or unknown(label):
                return True
    return False


def endpoint_paths(endpoint, base):
    """The API paths `endpoint` may name, host and slashes dropped; None when it could be any path.

    Each expansion the guard can't fill in stands for a segment, an owner/repo pair, the base
    branch or nothing, so a path is caught when any of its readings is."""
    def plain(path):
        path = re.sub(r'^https?://[^/]+/(api/v3/)?', '', path)
        return path.strip('/').split('?')[0]
    parts = EXPANSION.split(endpoint)
    if len(parts) == 1:
        return [plain(endpoint)]
    if len(parts) > 5 or not re.search(r'[A-Za-z]{3}', ''.join(parts)):
        return None
    readings = ['']
    for i, part in enumerate(parts):
        fills = ('x', 'x/x', base, '') if i else ('',)
        if i and parts[i - 1].endswith('repos/') and re.match(r'/[^/]', part):
            fills = ('x/x',)  # `repos/$REPO/issues`
        readings = [reading + fill + part for reading in readings for fill in fills]
    return [plain(reading) for reading in readings]


def readable_query(query):
    """An inline GraphQL query with each expansion in a value's place (after `:` or inside a string)
    read as a placeholder; None when one stands where it could change the operation."""
    def placeholder(match):
        before = query[:match.start()]
        if before.rstrip().endswith(':') or before.count('"') % 2:
            return GUESSED
        raise Unparsable('an expansion shapes the query')
    try:
        return literal(EXPANSION.sub(placeholder, query))
    except Unparsable:
        return None


def current_branch(directory):
    try:
        return subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=directory or None,
                              capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None


class Written:
    """A file this call writes: its text (None when the guard can't know it), and the code of the inline
    programs that may also write it, whose strings are what they write."""

    def __init__(self, text, code=''):
        self.text, self.code = text, code


class Judge:
    """Collects the reasons the calls in a shell command are caught.

    `origin` is the hook's working directory: where a directory the guard can't follow
    (`cd "$X"`) is taken to be."""

    def __init__(self, unattended=True, extra=(), base='main', is_main_checkout=None, origin=None):
        self.unattended, self.extra, self.base, self.origin = unattended, list(extra), base, origin
        self.is_main = is_main_checkout or (lambda path: False)
        self.findings, self.variables, self.written = [], {}, {}  # written: path -> Written

    def catch(self, reason, afk_only=False):
        if not afk_only or self.unattended:
            self.findings.append(reason)

    def sure(self, run):
        """Judge with `run(judge)` on a fresh judge, keeping only what it surely catches:
        for a fragment the guard reads loosely, a misread is not a finding."""
        judge = Judge(self.unattended, (), self.base, self.is_main, self.origin)
        try:
            run(judge)
        except MISREAD:
            return
        self.findings += [reason for reason in judge.findings if reason not in UNSURE]

    def expand(self, word):
        """`word` with the variables this script set to plain values filled in."""
        def value(match):
            known = self.variables.get(match.group(1) or match.group(2))
            return match.group(0) if known is None else known
        return re.sub(rf'\$(?:\{{({NAME})\}}|({NAME}))', value, word)

    def path(self, path, cwd):
        return str(Path(cwd or self.origin or '.').joinpath(os.path.expanduser(literal(path))).resolve())

    def script(self, script, cwd, nested=0):
        if nested > MAX_NESTING:
            return self.catch(UNREADABLE)
        for inner in script.substituted:
            self.script(inner, cwd, nested + 1)
        stack = []
        for command in script.commands:
            if command.argv == ['(']:
                stack.append(cwd)
            elif command.argv == [')']:
                cwd = stack.pop() if stack else cwd
            else:
                cwd = self.command(command, cwd, nested)

    def text(self, text, cwd, nested=0):
        self.script(parse(literal(text)), cwd, nested)

    def command(self, command, cwd, nested):
        """Judge one simple command; return the working directory after it (None when unknown)."""
        argv = command.argv
        assignments = [a for a in argv if ASSIGNMENT.match(a)]
        if argv and (len(assignments) == len(argv) or argv[0] in DECLARES):
            for assignment in (argv if len(assignments) == len(argv) else argv[1:]):
                match = ASSIGNMENT.match(assignment)
                if match:
                    value = self.expand(match.group(2))
                    self.variables[match.group(1)] = None if SUBST in value else value
            return cwd
        argv = [self.expand(a) for a in unwrap(argv)]
        self.note_writes(argv, command, cwd)
        if not argv:
            return cwd
        name, args = os.path.basename(argv[0]), argv[1:]
        if name in ('cd', 'pushd', 'popd'):
            target = next((a for a in args if a == '-' or not a.startswith('-')), '~')
            return None if name == 'popd' or target == '-' or unknown(target) else self.path(target, cwd)
        if name in RUNS_NOTHING:
            return cwd
        if name == 'alias':  # with expand_aliases on, a defined alias runs as written
            for definition in args:
                if '=' in definition:
                    self.shell_text(definition.split('=', 1)[1], cwd, nested)
        elif name in SHELLS or name in SCHEDULERS or name in ('eval', 'source', '.'):
            self.shell(name, args, command, cwd, nested)
        elif INTERPRETERS.match(name):
            self.interpreter(name, args, command, cwd)
        elif name == 'find':
            for i, arg in enumerate(args):
                if arg in ('-exec', '-execdir', '-ok', '-okdir'):
                    rest = args[i + 1:]
                    end = next((j for j, a in enumerate(rest) if a in (';', '+')), len(rest))
                    self.command(Command(rest[:end]), cwd, nested)
        elif name == 'gh':
            self.gh(args, command, cwd)
        elif name == 'git':
            self.git(args, command, cwd, nested)
        elif '/' in argv[0] and self.path(argv[0], cwd) in self.written:
            self.script_file(argv[0], cwd, nested)
        elif EXPANSION.fullmatch(argv[0]) and not args:
            self.catch(UNREADABLE)  # `$CMD` or `$(...)` runs a command line the guard can't see
        elif unknown(argv[0]):
            self.held_program(argv, command, cwd, nested)
        else:
            self.launched(argv, command, cwd, nested)
        self.project_rules(' '.join(literal(a) for a in argv if not re.search(r'\s', a)))
        return cwd

    def note_writes(self, argv, command, cwd):
        """Note each file this command writes, with its text when the guard knows it and None otherwise."""
        name = os.path.basename(argv[0]) if argv else ''
        if name == 'cat' and len(argv) == 1 and command.stdin is not None:
            text = command.stdin
        elif name == 'echo' and not any(unknown(a) for a in argv):
            text = literal(' '.join(a for a in argv[1:] if a not in ('-n', '-e', '-E')))
        else:
            text = None
        for path, appends in command.writes:
            self.written[self.path(path, cwd)] = Written(None if appends else text)
        if name == 'tee':
            for path in positionals(argv[1:], set()):
                self.written[self.path(path, cwd)] = Written(command.stdin if '-a' not in argv else None)
        if name in ('curl', 'wget'):
            self.note_downloads(name, argv[1:], cwd)
        files = positionals(argv[1:], {'-t', '--target-directory', '-S', '--suffix'})
        if name in ('cp', 'mv', 'install') and len(files) == 2:
            source = self.path(files[0], cwd)
            self.written[self.path(files[1], cwd)] = self.written.get(source) or Written(self.read_file(files[0], cwd))

    def note_downloads(self, name, args, cwd):
        """A downloaded file is unreadable."""
        tool, directory, files = DOWNLOADS[name], '', []
        named = tool.names_by_default
        for i, arg in enumerate(args):
            if value := re.fullmatch(tool.output, arg, re.DOTALL):
                files.append(matched_value(value, args, i, '-'))
                if tool.names_by_default:
                    named = False  # `wget -O` writes only its file
            elif tool.remote and re.fullmatch(tool.remote, arg):
                named = True
            elif tool.directory and (prefix := re.fullmatch(tool.directory, arg, re.DOTALL)):
                directory = matched_value(prefix, args, i)
        given = directory if tool.directory_holds_output else ''
        files = [os.path.join(given, file) for file in files if file != '-']
        for arg in args if named else ():
            url = re.fullmatch(r'\w+://[^/]+/(?:.*/)?([^/?#]+)(?:[?#].*)?', arg)
            if url:
                files.append(os.path.join(directory, url.group(1)))
        for file in files:
            self.written[self.path(file, cwd)] = Written(None)

    def note_program(self, code, cwd):
        """Each file an inline program that writes names may be one it writes, from its code. A writer often
        names its file in a variable elsewhere, so every file it names counts, read ones too."""
        if not WRITES.search(code):
            return
        for match in QUOTED.finditer(code):
            try:
                full = self.path(match.group(1) or match.group(2), cwd)
            except (OSError, ValueError, RuntimeError):
                continue
            before = self.written.get(full, Written(''))
            if before.text is not None:
                self.written[full] = Written(before.text, before.code + '\n' + code)

    def launched(self, argv, command, cwd, nested):
        """A launcher the guard doesn't know (`npx`, `uv run`) may run gh, git, a shell or a program."""
        for i, arg in enumerate(argv[1:], 1):
            name = os.path.basename(arg)
            if name in ('gh', 'git') or name in SHELLS or INTERPRETERS.match(name):
                return self.command(command.running(argv[i:]), cwd, nested + 1)

    def held_program(self, argv, command, cwd, nested):
        """A program held in a variable (`${GH:-gh} pr merge 1`) is judged as each one it could be."""
        for program in ('gh', 'git', 'sh'):
            self.sure(lambda judge: judge.command(command.running([program] + argv[1:]), cwd, nested + 1))

    def read_file(self, path, cwd):
        """A file's text, as this script wrote it or as it is on disk; None when unreadable."""
        if PROCSUB in path or unknown(path):
            return None
        full = self.path(path, cwd)
        written = self.written.get(full)
        if written:
            return None if written.code else written.text  # what a program writes, the guard can't read
        try:
            return Path(full).read_text()
        except (OSError, ValueError):
            return None

    def project_rules(self, text):
        for pattern, reason in self.extra:
            if re.search(pattern, text):
                self.catch(reason)

    def shell(self, name, args, command, cwd, nested):
        if name == 'eval':
            return self.shell_text(' '.join(args), cwd, nested)
        if name in ('source', '.'):
            files = args[:1]
        elif name in SCHEDULERS:
            files = option_values(args, ('-f',))
        else:
            files = []
            for i, arg in enumerate(args):
                if i and (re.fullmatch(r'[-+][a-zA-Z]*[oO]', args[i - 1])
                          or args[i - 1] in ('--rcfile', '--init-file')):
                    continue  # an option's value: `-euo pipefail`
                if arg == '--' or not arg.startswith(('-', '+')):
                    files = args[i + 1:i + 2] if arg == '--' else [arg]
                    break  # the script; the arguments after it are its own
                if re.fullmatch(r'-[a-zA-Z]*n[a-zA-Z]*', arg) or arg == '--no-execute':
                    return  # `sh -n` reads the script without running it
                if re.fullmatch(r'-[a-zA-Z]*c[a-zA-Z]*', arg):
                    rest = args[i + 2:] if args[i + 1:i + 2] == ['--'] else args[i + 1:]
                    return self.shell_text(rest[0], cwd, nested) if rest else self.catch(UNREADABLE)
        if not files and command.stdin is not None:
            return self.text(command.stdin, cwd, nested + 1)
        files = files or ([command.reads] if command.reads else [])
        if files:
            self.script_file(files[0], cwd, nested)
        elif command.piped:
            self.catch(UNREADABLE)

    def shell_text(self, text, cwd, nested):
        """Shell code given as text: one expansion the guard can't fill in (`"$(curl ...)"`) is unreadable."""
        if EXPANSION.fullmatch(text.strip()):
            return self.catch(UNREADABLE)
        self.text(text, cwd, nested + 1)

    def script_file(self, path, cwd, nested):
        """A script file a shell runs: the guard reads one this call wrote; a project's script is the project's."""
        written = self.runnable(path, cwd)
        if written and written.text is not None:
            self.text(written.text, cwd, nested + 1)
            self.writers(written, cwd)

    def runnable(self, path, cwd):
        """The Written a script's path names, None for a project's; catches one the guard can't read."""
        if PROCSUB in path:
            self.catch(UNREADABLE)
            return Written(None)
        written = self.written.get(self.path(path, cwd))
        if written and written.text is None:
            self.catch(UNREADABLE)  # a download, an append or tee
        return written

    def interpreter(self, name, args, command, cwd):
        kind = next((k for k in CODE_FLAGS if name.startswith(k)), 'node' if name in ('deno', 'bun') else 'other')
        written = self.program(name, kind, args, command, cwd)
        if not written or written.text is None:
            return
        self.writers(written, cwd)
        self.note_program(written.text, cwd)
        calls = self.process_calls(written.text, cwd, (kind if kind in SPAWNS else 'other',))
        if calls or re.search(STARTS_PROCESSES.get(kind, '$^'), literal(written.text)):
            # A program that starts processes may hold the command line in a string or list first.
            self.string_commands(written.text, cwd)

    def program(self, name, kind, args, command, cwd):
        """The program an interpreter runs, as a Written; None when it runs none the guard reads."""
        # `-pe` is node's flag, not `-p` with its code attached, so the whole flag is tried first.
        code_flag = re.compile(CODE_FLAGS[kind])
        attached = re.compile(rf'(?:{CODE_FLAGS[kind]})=?(.+)', re.DOTALL)  # `-c"..."`, `--eval=...`
        if name in ('deno', 'bun') and args[:1] == ['eval']:
            return Written(args[1] if len(args) > 1 else None)
        if name in ('deno', 'bun') and args[:1] == ['run']:
            args = args[1:]
        values, code, taken = PROGRAM_VALUES.get(kind, set()), [], set()
        for i, arg in enumerate(args):
            if i in taken or i and args[i - 1] in values:
                continue
            if code_flag.fullmatch(arg):
                code.append(args[i + 1] if i + 1 < len(args) else None)
                taken.add(i + 1)
            elif given := attached.fullmatch(arg):
                code.append(given.group(1))
            elif arg == '-' or not arg.startswith('-'):
                break  # the script (`-` for stdin); after code, the program's arguments
            elif kind == 'python' and (module := re.fullmatch(rf'-{PYTHON_SWITCHES}m(.*)', arg)):
                module = matched_value(module, args, i)  # python stops at its first code, so none came before
                return self.runnable(module.replace('.', '/') + '.py', cwd)  # installed, unless this call wrote it
            else:
                continue
            if kind == 'python':
                break  # the rest are the program's arguments; `perl -e a -w -e b` runs both
        else:
            arg = '-'
        if code:
            return Written(None if None in code else '\n'.join(code))
        if arg == '-':
            if command.stdin is None and command.piped:
                self.catch(UNREADABLE)
            return Written(command.stdin) if command.stdin is not None else None
        return self.runnable(arg, cwd)  # a program of the project's runs as the project's

    def writers(self, written, cwd):
        """Judge what programs may have written into a file: in any language, their process calls and the
        command lines in their strings, except the strings they only compare."""
        self.process_calls(written.code, cwd, SPAWNS)
        self.script_commands(written.code, cwd)

    def process_calls(self, code, cwd, languages):
        """Judge a program's process calls in `languages`; return them."""
        code = literal(code)
        calls = [call for language in languages for call in re.finditer(SPAWNS[language], code)]
        for call in calls:
            self.process_call(code, call, cwd)
        return calls

    def string_commands(self, code, cwd):
        """Judge the gh and git command lines a program's strings run; a statement that only compares,
        edits, prints or logs its strings runs none."""
        for statement in statements_running(code, TEXT_USE):
            if any(SHELL_COMMAND.search(string_text(string.group('string'))) for string in STRING.finditer(statement)):
                self.command_line(statement, cwd)

    def script_commands(self, code, cwd):
        """Judge the strings a program writes into a script the command runs, as the shell text they are;
        a statement that only compares its strings runs none."""
        for statement in statements_running(code, COMPARES):
            for string in STRING.finditer(statement):
                text = string_text(string.group('string'))
                if GH_OR_GIT.search(text):
                    self.sure(lambda judge, text=text: judge.text(text, cwd, STRING_NESTING))

    def process_call(self, code, call, cwd):
        """Judge the command line a program's process call could run: the call's own arguments."""
        if call.group(0) == '`':
            end = code.find('`', call.end())
            span = code[call.end():end if end >= 0 else len(code)]
        else:
            opening = code.find('(', call.end(), call.end() + 3)
            depth, end = 0, opening
            while 0 <= opening and end < len(code):
                depth += {'(': 1, ')': -1}.get(code[end], 0)
                if depth == 0:
                    break
                end += 1
            span = code[call.end():code.find('\n', call.end()) if opening < 0 else end]
        self.command_line(span, cwd)

    def command_line(self, code, cwd):
        """Judge program code as the command lines it spells; code before its first string, from its first gh
        or git (`qx{gh …}`)."""
        self.project_rules(code_words(code))
        head, *lines = spelled(code)
        start = GH_OR_GIT.search(head)
        for line in ([head[start.start():]] if start else []) + lines:
            if GH_OR_GIT.search(line):
                self.sure(lambda judge, line=line: judge.text(line, cwd, STRING_NESTING))

    # ------------------------------------------------------------------ gh

    def gh(self, args, command, cwd):
        flat, skip = [], False
        for arg in args:  # `gh pr -R o/r merge 1` reads as `gh pr merge 1`
            if skip:
                skip = False
            elif arg in ('-R', '--repo', '--hostname'):
                skip = True
            elif not re.match(r'(-R|--repo=|--hostname=)', arg):
                flat.append(arg)
        args = flat
        group, action, rest = (args + ['', ''])[0], (args + ['', ''])[1], args[2:]
        if group == 'pr' and action == 'merge':
            return self.catch(MERGE_IS_OWNERS)  # even with --help: setup.md's preflight probes the guard with it
        if not args or '--help' in args or '-h' in args or group == 'help':
            return
        if unknown(group) or (unknown(action) and group in {'pr'} | {rule[0] for rule in GH_RULES}):
            return self.catch(UNREADABLE)  # `gh pr "$A" 1` could be a merge
        if group == 'pr' and action == 'checkout' and self.is_main(cwd or self.origin):
            self.catch(OWN_WORKTREE)
        for rule_group, actions, reason in GH_RULES:
            if group == rule_group and action in actions:
                self.catch(reason)
        if group == 'pr' and action == 'review' and any(self.approves_flag(arg) for arg in rest):
            self.catch(MERGE_IS_OWNERS)
        elif group == 'repo' and action == 'deploy-key' and rest[:1] in (['add'], ['delete']):
            self.catch(SECURITY)
        elif group == 'api':
            self.gh_api(args[1:], command, cwd)
        if group in ('issue', 'pr') and action in ('create', 'edit'):
            if labels_add_afk(option_values(rest, ('--add-label', '--label', '-l'))):
                self.catch(UNATTENDED_AFK, afk_only=True)

    @staticmethod
    def approves_flag(arg):
        """`--approve`, or `-a` among short flags (`-ab ok`), before one that takes the rest as its value."""
        if arg == '--approve' or re.fullmatch(r'(--approve|-a)=(?!false$|0$).*', arg, re.I):
            return True
        if re.fullmatch(r'-[A-Za-z]+', arg):
            for flag in arg[1:]:
                if flag == 'a':
                    return True
                if flag in 'bF':
                    return False
        return False

    def request_body(self, fields, inputs, command, cwd):
        """The fields and input files of an API call as text; None when an input can't be read."""
        parts = list(fields)
        for name in inputs:
            parts.append(command.stdin if name == '-' else self.read_file(name, cwd))
        return None if None in parts else ' '.join(parts)

    def typed_field(self, field, command, cwd):
        """A `-F key=@file` field with the file's text (`$` when unreadable); other fields as given."""
        key, _, value = field.partition('=')
        if key == 'query' or not value.startswith('@'):
            return field  # graphql() reads a query file itself
        text = command.stdin if value == '@-' else self.read_file(value[1:], cwd)
        return f'{key}=' + ('$' if text is None else text)

    def gh_api(self, args, command, cwd):
        valued = {'-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '--input', '-q', '--jq',
                  '-t', '--template', '--cache', '-p', '--preview', '--hostname'}
        endpoint = next(iter(positionals(args, valued)), '')
        fields = option_values(args, ('-f', '--raw-field'))
        fields += [self.typed_field(f, command, cwd) for f in option_values(args, ('-F', '--field'))]
        inputs = option_values(args, ('--input',))
        methods = option_values(args, ('-X', '--method'))
        method = methods[-1].upper() if methods else ('POST' if fields or inputs else 'GET')
        paths = endpoint_paths(endpoint, self.base)
        if paths == ['graphql']:
            return self.graphql(fields, inputs, command, cwd)
        if method == 'GET':
            return
        if paths is None:
            return self.catch(UNREADABLE)  # a write to an endpoint the guard can't read
        body = self.request_body(fields, inputs, command, cwd)

        def names(pattern):
            return any(re.search(pattern, path) for path in paths)

        base = re.escape(self.base)
        for pattern, reason in API_RULES + [(rf'^{REPO}/git/refs/heads/{base}$', push_to(self.base)),
                                            (rf'^{REPO}/branches/{base}/rename$', SETTINGS)]:
            if names(pattern):
                self.catch(reason)

        if names(rf'^{REPO}/pulls/[^/]+/reviews(/[^/]+/events)?$'):
            if body is None or re.search(r'(^|\s)event=\S*\$|"event"\s*:\s*"?\$', body):
                self.catch(UNREADABLE)
            elif re.search(r'(^|\s)event=APPROVE\b|"event"\s*:\s*"APPROVE"', literal(body), re.I):
                self.catch(MERGE_IS_OWNERS)
        if names(rf'^{REPO}/contents/'):
            if body is None:
                self.catch(UNREADABLE)
            else:
                branches = re.findall(r'(?:^|\s)branch=(\S*)', body) + re.findall(r'"branch"\s*:\s*"([^"]*)"', body)
                if not branches or any(b == self.base or unknown(b) for b in branches):
                    self.catch(push_to(self.base))
        if names(rf'^{REPO}/issues(/[^/]+(/labels)?)?$'):
            labels = [f.split('=', 1)[1] for f in fields if re.match(r'labels(\[\])?=', f)]
            files = self.request_body([], inputs, command, cwd)  # a JSON body: stdin or a file
            if files is None:
                self.catch(UNREADABLE, afk_only=True)
            elif labels_add_afk(labels) or re.search('lane:afk', literal(files), re.I) or re.search(
                    r'"labels"\s*:\s*\[[^\]]*\$', files):
                self.catch(UNATTENDED_AFK, afk_only=True)

    def graphql(self, fields, inputs, command, cwd):
        texts = []
        for query in (f.split('=', 1)[1] for f in fields if f.startswith('query=')):
            if query.startswith('@'):
                texts.append(self.read_file(query[1:], cwd))  # in a file, `$name` is a GraphQL variable
            else:
                texts.append(readable_query(query))
        texts += [command.stdin if name == '-' else self.read_file(name, cwd) for name in inputs]
        if not texts or None in texts or (any(f.startswith('operationName=') for f in fields) and any(
                unknown(f) for f in fields)):
            return self.catch(UNKNOWN_QUERY)
        query = '\n'.join(texts)
        values = [f for f in fields if not f.startswith('query=')]
        variables = literal(' '.join(values))
        if GRAPHQL_OWNER.search(query) or (GRAPHQL_APPROVE.search(query) and 'APPROVE' in query + variables):
            self.catch(MERGE_IS_OWNERS)
        if GRAPHQL_SECURITY.search(query):
            self.catch(SECURITY)
        if GRAPHQL_LABELS.search(query):
            self.catch(UNREADABLE, afk_only=True)
        if GRAPHQL_PUSH.search(query):
            target = query + ' ' + variables
            if re.search(rf'(^|[\s"=:/]){re.escape(self.base)}\b', target):
                self.catch(push_to(self.base))
            elif GUESSED in target or any(unknown(v) for v in values) or not re.search(
                    r'\b(branchName|qualifiedName)\b|refs/heads/', target):
                self.catch(UNREADABLE)  # a ref named by id or by a value the guard can't read

    # ------------------------------------------------------------------ git

    def git(self, args, command, cwd, nested):
        args, directory, aliases = list(args), cwd, {}
        environment = {**{k: v for k, v in self.variables.items() if v is not None},
                       **dict(ASSIGNMENT.match(a).groups() for a in command.argv if ASSIGNMENT.match(a))}
        settings = [(environment[key], environment.get('GIT_CONFIG_VALUE_' + key[15:], ''))
                    for key in environment if key.startswith('GIT_CONFIG_KEY_')]
        while args and args[0].startswith('-'):
            flag = args.pop(0)
            if flag in ('-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path') and args:
                value = args.pop(0)
                if flag == '-C':
                    directory = None if unknown(value) or directory is None else self.path(value, directory)
                elif flag == '-c':
                    settings.append(tuple(value.split('=', 1)) if '=' in value else (value, ''))
        for key, setting in settings:
            self.git_setting(key, setting, cwd, nested)
            if key.lower().startswith('alias.'):
                aliases[key[6:]] = literal(setting)
        if not args or '--help' in args or '-h' in args:
            return
        sub, rest = args[0], args[1:]
        if sub in aliases:  # the alias runs with the call's arguments after it
            if aliases[sub].startswith('!'):
                return self.shell_text(' '.join([aliases[sub][1:]] + rest), cwd, nested)
            return self.git(['-C', directory] * bool(directory) + aliases[sub].split() + rest, Command(), cwd,
                            nested + 1) if nested < MAX_NESTING else self.catch(UNREADABLE)
        if sub == 'submodule' and 'foreach' in rest:
            self.shell_text(' '.join(positionals(rest[rest.index('foreach') + 1:], set())), cwd, nested)
        elif sub == 'rebase':
            for line in option_values(rest, ('-x', '--exec')):
                self.shell_text(line, cwd, nested)
        elif sub == 'bisect' and rest[:1] == ['run']:
            self.command(Command(rest[1:]), cwd, nested + 1)
        if sub == 'push':
            self.git_push(rest, directory)
        elif sub == 'config':
            settings = positionals(rest, {'-f', '--file', '--blob', '--type', '--default', '--comment'})
            settings = settings[1:] if settings[:1] in (['set'], ['add']) else settings
            if len(settings) >= 2:
                self.git_setting(settings[0], settings[1], cwd, nested)
        elif sub in ('switch', 'checkout') and self.is_main(directory or self.origin):
            if not (sub == 'checkout' and ('--' in rest or '-p' in rest or '--patch' in rest)):
                self.catch(OWN_WORKTREE)

    def git_setting(self, key, value, cwd, nested):
        """An alias runs its command; a remote's push refspec is where a bare `git push` goes."""
        key = key.lower()
        if key.startswith('alias.'):
            line = literal(value)
            self.text(line[1:] if line.startswith('!') else 'git ' + line, cwd, nested + 1)
        elif re.fullmatch(r'remote\..+\.push', key):
            self.git_push(['origin', value], cwd)

    def git_push(self, args, directory):
        """`HEAD` in a directory the guard can't follow (`cd "$WT"`) isn't resolved: it is most likely the
        worktree the agent works in, and the session's own branch says nothing about it."""
        if {'--all', '--mirror', '--branches'} & set(args):
            return self.catch(push_to(self.base))
        valued = {'--repo', '-o', '--push-option', '--receive-pack', '--exec'}
        targets = positionals(args, valued)[1:] or ['HEAD']
        for refspec in targets:
            destination = refspec.lstrip('+').split(':')[-1]
            if destination in ('HEAD', '@'):
                if directory is None:
                    continue
                destination = current_branch(directory)
            if destination is None or unknown(destination):
                self.catch(UNREADABLE)
            elif fnmatch.fnmatchcase(self.base, re.sub(r'^(refs/)?heads/', '', destination)):
                self.catch(push_to(self.base))


def refusal(command, unattended=True, extra=(), base='main', cwd=None, is_main_checkout=None):
    """The first reason a shell command is caught, or None."""
    cwd = cwd or os.getcwd()
    judge = Judge(unattended, extra, base, is_main_checkout, cwd)
    try:
        judge.text(command, cwd)
    except MISREAD as error:
        return f'{UNREADABLE} ({error})'
    return judge.findings[0] if judge.findings else None


# ---------------------------------------------------------------- other tools

MERGE_TOOLS = ('merge_pull_request', 'enable_pr_auto_merge', 'enable_auto_merge')
PUSH_TOOLS = ('push_files', 'create_or_update_file', 'delete_file')
REVIEW_TOOLS = ('create_pull_request_review', 'submit_pending_pull_request_review', 'pull_request_review_write')
EDIT_TOOLS = ('Edit', 'Write', 'MultiEdit', 'NotebookEdit')


def main_checkout(path):
    """The main checkout holding `path`, or None in a linked worktree (`.git` is a file) or outside a repository."""
    path = Path(path).absolute()
    for directory in (path, *path.parents):
        marker = directory / '.git'
        if marker.exists():
            return directory if marker.is_dir() else None
    return None


def opted_in_main_checkout(path):
    """`path` lies in the main checkout of a project with lanes.json."""
    checkout = main_checkout(path) if path else None
    return bool(checkout and (checkout / CONFIG_FILE).is_file())


def tool_refusal(tool_name, tool_input, base='main'):
    """Why a non-shell tool call is caught, or None."""
    tool = str(tool_name or '')
    if tool.startswith('mcp__'):
        action = tool.rsplit('__', 1)[-1]
        if action in MERGE_TOOLS:
            return MERGE_IS_OWNERS
        if action in PUSH_TOOLS and str(tool_input.get('branch') or base) == base:
            return push_to(base)
        if action in REVIEW_TOOLS and str(tool_input.get('event', '')).upper() == 'APPROVE':
            return MERGE_IS_OWNERS
        return None
    target = str(tool_input.get('file_path') or tool_input.get('notebook_path') or '')
    if tool not in EDIT_TOOLS or not target:
        return None
    if target.endswith(CONFIG_FILE):
        return OWNERS_CONFIG
    if opted_in_main_checkout(target):
        return OWN_WORKTREE
    return None


# ---------------------------------------------------------------- hook

def is_unattended(transcript_path):
    """A scheduled-task run, or a transcript that can't be read (fail closed).

    A subagent's transcript (`<session>/subagents/agent-*.jsonl`) starts with its
    task, so the session's own transcript beside that directory decides."""
    try:
        path = Path(transcript_path)
        if path.parent.name == 'subagents':
            path = path.parent.parent.with_suffix('.jsonl')
        with open(path) as transcript:
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

    A rule without `pattern` and `reason` strings raises, and the hook then fails closed."""
    try:
        config = json.loads((Path(project_dir) / CONFIG_FILE).read_text())
    except (OSError, TypeError, ValueError):
        return None
    rules = [(rule['pattern'], rule['reason']) for rule in config.get('guard', [])]
    if not all(isinstance(x, str) for rule in rules for x in rule):
        raise ValueError('every lanes.json guard rule needs string `pattern` and `reason`')
    return rules, config.get('base', 'main')


ASKING_MODES = ('default', 'acceptEdits', 'auto', 'plan')


def decide(reason, unattended, mode=None):
    """Ask the owner in an attended session whose mode shows the ask; refuse otherwise."""
    if not reason:
        return 0
    if unattended or mode not in ASKING_MODES:
        hint = '' if unattended else (' This permission mode approves asks unseen, so the owner runs it, '
                                      'or approves it in a mode that asks.')
        print(f'Blocked by the lanes guard: {reason}{hint}', file=sys.stderr)
        return 2
    print(json.dumps({'hookSpecificOutput': {
        'hookEventName': 'PreToolUse', 'permissionDecision': 'ask',
        'permissionDecisionReason': f'Lanes guard: {reason} Approve only if you asked for it.'}}))
    return 0


def main(event, unattended):
    project = project_config(project_root(event.get('cwd')))
    if project is None:
        return 0
    extra, base = project
    tool_input = event.get('tool_input') or {}
    if event.get('tool_name') == 'Bash':
        reason = refusal(tool_input.get('command', ''), unattended, extra, base, event.get('cwd'),
                         opted_in_main_checkout)
    else:
        reason = tool_refusal(event.get('tool_name'), tool_input, base)
    return decide(reason, unattended, event.get('permission_mode'))


if __name__ == '__main__':
    unattended, mode = True, None
    try:
        event = json.load(sys.stdin)
        unattended, mode = is_unattended(event.get('transcript_path')), event.get('permission_mode')
        sys.exit(main(event, unattended))
    except Exception as error:  # fail closed: a guard that cannot decide refuses, or asks the owner
        sys.exit(decide(f'it could not run ({error}).', unattended, mode))
