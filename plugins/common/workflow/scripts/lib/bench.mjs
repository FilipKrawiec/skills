import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activeSkills } from '../project-verify.mjs';
import { cleanEnvironment, jsonCommand, workflowScratch } from './core.mjs';
import { changedExportSites, implementerBrief, reviewerCommand, sessionFor } from './drive.mjs';
import { architectureNote, reviewPacket } from './packet.mjs';
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
  const valued = ['--snapshot', '--out', '--compare', '--from', '--model', '--effort', '--settings', '--host', '--baseline'];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run' || args[i] === '--json' || args[i] === '--implementer') options[args[i].slice(2)] = true;
    else if (valued.includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
    else throw new Error('Usage: bench [--snapshot FILE] [--run] [--model M] [--effort E] [--settings model:effort,...] [--host claude|codex] [--json] [--out FILE] [--compare FILE] [--from FILE] [--implementer [--baseline REF]]');
  }
  return options;
}
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
// A legacy result has top-level rows and summary and no runs: wrap it as one run.
const readResult = file => { const value = readJson(file); return !value.runs && Array.isArray(value.rows) && value.summary ? { ...value, runs: [value] } : value; };

export async function benchCommand(args, io) {
  const options = parseArgs(args);
  if (options.implementer) return implementerBenchCommand(options, io);
  if (options.baseline) throw new Error('--baseline belongs to the implementer bench; pass --implementer');
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

// The implementer benchmark: replays seeded implementer tasks on the cheapest delivery setting, once with the skills at the
// working tree and once with the skills at a baseline ref, and grades each run by deterministic checks only (no model grades).
export const spendCap = 10;
const implementerChecks = ['layers', 'primitives', 'red', 'gate'];
const implementerLanguages = ['typescript', 'java', 'kotlin', 'dart'];
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const defaultImplementerSnapshot = join(repoRoot, 'docs', 'implementer-benchmark.json');
const requiredSkills = ['ddd', 'hexagonal-architecture'];

export function validateImplementerSnapshot(snapshot, root = repoRoot) {
  if (!snapshot || snapshot.version !== 1) return ['snapshot must be version 1'];
  const problems = [];
  if (typeof snapshot.repo !== 'string' || !snapshot.repo) problems.push('snapshot names its repo');
  const tasks = Array.isArray(snapshot.tasks) ? snapshot.tasks : [];
  if (!tasks.length) problems.push('snapshot has no tasks');
  const seen = new Set();
  for (const task of tasks) {
    if (typeof task?.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(task.id)) { problems.push('a task id must be lowercase kebab-case'); continue; }
    const label = task.id;
    if (seen.has(label)) problems.push(`${label}: duplicate task`);
    seen.add(label);
    if (!implementerLanguages.includes(task.language)) problems.push(`${label}: language must be one of ${implementerLanguages.join(', ')}`);
    const fixture = typeof task.fixture === 'string' && task.fixture ? join(root, task.fixture) : null;
    if (!fixture || !existsSync(fixture) || !statSync(fixture).isDirectory()) problems.push(`${label}: fixture must name an existing project directory`);
    else if (!existsSync(join(fixture, 'AGENTS.md')) || requiredSkills.some(skill => !activeSkills(fixture).includes(skill))) problems.push(`${label}: the fixture's AGENTS.md lists ${requiredSkills.join(' and ')} under active_skills`);
    if (typeof task.issue?.title !== 'string' || !task.issue.title || typeof task.issue?.body !== 'string' || !task.issue.body) problems.push(`${label}: issue names its title and body`);
    if (!Array.isArray(task.gate) || !task.gate.length || task.gate.some(part => typeof part !== 'string' || !part)) problems.push(`${label}: gate must be a non-empty argv array`);
    const checks = Array.isArray(task.checks) ? task.checks : [];
    if (!checks.length || checks.some(check => !implementerChecks.includes(check)) || new Set(checks).size !== checks.length) problems.push(`${label}: checks must be a non-empty subset of ${implementerChecks.join(', ')}`);
  }
  return problems;
}

// A tree is a Map of relative path to text; the checks read only that.
const skippedDirectory = /^(\.git|node_modules)$/;
function readTree(dir) {
  const files = new Map();
  const walk = (relative) => {
    for (const entry of readdirSync(join(dir, relative), { withFileTypes: true })) {
      if (skippedDirectory.test(entry.name)) continue;
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.set(path, readFileSync(join(dir, path), 'utf8'));
    }
  };
  walk('');
  return files;
}
const isTestFile = path => /(^|\/)(tests?|__tests__)\//.test(path) || /\.(test|spec)\.[a-z]+$/.test(path) || /Tests?\.(java|kt)$/.test(path) || /_test\.dart$/.test(path);
const domainFiles = files => [...files].filter(([path]) => /(^|\/)domain\//.test(path) && !isTestFile(path));

// Check 1: no domain file imports an application, API or infrastructure path or package.
const outerLayer = /^(app|application|api|infra|infrastructure)$/i;
const importTargets = (content, language) => (language === 'java' || language === 'kotlin'
  ? [...content.matchAll(/^\s*import\s+(?:static\s+)?([\w.*]+)/gm)].map(match => match[1])
  : [...content.matchAll(/(?:\bfrom\s+|\bimport\s+|\brequire\(\s*)['"]([^'"]+)['"]/g)].map(match => match[1]));
export function checkLayerImports(files, language) {
  const violations = [];
  for (const [path, content] of domainFiles(files)) for (const target of importTargets(content, language)) if (target.split(/[/.:-]+/).some(segment => outerLayer.test(segment))) violations.push(`${path} imports ${target}`);
  return { pass: violations.length === 0, violations };
}

// Check 2: no raw primitive in a public domain signature, parameters and return type. Single-line signatures only. Factories
// that parse raw input into a value (`of`, `parse`, `from*`, and in TypeScript the parser named after its type, `email(): Email`)
// are the one place raw values enter, so they are exempt.
const primitiveType = {
  typescript: /^(string|number|boolean|bigint)(\[\])?$/,
  java: /^(String|int|long|short|byte|double|float|boolean|char|Integer|Long|Short|Byte|Double|Float|Boolean|Character)$/,
  kotlin: /^(String|Int|Long|Short|Byte|Double|Float|Boolean|Char)\??$/,
  dart: /^(String|int|double|num|bool)\??$/,
};
const splitTop = text => {
  const parts = []; let depth = 0; let current = '';
  for (const char of text) {
    if ('<([{'.includes(char)) depth++;
    else if ('>)]}'.includes(char)) depth--;
    if (char === ',' && depth === 0) { parts.push(current); current = ''; } else current += char;
  }
  return [...parts, current].map(part => part.trim()).filter(Boolean);
};
const unwrapAsync = type => type.replace(/^(?:Promise|Future|FutureOr)<(.*)>$/, '$1');
const paramTypes = (text, style) => splitTop(text).map(param => {
  const bare = param.replace(/@\w+(\([^)]*\))?\s*/g, '').replace(/^(?:final|required|readonly|public|private|protected|vararg)\s+/g, '').replace(/^[{[]|[}\]]$/g, '').trim();
  if (style === 'ts' || style === 'kotlin') return bare.replace(/\s*=.*$/, '').split(/\s*\??:\s*/)[1] ?? null;
  const tokens = bare.replace(/\s*=.*$/, '').split(/\s+/);
  return tokens.length > 1 && !bare.includes('this.') ? tokens.slice(0, -1).join(' ') : null;
}).filter(Boolean);
const signatureReaders = {
  typescript: line => {
    const patterns = [
      /^\s*export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>(]*>)?\(([^)]*)\)\s*(?::\s*([^{=;]+?))?\s*[{;]?\s*$/,
      /^\s*export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*(?::\s*([^=]+?))?\s*=>/,
      /^\s{2,}(?!private|protected|constructor|return|if|for|while|switch|catch|#)(?:public\s+)?(?:static\s+)?(?:async\s+)?(\w+)\s*\(([^)]*)\)\s*:\s*([^{;=]+?)\s*[{;]/,
    ];
    const match = patterns.map(pattern => pattern.exec(line)).find(Boolean);
    return match && { name: match[1], types: [...paramTypes(match[2], 'ts'), match[3]?.trim()].filter(Boolean) };
  },
  java: line => {
    const match = /^\s*public\s+(?:static\s+)?(?:final\s+)?(?:<[^>]+>\s+)?([\w<>[\],.? ]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws [\w., ]+)?\s*[{;]/.exec(line);
    return match && { name: match[2], types: [...paramTypes(match[3], 'c'), match[1].trim()] };
  },
  kotlin: line => {
    const match = /^\s*((?:\w+\s+)*)fun\s+(?:<[^>]+>\s*)?(?:[\w.]+\.)?(\w+)\s*\(([^)]*)\)\s*(?::\s*([^{=]+?))?\s*[{=]/.exec(line);
    return match && !/\b(private|internal|protected)\b/.test(match[1]) && { name: match[2], types: [...paramTypes(match[3], 'kotlin'), match[4]?.trim()].filter(Boolean) };
  },
  dart: line => {
    const match = /^\s*(?:static\s+)?([\w<>?,]+(?:\s+[\w<>?,]+)*?)\s+([a-zA-Z]\w*)\s*\(([^)]*)\)\s*(?:async\s*)?(?:\{|=>|;)/.exec(line);
    return match && !/^(return|if|else|for|while|switch|new|await|throw|assert)$/.test(match[1]) && { name: match[2], types: [...paramTypes(match[3], 'c'), match[1].trim()] };
  },
};
const parsingFactory = (name, types, language) => /^(of|parse|valueOf|from\w*|toString|equals|hashCode|main)$/.test(name) || (language === 'typescript' && types.at(-1)?.toLowerCase() === name.toLowerCase());
export function checkRawPrimitives(files, language) {
  const violations = [];
  for (const [path, content] of domainFiles(files)) {
    for (const line of content.split('\n')) {
      const signature = signatureReaders[language]?.(line);
      if (!signature || parsingFactory(signature.name, signature.types, language)) continue;
      const raw = signature.types.filter(type => unwrapAsync(type.replace(/^readonly\s+/, '')).split('|').some(part => primitiveType[language].test(part.trim())));
      if (raw.length) violations.push(`${path}: ${signature.name} uses ${[...new Set(raw)].join(', ')}`);
    }
  }
  return { pass: violations.length === 0, violations };
}

// Check 3: the tests the run added or changed fail on the pre-fix tree, the starting tree plus only those test files.
export function checkRedRun({ start, final, gate, run, scratch }) {
  const added = [...final].filter(([path, content]) => isTestFile(path) && start.get(path) !== content);
  if (!added.length) return { pass: false, violations: ['no new or changed test file'] };
  const dir = mkdtempSync(join(scratch, 'pre-fix-'));
  try {
    for (const [path, content] of [...start, ...added]) { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), content); }
    const { status } = run(gate, dir);
    return typeof status === 'number' && status !== 0 ? { pass: true, violations: [] } : { pass: false, violations: [`the new test passed on the pre-fix tree (exit ${status ?? 'none'})`] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Check 4: the project gate passes on the final tree.
export function checkGate({ dir, gate, run }) {
  const { status } = run(gate, dir);
  return { pass: status === 0, violations: status === 0 ? [] : [`gate exited ${status ?? 'none'}`] };
}

function gradeTask({ task, start, final, dir, run, scratch }) {
  const results = {
    layers: () => checkLayerImports(final, task.language),
    primitives: () => checkRawPrimitives(final, task.language),
    red: () => checkRedRun({ start, final, gate: task.gate, run, scratch }),
    gate: () => checkGate({ dir, gate: task.gate, run }),
  };
  const graded = Object.fromEntries(task.checks.map(name => [name, results[name]()]));
  return { checks: Object.fromEntries(implementerChecks.map(name => [name, graded[name] ? graded[name].pass : null])), violations: Object.fromEntries(Object.entries(graded).filter(([, result]) => !result.pass).map(([name, result]) => [name, result.violations])) };
}

const rate = (passed, total) => ({ passed, total, rate: total ? round(passed / total) : null });
function summarizeImplementer(rows) {
  const checks = Object.fromEntries(implementerChecks.map(name => { const graded = rows.filter(row => typeof row.checks[name] === 'boolean'); return [name, rate(graded.filter(row => row.checks[name]).length, graded.length)]; }));
  const all = Object.values(checks);
  const costs = rows.map(row => row.cost).filter(cost => Number.isFinite(cost));
  const total = costs.reduce((sum, cost) => sum + cost, 0);
  return {
    tasks: rows.length, tasksPassed: rows.filter(row => row.passed).length, checks,
    overall: rate(all.reduce((sum, item) => sum + item.passed, 0), all.reduce((sum, item) => sum + item.total, 0)),
    cost: { total: costs.length ? round(total) : unreported, perTask: costs.length ? round(total / costs.length) : unreported, reported: costs.length, unreported: rows.length - costs.length },
  };
}
function compareImplementerResults(before, after) {
  const delta = (x, y) => (typeof x === 'number' && typeof y === 'number' ? round(y - x) : unreported);
  return after.arms.map(arm => {
    const saved = before.arms?.find(other => other.arm === arm.arm);
    return saved && { arm: arm.arm, passRate: delta(saved.summary.overall.rate, arm.summary.overall.rate), costPerTask: delta(saved.summary.cost.perTask, arm.summary.cost.perTask) };
  });
}
const percent = item => (item.total ? `${item.passed}/${item.total}` : 'n/a');
function renderImplementerResults(result, comparisons = []) {
  const lines = [`Setting ${result.setting.model} ${result.setting.effort}; spend cap ${money(result.spendCap)}; total cost ${money(result.totalCost)}`];
  result.arms.forEach(arm => {
    lines.push('', `== ${arm.arm} (${arm.ref})`);
    for (const row of arm.rows) lines.push(`${row.task} ${implementerChecks.filter(name => typeof row.checks[name] === 'boolean').map(name => `${name} ${row.checks[name] ? 'pass' : 'FAIL'}`).join(', ')} ${money(row.cost)}`);
    const { checks, overall, cost } = arm.summary;
    lines.push(`pass rate: ${implementerChecks.map(name => `${name} ${percent(checks[name])}`).join('; ')}; overall ${percent(overall)}${overall.total ? ` (${overall.rate})` : ''}; cost per task ${money(cost.perTask)}, total ${money(cost.total)} (${cost.unreported} unreported)`);
    const comparison = comparisons.find(item => item?.arm === arm.arm);
    if (comparison) lines.push(`vs saved: pass rate ${signed(comparison.passRate)}, cost per task ${signed(comparison.costPerTask, true)}`);
  });
  if (result.skipped.length) lines.push('', `Skipped at the spend cap: ${result.skipped.map(item => `${item.task} (${item.arm})`).join(', ')}`);
  return lines.join('\n');
}

// Replays every task through both arms, task by task so the cap cuts both arms evenly, and stops starting sessions once the reported cost reaches the cap.
async function runImplementerBench({ snapshot, arms, io, root = repoRoot, scratch = tmpdir(), cap = spendCap, setting = sessionFor('implementer', 'R0') }) {
  const results = arms.map(arm => ({ arm: arm.name, ref: arm.ref, rows: [] }));
  const skipped = [];
  let spent = 0;
  for (const [index, task] of snapshot.tasks.entries()) {
    for (const [at, arm] of arms.entries()) {
      if (spent >= cap) { skipped.push({ task: task.id, arm: arm.name }); continue; }
      const tree = mkdtempSync(join(scratch, `implementer-${task.id}-`));
      try {
        cpSync(join(root, task.fixture), tree, { recursive: true, filter: source => !skippedDirectory.test(source.split('/').at(-1)) });
        mkdirSync(join(tree, '.agents'), { recursive: true });
        writeFileSync(join(tree, '.agents', 'config.json'), `${JSON.stringify({ version: 1, steps: { test: task.gate } }, null, 2)}\n`);
        const start = readTree(tree);
        const brief = join(scratch, `${basenameOf(tree)}-brief.md`);
        const roots = [join(arm.plugin, '..', 'core', 'skills'), join(arm.plugin, 'skills')];
        writeFileSync(brief, implementerBrief({
          step: { agent: 'implementer', mode: 'build' }, risk: 'R0', round: 0, model: setting.model, effort: setting.effort, base: 'main', pr: null,
          issue: { number: index + 1, title: task.issue.title, url: `bench://${snapshot.repo}/${task.id}`, body: task.issue.body },
          tree: { path: tree, branch: `bench-${task.id}` },
          architecture: architectureNote({ root: tree, files: [...start.keys()], roots }),
        }));
        const session = await io.implement({ task, arm, tree, brief, model: setting.model, effort: setting.effort });
        const graded = gradeTask({ task, start, final: readTree(tree), dir: tree, run: io.run, scratch });
        const cost = costOf(session?.usage);
        if (cost) spent += cost;
        const required = Object.values(graded.checks).filter(value => typeof value === 'boolean');
        results[at].rows.push({ task: task.id, language: task.language, checks: graded.checks, violations: graded.violations, passed: required.every(Boolean), cost });
      } finally { rmSync(tree, { recursive: true, force: true }); rmSync(join(scratch, `${basenameOf(tree)}-brief.md`), { force: true }); }
    }
  }
  return { snapshot: snapshot.repo, kind: 'implementer', setting, spendCap: cap, baseline: arms.at(-1)?.ref ?? null, totalCost: round(spent), arms: results.map(item => ({ ...item, summary: summarizeImplementer(item.rows) })), skipped };
}
const basenameOf = path => path.split('/').at(-1);

async function implementerBenchCommand(options, io) {
  for (const flag of ['model', 'effort', 'settings']) if (options[flag]) throw new Error(`--${flag} does not apply to the implementer bench: it runs the cheapest delivery setting, sessionFor('implementer', 'R0')`);
  const snapshot = readJson(options.snapshot || defaultImplementerSnapshot);
  const problems = validateImplementerSnapshot(snapshot, options.snapshot ? dirname(options.snapshot) : repoRoot);
  if (problems.length) throw new Error(`Invalid implementer benchmark snapshot: ${problems.join('; ')}`);
  // An explicit --snapshot resolves its fixtures against the snapshot's own directory; the committed snapshot, against the repository root.
  const root = options.snapshot ? dirname(options.snapshot) : repoRoot;
  const emit = (value, text) => console.log(options.json ? JSON.stringify(value, null, 2) : text);
  const setting = sessionFor('implementer', 'R0');
  let result;
  if (options.from) result = readJson(options.from);
  else if (!options.run) {
    const baseline = options.baseline || 'the merge base with the default branch';
    const would = snapshot.tasks.map(({ id, language, fixture, gate, checks }) => ({ id, language, fixture, gate, checks }));
    emit({ run: false, cost: 0, setting, spendCap, baseline, arms: ['current', 'baseline'], would }, [`Dry listing; nothing run, nothing spent. Snapshot holds ${would.length} seeded implementer tasks, each replayed on ${setting.model} ${setting.effort} with the skills at the working tree and at ${baseline}, no new session started once reported cost reaches ${money(spendCap)}. Pass --run to replay them (real model spend).`, ...would.map(task => `${task.id} ${task.language} ${task.fixture} gate: ${task.gate.join(' ')} checks: ${task.checks.join(', ')}`)].join('\n'));
    return 0;
  } else {
    const arms = await io.arms(options.baseline);
    try { result = await runImplementerBench({ snapshot, arms, io, root, scratch: io.scratch ?? tmpdir(), setting }); } finally { await io.release?.(); }
  }
  const comparisons = options.compare ? compareImplementerResults(readJson(options.compare), result) : [];
  if (options.out) writeFileSync(options.out, `${JSON.stringify(result, null, 2)}\n`);
  emit(options.compare ? { ...result, comparisons } : result, renderImplementerResults(result, comparisons));
  return 0;
}

// The real implementer session: the arm's own plugin directory, a git-initialised copy of the fixture, usage from the host's output.
export function implementerIo(lanes, root, options = {}) {
  const host = options.host || lanes.delivery?.roles?.implementer?.host || 'claude';
  if (host !== 'claude') throw new Error('The implementer bench supports the claude host only');
  const executable = lanes.delivery?.executables?.claude || 'claude';
  const scratch = join(workflowScratch(root), 'bench-implementer');
  mkdirSync(scratch, { recursive: true });
  const gitRun = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', env: cleanEnvironment() });
  let baselineTree = null;
  return {
    scratch,
    arms(ref) {
      const at = ref || gitRun('merge-base', 'HEAD', `origin/${lanes.base}`).stdout.trim() || lanes.base;
      baselineTree = join(scratch, 'baseline-skills');
      rmSync(baselineTree, { recursive: true, force: true });
      if (gitRun('worktree', 'add', '--detach', baselineTree, at).status !== 0) throw new Error(`Cannot check out baseline ${at}`);
      return [{ name: 'current', ref: 'working tree', plugin: join(root, 'plugins', 'common', 'workflow') }, { name: 'baseline', ref: at, plugin: join(baselineTree, 'plugins', 'common', 'workflow') }];
    },
    release() { if (baselineTree) gitRun('worktree', 'remove', '--force', baselineTree); },
    implement({ arm, task, tree, brief, model, effort }) {
      for (const args of [['init', '-q'], ['add', '-A'], ['-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', 'commit', '-q', '-m', 'chore: seed']]) spawnSync('git', args, { cwd: tree, env: cleanEnvironment() });
      const command = [executable, '--print', '--output-format', 'json', '--agent', 'filipkrawiec-workflow:implementer', '--model', model, '--effort', effort, '--plugin-dir', arm.plugin, '--permission-mode', 'auto', '--name', `bench-${arm.name}-${task.id}`, `Follow your brief at ${brief}. Return at most 5 lines.`];
      const run = spawnSync(command[0], command.slice(1), { cwd: tree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env });
      const usageOf = usageHost(command);
      return { usage: usageOf ? parseUsage(usageOf, run.stdout) : null };
    },
    run: (argv, cwd) => ({ status: spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', env: cleanEnvironment(), timeout: 600_000 }).status }),
  };
}
