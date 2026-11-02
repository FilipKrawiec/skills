import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  afkReadLedger,
  afkWriteLedger,
} from './afk-board.mjs';
import {
  afkAgentEnvironment,
  afkCheckRun,
  afkEndRun,
  afkLive,
  afkLoadEnvironment,
  afkRunUsage,
  afkStartRun,
} from './afk-runs.mjs';
import {
  afkExpandedPath,
  afkGh,
  cleanEnvironment,
  git,
  run,
  withRepoLock,
} from './core.mjs';

export function afkWorkflowCliPath() { return realpathSync(fileURLToPath(new URL('../workflow.mjs', import.meta.url))); }
export function afkPluginDir(cliPath) { return resolve(dirname(cliPath), '..', '..'); }
const toolingCli = join('plugins', 'common', 'workflow', 'scripts', 'workflow.mjs');
export function afkEnsureTooling(directory, repository, ref) {
  const env = cleanEnvironment();
  if (!existsSync(directory)) {
    mkdirSync(dirname(directory), { recursive: true });
    run('git', ['clone', '--quiet', '--no-checkout', repository, directory], { env });
  } else {
    let top;
    try { top = realpathSync(run('git', ['rev-parse', '--show-toplevel'], { cwd: directory, env })); } catch {}
    if (top !== realpathSync(directory)) throw new Error(`${directory} is not a Git checkout of the workflow tooling; preserve it and choose another afk.toolingDirectory`);
    if (run('git', ['remote', 'get-url', 'origin'], { cwd: directory, env }) !== repository) throw new Error(`${directory} tracks another repository; preserve it and choose another afk.toolingDirectory`);
    run('git', ['fetch', '--quiet', 'origin', ref], { cwd: directory, env });
    if (run('git', ['status', '--porcelain'], { cwd: directory, env })) throw new Error(`${directory} has local changes; preserve them and retry after cleanup`);
  }
  run('git', ['checkout', '--quiet', '--detach', `origin/${ref}`], { cwd: directory, env });
  return join(directory, toolingCli);
}
export function afkLauncherSource({ toolingDirectory, ref }) {
  return `import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const dir = ${JSON.stringify(toolingDirectory)};
const ref = ${JSON.stringify(ref)};
const cli = join(dir, ${JSON.stringify(toolingCli)});
const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
if (git('fetch', '--quiet', 'origin', ref).status !== 0) console.error('Workflow tooling update failed; running the current version');
else if (git('status', '--porcelain').stdout.trim()) console.error(\`Workflow tooling at \${dir} has local changes; running its current version\`);
else if (git('checkout', '--quiet', '--detach', \`origin/\${ref}\`).status !== 0) console.error('Workflow tooling checkout failed; running the current version');
if (!existsSync(cli)) { console.error('The workflow CLI is missing; rerun afk install'); process.exit(1); }
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exit(1); }
process.exit(result.status ?? 1);
`;
}
function afkConfiguredCommand(argv, replacements = {}, options = {}) {
  const values = argv.map(value => value.replace(/\{([A-Za-z]+)\}/g, (match, key) => {
    if (!Object.hasOwn(replacements, key)) throw new Error(`Unknown command placeholder ${match}`);
    return String(replacements[key]);
  }));
  const [program, ...args] = values;
  const { graceMs, ...spawnOptions } = options;
  const result = spawnSync(program, args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: afkAgentEnvironment(), ...spawnOptions });
  if (result.error?.code === 'ETIMEDOUT') {
    if (options.detached) afkStopGroup(result.pid, graceMs);
    throw Object.assign(new Error(`${program} ${args[0] || ''} stopped after ${afkDuration(options.timeout)}`), { code: 'ETIMEDOUT' });
  }
  if (result.error || result.status !== 0) throw new Error(`${program} ${args[0] || ''} failed`);
  return (result.stdout || '').trim();
}
// A limit under a minute, as only a test sets, reads in seconds, never as "0 minutes".
export function afkDuration(ms) {
  const [count, unit] = ms >= 60_000 ? [Math.round(ms / 60_000), 'minute'] : [Math.ceil(ms / 1000), 'second'];
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
// Stops a whole process group: SIGTERM first, SIGKILL for whatever is left after the grace period.
function afkStopGroup(pid, graceMs = 10_000) {
  const signal = name => { try { process.kill(-pid, name); return true; } catch { return false; } };
  if (!Number.isSafeInteger(pid) || !signal('SIGTERM')) return;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (const end = Date.now() + graceMs; Date.now() < end && signal(0);) Atomics.wait(pause, 0, 0, 100);
  signal('SIGKILL');
}
// A supervisor's agent leads its own process group (afkLaunchAgent runs it detached), so each child's group is stopped whole; a child that leads no group is left alone.
export function afkStopSupervisedAgent(supervisorPid, graceMs) {
  const children = spawnSync('pgrep', ['-P', String(supervisorPid)], { encoding: 'utf8' }).stdout || '';
  for (const pid of children.split('\n').map(Number).filter(pid => pid > 0)) afkStopGroup(pid, graceMs);
}
// A run past afk.maxRunMinutes is stopped with its whole process group, so its supervisor releases the hold and the next tick serves the work again.
export function afkLaunchAgent({ argv, replacements, cwd, runId, issue, timeoutMs, graceMs, source = process.env }) {
  const env = afkAgentEnvironment(source);
  delete env.WORKFLOW_RUN_ID;
  delete env.WORKFLOW_ISSUE_NUMBER;
  if (runId) env.WORKFLOW_RUN_ID = runId;
  if (issue != null) env.WORKFLOW_ISSUE_NUMBER = String(issue);
  return afkConfiguredCommand(argv, replacements, { cwd, env, ...(timeoutMs ? { timeout: timeoutMs, killSignal: 'SIGTERM', detached: true, graceMs } : {}) });
}
export function afkReap(cfg, common) {
  if (!cfg.runsCommand) return;
  const file = join(common, 'afk-prompt-waits.json'); let previous = {};
  try { previous = JSON.parse(readFileSync(file, 'utf8')); } catch {}
  const agents = JSON.parse(run(cfg.runsCommand[0], cfg.runsCommand.slice(1)) || '[]')
    .filter(agent => agent.kind === 'background' && (agent.name || '').startsWith(cfg.runPrefix) && agent.id);
  const now = Date.now(), waiting = {}, stops = [];
  for (const agent of agents) {
    if (typeof agent.id !== 'string' || !/^[A-Za-z0-9._-]+$/.test(agent.id)) continue;
    let ended = false;
    if (agent.status === 'idle') {
      try {
        const statePath = afkExpandedPath(cfg.stateFile.replaceAll('{id}', agent.id));
        ended = !JSON.parse(readFileSync(statePath, 'utf8')).inFlight?.tasks?.length;
      } catch {}
    }
    const reason = agent.waitingFor || (ended ? 'finished turn' : null);
    if (reason) waiting[agent.id] = previous[agent.id] || now;
    const started = afkRunStarted(agent.name.slice(cfg.runPrefix.length));
    if (started !== null && !['done', 'stopped', 'failed'].includes(agent.state || agent.status) && now - started >= cfg.maxRunMinutes * 60_000) stops.push({ agent, why: `stopped after ${afkDuration(cfg.maxRunMinutes * 60_000)}` });
    else if (agent.state === 'done' || (agent.state === 'blocked' && !agent.waitingFor) || (reason && now - waiting[agent.id] >= cfg.waitTimeoutMinutes * 60_000)) stops.push({ agent, why: 'wait ended' });
  }
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(waiting)); renameSync(temp, file);
  for (const { agent, why } of stops) {
    afkConfiguredCommand(cfg.stopCommand, { runId: agent.name || agent.id, id: agent.id });
    console.error(`stopped ${agent.name}: ${why}`);
  }
}
// A launched agent cannot be timed while its launcher returns at once, so reap stops it by the UTC start its watcher-made name carries.
export function afkRunStarted(suffix) {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})-/.exec(suffix);
  return match ? Date.UTC(match[1], match[2] - 1, match[3], match[4], match[5], match[6]) : null;
}
// A held PR whose head moved to a commit its live run's checkout does not contain was pushed by someone else, so that run's work is stale.
export function afkForeignHeads(ledger, live, headOf, ownsHead) {
  return Object.entries(ledger).filter(([id]) => live.includes(id)).flatMap(([id, holds]) => holds
    .filter(hold => typeof hold.head === 'string' && Number.isSafeInteger(hold.pr))
    .map(hold => ({ id, pr: hold.pr, from: hold.head, to: headOf(hold.pr) }))
    .filter(moved => moved.to && moved.to !== moved.from && !ownsHead(id, moved.to)));
}
// A run pushed a head its checkout's HEAD contains or once pointed at (it may rebase after pushing); a head the checkout never fetched is someone else's.
export function afkOwnsHead(tree, head) {
  const env = cleanEnvironment();
  if (spawnSync('git', ['merge-base', '--is-ancestor', head, 'HEAD'], { cwd: tree, stdio: 'ignore', env }).status === 0) return true;
  const visited = spawnSync('git', ['log', '-g', '--format=%H', 'HEAD'], { cwd: tree, encoding: 'utf8', env });
  return visited.status === 0 && visited.stdout.split('\n').includes(head);
}
// Stops each run whose held PR someone else pushed, as reap does, and releases its hold so the next check serves the PR again.
function afkReleaseForeignHeads(cfg, common) {
  const live = afkLive(cfg);
  const ledger = afkReadLedger(join(common, 'afk-holds.json'));
  const treeOf = id => { try { return JSON.parse(readFileSync(afkJobPath(common, id), 'utf8')).tree; } catch { return join(dirname(common), '.claude', 'worktrees', id); } };
  // A run whose checkout cannot be found cannot be told from a foreign pusher, so it keeps its hold.
  const owns = (id, head) => { const tree = treeOf(id); return !tree || !existsSync(tree) || afkOwnsHead(tree, head); };
  const headOf = number => { try { return afkGh(['api', `repos/${cfg.repo}/pulls/${number}`]).head?.sha; } catch { return null; } };
  const moved = afkForeignHeads(ledger, live, headOf, owns);
  // The released PR is served by this tick's check, never skipped as quiet.
  if (moved.length) rmSync(join(common, 'afk-check.json'), { force: true });
  for (const { id, pr, from, to } of moved) {
    if (cfg.runsCommand) {
      const agent = JSON.parse(run(cfg.runsCommand[0], cfg.runsCommand.slice(1)) || '[]').find(item => item.name === id && typeof item.id === 'string' && /^[A-Za-z0-9._-]+$/.test(item.id));
      if (agent) afkConfiguredCommand(cfg.stopCommand, { runId: id, id: agent.id });
    } else {
      // Ending the supervisor's agent lets the supervisor release the run's worktree as usual.
      let job = {}; try { job = JSON.parse(readFileSync(afkJobPath(common, id), 'utf8')); } catch {}
      if (Number.isSafeInteger(job.pid)) afkStopSupervisedAgent(job.pid);
    }
    console.error(`stopped ${id}: PR #${pr}'s head moved from ${from.slice(0, 7)} to ${to.slice(0, 7)}, a push it did not make`);
    afkEndRun(cfg, common, id, `Stopped: PR #${pr}'s head moved to ${to}, a push this run did not make; the PR is served again.`);
  }
}
function afkWatchTree(cfg) {
  const root = git('rev-parse', '--show-toplevel');
  const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
  const watch = afkWatchPath(common);
  const marker = join(common, 'afk-watch-worktree.json');
  afkExcludeWorktrees(common);
  run('git', ['fetch', '--quiet', 'origin', cfg.base], { cwd: root, env: cleanEnvironment() });
  mkdirSync(dirname(watch), { recursive: true });
  if (!existsSync(watch)) {
    run('git', ['worktree', 'add', '--quiet', '--detach', watch, `origin/${cfg.base}`], { cwd: root, env: cleanEnvironment() });
    writeFileSync(marker, JSON.stringify({ common, watch: realpathSync(watch) }));
  } else {
    let actual;
    try { actual = realpathSync(run('git', ['rev-parse', '--show-toplevel'], { cwd: watch })); }
    catch { throw new Error(`${watch} exists but is not a Git worktree; preserve it and resolve manually`); }
    if (actual !== realpathSync(watch)) throw new Error(`${watch} resolves to another checkout`);
    const watchCommon = realpathSync(resolve(watch, run('git', ['rev-parse', '--git-common-dir'], { cwd: watch })));
    if (watchCommon !== common) throw new Error(`${watch} belongs to a different repository`);
    const attached = spawnSync('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd: watch, encoding: 'utf8', env: cleanEnvironment() });
    if (attached.error || attached.status === 0) throw new Error(`${watch} has an attached branch; preserve it and resolve manually`);
    if (attached.status !== 1) throw new Error(`${watch} HEAD state is unreadable; preserve it and resolve manually`);
    let ownership;
    try { ownership = JSON.parse(readFileSync(marker, 'utf8')); } catch {}
    if (ownership && (ownership.common !== common || ownership.watch !== realpathSync(watch))) throw new Error(`${watch} does not match its CLI ownership record; preserve it and resolve manually`);
    const tracked = spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], { cwd: watch, env: cleanEnvironment() });
    const staged = spawnSync('git', ['diff', '--cached', '--quiet', '--'], { cwd: watch, env: cleanEnvironment() });
    if (tracked.error || tracked.status !== 0 || staged.error || staged.status !== 0) throw new Error(`${watch} has tracked changes; preserve them and retry after cleanup`);
    const localOnly = run('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], { cwd: watch }).split('\0').filter(Boolean);
    const target = run('git', ['ls-tree', '-r', '--name-only', '-z', `origin/${cfg.base}`], { cwd: watch }).split('\0').filter(Boolean);
    const targetPaths = new Set();
    for (const trackedPath of target) {
      targetPaths.add(trackedPath);
      let parent = trackedPath;
      while (parent.includes('/')) { parent = parent.slice(0, parent.lastIndexOf('/')); targetPaths.add(parent); }
    }
    const collision = localOnly.find(path => targetPaths.has(path));
    if (collision) throw new Error(`${watch} has an untracked or ignored file that would collide with ${cfg.base}: ${collision}; preserve it and resolve manually`);
    if (!ownership) {
      writeFileSync(marker, JSON.stringify({ common, watch: realpathSync(watch) }));
      if (localOnly.length) console.log(`Adopted detached watcher and preserved ${localOnly.length} untracked or ignored path(s).`);
    }
    run('git', ['checkout', '--quiet', '--no-overwrite-ignore', '--detach', `origin/${cfg.base}`], { cwd: watch, env: cleanEnvironment() });
  }
  return watch;
}
// Keeps the watcher's and runs' worktrees out of the main checkout's status, whatever the repository ignores.
export function afkExcludeWorktrees(common) {
  const file = join(common, 'info', 'exclude');
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const missing = ['/.worktrees/', '/.claude/worktrees/'].filter(entry => !current.split('\n').includes(entry));
  if (!missing.length) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
}
function afkWatchPath(common) { return join(dirname(common), '.worktrees', 'afk-watch'); }
// Each launched run works in its own worktree, so work it leaves behind can never block the watcher's checkout.
// A start command with --worktree lets Claude Code create it natively under .claude/worktrees/<run id>; otherwise the watcher creates one.
function afkRunTree(cfg, common, runId) {
  if (cfg.startCommand.includes('--worktree')) return { tree: join(dirname(common), '.claude', 'worktrees', runId), native: true };
  const tree = join(dirname(common), '.worktrees', runId);
  run('git', ['worktree', 'add', '--quiet', '--detach', tree, `origin/${cfg.base}`], { cwd: dirname(common), env: cleanEnvironment() });
  return { tree, native: false };
}
// Removes a run's worktree, and the branch Claude Code made for it, only when nothing in them is missing from the remote; returns whether it is gone.
export function afkReleaseRunTree(tree, root) {
  if (!existsSync(tree)) return true;
  const env = cleanEnvironment();
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: tree, encoding: 'utf8', env });
  const unpushed = spawnSync('git', ['log', '--oneline', 'HEAD', '--not', '--remotes'], { cwd: tree, encoding: 'utf8', env });
  if (status.error || status.status !== 0 || status.stdout.trim() || unpushed.error || unpushed.status !== 0 || unpushed.stdout.trim()) return false;
  spawnSync('git', ['worktree', 'unlock', tree], { cwd: root, env });
  if (spawnSync('git', ['worktree', 'remove', tree], { cwd: root, env }).status !== 0) return false;
  const branch = `worktree-${basename(tree)}`;
  const own = spawnSync('git', ['log', '--oneline', `refs/heads/${branch}`, '--not', '--remotes'], { cwd: root, encoding: 'utf8', env });
  if (own.status === 0 && !own.stdout.trim()) spawnSync('git', ['branch', '-D', branch], { cwd: root, env });
  return true;
}
// Releases run worktrees whose watcher process has ended, so a crashed or killed run never leaves one behind unreported.
export function afkSweepRunTrees(cfg, root, alive = afkPidAlive) {
  const listed = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8', env: cleanEnvironment() });
  if (listed.status !== 0) return;
  for (const line of listed.stdout.split('\n')) {
    if (!line.startsWith('worktree ')) continue;
    const tree = line.slice(9), name = basename(tree);
    const pid = Number(new RegExp(`^${cfg.runPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{14}-(\\d+)-\\d+$`).exec(name)?.[1]);
    if (!pid || alive(pid, name)) continue;
    if (!afkReleaseRunTree(tree, root)) console.log(`Kept: ${tree} holds work that is not on the remote; preserve it.`);
  }
}
function plistText(xml, key) {
  const match = new RegExp(`<key>${key}<\\/key>\\s*<string>([\\s\\S]*?)<\\/string>`).exec(xml);
  return match?.[1].replaceAll('&apos;', "'").replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&') ?? null;
}
function plistArguments(xml) {
  const match = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(xml);
  return match ? [...match[1].matchAll(/<string>([\s\S]*?)<\/string>/g)].map(item => item[1].replaceAll('&apos;', "'").replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&')) : [];
}
export function afkPlistBelongsToWorkflow(xml, { label, launcher, executable, watchDirectory, repositoryRoot, allowLegacy = false }) {
  if (plistText(xml, 'Label') !== label) return false;
  const args = plistArguments(xml);
  if (args.length === 4 && args[0] === executable && args[1] === launcher && args[2] === 'afk' && args[3] === 'watch' && plistText(xml, 'WorkingDirectory') === watchDirectory) return true;
  return allowLegacy && args.length === 2 && basename(args[0] || '') === 'just' && args[1] === 'afk-watch' && plistText(xml, 'WorkingDirectory') === repositoryRoot;
}
export function afkInstall(cfg) {
  if (process.platform !== 'darwin') throw new Error('afk install currently requires macOS launchd');
  afkLoadEnvironment(cfg);
  const watch = withRepoLock('afk-watch-tree', () => afkWatchTree(cfg));
  const cliPath = afkWorkflowCliPath();
  const label = cfg.serviceLabel;
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const launcher = join(common, 'afk-launch.mjs');
  const repositoryRoot = git('rev-parse', '--show-toplevel');
  const plistPath = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  if (existsSync(plistPath)) {
    const existing = readFileSync(plistPath, 'utf8');
    if (!afkPlistBelongsToWorkflow(existing, { label, launcher, executable: process.execPath, watchDirectory: watch, repositoryRoot, allowLegacy: true })) throw new Error(`LaunchAgent ${label} already belongs to another service; preserve ${plistPath} and choose a unique afk.serviceLabel`);
  } else {
    const loaded = spawnSync('launchctl', ['print', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
    if (!loaded.error && loaded.status === 0) throw new Error(`LaunchAgent ${label} is already loaded without an owned plist; preserve it and choose a unique afk.serviceLabel`);
  }
  const toolingDirectory = afkExpandedPath(cfg.toolingDirectory);
  afkEnsureTooling(toolingDirectory, cfg.toolingRepository, cfg.toolingRef);
  const launcherSource = afkLauncherSource({ toolingDirectory, ref: cfg.toolingRef });
  writeFileSync(launcher, launcherSource, { mode: 0o700 });
  const logPath = join(homedir(), 'Library', 'Logs', `${label}.log`);
  const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  const args = [process.execPath, launcher, 'afk', 'watch'];
  const plist = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${xml(label)}</string>\n<key>ProgramArguments</key><array>${args.map(arg => `<string>${xml(arg)}</string>`).join('')}</array>\n<key>WorkingDirectory</key><string>${xml(watch)}</string>\n<key>EnvironmentVariables</key><dict><key>HOME</key><string>${xml(homedir())}</string><key>PATH</key><string>${xml(process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin')}</string></dict>\n<key>AbandonProcessGroup</key><true/><key>StartInterval</key><integer>${cfg.watchIntervalSeconds}</integer><key>RunAtLoad</key><true/>\n<key>StandardOutPath</key><string>${xml(logPath)}</string><key>StandardErrorPath</key><string>${xml(logPath)}</string>\n</dict></plist>\n`;
  mkdirSync(dirname(plistPath), { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });
  const temp = `${plistPath}.${process.pid}.tmp`;
  writeFileSync(temp, plist, { mode: 0o600 }); renameSync(temp, plistPath);
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
  run('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]);
  console.log(`Installed: ${label}; watcher worktree ${watch}`);
}
export function afkUninstall(cfg) {
  if (process.platform !== 'darwin') throw new Error('afk uninstall currently requires macOS launchd');
  const label = cfg.serviceLabel;
  const plist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
  const realCommon = realpathSync(common);
  const watch = afkWatchPath(realCommon);
  if (!existsSync(plist) || !afkPlistBelongsToWorkflow(readFileSync(plist, 'utf8'), { label, launcher: join(realCommon, 'afk-launch.mjs'), executable: process.execPath, watchDirectory: watch, repositoryRoot: git('rev-parse', '--show-toplevel') })) {
    throw new Error(`LaunchAgent ${label} is not an owned workflow watcher; preserve it and inspect ${plist}`);
  }
  spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${label}`], { stdio: 'ignore' });
  rmSync(plist, { force: true });
  rmSync(join(common, 'afk-launch.mjs'), { force: true });
  console.log(`Uninstalled: ${label}. The watcher worktree is preserved.`);
}
export function afkWatch(cfg, common, requestedIssue = null) {
  afkLoadEnvironment(cfg);
  const currentCli = afkWorkflowCliPath();
  const watchRoot = withRepoLock('afk-watch-tree', () => afkWatchTree(cfg));
  if (cfg.pluginUpdateCommands.length) {
    const stamp = join(common, 'afk-plugin-sync');
    let update = true;
    try { update = Date.now() - statSync(stamp).mtimeMs >= cfg.pluginUpdateIntervalMinutes * 60_000; } catch {}
    if (update) {
      writeFileSync(stamp, String(Date.now()));
      try {
        for (const command of cfg.pluginUpdateCommands) afkConfiguredCommand(command);
        rmSync(join(common, 'afk-check.json'), { force: true });
      } catch (error) { console.error(`plugin update failed; retry after ${cfg.pluginUpdateIntervalMinutes} minutes: ${error.message}`); }
    }
  }
  afkReap(cfg, common);
  afkReleaseForeignHeads(cfg, common);
  if (!cfg.runsCommand) afkSweepRunTrees(cfg, dirname(common), (pid, name) => afkRunAlive(common, pid, name));
  const result = {};
  const code = afkCheckRun(cfg, common, true, result, requestedIssue);
  for (let i = 1; i <= (result.start || 0); i++) {
    const runId = `${cfg.runPrefix}${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${process.pid}-${i}`;
    const cliPath = currentCli;
    const issueArg = requestedIssue ? ` --issue ${requestedIssue}` : '';
    const assignment = cfg.runsCommand ? null : afkStartRun(cfg, runId, common, requestedIssue, true, true);
    const held = typeof assignment === 'string' && assignment.includes('Hold:');
    // The watcher holds the start lock, so a launched agent can never run afk start itself; without a hold it launches nothing.
    if (!cfg.runsCommand && !held) continue;
    const holds = afkReadLedger(join(common, 'afk-holds.json'))[runId] || [];
    const prompt = `${cfg.promptPrefix ? `${cfg.promptPrefix}\n` : ''}Use the AFK skill for one unattended work slice. Run id: ${runId}.${held ? ` The workflow CLI already holds this assignment; use it as complete scope and do not call afk start or afk end.\n${assignment}` : ` Begin with: node ${cliPath} afk start --me ${runId}${issueArg}. End through the AFK skill's end step.`}`;
    const launch = { argv: cfg.startCommand, replacements: { runId, prompt, model: cfg.model, permissionMode: cfg.permissionMode, cliPath, pluginDir: afkPluginDir(cliPath), repository: cfg.repo }, cwd: watchRoot, runId: held || cfg.runsCommand ? runId : null, issue: held ? holds[0]?.number : null, timeoutMs: cfg.maxRunMinutes * 60_000 };
    if (cfg.runsCommand) { console.log(afkRunReport(runId, afkLaunchAgent(launch))); continue; }
    let runTree = null;
    try {
      if (held && (holds.length !== 1 || !Number.isSafeInteger(holds[0].number) || holds[0].number < 1)) throw new Error('AFK watcher cannot bind the held issue');
      runTree = afkRunTree(cfg, common, runId);
      if (!runTree.native) launch.cwd = runTree.tree;
      afkSpawnRun(common, runId, { launch, held, tree: runTree.tree, root: dirname(common) });
    } catch (error) {
      if (held) afkEndRun(cfg, common, runId);
      if (runTree && !afkReleaseRunTree(runTree.tree, dirname(common))) console.log(`Kept: ${runTree.tree} holds work that is not on the remote; preserve it.`);
      throw error;
    }
    console.log(`Launched: ${runId}`);
  }
  return code === 2 ? 2 : 0;
}
function afkRunReport(runId, output) {
  const usage = afkRunUsage(output);
  return output ? `Completed: ${runId}\n${usage ? `${usage.result}\n${usage.line}` : output}` : `Started: ${runId}`;
}
function afkJobPath(common, runId) { return join(common, 'afk-runs', `${runId}.json`); }
function afkWriteJob(path, job) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(job)); renameSync(temp, path);
}
// Each run gets a detached supervisor, so the watcher returns at once and every tick can start runs up to afk.maxRuns.
// The supervisor owns the hold from here: the watcher still holds the start lock, so the run cannot end before it is rebound.
function afkSpawnRun(common, runId, job) {
  const path = afkJobPath(common, runId);
  afkWriteJob(path, job);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../workflow.mjs', import.meta.url)), 'afk', 'supervise', '--me', runId], { cwd: job.launch.cwd, detached: true, stdio: 'inherit', env: process.env });
  child.on('error', error => console.error(`Blocked: the supervisor of run ${runId} failed: ${error.message}`));
  child.unref();
  if (!Number.isSafeInteger(child.pid)) { rmSync(path, { force: true }); throw new Error(`cannot start the supervisor of run ${runId}`); }
  afkWriteJob(path, { ...job, pid: child.pid });
  if (!job.held) return;
  withRepoLock('afk-start', () => {
    const ledgerPath = join(common, 'afk-holds.json'); const ledger = afkReadLedger(ledgerPath);
    for (const hold of ledger[runId] || []) hold.watcherPid = child.pid;
    afkWriteLedger(ledgerPath, ledger);
  });
}
// Runs one launched agent to its end, then releases its hold and its worktree.
export function afkSupervise(common, runId) {
  const path = afkJobPath(common, runId);
  const job = JSON.parse(readFileSync(path, 'utf8'));
  let output, usage = null, why = null;
  try {
    output = afkLaunchAgent(job.launch);
    usage = afkRunUsage(output);
    why = usage?.result?.trim() ? usage.result : null;
  } catch (error) {
    if (error.code === 'ETIMEDOUT') why = `Stopped after ${afkDuration(job.launch.timeoutMs)}, the afk.maxRunMinutes limit.`;
    throw error;
  } finally {
    const finished = job.held ? spawnSync(process.execPath, [fileURLToPath(new URL('../workflow.mjs', import.meta.url)), 'afk', 'finish', '--me', runId, ...(why ? ['--why', why] : []), ...(usage ? ['--note', usage.line] : []), ...(usage?.ok ? ['--spent', 'yes'] : [])], { cwd: job.root, stdio: 'inherit', env: process.env }) : null;
    if (finished && finished.status !== 0) console.error(`Blocked: run ${runId} still holds its issue; release it with afk end --me ${runId}.`);
    if (job.tree && !afkReleaseRunTree(job.tree, job.root)) console.log(`Kept: ${job.tree} holds work that is not on the remote; preserve it.`);
    rmSync(path, { force: true });
  }
  console.log(afkRunReport(runId, output));
  return 0;
}
// A run is live while its watcher or its supervisor is; the watcher records the supervisor in the job file as it starts it.
export function afkRunAlive(common, pid, name, isAlive = afkPidAlive) {
  if (pid && isAlive(pid)) return true;
  let job; try { job = JSON.parse(readFileSync(afkJobPath(common, name), 'utf8')); } catch { return false; }
  if (Number.isSafeInteger(job.pid) && isAlive(job.pid)) return true;
  rmSync(afkJobPath(common, name), { force: true });
  return false;
}
function afkPidAlive(pid) { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } }
