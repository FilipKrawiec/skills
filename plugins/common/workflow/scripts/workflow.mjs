#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { manifestsCommand } from './manifests.mjs';
import { projectVerify } from './project-verify.mjs';
import { releaseCommand } from './release.mjs';
import { safetyCommand } from './safety.mjs';
import { lockTimeoutStatus, runWithLocks } from './locks.mjs';
import {
  afkMerge,
  afkPrs,
  afkReadLedger,
} from './lib/afk-board.mjs';
import {
  afkActor,
  afkCheckRun,
  afkConfig,
  afkEndRun,
  afkFlags,
  afkLoadEnvironment,
  afkStartRun,
  hasProcessAncestor,
  processTable,
} from './lib/afk-runs.mjs';
import {
  afkInstall,
  afkReap,
  afkSupervise,
  afkUninstall,
  afkWatch,
} from './lib/afk-watch.mjs';
import {
  cachedGithubMetadata,
  config,
  git,
  githubMetadataPath,
  heldWorkflowLocks,
  run,
  workflowScratch,
  workflowDefaults,
} from './lib/core.mjs';
import {
  issueClaim,
  issueClose,
  issueComment,
  issueCreate,
  issueEdit,
  issueQueue,
  issueReopen,
  issueStatus,
  labelsCommand,
} from './lib/issues.mjs';
import {
  commit,
  push,
  reviewContext,
  reviewPost,
} from './lib/vcs.mjs';
import { nitsCommand, prCommand } from './lib/pr.mjs';
import { nextCommand, statusCommand, waitCommand } from './lib/state.mjs';
import { checkCommand, driveCommand } from './lib/drive.mjs';
import { worktreeCommand } from './lib/worktrees.mjs';

const help = `Usage:
  node workflow.mjs commit --message MESSAGE [-- PATH...]
  node workflow.mjs push [--owner-bootstrap | --to BRANCH]
  node workflow.mjs review-context --pr NUMBER [--claim] [--previous SHA --previous-base SHA] [--issue NUMBER]
  node workflow.mjs review-post --pr NUMBER --sha HEX --event APPROVE|REQUEST_CHANGES|COMMENT --body-file PATH|- [--comments-file PATH|-] [--resolve-thread ID]...
  node workflow.mjs scratch
  node workflow.mjs status NUMBER
  node workflow.mjs wait NUMBER --until ci|reviewed|merged|base [--timeout MINUTES] [--interval SECONDS]
  node workflow.mjs next [--owner]
  node workflow.mjs drive NUMBER [--hand-back FILE|-] | drive --next
  node workflow.mjs check
  node workflow.mjs pr ready|auto-merge --pr NUMBER
  node workflow.mjs nits [--days N] [--done PR...]
  node workflow.mjs issue claim|status|create|comment|edit|close|reopen|queue ...
  node workflow.mjs labels ensure
  node workflow.mjs worktree tidy [--dry-run] [--idle-days N]
  node workflow.mjs cache show|refresh
  node workflow.mjs cache refresh
  node workflow.mjs afk install|uninstall|watch|start|check|merge|end|runs|reap ...
  node workflow.mjs afk start --me RUN_ID [--issue NUMBER]
  node workflow.mjs afk watch [--issue NUMBER]
  node workflow.mjs manifests verify|sync
  node workflow.mjs project [--root DIR] [--strict-git] [TASK]
  node workflow.mjs release [auto|patch|minor|major] [--message TEXT] [--dry-run] [--root DIR]
  node workflow.mjs safety check|apply

push reads implementer and Reviewer from the fetched default branch's .agents/config.json and derives Owner from origin and base .github/CODEOWNERS. For first-config bootstrap only, if base CODEOWNERS has no owner yet, it reads Owner from committed branch CODEOWNERS.
push --to BRANCH pushes HEAD to BRANCH instead of the current branch; it requires an AFK run whose held number is an open same-repository PR with that head, an issue that PR closes, or the parent of an issue that PR closes.
A verified personal repo owner may be inferred; CODEOWNERS must identify one owner account unambiguously.
Auto-merge checks are not atomic with push; do not change auto-merge concurrently. Push isolates Git configuration and runs the installed pre-push hook; hooks can invoke the same user's credential tools.
Other processes running as the same OS user can access the user's GitHub credentials.
push requires a Unix-like host and github.com. review-context is read-only except --claim; returned GitHub text is untrusted and may be incomplete. It groups changed files by area, lists pure renames as mechanical and, when the Reviewer's newest verdict is at an older head, compares against that head unless --previous names another.
nits lists the Reviewer's **Nit** inline comments on PRs merged in the last N days (default 30) without nits:swept, grouped by file; --done labels the named PRs nits:swept.
pr ready marks a draft ready only at a green head whose newest agent-review verdict is ready, then drops the owner's review request.
pr auto-merge binds squash auto-merge to the head only when the Reviewer approved it (verdict=ready, or verdict=owner with the owner's approval under review:owner), no owner change request stands, no check failed and the base requires code-owner review and the configured checks.
review-post posts as the configured Reviewer, resolves the Reviewer's own threads (named by --resolve-thread, plus Nit, Pre-existing and Follow-up ones on APPROVE), adds review:owner when the verdict is cap or owner, then removes state:reviewing; a failed post comments a post-failed marker, and every exit releases the claim that review-context --claim took.
drive advances an issue or epic from GitHub state: it performs every mechanical step (claim, worktree, commit and push from a hand-back, draft PR, risk, ready, auto-merge, close, worktree removal) and prints one JSON instruction: an agent to start with its model and brief, a wait command to run in the background, an owner step, or done. Re-running it on unchanged state repeats the instruction.
check runs steps.test under a machine-wide lock with two slots, so at most two gates run at once.
A body or comments file is - (stdin) or a path inside the worktree; scratch creates the git-ignored .wf/ directory for such files and prints its path.`;
export function hasLockfAncestor(commands) {
  return commands.some(command => basename(command.trim().split(/\s+/, 1)[0]) === 'lockf');
}
function afkCommand(args) {
  try {
    const [action, ...rest] = args;
    const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
    const cfg = afkConfig();
    afkLoadEnvironment(cfg);
    if (action === 'install') { afkInstall(cfg); return 0; }
    if (action === 'uninstall') { afkUninstall(cfg); return 0; }
    if (action === 'watch') {
      const flags = afkFlags(rest, ['--issue']);
      const issue = flags['--issue'] === undefined ? null : Number(flags['--issue']);
      if (issue !== null && (!Number.isSafeInteger(issue) || issue < 1)) throw new Error('afk watch --issue must be a positive issue number');
      return afkWatch(cfg, common, issue);
    }
    if (action === 'supervise' || action === 'finish') {
      const flags = afkFlags(rest, ['--me', '--note', '--why', '--spent']); const id = flags['--me'];
      if (!/^[\w.-]+$/.test(id || '')) throw new Error(`Usage: afk ${action} --me RUN_ID`);
      return action === 'supervise' ? afkSupervise(common, id) : afkEndRun(cfg, common, id, flags['--note'] || null, flags['--why'] ?? '', flags['--spent'] === 'yes');
    }
    if (action === 'reap') { afkLoadEnvironment(cfg); afkReap(cfg, common); return 0; }
    if (action === 'runs') {
      afkLoadEnvironment(cfg);
      const agents = cfg.runsCommand ? JSON.parse(run(cfg.runsCommand[0], cfg.runsCommand.slice(1)) || '[]') : [];
      console.log(agents.filter(a => a.kind === 'background' && (a.name || '').startsWith(cfg.runPrefix) && !['idle', 'done', 'stopped', 'failed'].includes(a.state || a.status)).map(a => a.name).join('\n')); return 0;
    }
    if (action === 'merge') {
      afkActor(cfg);
      const wanted = rest.map(v => { if (!/^[1-9]\d*$/.test(v)) throw new Error(`Invalid PR number: ${v}`); return Number(v); });
      console.log(afkMerge(cfg, afkPrs(cfg), wanted.length ? new Set(wanted) : null).join('\n') || 'Merged nothing.'); return 0;
    }
    if (action === 'start') {
      const flags = afkFlags(rest, ['--me', '--issue']); const id = flags['--me'];
      if (!/^[\w.-]+$/.test(id || '')) throw new Error('Usage: afk start --me RUN_ID');
      const issue = flags['--issue'] === undefined ? null : Number(flags['--issue']);
      if (issue !== null && (!Number.isSafeInteger(issue) || issue < 1)) throw new Error('afk start --issue must be a positive issue number');
      return afkStartRun(cfg, id, common, issue);
    }
    if (action === 'check') {
      if (rest.some(value => value !== '--quiet')) throw new Error('Usage: afk check [--quiet]');
      return afkCheckRun(cfg, common, rest.includes('--quiet'));
    }
    if (action === 'end') {
      const id = afkFlags(rest, ['--me'])['--me'];
      if (!/^[\w.-]+$/.test(id || '')) throw new Error('Usage: afk end --me RUN_ID');
      return afkEndRun(cfg, common, id);
    }
    throw new Error('Usage: afk <install|uninstall|watch|start|check|merge|end|runs|reap|supervise|finish>');
  } catch (error) { console.error(`Blocked: ${error.message}; resolve the cause and retry.`); return 2; }
}
function requiredLocks(command, args) {
  if (command === 'issue') {
    if (args[0] === 'queue') return ['afk-queue'];
    if (args[0] === 'create') return ['issue-create'];
    if (args[0] === 'status') return ['afk-start'];
    if (args[0] === 'claim') {
      const index = args.indexOf('--number');
      return index >= 0 && /^[1-9]\d*$/.test(args[index + 1] || '') ? [`claim-${args[index + 1]}`] : [];
    }
    if (['comment', 'edit', 'close', 'reopen'].includes(args[0])) {
      const index = args.indexOf('--number');
      return index >= 0 && /^[1-9]\d*$/.test(args[index + 1] || '') ? [`issue-${args[0]}-${args[index + 1]}`] : [];
    }
  }
  if (command === 'afk') {
    if (['start', 'check', 'merge', 'end', 'finish'].includes(args[0])) return ['afk-start'];
    if (['install', 'uninstall'].includes(args[0])) return ['afk-watch-tree'];
    if (args[0] === 'reap') return ['afk-reap'];
    if (args[0] === 'watch') return ['afk-start', 'afk-reap', 'afk-watch-tree'];
  }
  return [];
}
function oneShotLedgerRun(command, args) {
  if (command !== 'afk' || !['start', 'end'].includes(args[0])) return null;
  try {
    const id = oneShotRunId(args[0], args.slice(1));
    if (!/^[\w.-]+$/.test(id || '')) return null;
    const { root, lanes } = config();
    if (lanes.runsCommand) return null;
    const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
    return afkReadLedger(join(common, 'afk-holds.json'))[id]?.some(hold => hold.oneShot) ? id : null;
  } catch { return null; }
}
export function oneShotRunId(action, args) {
  if (action === 'start') return afkFlags(args, ['--me', '--issue'])['--me'];
  if (action !== 'end') return null;
  const indexes = args.flatMap((value, index) => value === '--me' ? [index] : []);
  return indexes.length === 1 ? args[indexes[0] + 1] : null;
}
function oneShotWatcherActive(id) {
  try {
    const { root } = config();
    const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
    const hold = afkReadLedger(join(common, 'afk-holds.json'))[id]?.[0];
    const ownerPid = hold?.watcherPid;
    if (!hold?.oneShot || !Number.isSafeInteger(ownerPid)) return false;
    const processes = processTable();
    if (!processes?.get(ownerPid)?.command.includes(fileURLToPath(import.meta.url))) return false;
    if (!hasProcessAncestor(processes, process.ppid, ownerPid)) return false;
    if (processes.get(ownerPid).command.includes(' afk supervise ')) return true;
    const lockPath = join(common, 'workflow-locks', 'afk-start.lock');
    const probe = process.platform === 'darwin'
      ? spawnSync('lockf', ['-t', '0', lockPath, 'true'], { stdio: 'ignore' })
      : spawnSync('flock', ['-n', lockPath, 'true'], { stdio: 'ignore' });
    return !probe.error && probe.status !== 0;
  } catch { return false; }
}
function validInheritedLockContext(names) {
  const token = process.env.WORKFLOW_LOCK_TOKEN || '';
  const proofPath = process.env.WORKFLOW_LOCK_PROOF || '';
  if (!/^[0-9a-f-]{36}$/i.test(token) || !proofPath) return false;
  try {
    const root = git('rev-parse', '--show-toplevel');
    const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
    const lockDirectory = realpathSync(join(common, 'workflow-locks'));
    const proof = realpathSync(proofPath);
    const stat = statSync(proof);
    if (dirname(proof) !== lockDirectory || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) return false;
    const data = JSON.parse(readFileSync(proof, 'utf8'));
    const inherited = [...new Set((process.env.WORKFLOW_LOCK_NAMES || '').split(',').filter(Boolean))].sort();
    const ownerPid = Number(process.env.WORKFLOW_LOCK_OWNER_PID);
    if (data.token !== token || JSON.stringify(data.names) !== JSON.stringify(inherited) || !names.every(name => inherited.includes(name)) || !Number.isSafeInteger(ownerPid)) return false;
    const table = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
    if (table.error || table.status !== 0) return false;
    const processes = new Map();
    for (const line of table.stdout.split('\n')) {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
      if (match) processes.set(Number(match[1]), { parent: Number(match[2]), command: match[3] });
    }
    const owner = processes.get(ownerPid);
    // The owner ran this argv, so its ps line matches ours even where ps escapes the path.
    if (!owner || !(owner.command.includes(fileURLToPath(import.meta.url)) || owner.command.trim() === ownCommandLine())) return false;
    const ancestors = [];
    let pid = process.ppid;
    for (let depth = 0; pid && depth < 16; depth++) {
      if (pid === ownerPid) break;
      const parent = processes.get(pid);
      if (!parent) return false;
      ancestors.push(parent.command);
      pid = parent.parent;
    }
    if (pid !== ownerPid) return false;
    for (const name of names) {
      const lockPath = join(lockDirectory, `${name}.lock`);
      const probe = process.platform === 'darwin'
        ? spawnSync('lockf', ['-t', '0', lockPath, 'true'], { stdio: 'ignore' })
        : spawnSync('flock', ['-n', lockPath, 'true'], { stdio: 'ignore' });
      if (probe.error || probe.status === 0) return false;
      if (process.platform === 'darwin' && !hasLockfAncestor(ancestors)) return false;
    }
    return true;
  } catch { return false; }
}
function cacheCommand(args) {
  if (args.length !== 1 || !['show', 'refresh'].includes(args[0])) throw new Error('Usage: cache show|refresh');
  const { lanes } = config();
  const metadata = cachedGithubMetadata(lanes.repo, args[0] === 'refresh');
  console.log(JSON.stringify({ repository: lanes.repo, base: lanes.base, owner: lanes.owner, reviewer: lanes.reviewer, project: metadata.project, reviewQueue: metadata.reviewQueue, requiredChecks: lanes.requiredChecks, steps: lanes.steps, explore: workflowDefaults.explore, cache: githubMetadataPath() }));
}
async function execute(command, args) {
  if (!command || command === '--help' || command === 'help') console.log(help);
  else if (command === 'commit') commit(args);
  else if (command === 'push') await push(args);
  else if (command === 'review-context') reviewContext(args);
  else if (command === 'review-post') reviewPost(args);
  else if (command === 'pr') { const { lanes } = config(); prCommand(args, lanes); }
  else if (command === 'nits') { const { lanes } = config(); nitsCommand(args, lanes); }
  else if (command === 'issue' && args[0] === 'claim') { const { lanes } = config(); issueClaim(args.slice(1), lanes); }
  else if (command === 'issue' && args[0] === 'status') { const { lanes } = config(); issueStatus(args.slice(1), lanes); }
  else if (command === 'issue' && args[0] === 'create') { config(); issueCreate(args.slice(1)); }
  else if (command === 'issue' && args[0] === 'comment') { config(); issueComment(args.slice(1)); }
  else if (command === 'issue' && args[0] === 'edit') { config(); issueEdit(args.slice(1)); }
  else if (command === 'issue' && args[0] === 'close') { config(); issueClose(args.slice(1)); }
  else if (command === 'issue' && args[0] === 'reopen') { config(); issueReopen(args.slice(1)); }
  else if (command === 'issue' && args[0] === 'queue') { const { lanes } = config(); issueQueue(args.slice(1)); }
  else if (command === 'status') { const { lanes } = config(); statusCommand(args, lanes); }
  else if (command === 'wait') { const { lanes } = config(); process.exitCode = waitCommand(args, lanes); }
  else if (command === 'next') { const { lanes } = config(); nextCommand(args, lanes); }
  else if (command === 'drive') { const { lanes } = config(); driveCommand(args, lanes); }
  else if (command === 'check') { const { lanes } = config(); process.exitCode = checkCommand(args, lanes); }
  else if (command === 'scratch' && !args.length) console.log(JSON.stringify({ path: workflowScratch() }));
  else if (command === 'labels') labelsCommand(args);
  else if (command === 'worktree') worktreeCommand(args);
  else if (command === 'cache') cacheCommand(args);
  else if (command === 'afk') process.exitCode = afkCommand(args);
  else if (command === 'manifests') manifestsCommand(args);
  else if (command === 'project') projectVerify(args);
  else if (command === 'release') process.exitCode = releaseCommand(args);
  else if (command === 'safety') { const { lanes } = config(); process.exitCode = safetyCommand(args, lanes); }
  else throw new Error('Invalid command; use --help');
}
export function needsAbsoluteInvocation(command, self) { return !command.includes(self); }
function ownCommandLine() {
  // Node makes process.argv[1] absolute, so only ps shows how this process was invoked.
  const result = spawnSync('ps', ['-o', 'command=', '-p', String(process.pid)], { encoding: 'utf8' });
  return result.error || result.status !== 0 ? null : result.stdout.trim();
}
const invokedLocked = () => {
  // ps may escape or truncate a path it cannot show literally, so a re-exec'd child never re-execs again.
  const reexecuted = process.env.WORKFLOW_ABSOLUTE_REEXEC === '1';
  delete process.env.WORKFLOW_ABSOLUTE_REEXEC;
  const [command, ...args] = process.argv.slice(2);
  // A lock child already runs by the absolute path its owner chose.
  if (reexecuted || process.env.WORKFLOW_LOCK_TOKEN || !requiredLocks(command, args).length) return false;
  const line = ownCommandLine();
  return line !== null && needsAbsoluteInvocation(line, fileURLToPath(import.meta.url));
};
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && invokedLocked()) {
  // Lock inheritance matches the owner's command line by absolute path.
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, WORKFLOW_ABSOLUTE_REEXEC: '1' } });
  process.exit(result.error ? 1 : result.status ?? 1);
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const names = requiredLocks(command, args);
    const oneShotRun = oneShotLedgerRun(command, args);
    const inherited = names.length && validInheritedLockContext(names);
    if (oneShotRun && !inherited && args[0] === 'end' && oneShotWatcherActive(oneShotRun)) {
      const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
      console.log(`One-shot watcher will release run ${oneShotRun} when the agent exits.`);
    } else if (oneShotRun && !inherited && args[0] === 'start') {
      heldWorkflowLocks.add('afk-start');
      await execute(command, args);
    } else if (names.length && inherited) {
      names.forEach(name => heldWorkflowLocks.add(name));
      delete process.env.WORKFLOW_LOCK_NAMES;
      delete process.env.WORKFLOW_LOCK_TOKEN;
      delete process.env.WORKFLOW_LOCK_PROOF;
      delete process.env.WORKFLOW_LOCK_OWNER_PID;
      await execute(command, args);
    } else if (names.length) {
      const common = realpathSync(resolve(git('rev-parse', '--show-toplevel'), git('rev-parse', '--git-common-dir')));
      const result = runWithLocks(join(common, 'workflow-locks'), names, process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2)], { env: process.env });
      if (result.status === lockTimeoutStatus) console.error(`workflow: lock timed out while acquiring ${names.join(', ')}`);
      process.exitCode = result.status ?? 1;
    } else await execute(command, args);
  } catch (error) {
    console.error(`workflow: ${error.message}`);
    process.exitCode = 1;
  }
}
