import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanEnvironment, jsonCommand, workflowScratch } from './core.mjs';
import { changedExportSites, reviewerCommand } from './drive.mjs';
import { reviewPacket } from './packet.mjs';
import { commandModel, parseUsage, unreported, usageHost, visibleResult } from './usage.mjs';

// The reviewer benchmark: replays pinned known-defect and known-clean PRs through the Reviewer and reports catches,
// false positives and cost. Without --run it only validates the snapshot and lists what it would run.
const defaultSnapshot = new URL('../../../../../docs/review-benchmark.json', import.meta.url);
const riskLevels = ['R0', 'R1', 'R2'];
const efforts = ['low', 'medium', 'high'];
const commitId = /^[0-9a-f]{40}([0-9a-f]{24})?$/i;
const round = value => Math.round(value * 1e6) / 1e6;
const money = value => (typeof value === 'number' ? `$${value.toFixed(2)}` : unreported);
const signed = (value, cost) => (typeof value !== 'number' ? unreported : `${value < 0 ? '-' : '+'}${cost ? '$' : ''}${Math.abs(value).toFixed(cost ? 2 : 0)}`);

export function validateSnapshot(snapshot) {
  const problems = [];
  if (!snapshot || snapshot.version !== 1) return ['snapshot must be version 1'];
  if (typeof snapshot.repo !== 'string' || !snapshot.repo) problems.push('snapshot names its repo');
  const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
  if (!entries.length) problems.push('snapshot has no entries');
  const seen = new Set();
  for (const entry of entries) {
    const label = `#${entry?.pr}`;
    if (!Number.isInteger(entry?.pr) || entry.pr < 1) { problems.push(`${label}: pr must be a positive integer`); continue; }
    if (seen.has(entry.pr)) problems.push(`${label}: duplicate PR`);
    seen.add(entry.pr);
    if (!Number.isInteger(entry.issue) || entry.issue < 1) problems.push(`${label}: issue must be the closing issue number`);
    if (!riskLevels.includes(entry.risk)) problems.push(`${label}: risk must be R0, R1 or R2, the risk drive assessed for the PR`);
    for (const field of ['base', 'head']) if (!commitId.test(entry[field] || '')) problems.push(`${label}: ${field} must be a 40 or 64 character commit id`);
    if (entry.kind === 'defect') {
      const named = typeof entry.defect?.name === 'string' && entry.defect.name && Array.isArray(entry.defect.keywords) && entry.defect.keywords.length && entry.defect.keywords.every(word => typeof word === 'string' && word);
      if (!named) problems.push(`${label}: a known-defect PR names its defect and keywords`);
    } else if (entry.kind === 'clean') {
      if (entry.defect) problems.push(`${label}: a known-clean PR has no defect`);
    } else problems.push(`${label}: kind is defect or clean`);
  }
  const counts = { defect: entries.filter(entry => entry?.kind === 'defect').length, clean: entries.filter(entry => entry?.kind === 'clean').length };
  if (snapshot.counts?.defect !== counts.defect || snapshot.counts?.clean !== counts.clean) problems.push(`counts do not match the entries (${counts.defect} defect, ${counts.clean} clean)`);
  return problems;
}

export const parseVerdict = text => /verdict\s*[:=]\s*(ready|fixes|owner)/i.exec(String(text || ''))?.[1].toLowerCase() ?? null;

