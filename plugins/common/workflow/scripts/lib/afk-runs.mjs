import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  afkCandidates,
  afkComments,
  afkFree,
  afkHeldLines,
  afkLiveHolds,
  afkMergeThenPlan,
  afkPathsFromIssueBody,
  afkPathsWithinScope,
  afkPlan,
  afkPrData,
  afkPrRecord,
  afkReadLedger,
  afkSpentEntries,
  afkStartRefusal,
  afkWriteLedger,
} from './afk-board.mjs';
import {
  afkExpandedPath,
  afkGh,
  afkMarker,
  applyGithubMetadata,
  assertDistinctPushRoles,
  cachedGithubMetadata,
  cleanEnvironment,
  config,
  git,
  githubPushRemoteMatches,
  githubScopeFailure,
  jsonCommand,
  missingProjectScope,
  requireTestStep,
  run,
  withRepoLock,
  workflowDefaults,
} from './core.mjs';

export function afkAgentEnvironment(source = process.env) { return cleanEnvironment(source); }
export function afkFlags(args, allowed) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!allowed.includes(key) || !args[i + 1] || Object.hasOwn(result, key)) throw new Error(`Expected ${allowed.join(' ')}`);
    result[key] = args[i + 1];
  }
  return result;
}
// A configured model alone reaches the default runner command.
export function afkDefaultStartCommand(model) {
  const argv = workflowDefaults.afk.startCommand;
  return model === undefined ? argv : argv.flatMap(value => value === '--print' ? [value, '--model', '{model}'] : [value]);
}
export function afkActor(cfg) {
  const actor = afkGh(['api', 'user']).login;
  if (!cfg.implementer || actor?.toLowerCase() !== cfg.implementer.toLowerCase()) throw new Error(`Authenticated as ${actor || 'unknown'}; AFK writes require ${cfg.implementer || 'a configured implementer'}`);
}
export function afkCheckRunLimits(lanes) {
  for (const key of ['maxRuns']) if (!Number.isSafeInteger(lanes[key]) || lanes[key] < 1) throw new Error(`afk.${key} must be a positive integer`);
}
export function afkConfig(refreshMetadata = false) {
  git('fetch', '--quiet', 'origin');
  const { lanes, baseRef } = config();
  if (!lanes.repo || !lanes.implementer || !lanes.reviewer) throw new Error('Configure identities.implementer and identities.reviewer; repo comes from Git and Owner from CODEOWNERS');
  assertDistinctPushRoles({ owner: lanes.owner, implementer: lanes.implementer, reviewer: lanes.reviewer });
  lanes.startCommand ??= afkDefaultStartCommand(lanes.model);
  for (const [key, value] of Object.entries(workflowDefaults.afk)) lanes[key] ??= value;
  lanes.serviceLabel ??= `dev.workflow.afk.${lanes.repo.replace('/', '.')}`;
  afkCheckRunLimits(lanes);
  afkCheckRetroMode(lanes.retros);
  lanes.explore = { ...workflowDefaults.explore };
  if (!Object.hasOwn(lanes.steps, 'process') || !Object.hasOwn(lanes.steps, 'assemble')) throw new Error('Configure steps.process and steps.assemble; use null when a phase is skill-handled or not applicable');
  requireTestStep(lanes.steps);
  lanes.refreshMetadata = refreshMetadata;
  if (typeof lanes.runPrefix !== 'string' || !lanes.runPrefix.trim()) throw new Error('afk.runPrefix must be a non-empty string');
  for (const key of ['runsCommand', 'startCommand', 'stopCommand']) {
    if (lanes[key] === undefined && key !== 'startCommand') continue;
    if (!Array.isArray(lanes[key]) || !lanes[key].length || !lanes[key].every(value => typeof value === 'string' && value.length)) throw new Error(`Configure afk.${key} as a non-empty argv array`);
  }
  lanes.base = lanes.base || baseRef.slice('refs/remotes/origin/'.length);
  if (typeof lanes.environmentFile !== 'string' || !lanes.environmentFile.trim()) throw new Error('afk.environmentFile must be a non-empty string');
  for (const key of ['toolingRepository', 'toolingRef', 'toolingDirectory']) if (typeof lanes[key] !== 'string' || !lanes[key].trim()) throw new Error(`afk.${key} must be a non-empty string`);
  if (lanes.startCommand.some(value => value.includes('{model}')) && (typeof lanes.model !== 'string' || !lanes.model.trim())) throw new Error('Configure afk.model because startCommand uses {model}');
  if (lanes.startCommand.some(value => value.includes('{permissionMode}')) && (typeof lanes.permissionMode !== 'string' || !lanes.permissionMode.trim())) throw new Error('Configure afk.permissionMode because startCommand uses {permissionMode}');
  if (lanes.promptPrefix !== undefined && typeof lanes.promptPrefix !== 'string') throw new Error('Configure afk.promptPrefix as a string');
  if (!Number.isSafeInteger(lanes.maxRunMinutes) || lanes.maxRunMinutes < 1) throw new Error('Configure afk.maxRunMinutes as a positive integer');
  if (!Number.isSafeInteger(lanes.watchIntervalSeconds) || lanes.watchIntervalSeconds < 15) throw new Error('Configure afk.watchIntervalSeconds as an integer of at least 15');
  if (lanes.runsCommand && (!Number.isSafeInteger(lanes.waitTimeoutMinutes) || lanes.waitTimeoutMinutes < 1)) throw new Error('Configure afk.waitTimeoutMinutes as a positive integer when afk.runsCommand is set');
  if (lanes.runsCommand && (!lanes.stopCommand || typeof lanes.stateFile !== 'string' || !lanes.stateFile.includes('{id}'))) throw new Error('Configure afk.stopCommand and afk.stateFile with {id} when afk.runsCommand is set');
  if (!lanes.startCommand.some(value => value.includes('{runId}')) || !lanes.startCommand.some(value => value.includes('{prompt}'))) throw new Error('afk.startCommand must include {runId} and {prompt}');
  if (typeof lanes.serviceLabel !== 'string' || !/^[A-Za-z0-9.-]+$/.test(lanes.serviceLabel)) throw new Error('Configure afk.serviceLabel');
  lanes.pluginUpdateCommands ??= [];
  if (!Array.isArray(lanes.pluginUpdateCommands) || !lanes.pluginUpdateCommands.every(argv => Array.isArray(argv) && argv.length && argv.every(value => typeof value === 'string' && value))) throw new Error('Configure afk.pluginUpdateCommands as an array of argv arrays');
  if (lanes.pluginUpdateCommands.length && (!Number.isSafeInteger(lanes.pluginUpdateIntervalMinutes) || lanes.pluginUpdateIntervalMinutes < 1)) throw new Error('Configure afk.pluginUpdateIntervalMinutes');
  run('git', ['check-ref-format', '--branch', lanes.base]);
  return lanes;
}
export function afkLive(cfg) {
  if (!cfg.runsCommand) {
    try {
      const common = git('rev-parse', '--path-format=absolute', '--git-common-dir');
      const ledger = afkReadLedger(join(common, 'afk-holds.json'));
      return afkOneShotLive(ledger);
    } catch { return []; }
  }
  const output = run(cfg.runsCommand[0], cfg.runsCommand.slice(1));
  const agents = JSON.parse(output || '[]');
  return agents.filter(a => a.kind === 'background' && (a.name || '').startsWith(cfg.runPrefix) && !['idle', 'done', 'stopped', 'failed'].includes(a.state || a.status)).map(a => a.name);
}
export function afkOneShotLive(ledger, isAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } }) {
  return Object.entries(ledger).filter(([, holds]) => holds.some(hold => hold.oneShot && Number.isSafeInteger(hold.watcherPid) && isAlive(hold.watcherPid))).map(([id]) => id);
}
function afkHold(cfg, live, me, number, kind) {
  const comments = afkComments(cfg, number);
  if (afkLiveHolds(comments, live, me).some(hold => hold.run !== me)) return null;
  const created = afkGh(['api', `repos/${cfg.repo}/issues/${number}/comments`, '-f', `body=${afkMarker(`${kind}-hold`, me)}\nAn AFK run works on this ${kind}; it releases this hold when it ends.`]);
  const current = afkLiveHolds(afkComments(cfg, number), live, me);
  if (current.length && current[0].run !== me) {
    run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${created.id}`, '-f', `body=${afkMarker(`${kind}-released`, me)}`]);
    return null;
  }
  return created.id;
}
export function afkOtherHolds(ledger, live, me, now = Date.now()) {
  for (const [id, holds] of Object.entries(ledger)) {
    if (id === me) continue;
    if (live.includes(id)) for (const hold of holds) delete hold.gone;
    else if (!holds.length || now - Math.min(...holds.map(hold => hold.gone || (hold.gone = now))) >= 600_000) delete ledger[id];
  }
  return Object.entries(ledger).filter(([id]) => id !== me).flatMap(([, holds]) => holds);
}
function afkThreadReader(cfg) {
  const cache = new Map();
  return number => {
    if (!cache.has(number)) cache.set(number, afkComments(cfg, number));
    return cache.get(number);
  };
}
export function afkShow(held, units, out, quiet = false) {
  const unit = units.find(item => item.issue === held.number && (item.pr ?? null) === (held.pr ?? null));
  const lines = [`Hold: ${held.pr ? `PR #${held.pr}` : `issue #${held.number}`} in ${held.column || 'Todo'} (comment ${held.comment})`, ...out, ...(held.text || unit?.text ? [`Work: ${held.text || unit.text}`] : [])];
  if (quiet) return lines.join('\n');
  for (const line of lines) console.log(line);
  return 0;
}
function afkPreflight(cfg) {
  const remote = git('remote', 'get-url', '--push', 'origin');
  if (!githubPushRemoteMatches(remote, cfg.repo)) throw new Error(`origin pushes to ${remote}; configure it for https://github.com/${cfg.repo} or git@github.com:${cfg.repo}.git`);
  const actor = afkGh(['api', 'user']).login;
  if (actor?.toLowerCase() !== cfg.implementer.toLowerCase()) throw new Error(`gh acts as ${actor || 'nobody'}; AFK requires ${cfg.implementer}`);
  const reviewerToken = spawnSync('gh', ['auth', 'token', '--user', cfg.reviewer], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (reviewerToken.status !== 0) throw new Error(`No gh login for ${cfg.reviewer}; authenticate that reviewer account`);
  const permissions = afkGh(['api', `repos/${cfg.repo}`]).permissions || {};
  if (permissions.admin || permissions.maintain) throw new Error(`${actor} has admin or maintain permission on ${cfg.repo}; the AFK implementer must not have merge authority`);
}
function afkBudget() {
  const result = spawnSync('gh', ['api', 'rate_limit', '--jq', '.resources.graphql | [.remaining, .reset] | @tsv'], { encoding: 'utf8' });
  const [remaining, reset] = (result.stdout || '').trim().split(/\s+/).map(Number);
  if (!Number.isFinite(remaining) || !Number.isFinite(reset)) return { remaining: 1000, reset: '' };
  return { remaining, reset: new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
}
function afkSignal(cfg, live) {
  const event = run('gh', ['api', `repos/${cfg.repo}/events?per_page=1`, '--jq', '.[0].id // empty']);
  const checks = run('gh', ['api', `repos/${cfg.repo}/actions/runs?per_page=10`, '--jq', '[.workflow_runs[] | "\\(.id):\\(.status):\\(.conclusion)"] | join(",")']);
  return `${event} ${checks} ${live.slice().sort().join(' ')}`;
}
function afkMoveCard(cfg, cardId, column) {
  const project = cfg.project;
  if (!project?.number) return false;
  const owner = project.owner;
  if (!owner) throw new Error('Cached GitHub Project is missing its owner; run `workflow.mjs cache refresh`');
  const fields = afkGh(['project', 'field-list', String(project.number), '--owner', owner, '--format', 'json']).fields;
  const field = fields.find(item => item.name === 'Status');
  const option = field?.options.find(item => item.name.toLowerCase() === column.toLowerCase());
  if (!field || !option) return false;
  const result = spawnSync('gh', ['project', 'item-edit', '--project-id', run('gh', ['project', 'view', String(project.number), '--owner', owner, '--format', 'json', '--jq', '.id']), '--id', cardId, '--field-id', field.id, '--single-select-option-id', option.id], { encoding: 'utf8' });
  if (result.status !== 0) {
    const scopeFailure = githubScopeFailure(result.stderr || '');
    if (scopeFailure) throw new Error(scopeFailure);
  }
  return result.status === 0;
}
function afkFinishPrCards(cfg) {
  if (!cfg.project?.number) return [];
  const [owner, name] = cfg.repo.split('/');
  const query = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){pullRequests(states:[MERGED,CLOSED],first:30,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number projectItems(first:10){nodes{id project{number} fieldValueByName(name:"Status"){... on ProjectV2ItemFieldSingleSelectValue{name}}}}}}}}';
  let nodes;
  try { nodes = afkGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`]).data.repository.pullRequests.nodes; }
  catch (error) {
    if (!missingProjectScope(error)) throw error;
    console.error('Closed PR board statuses skipped: token lacks project scope; continuing AFK work.');
    return [];
  }
  const moved = [];
  try {
    for (const pr of nodes) for (const item of pr.projectItems.nodes) {
      if (item.project.number === cfg.project.number && item.fieldValueByName?.name !== 'Done' && afkMoveCard(cfg, item.id, 'Done')) moved.push(pr.number);
    }
  } catch (error) {
    if (!missingProjectScope(error)) throw error;
    console.error('Closed PR board statuses skipped: token lacks project scope; continuing AFK work.');
  }
  return moved;
}
function afkExploreDue(cfg, live, currentRun = null) {
  const hours = Number(cfg.explore?.idleHours);
  if (!Number.isFinite(hours) || hours <= 0 || live.some(id => id !== currentRun)) return false;
  const path = join(git('rev-parse', '--path-format=absolute', '--git-common-dir'), 'afk-idle-explore.json');
  try {
    const previous = JSON.parse(readFileSync(path, 'utf8'));
    if (previous.session && previous.session !== currentRun && live.includes(previous.session)) return false;
    return Date.now() - Number(previous.started || 0) >= hours * 3_600_000;
  }
  catch { return true; }
}
export function afkStatus(cfg, issue, value, silent = false) {
  const statusNames = { BACKLOG: 'Backlog', TODO: 'Todo', PROGRESS: 'In progress', BLOCKED: 'Blocked', REVIEW: 'Review', DONE: 'Done' };
  const target = statusNames[value];
  const project = cfg.project;
  if (!target || !project?.number) {
    if (silent) return false;
    throw new Error('No GitHub Project was discovered; check scopes or run `workflow.mjs cache refresh`');
  }
  try {
  const owner = project.owner;
  if (!owner) throw new Error('Cached GitHub Project is missing its owner; run `workflow.mjs cache refresh`');
  const projectInfo = jsonCommand('gh', ['project', 'view', String(project.number), '--owner', owner, '--format', 'json']);
  if (project.title && projectInfo.title !== project.title) throw new Error('Cached GitHub Project no longer matches; run `workflow.mjs cache refresh`');
  const id = projectInfo.id;
  if (typeof id !== 'string' || !id) throw new Error('GitHub Project response is missing its id');
  const [org, name] = cfg.repo.split('/');
  const query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){issue(number:$number){state projectItems(first:30){nodes{id project{id}}}}}}';
  const issueData = afkGh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${org}`, '-F', `name=${name}`, '-F', `number=${issue}`]).data.repository.issue;
  let card = issueData?.projectItems?.nodes?.find(item => item.project.id === id);
  if (!card && silent) return false;
  if (!card) {
    const url = `https://github.com/${cfg.repo}/issues/${issue}`;
    card = { id: run('gh', ['project', 'item-add', String(project.number), '--owner', owner, '--url', url, '--format', 'json', '--jq', '.id']) };
  }
  const final = issueData.state === 'CLOSED' ? 'Done' : target;
  const field = afkGh(['project', 'field-list', String(project.number), '--owner', owner, '--format', 'json']).fields.find(item => item.name === 'Status');
  const option = field?.options.find(item => item.name.toLowerCase() === final.toLowerCase());
  if (!option) {
    if (silent) return false;
    throw new Error(`Project is missing Status option ${final}`);
  }
  run('gh', ['project', 'item-edit', '--project-id', id, '--id', card.id, '--field-id', field.id, '--single-select-option-id', option.id]);
  if (!silent) console.log(`#${issue} → ${final}`);
  } catch (error) {
    if (!silent || !missingProjectScope(error)) throw error;
    console.error(`Board status for #${issue} not updated: token lacks project scope; continuing AFK work.`);
    return false;
  }
}
export function afkQueue(args) {
  const o = afkFlags(args, ['--kind', '--number', '--text']);
  const heading = { waiting: 'Waiting for the owner', decision: 'Decisions you may challenge' }[o['--kind']];
  if (!heading || !/^[1-9]\d*$/.test(o['--number'] || '') || !o['--text']?.trim() || o['--text'].length > 500 || /[\r\n]/.test(o['--text'])) throw new Error('Queue requires waiting|decision, an issue number and one-line text (max 500 chars)');
  const cfg = afkConfig(); afkLoadEnvironment(cfg); afkActor(cfg);
  if (!Number.isInteger(cfg.reviewQueue)) throw new Error('No open issue titled "Review queue" was discovered; create one, then run `workflow.mjs cache refresh`');
  return withRepoLock('afk-queue', () => {
    const queue = afkGh(['issue', 'view', String(cfg.reviewQueue), '--repo', cfg.repo, '--json', 'title,state,body']);
    if (queue.title?.trim().toLowerCase() !== 'review queue' || queue.state !== 'OPEN') throw new Error('Cached Review queue issue is no longer open or its title changed; run `workflow.mjs cache refresh`');
    const body = queue.body || '';
    const lines = body.split('\n'); const start = lines.findIndex(line => line.replace(/^#+\s*/, '').trim().toLowerCase() === heading.toLowerCase());
    if (start < 0) throw new Error(`Review queue is missing ${heading}`);
    let end = lines.findIndex((line, i) => i > start && /^#{1,6}\s/.test(line)); if (end < 0) end = lines.length;
    const n = Number(o['--number']); const entry = `#${n}: ${o['--text'].trim()}`;
    const existing = lines.findIndex((line, i) => i > start && i < end && new RegExp(`^(?:\\d+\\. |- )#${n}\\b`).test(line));
    if (existing >= 0) lines[existing] = `${lines[existing].match(/^(?:\d+\. |- )/)[0]}${entry}`;
    else lines.splice(end, 0, o['--kind'] === 'waiting' ? `${lines.slice(start + 1, end).filter(line => /^\d+\. /.test(line)).length + 1}. ${entry}` : `- ${entry}`);
    run('gh', ['issue', 'edit', String(cfg.reviewQueue), '--repo', cfg.repo, '--body', lines.join('\n')]);
    if (!afkGh(['issue', 'view', String(cfg.reviewQueue), '--repo', cfg.repo, '--json', 'body']).body.includes(entry)) throw new Error(`Queue verification failed for #${n}`);
    console.log(`Queued #${n} under ${o['--kind']}`);
  });
}
function afkChangedPaths(root, beforeHead) {
  const paths = args => {
    const result = spawnSync('git', args, { cwd: root, env: cleanEnvironment(), encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error('Cannot inspect changed paths for AFK scope');
    return result.stdout.split('\0').filter(Boolean);
  };
  return [...new Set([
    ...paths(['diff', '--no-renames', '--name-only', '-z', `${beforeHead}...HEAD`]),
    ...paths(['diff', '--no-renames', '--name-only', '-z', '--cached']),
    ...paths(['diff', '--no-renames', '--name-only', '-z']),
    ...paths(['ls-files', '--others', '--exclude-standard', '-z']),
  ])];
}
export function afkAssertPushScope(root, baseRef) {
  const runId = process.env.WORKFLOW_RUN_ID;
  if (!runId) return;
  const hold = afkBoundHold(root, 'push');
  if (Array.isArray(hold.paths)) {
    const changed = afkChangedPaths(root, git('rev-parse', baseRef));
    if (!afkPathsWithinScope(changed, afkHeldScope(hold, changed))) throw new Error(`Push paths exceed the assigned AFK scope${afkScopeHint(hold)}`);
  }
}
// A PR scoped by its changed files follows them into the files the base renamed them to since the held head; the branch's own renames widen nothing.
function afkBaseRenamedScope(hold) {
  if (!hold.scopedByFiles) return hold.paths;
  const base = 'refs/remotes/origin/HEAD';
  const env = cleanEnvironment();
  const from = hold.head || spawnSync('git', ['merge-base', 'HEAD', base], { env, encoding: 'utf8' }).stdout?.trim();
  if (!from) return hold.paths;
  const log = spawnSync('git', ['log', '--reverse', '--format=', '--name-status', '-M', '--diff-filter=R', '-z', `${from}..${base}`, '--'], { env, encoding: 'utf8' });
  if (log.error || log.status !== 0) return hold.paths;
  const scope = [...hold.paths];
  const fields = log.stdout.split('\0').map(field => field.replace(/^\n+/, '')).filter(Boolean);
  for (let i = 0; i + 2 < fields.length && fields[i].startsWith('R'); i += 3) {
    if (afkPathsWithinScope([fields[i + 1]], scope)) scope.push(fields[i + 2]);
  }
  return scope;
}
export function afkScopeHint(hold) { return hold.scopedByFiles ? `; add a \`scope\` packet listing them to #${hold.number}'s body` : ''; }
// Reads the lanes config and loads the AFK environment at most once for the callers sharing the returned loader.
export function afkEnvironmentOnce() {
  let cfg = null;
  return () => {
    if (!cfg) { const lanes = { ...workflowDefaults.afk, ...config().lanes }; afkLoadEnvironment(lanes); cfg = lanes; }
    return cfg;
  };
}
// The hold copies the scope packet at start; a packet corrected on the issue since then is rechecked before refusing.
// A fix hold records only its PR's first linked story, so the other stories' corrected packets still refuse.
export function afkHeldScope(hold, paths, environment = afkEnvironmentOnce()) {
  if (!Array.isArray(hold.paths) || afkPathsWithinScope(paths, hold.paths) || hold.review || hold.refine) return hold.paths;
  const followed = afkBaseRenamedScope(hold);
  if (afkPathsWithinScope(paths, followed)) return followed;
  try {
    const cfg = environment();
    const current = afkPathsFromIssueBody(afkGh(['api', `repos/${cfg.repo}/issues/${hold.number}`]).body || '');
    if (Array.isArray(current) && afkPathsWithinScope(paths, current)) return current;
  } catch { /* An unreadable issue keeps the scope recorded in the hold. */ }
  return hold.paths;
}
export function afkBoundHold(root, action) {
  const runId = process.env.WORKFLOW_RUN_ID;
  const bound = process.env.WORKFLOW_ISSUE_NUMBER;
  const common = realpathSync(resolve(root, git('rev-parse', '--git-common-dir')));
  const holds = afkReadLedger(join(common, 'afk-holds.json'))[runId] || [];
  const hold = holds[0];
  if (holds.length !== 1 || !Number.isSafeInteger(hold?.number) || hold.number < 1 || (bound !== undefined && String(hold.number) !== bound)) throw new Error(`AFK ${action} requires the current run to hold its bound issue`);
  return hold;
}
export function afkStartRun(cfg, id, common, requestedIssue = null, quiet = false, prepared = false) {
  const ledgerPath = join(common, 'afk-holds.json');
  const existing = afkReadLedger(ledgerPath)[id]?.[0];
  const resumingOneShot = !prepared && !cfg.runsCommand && Boolean(existing?.oneShot);
  if (!prepared) afkPreflight(cfg);
  const tick = afkMergeThenPlan(cfg, { merge: !prepared && !resumingOneShot }), output = tick.merged;
  return withRepoLock('afk-start', () => {
    const ledger = afkReadLedger(ledgerPath);
    if (ledger[id]?.length) {
      if (requestedIssue && ledger[id][0].number !== requestedIssue) throw new Error(`Run ${id} already holds #${ledger[id][0].number}, not #${requestedIssue}`);
      return afkShow(ledger[id][0], [], output, quiet);
    }
    const live = afkLive(cfg);
    if (!afkFree(cfg, live, id)) {
      console.log(`Done: ${live.filter(runId => runId !== id).length} other runs are live, as many as afk.maxRuns allows.`);
      output.forEach(line => console.log(line)); return 3;
    }
    const threads = afkThreadReader(cfg);
    const { units, byNumber, held: overlaps } = tick.plan(live, threads, id);
    const othersHolds = afkOtherHolds(ledger, live, id);
    afkWriteLedger(ledgerPath, ledger);
    for (const candidate of afkCandidates(units, othersHolds)) {
      if (requestedIssue && candidate.number !== requestedIssue && candidate.unit.pr !== requestedIssue) continue;
      const comment = afkHold(cfg, live, id, candidate.number, 'issue');
      if (!comment) continue;
      const { unit } = candidate;
      const held = { number: candidate.number, column: unit.column, text: unit.text, paths: candidate.paths, ...(unit.refine ? { refine: true } : {}), ...(unit.review ? { review: true } : {}), ...(unit.pr ? { pr: unit.pr, ...(unit.head ? { head: unit.head } : {}), ...(unit.scopedByFiles ? { scopedByFiles: true } : {}) } : {}), ...(unit.state ? { state: unit.state } : {}), ...(unit.input !== undefined ? { input: unit.input } : {}), comment, oneShot: prepared && !cfg.runsCommand, watcherPid: prepared && !cfg.runsCommand ? process.pid : undefined };
      ledger[id] = [...(ledger[id] || []), held];
      try {
        // Only implementation moves a card to In progress; refine runs and PR work leave the card where it is.
        if (unit.column === 'Todo' && !unit.refine) afkStatus(cfg, held.number, 'PROGRESS', true);
        afkWriteLedger(ledgerPath, ledger);
      } catch (error) {
        spawnSync('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${comment}`, '-f', `body=${afkMarker('issue-released', id)}\nStart failed; hold released.`], { stdio: 'ignore' });
        throw error;
      }
      return afkShow(held, units, output, quiet);
    }
    if (requestedIssue) throw afkStartRefusal(requestedIssue, byNumber.get(requestedIssue));
    // The watcher (prepared) never starts an agent without work; an idle `explore` pass is only for a run that asked.
    if (!prepared && afkExploreDue(cfg, live, id)) {
      const explorePath = join(common, 'afk-idle-explore.json');
      const previous = (() => { try { return JSON.parse(readFileSync(explorePath, 'utf8')); } catch { return {}; } })();
      if (!previous.session || previous.session === id || !live.includes(previous.session)) {
        const temp = `${explorePath}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify({ session: id, started: Date.now() })); renameSync(temp, explorePath);
        console.log('Explore: no work is free for this run; play `explore` unattended.');
        output.forEach(line => console.log(line)); return 4;
      }
    }
    console.log('Done: every free piece of work has its runner.');
    [...output, ...afkHeldLines(overlaps)].forEach(line => console.log(line)); return 3;
  });
}
// Read once at load: an in-place update during `afk watch` must not stamp the new version on a check the old code ran.
const loadedToolingVersion = (() => { try { return JSON.parse(readFileSync(new URL('../../plugin.json', import.meta.url), 'utf8')).version || ''; } catch { return ''; } })();
export function afkToolingVersion() { return loadedToolingVersion; }
// A tooling update can free work no repository event shows, so a changed or missing version ends the quiet window.
export function afkCheckQuiet(previous, signal, version, now = Date.now()) {
  return Boolean(version) && previous?.version === version && previous.signal === signal && now - previous.at < 1_800_000;
}
// Each ping starts one run when a slot is free and a unit waits; the run takes the first unit itself.
export function afkStartCount(cfg, live, candidates) { return candidates.length && afkFree(cfg, live) ? 1 : 0; }
export function afkCheckRun(cfg, common, quiet, result = {}, requestedIssue = null) {
  const live = afkLive(cfg); const statePath = quiet ? join(common, 'afk-check.json') : null;
  const signal = statePath ? afkSignal(cfg, live) : null; const version = afkToolingVersion();
  if (statePath) {
    try {
      const previous = JSON.parse(readFileSync(statePath, 'utf8'));
      if (afkCheckQuiet(previous, signal, version)) { result.start = 0; console.log('Quiet: nothing changed since the last check.'); return 3; }
    } catch {}
  }
  const budget = afkBudget();
  if (budget.remaining < 1000) { result.start = 0; console.log(`Quiet: GitHub GraphQL has ${budget.remaining} points until ${budget.reset}; live runs keep them.`); return 3; }
  afkPreflight(cfg);
  const tick = afkMergeThenPlan(cfg), output = tick.merged;
  for (const number of afkFinishPrCards(cfg)) output.push(`PR #${number}'s card moved to Done: the PR is merged or closed`);
  const threads = afkThreadReader(cfg);
  const { units, unchanged, orphans, held } = tick.plan(live, threads);
  for (const number of orphans) { afkStatus(cfg, number, 'TODO', true); output.push(`Orphaned: #${number} was In progress with no live run; back to Todo`); }
  for (const number of unchanged) output.push(`Unchanged: #${number} since its last run; no new run until it changes`);
  output.push(...afkHeldLines(held));
  if (units[0]) output.push(`Next: ${units[0].column}: ${units[0].text}`);
  const ledgerPath = join(common, 'afk-holds.json');
  const start = withRepoLock('afk-start', () => {
    const ledger = afkReadLedger(ledgerPath);
    const others = afkOtherHolds(ledger, live, '');
    const candidates = [...afkCandidates(units, others)].filter(candidate => !requestedIssue || candidate.number === requestedIssue || candidate.unit.pr === requestedIssue);
    const count = afkStartCount(cfg, live, candidates);
    if (requestedIssue && !count) return 0;
    afkWriteLedger(ledgerPath, ledger);
    return count;
  });
  result.start = start;
  if (statePath) { mkdirSync(dirname(statePath), { recursive: true }); writeFileSync(statePath, JSON.stringify({ signal, version, at: Date.now() })); }
  console.log(start ? `Start: ${start}` : requestedIssue ? `Done: #${requestedIssue} has no free AFK assignment.` : `Done: no new run has work (${live.length} live).`);
  output.forEach(line => console.log(line));
  return start ? 0 : 3;
}
export function afkRunUsage(output) {
  let value; try { value = JSON.parse(output); } catch { return null; }
  if (value?.type !== 'result') return null;
  const usage = value.usage || {}, count = key => Number.isFinite(usage[key]) ? usage[key] : 0, parts = [];
  if (Number.isFinite(value.total_cost_usd)) parts.push(`$${value.total_cost_usd.toFixed(2)}`);
  if (Number.isFinite(value.num_turns)) parts.push(`${value.num_turns} turns`);
  if (Number.isFinite(value.duration_ms)) parts.push(`${Math.max(1, Math.round(value.duration_ms / 60_000))} min`);
  parts.push(`tokens in ${count('input_tokens')}, out ${count('output_tokens')}, cache read ${count('cache_read_input_tokens')}, cache write ${count('cache_creation_input_tokens')}`);
  return { result: typeof value.result === 'string' ? value.result : '', line: `Usage: ${parts.join(', ')}`, ok: value.is_error !== true };
}
// An implementation run that ended without a PR naming its issue stopped on a blocker (`why` is its own summary): the card
// goes to Blocked with a comment saying why, and the next ping serves it a refine run. Only an issue still open and still
// `lane:afk` is blocked: a closed issue or a merged PR ends normally. Refine and PR runs leave the card where they put it.
function afkStillReady(cfg, number) {
  const issue = afkGh(['api', `repos/${cfg.repo}/issues/${number}`]);
  return issue.state === 'open' && (issue.labels || []).some(label => label.name === 'lane:afk');
}
// An unreadable list counts as none, so the issue ends as an unsplit one and the hold is still released.
function afkSubIssues(cfg, number) {
  try {
    const pages = afkGh(['api', '--paginate', '--slurp', `repos/${cfg.repo}/issues/${number}/sub_issues`]);
    return Array.isArray(pages) ? pages.flat().map(sub => sub?.number).filter(Number.isSafeInteger) : [];
  } catch { return []; }
}
export function afkEndStatus(named, blocked) { return named ? 'REVIEW' : blocked ? 'BLOCKED' : 'TODO'; }
// A held issue the run split into sub-issues is their epic and stays In progress; each sub-issue a PR names goes to Review.
export function afkEndCards(number, subIssues, named, blocked) {
  if (!subIssues.length) return [[number, afkEndStatus(named.has(number), blocked)]];
  return [[number, 'PROGRESS'], ...subIssues.filter(sub => named.has(sub)).map(sub => [sub, 'REVIEW'])];
}
export function afkEndRun(cfg, common, id, note = null, why = null, spend = false) {
  afkActor(cfg);
  return withRepoLock('afk-start', () => {
    const path = join(common, 'afk-holds.json'); const ledger = afkReadLedger(path);
    const dropped = ledger[id] || []; delete ledger[id];
    // Read the issue units' end states while this run's holds still stand, before the release below.
    const entries = afkSpentEntries(dropped, spend, () => afkPlan(cfg, afkLive(cfg), afkThreadReader(cfg), id).units);
    const implemented = dropped.filter(held => held.paths !== null && !held.refine && !held.review && !held.pr);
    const named = new Set(implemented.length ? afkPrData(cfg).flatMap(pr => afkPrRecord(pr, cfg).issues) : []);
    for (const held of dropped) {
      const kind = held.paths === null ? 'epic' : 'issue';
      run('gh', ['api', '-X', 'PATCH', `repos/${cfg.repo}/issues/comments/${held.comment}`, '-f', `body=${afkMarker(`${kind}-released`, id)}${note ? `\n${note}` : ''}`]);
      console.log(`Released: ${kind} #${held.number}`);
      if (!implemented.includes(held)) continue;
      const subIssues = afkSubIssues(cfg, held.number);
      const blocked = why !== null && !subIssues.length && !named.has(held.number) && afkStillReady(cfg, held.number);
      if (blocked) run('gh', ['api', `repos/${cfg.repo}/issues/${held.number}/comments`, '-f', `body=${afkMarker('issue-blocked', id)}\n**Blocked:** run ${id} ended without a PR.\n\n${why.trim().slice(0, 3000) || 'It left no summary; see the watcher log.'}`]);
      for (const [number, status] of afkEndCards(held.number, subIssues, named, blocked)) afkStatus(cfg, number, status, true);
    }
    afkWriteLedger(path, ledger);
    // Only an agent that exited cleanly spends its unit's state; a crash, a failed start or a manual end leaves it offered.
    if (Object.keys(entries).length) {
      const spentPath = join(common, 'afk-spent.json');
      afkWriteLedger(spentPath, { ...afkReadLedger(spentPath), ...entries });
    }
    if (!dropped.length) console.log('Released: no issue hold');
    return 0;
  });
}
export const afkRetroModes = ['all', 'bugs-when-empty'];
export function afkCheckRetroMode(mode) {
  if (mode !== undefined && !afkRetroModes.includes(mode)) throw new Error(`afk.retros must be one of ${afkRetroModes.join(', ')}`);
  return mode;
}
export function afkLoadEnvironment(cfg) {
  for (const key of Object.keys(process.env)) {
    if (/^(GH_TOKEN|GITHUB_TOKEN|GH_HOST|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN|GIT_ASKPASS|SSH_ASKPASS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_SSH|GIT_SSH_COMMAND|GIT_PROXY_COMMAND|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_NAMESPACE|GIT_CONFIG_PARAMETERS|GIT_CONFIG|GIT_EXEC_PATH|GIT_TRACE.*|GIT_CURL_VERBOSE|GIT_SSL_NO_VERIFY|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_INDEX_FILE|GIT_TEMPLATE_DIR)$/i.test(key)) delete process.env[key];
  }
  const file = afkExpandedPath(cfg.environmentFile);
  const value = JSON.parse(readFileSync(file, 'utf8'));
  const env = value?.env;
  if (!env || typeof env !== 'object' || Array.isArray(env)) throw new Error(`${file} must contain an env object`);
  for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_CONFIG_DIR', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) {
    if (typeof env[key] === 'string' && env[key]) process.env[key] = env[key];
  }
  if (cfg.repo) applyGithubMetadata(cfg, cachedGithubMetadata(cfg.repo, cfg.refreshMetadata === true));
}
export function hasProcessAncestor(processes, pid, ownerPid, maxDepth = 16) {
  for (let depth = 0; pid && depth < maxDepth; depth++) {
    if (pid === ownerPid) return true;
    const parent = processes.get(pid);
    if (!parent) return false;
    pid = parent.parent;
  }
  return false;
}
export function processTable() {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  const processes = new Map();
  for (const line of result.stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);
    if (match) processes.set(Number(match[1]), { parent: Number(match[2]), command: match[3] });
  }
  return processes;
}
// A hold its watcher or supervisor records binds the run to that process tree; one without (a runsCommand agent, an owner's start) trusts WORKFLOW_RUN_ID.
export function afkCallerInRun(common, id, processes = processTable()) {
  const ownerPid = afkReadLedger(join(common, 'afk-holds.json'))[id]?.[0]?.watcherPid;
  if (!Number.isSafeInteger(ownerPid)) return true;
  return Boolean(processes && hasProcessAncestor(processes, process.ppid, ownerPid, 64));
}
