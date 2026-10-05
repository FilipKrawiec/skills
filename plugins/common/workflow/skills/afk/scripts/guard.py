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
runs (including `$(...)`, `bash -c`, scripts fed to a shell and the process
calls of inline programs), never the text it writes, quotes or reads, and
GitHub API calls by endpoint and method. A call whose effect the guard can't
read (a script piped to a shell, a GraphQL query held in a file) is caught.

In a session the owner attends, a caught call goes to the owner to approve,
in every permission mode where the host asks before a call. Bypass mode
approves an ask unseen, so there the call is refused. A scheduled run (or a
session whose transcript can't be read) is refused too.

Hook input: the host's pre-tool-use event as JSON on stdin (`tool_name`,
`tool_input`, `cwd`, `transcript_path`, `permission_mode`). Exit 2 refuses; a
`permissionDecision` of `ask` on stdout hands the call to the owner.
"""
import json
import os
import re
import subprocess
import sys
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


class Command:
    def __init__(self, argv=None):
        self.argv, self.stdin, self.piped, self.writes = argv or [], None, False, None


class Script:
    """A parsed shell script: its simple commands, in order, and the scripts it substitutes."""

    def __init__(self):
        self.commands, self.substituted = [], []


def parse(text):
    """The Script `text` runs; raises Unparsable."""
    return _Parser(text).run(0)[0]


def _substitution(text, i, script):
    """At a `$(` or backquote opening at `i`, parse the command it runs into `script`; return
    the index after it, or None when no substitution opens there."""
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
    return end


def _expansions(body, script):
    """Parse the commands an unquoted heredoc body runs."""
    i = 0
    while i < len(body):
        if body[i] == '\\':
            i += 2
        else:
            i = _substitution(body, i, script) or i + 1


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
        elif redirect in ('>', '>|'):
            command.writes = word
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
            owner.stdin = '\n'.join(lines)
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
                j, text = after, text + SUBST
            elif s[j] == '\\' and j + 1 < len(s):
                text += s[j + 1] if s[j + 1] in '$`"\\\n' else s[j:j + 2]
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
        self.add(body, s[i:end + 1])
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
        self.redirect = op if op in ('<<', '<<-', '<<<', '>', '>|') else 'target'
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
                    self.add(s[i + 1:i + 2], s[i:i + 2])
                i += 2
            elif c == "'":
                end = s.find("'", i + 1)
                if end < 0:
                    raise Unparsable("unbalanced '")
                self.add(s[i + 1:end], s[i:end + 1])
                i = end + 1
            elif s.startswith("$'", i):
                i = self.ansi_quoted(i)
            elif c == '"':
                i = self.double_quoted(i)
            elif s.startswith('$(', i) or c == '`':
                i = _substitution(s, i, self.script)
                self.add(SUBST, SUBST)
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
KEYWORDS = {'!', '{', '}', 'then', 'else', 'elif', 'do', 'time', 'if', 'while', 'until'}
# Commands that run their arguments as a command, each with its short options that take a value.
WRAPPERS = {'command': '', 'builtin': '', 'exec': '-a', 'nohup': '', 'noglob': '', 'caffeinate': '-tw',
            'env': '-uCS', 'sudo': '-ugCDhprTU', 'nice': '-n', 'timeout': '-sk', 'xargs': '-IEdLnPs',
            'watch': '-nd', 'stdbuf': '-ioe'}
DECLARES = {'export', 'local', 'readonly', 'declare', 'typeset'}
SHELLS = {'bash', 'sh', 'zsh', 'dash', 'ksh', 'fish'}
INTERPRETERS = re.compile(r'^(python[0-9.]*|node|nodejs|deno|bun|ruby|perl|php|osascript)$')
# What starts a process in each language; backquotes run commands only in the last group.
SPAWNS = {
    'python': r'\b(subprocess\.\w+|os\.(system|popen|exec\w*|spawn\w*|posix_spawn\w*)|pty\.spawn)\b',
    'node': r'\b(exec|execSync|spawn|spawnSync|execFile|execFileSync|Bun\.spawn|Deno\.(run|Command))\b',
    'osascript': r'\bdo\s+shell\s+script\b',
    'other': r'\b(system|exec|spawn|popen|IO\.popen|Open3\.\w+|qx|proc_open|shell_exec|passthru)\b|`',
}
# Commands that run none of their arguments; `tee` writes files, but a file it writes runs nothing.
RUNS_NOTHING = {'cat', 'head', 'tail', 'less', 'more', 'grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'wc', 'ls',
             'diff', 'cmp', 'file', 'stat', 'echo', 'printf', 'jq', 'yq', 'sort', 'uniq', 'cut', 'tr', 'column',
             'nl', 'tee', 'true', 'false', 'test', '[', 'basename', 'dirname', 'realpath', 'readlink', 'which',
             'type', 'man', 'pwd', 'base64', 'shasum', 'md5'}

GRAPHQL_OWNER = re.compile(r'\b(mergePullRequest|enablePullRequestAutoMerge|mergeBranch)\b')
GRAPHQL_SECURITY = re.compile(r'\b((create|update|delete)(BranchProtectionRule|RepositoryRuleset)|'
                              r'(update|archive|unarchive)Repository)\b')
GRAPHQL_APPROVE = re.compile(r'\b(addPullRequestReview|submitPullRequestReview)\b')
GRAPHQL_PUSH = re.compile(r'\b(createCommitOnBranch|updateRefs?)\b')
REPO = r'repos/[^/\s]+/[^/\s]+'
MAX_NESTING = 8  # shells, evals and substitutions within one another; deeper is unreadable

# (group, actions, reason): the gh commands caught whatever their arguments.
GH_RULES = [
    ('release', {'create', 'edit', 'delete', 'upload', 'delete-asset'}, RELEASE),
    ('secret', {'set', 'delete', 'remove'}, SECRETS),
    ('variable', {'set', 'delete', 'remove'}, SECRETS),
    ('repo', {'edit', 'delete', 'rename', 'archive', 'unarchive'}, SETTINGS),
    ('workflow', {'run', 'enable', 'disable'}, DISPATCH),
    ('alias', {'set', 'import'}, ALIAS),
]


def unwrap(argv):
    """argv without leading variable assignments, keywords and pass-through wrappers."""
    argv = list(argv)
    while argv:
        head = argv.pop(0)
        if head in WRAPPERS:
            while argv and (argv[0].startswith('-') or ASSIGNMENT.match(argv[0])):
                flag = argv.pop(0)
                if len(flag) == 2 and flag[1] in WRAPPERS[head] and argv:
                    argv.pop(0)
            if head == 'timeout' and argv:
                argv.pop(0)  # the duration
        elif not (ASSIGNMENT.match(head) or head in KEYWORDS):
            return [head] + argv
    return argv


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
            if label.strip().strip('"\'') == 'lane:afk' or '$' in label:
                return True
    return False


def current_branch(directory):
    try:
        return subprocess.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd=directory or None,
                              capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, ValueError, subprocess.CalledProcessError):
        return None


class Judge:
    """Collects the reasons the calls in a shell command are caught."""

    def __init__(self, unattended=True, extra=(), base='main', is_main_checkout=None):
        self.unattended, self.extra, self.base = unattended, list(extra), base
        self.is_main = is_main_checkout or (lambda path: False)
        self.findings, self.variables, self.written = [], {}, {}

    def catch(self, reason, afk_only=False):
        if not afk_only or self.unattended:
            self.findings.append(reason)

    def expand(self, word):
        """`word` with the variables this script set to plain values filled in."""
        def value(match):
            known = self.variables.get(match.group(1) or match.group(2))
            return match.group(0) if known is None else known
        return re.sub(rf'\$(?:\{{({NAME})\}}|({NAME}))', value, word)

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
        self.script(parse(text), cwd, nested)

    def command(self, command, cwd, nested):
        """Judge one simple command; return the working directory after it."""
        argv = command.argv
        head = [a for a in argv if ASSIGNMENT.match(a)]
        if argv and (len(head) == len(argv) or argv[0] in DECLARES):
            for assignment in (argv if len(head) == len(argv) else argv[1:]):
                match = ASSIGNMENT.match(assignment)
                if match:
                    self.variables[match.group(1)] = match.group(2) if SUBST not in match.group(2) else None
            return cwd
        argv = [self.expand(a) for a in unwrap(argv)]
        if command.writes and command.stdin is not None and argv[:1] == ['cat']:
            self.written[str(Path(cwd or '.').joinpath(self.expand(command.writes)).resolve())] = command.stdin
        if not argv:
            return cwd
        name, args = os.path.basename(argv[0]), argv[1:]
        if name == 'cd':
            target = next((a for a in args if not a.startswith('-')), '~')
            if '$' in target:
                return None
            return str(Path(cwd or '.').joinpath(os.path.expanduser(target)).resolve())
        if name in RUNS_NOTHING:
            return cwd
        if name in SHELLS or name == 'eval':
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
            self.gh(args, cwd)
        elif name == 'git':
            self.git(args, cwd)
        self.project_rules(' '.join(a for a in argv if not re.search(r'\s', a)))
        return cwd

    def read_file(self, path, cwd):
        """A file's text, as this script wrote it or as it is on disk; None when unreadable."""
        full = Path(cwd or '.').joinpath(path).resolve()
        if str(full) in self.written:
            return self.written[str(full)]
        try:
            return full.read_text()
        except (OSError, ValueError):
            return None

    def project_rules(self, text):
        for pattern, reason in self.extra:
            if re.search(pattern, text):
                self.catch(reason)

    def shell(self, name, args, command, cwd, nested):
        if name == 'eval':
            return self.text(' '.join(args), cwd, nested + 1)
        for i, arg in enumerate(args):
            if re.fullmatch(r'-[a-zA-Z]*c[a-zA-Z]*', arg):
                if i + 1 >= len(args):
                    return self.catch(UNREADABLE)
                return self.text(args[i + 1], cwd, nested + 1)
        if positionals(args, {'-o', '+o', '-O', '+O'}):
            return None  # runs a script file of the project's
        if command.stdin is not None:
            return self.text(command.stdin, cwd, nested + 1)
        if command.piped:
            self.catch(UNREADABLE)

    def interpreter(self, name, args, command, cwd):
        code = next((args[i + 1] for i, a in enumerate(args[:-1]) if a in ('-c', '-e', '--eval', '-E')), None)
        if '-m' in args:
            return  # runs an installed module
        files = positionals(args, {'-W', '-X'})
        if code is None and command.stdin is not None and files in ([], ['-']):
            code = command.stdin
        if code is None:
            if command.piped and not files:
                self.catch(UNREADABLE)
            return
        language = next((k for k in ('python', 'node', 'osascript') if name.startswith(k)),
                        'node' if name in ('nodejs', 'deno', 'bun') else 'other')
        for call in re.finditer(SPAWNS[language], code):
            self.process_call(code, call, cwd)

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
        line = ' '.join(re.sub(r'["\'\[\](),]+|\b[fbr]?(?=["\'])|\\[nt]', ' ', span).split())
        self.project_rules(line)
        start = re.search(r'\b(gh|git)\b', line)
        if not start:
            return
        # Only what the call surely runs counts: a fragment the guard misreads is not a finding.
        # Judged at the deepest nesting: a shell this fragment seems to start is not read further.
        judge = Judge(self.unattended, (), self.base, self.is_main)
        try:
            judge.text(line[start.start():], cwd, MAX_NESTING)
        except Unparsable:
            return
        self.findings += [reason for reason in judge.findings if reason not in UNSURE]

    # ------------------------------------------------------------------ gh

    def gh(self, args, cwd):
        flat, skip = [], False
        for arg in args:  # `gh pr -R o/r merge 1` reads as `gh pr merge 1`
            if skip:
                skip = False
            elif arg in ('-R', '--repo', '--hostname'):
                skip = True
            elif not arg.startswith(('--repo=', '-R=', '--hostname=')):
                flat.append(arg)
        args = flat
        group, action, rest = (args + ['', ''])[0], (args + ['', ''])[1], args[2:]
        if group == 'pr' and action == 'merge':
            return self.catch(MERGE_IS_OWNERS)  # even with --help: setup.md's preflight probes the guard with it
        if not args or '--help' in args or '-h' in args or group == 'help':
            return
        for rule_group, actions, reason in GH_RULES:
            if group == rule_group and action in actions:
                self.catch(reason)
        if group == 'pr' and action == 'review' and ('--approve' in rest or '-a' in rest):
            self.catch(MERGE_IS_OWNERS)
        elif group == 'repo' and action == 'deploy-key' and rest[:1] in (['add'], ['delete']):
            self.catch(SECURITY)
        elif group == 'api':
            self.gh_api(args[1:], cwd)
        if group in ('issue', 'pr') and action in ('create', 'edit'):
            if labels_add_afk(option_values(rest, ('--add-label', '--label', '-l'))):
                self.catch(UNATTENDED_AFK, afk_only=True)

    def gh_api(self, args, cwd):
        valued = {'-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '--input', '-q', '--jq',
                  '-t', '--template', '--cache', '-p', '--preview', '--hostname'}
        endpoint = next(iter(positionals(args, valued)), '')
        fields = option_values(args, ('-f', '--raw-field', '-F', '--field'))
        inputs = option_values(args, ('--input',))
        methods = option_values(args, ('-X', '--method'))
        method = methods[-1].upper() if methods else ('POST' if fields or inputs else 'GET')
        if endpoint == 'graphql':
            return self.graphql(fields, inputs, cwd)
        path = endpoint.lstrip('/').split('?')[0]
        if method == 'GET' or not path:
            return
        body = ' '.join(fields)
        for name in inputs:
            body += ' ' + ((self.read_file(name, cwd) or '$') if name != '-' else '$')
        rules = [
            (rf'^{REPO}/pulls/[^/]+/merge$|^{REPO}/merges$', MERGE_IS_OWNERS),
            (rf'^{REPO}/pulls/[^/]+/reviews(/[^/]+/events)?$', MERGE_IS_OWNERS if 'APPROVE' in body else None),
            (rf'^{REPO}/?$|^{REPO}/(transfer|vulnerability-alerts|automated-security-fixes|'
             r'private-vulnerability-reporting)$', SETTINGS),
            (rf'^{REPO}/(branches/[^/]+/protection|rulesets|environments|actions/(secrets|variables|permissions)|'
             r'dependabot/secrets|codespaces/secrets|collaborators|invitations|keys|hooks)\b', SECURITY),
            (rf'^{REPO}/releases\b', RELEASE),
            (rf'^{REPO}/(dispatches|actions/workflows/[^/]+/(dispatches|enable|disable))$', DISPATCH),
            (rf'^{REPO}/git/refs/heads/{re.escape(self.base)}$', push_to(self.base)),
        ]
        for pattern, reason in rules:
            if reason and re.search(pattern, path):
                self.catch(reason)
        if re.search(rf'^{REPO}/contents/', path):
            branches = [f.split('=', 1)[1] for f in fields if f.startswith('branch=')]
            if not branches or self.base in branches or any('$' in b for b in branches):
                self.catch(push_to(self.base))
        if re.search(rf'^{REPO}/issues(/[^/]+(/labels)?)?$', path) and 'label' in body:
            labels = [f.split('=', 1)[1] for f in fields if re.match(r'labels(\[\])?=', f)]
            if labels_add_afk(labels) or 'lane:afk' in body or ('$' in body and 'labels' in body):
                self.catch(UNATTENDED_AFK, afk_only=True)

    def graphql(self, fields, inputs, cwd):
        queries = [f.split('=', 1)[1] for f in fields if f.startswith('query=')]
        text = [self.read_file(q[1:], cwd) if q.startswith('@') else q for q in queries]
        text += [None if name == '-' else self.read_file(name, cwd) for name in inputs]
        if not text or any(t is None or SUBST in t or re.fullmatch(r'\s*\$\{?\w+\}?\s*', t) for t in text):
            return self.catch(UNKNOWN_QUERY)
        query, variables = '\n'.join(text), ' '.join(fields)
        if GRAPHQL_OWNER.search(query) or (GRAPHQL_APPROVE.search(query) and 'APPROVE' in query + variables):
            self.catch(MERGE_IS_OWNERS)
        if GRAPHQL_SECURITY.search(query):
            self.catch(SECURITY)
        if GRAPHQL_PUSH.search(query) and re.search(rf'(^|[\s"=:/]){re.escape(self.base)}\b', query + ' ' + variables):
            self.catch(push_to(self.base))

    # ------------------------------------------------------------------ git

    def git(self, args, cwd):
        args, directory = list(args), cwd
        while args and args[0].startswith('-'):
            flag = args.pop(0)
            if flag in ('-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path') and args:
                value = args.pop(0)
                if flag == '-C':
                    directory = str(Path(directory or '.').joinpath(value).resolve()) if '$' not in value else None
        if not args or '--help' in args or '-h' in args:
            return
        sub, rest = args[0], args[1:]
        if sub == 'push':
            self.git_push(rest, directory)
        elif sub in ('switch', 'checkout') and directory and self.is_main(directory):
            if not (sub == 'checkout' and ('--' in rest or '-p' in rest or '--patch' in rest)):
                self.catch(OWN_WORKTREE)

    def git_push(self, args, directory):
        if '--all' in args or '--mirror' in args:
            return self.catch(push_to(self.base))
        valued = {'--repo', '-o', '--push-option', '--receive-pack', '--exec'}
        targets = positionals(args, valued)[1:] or ['HEAD']
        for refspec in targets:
            destination = refspec.lstrip('+').split(':')[-1]
            if destination == 'HEAD':
                destination = current_branch(directory) if directory else None
            if destination is None or '$' in destination:
                self.catch(UNREADABLE)
            elif destination.removeprefix('refs/heads/') == self.base:
                self.catch(push_to(self.base))


def refusal(command, unattended=True, extra=(), base='main', cwd=None, is_main_checkout=None):
    """The first reason a shell command is caught, or None."""
    judge = Judge(unattended, extra, base, is_main_checkout)
    try:
        judge.text(command, cwd or os.getcwd())
    except (Unparsable, IndexError, RecursionError) as error:
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