// review: { verdict, text, usage }. Only a blocking verdict can catch a defect or flag a clean PR.
export function scoreEntry(entry, review) {
  const blocking = review?.verdict === 'fixes' || review?.verdict === 'owner';
  if (entry.kind === 'clean') return { caught: null, falsePositive: blocking };
  const text = String(review?.text || '').toLowerCase();
  return { caught: blocking && entry.defect.keywords.some(word => text.includes(word.toLowerCase())), falsePositive: null };
}
const costOf = usage => (Number.isFinite(usage?.cost) ? usage.cost : null);
export function summarize(rows) {
  const defects = rows.filter(row => row.kind === 'defect');
  const clean = rows.filter(row => row.kind === 'clean');
  const costs = rows.map(row => row.cost).filter(cost => Number.isFinite(cost));
  const total = costs.reduce((sum, cost) => sum + cost, 0);
  return {
    defects: defects.length, caught: defects.filter(row => row.caught).length,
    clean: clean.length, falsePositives: clean.filter(row => row.falsePositive).length,
    cost: { total: costs.length ? round(total) : unreported, mean: costs.length ? round(total / costs.length) : unreported, reported: costs.length, unreported: rows.length - costs.length },
  };
}
export const summarizeByRisk = rows => Object.fromEntries(riskLevels.map(risk => [risk, summarize(rows.filter(row => row.risk === risk))]));
export function parseSettings(text) {
  const seen = new Set();
  return String(text).split(',').map(item => {
    const [model, effort, ...rest] = item.trim().split(':');
    if (!model || !effort || rest.length) throw new Error(`Setting "${item}" must be model:effort`);
    if (!efforts.includes(effort)) throw new Error(`Setting "${item}" has an unknown effort; use ${efforts.join(', ')}`);
    if (seen.has(`${model}:${effort}`)) throw new Error(`Setting "${item}" is listed twice`);
    seen.add(`${model}:${effort}`);
    return { model, effort };
  });
}
const settingKey = setting => `${setting.model}:${setting.effort}`;
export function compareResults(before, after) {
  const a = before.summary; const b = after.summary;
  const delta = (x, y) => (typeof x === 'number' && typeof y === 'number' ? round(y - x) : unreported);
  return { caught: b.caught - a.caught, falsePositives: b.falsePositives - a.falsePositives, totalCost: delta(a.cost.total, b.cost.total), meanCost: delta(a.cost.mean, b.cost.mean) };
}
const tally = summary => `caught ${summary.caught}/${summary.defects}; false positives ${summary.falsePositives}/${summary.clean}; cost total ${money(summary.cost.total)}, mean ${money(summary.cost.mean)} (${summary.cost.unreported} unreported)`;
export function renderResults(result, comparisons = []) {
  const lines = [];
  result.runs.forEach((run, index) => {
    if (lines.length) lines.push('');
    lines.push(`== ${run.model ?? 'unknown'} ${run.effort ?? 'default'}`);
    for (const row of run.rows) lines.push(`#${row.pr} ${row.risk ?? '?'} ${row.kind} ${row.verdict ?? 'no-verdict'} ${row.kind === 'defect' ? (row.caught ? 'caught' : 'missed') : (row.falsePositive ? 'false positive' : 'clean')} ${money(row.cost)}`);
    lines.push('', tally(run.summary));
    for (const [risk, summary] of Object.entries(run.byRisk ?? {})) if (summary.defects + summary.clean) lines.push(`${risk}: ${tally(summary)}`);
    const comparison = comparisons[index];
    if (comparison) lines.push(`vs saved: caught ${signed(comparison.caught)}, false positives ${signed(comparison.falsePositives)}, total cost ${signed(comparison.totalCost, true)}, mean cost ${signed(comparison.meanCost, true)}`);
  });
  return lines.join('\n');
}

function parseArgs(args) {
  const options = {};
  const valued = ['--snapshot', '--out', '--compare', '--from', '--model', '--effort', '--settings', '--host'];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run' || args[i] === '--json') options[args[i].slice(2)] = true;
    else if (valued.includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else throw new Error('Usage: bench [--snapshot FILE] [--run] [--model M] [--effort E] [--settings model:effort,...] [--host claude|codex] [--json] [--out FILE] [--compare FILE] [--from FILE]');
  }
  return options;
}
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
// A legacy result has top-level rows and summary and no runs: wrap it as one run.
const readResult = file => { const value = readJson(file); return !value.runs && Array.isArray(value.rows) && value.summary ? { ...value, runs: [value] } : value; };

export async function benchCommand(args, io) {
  const options = parseArgs(args);
  const snapshot = readJson(options.snapshot || defaultSnapshot);
  const problems = validateSnapshot(snapshot);
  if (problems.length) throw new Error(`Invalid benchmark snapshot: ${problems.join('; ')}`);
  const emit = (value, text) => console.log(options.json ? JSON.stringify(value, null, 2) : text);
  const settings = options.settings ? parseSettings(options.settings) : [{ model: io.model ?? null, effort: io.effort ?? null }];
  let result;
  if (options.from) result = readResult(options.from);
  else if (!options.run) {
    const would = snapshot.entries.map(({ pr, kind, risk, title, base, head }) => ({ pr, kind, risk, title, base, head }));
    emit({ run: false, cost: 0, counts: snapshot.counts, settings, would }, [`Dry listing; nothing run, nothing spent. Snapshot holds ${snapshot.counts.defect} known-defect and ${snapshot.counts.clean} known-clean PRs, replayed once per setting (${settings.map(setting => `${setting.model ?? 'configured'} ${setting.effort ?? 'default'}`).join(', ')}). Pass --run to replay them through the Reviewer (real model spend).`, ...would.map(entry => `#${entry.pr} ${entry.risk} ${entry.kind} ${entry.title || ''} ${entry.base.slice(0, 10)}..${entry.head.slice(0, 10)}`)].join('\n'));
    return 0;
  } else {
    const runs = [];
    for (const setting of settings) {
      const rows = [];
      for (const entry of snapshot.entries) {
        const review = await io.review(entry, setting);
        rows.push({ pr: entry.pr, kind: entry.kind, risk: entry.risk, title: entry.title, defect: entry.defect?.name ?? null, verdict: review?.verdict ?? null, ...scoreEntry(entry, review), cost: costOf(review?.usage) });
      }
      runs.push({ ...setting, rows, summary: summarize(rows), byRisk: summarizeByRisk(rows) });
    }
    result = { snapshot: snapshot.repo, runs };
  }
  let comparisons = [];
  if (options.compare) {
    const saved = readResult(options.compare);
    comparisons = result.runs.map(run => { const before = saved.runs.find(other => settingKey(other) === settingKey(run)); return before ? compareResults(before, run) : null; });
  }
  if (options.out) writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`);
  emit(options.compare ? { ...result, comparisons } : result, renderResults(result, comparisons));
  return 0;
}

// The real Reviewer: drive's packet for the pinned diff, the Reviewer session in a detached checkout at head, usage from the host's output.
export function reviewerIo(lanes, root, options = {}) {
  const host = options.host || lanes.delivery?.roles?.reviewer?.host || 'claude';
  const model = options.model || lanes.delivery?.roles?.reviewer?.model || 'opus';
  const effort = options.effort || null;
  const executable = lanes.delivery?.executables?.[host] || host;
  const gitRun = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', env: cleanEnvironment(), maxBuffer: 64 * 1024 * 1024 });
  const git = (...args) => { const result = gitRun(...args); return result.status === 0 ? result.stdout.trim() : ''; };
  const packetFor = entry => {
    if (gitRun('cat-file', '-e', `${entry.head}^{commit}`).status !== 0) gitRun('fetch', '-q', 'origin', `refs/pull/${entry.pr}/head`);
    let issue = { url: '', body: '' };
    if (entry.issue) { try { issue = jsonCommand('gh', ['issue', 'view', String(entry.issue), '--repo', lanes.repo, '--json', 'url,body']); } catch { /* the packet marks criteria unavailable */ } }
    const range = `${entry.base}...${entry.head}`;
    const files = git('diff', '--name-only', range).split('\n').filter(Boolean).map(path => ({ path }));
    const diffs = Object.fromEntries(files.map(file => [file.path, git('diff', range, '--', file.path)]));
    return reviewPacket({ issue, pr: { number: entry.pr, url: `https://github.com/${lanes.repo}/pull/${entry.pr}`, head: entry.head, base: entry.base }, round: 1, requiredChecks: [], checks: [], gate: null, files, diffs, range, previous: null, threads: [], callSites: changedExportSites({ files, diffs, head: entry.head, git: (...args) => git(...args) }) });
  };
  return {
    model,
    effort,
    review(entry, setting = { model, effort }) {
      const scratch = join(workflowScratch(root), 'bench'); mkdirSync(scratch, { recursive: true });
      const tree = join(scratch, `pr-${entry.pr}`); const packet = join(scratch, `pr-${entry.pr}-packet.md`); const brief = join(scratch, `pr-${entry.pr}-brief.md`);
      writeFileSync(packet, packetFor(entry));
      writeFileSync(brief, `# Reviewer brief: benchmark replay of PR #${entry.pr}\n\nRead the review packet first: ${packet}. Review the diff at head ${entry.head} against the issue criteria, as in the review skill, steps 1 to 5. This is a replay: post nothing, claim nothing, run no workflow command, edit nothing.\n\n## Hand-back, at most 5 lines\n\nverdict: ready|fixes, then one line per Blocker or Important finding.\n`);
      if (gitRun('worktree', 'add', '--detach', tree, entry.head).status !== 0) throw new Error(`Cannot check out ${entry.head} for PR #${entry.pr}`);
      try {
        const command = reviewerCommand(setting.model ?? model, brief, `bench-${entry.pr}`, host, executable, setting.effort ?? null);
        const run = spawnSync(command[0], command.slice(1), { cwd: tree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
        const usageOf = usageHost(command);
        const text = usageOf ? visibleResult(usageOf, run.stdout) : run.stdout;
        return { verdict: parseVerdict(text), text, usage: usageOf ? parseUsage(usageOf, run.stdout) : null, model: commandModel(command) };
      } finally { git('worktree', 'remove', '--force', tree); }
    },
  };
}
