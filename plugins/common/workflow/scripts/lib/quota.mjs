import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// One GraphQL budget per token, shared by every CLI process on the machine through a file. GitHub's own
// `rate_limit` endpoint is the source of truth (it costs nothing); each call spent in between is counted locally.
export const quotaDefaults = {
  share: 0.5,         // the share of the hourly quota the CLI may spend; the thresholds below apply to that share
  backoffBelow: 0.2,  // fraction of the usable quota left under which callers slow down proportionally
  floorBelow: 0.05,   // fraction left under which only merge-critical calls run
  maxBackoffMs: 5000, // the delay at the floor
  probeEveryMs: 30_000,
  pollSeconds: 60,
  pollJitter: 0.2,
};
const shareFromEnv = () => { const value = Number(process.env.WORKFLOW_GRAPHQL_SHARE); return value > 0 && value <= 1 ? value : quotaDefaults.share; };
export const budgetFile = () => process.env.WORKFLOW_QUOTA_DIR ? join(process.env.WORKFLOW_QUOTA_DIR, 'graphql-budget.json') : join(homedir(), '.config', 'gh-agents', 'graphql-budget.json');
const tokenKey = () => createHash('sha256').update(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || 'ambient').digest('hex').slice(0, 16);

function readJson(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; } }
function writeJson(path, value) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(value));
    renameSync(temp, path);
  } catch { /* an unwritable budget file must never stop a command */ }
}
export function readBudget(file = budgetFile(), key = tokenKey()) { return readJson(file)[key] || null; }
export function writeBudget(budget, file = budgetFile(), key = tokenKey()) { writeJson(file, { ...readJson(file), [key]: budget }); }

// Whether a gh invocation spends GraphQL points: `gh api graphql`, and the porcelain commands that query it.
export function isGraphql(args) {
  if (args[0] === 'api') return args.includes('graphql');
  return ['pr', 'issue', 'project', 'repo', 'release', 'run', 'search', 'label'].includes(args[0]);
}
// Merge-critical calls keep running below the floor.
export function isMergeCritical(args) {
  const text = args.join(' ');
  return (args[0] === 'pr' && ['merge', 'ready'].includes(args[1])) || /mergePullRequest|enablePullRequestAutoMerge|markPullRequestReadyForReview/.test(text);
}
export function isGraphqlRead(args) {
  if (args[0] === 'api') return args.includes('graphql') && !args.some(arg => /^query=\s*mutation\b/.test(arg));
  return ['view', 'list', 'status', 'checks'].includes(args[1]);
}

// The decision for one call: how long to sleep, or `until` a reset time when only critical calls may run.
export function plan(budget, { now, critical = false, share = shareFromEnv() } = {}) {
  if (!budget || !Number.isFinite(budget.remaining) || !(budget.limit > 0)) return { sleepMs: 0 };
  if (Date.parse(budget.resetAt) <= now) return { sleepMs: 0 };
  const reserved = budget.limit * (1 - share);
  const usable = Math.max(0, budget.remaining - reserved);
  const fraction = usable / (budget.limit * share);
  if (fraction < quotaDefaults.floorBelow) return critical ? { sleepMs: 0 } : { until: Date.parse(budget.resetAt), exhausted: true };
  if (fraction < quotaDefaults.backoffBelow) {
    const depth = (quotaDefaults.backoffBelow - fraction) / (quotaDefaults.backoffBelow - quotaDefaults.floorBelow);
    return { sleepMs: Math.round(depth * quotaDefaults.maxBackoffMs) };
  }
  return { sleepMs: 0 };
}

function probe() {
  const result = spawnSync('gh', ['api', 'rate_limit', '--jq', '.resources.graphql'], { encoding: 'utf8', timeout: 15_000 });
  if (result.error || result.status !== 0) return null;
  try {
    const value = JSON.parse(result.stdout);
    return Number.isFinite(value.remaining) ? { remaining: value.remaining, limit: value.limit, resetAt: new Date(value.reset * 1000).toISOString() } : null;
  } catch { return null; }
}

// Called before every GraphQL call. `sleep` blocks; `fetchLimit` returns GitHub's current quota or null.
export function gate(args, { now = Date.now, sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms), fetchLimit = probe, file = budgetFile(), key = tokenKey(), share, waitWhenExhausted = false, report = message => console.error(message) } = {}) {
  let budget = readBudget(file, key);
  if (!budget || now() - (budget.probedAt || 0) >= quotaDefaults.probeEveryMs || Date.parse(budget.resetAt) <= now()) {
    const fresh = fetchLimit();
    budget = fresh ? { ...fresh, probedAt: now(), reportedFor: budget?.reportedFor } : { ...(budget || {}), probedAt: now() };
    writeBudget(budget, file, key);
  }
  const critical = isMergeCritical(args);
  for (let decision = plan(budget, { now: now(), critical, share }); ; decision = plan(budget, { now: now(), critical, share })) {
    if (decision.exhausted) {
      if (budget.reportedFor !== budget.resetAt) { report(`workflow: GitHub GraphQL quota used up to its ${Math.round((share ?? shareFromEnv()) * 100)}% share (${budget.remaining}/${budget.limit} left); resets at ${budget.resetAt}`); budget = { ...budget, reportedFor: budget.resetAt }; writeBudget(budget, file, key); }
      if (!waitWhenExhausted) throw new Error(`GitHub GraphQL quota is used up until ${budget.resetAt}; wait or poll after the reset`);
      sleep(Math.max(1000, Math.min(decision.until - now(), 60_000)));
      const fresh = fetchLimit();
      if (fresh) { budget = { ...fresh, probedAt: now(), reportedFor: budget.reportedFor }; writeBudget(budget, file, key); }
      else if (decision.until <= now()) budget = { ...budget, remaining: budget.limit, resetAt: new Date(now() + 3_600_000).toISOString() };
      continue;
    }
    if (decision.sleepMs) sleep(decision.sleepMs);
    break;
  }
  // Count the call locally until the next probe corrects the figure.
  writeBudget({ ...budget, remaining: Math.max(0, (budget.remaining ?? 0) - 1) }, file, key);
}

// What `status` shows: the last known quota, never a network call.
export function quotaStatus(file = budgetFile(), key = tokenKey(), now = Date.now()) {
  const budget = readBudget(file, key);
  if (!budget || !Number.isFinite(budget.remaining)) return null;
  return { remaining: budget.remaining, limit: budget.limit, resetAt: budget.resetAt, expired: Date.parse(budget.resetAt) <= now };
}

// One result per key and interval, shared by every process: `wait`s on the same PR spend one query per interval.
export function sharedRead(name, ttlMs, load, { now = Date.now, file = budgetFile().replace(/graphql-budget\.json$/, 'graphql-shared.json') } = {}) {
  const cache = readJson(file);
  const hit = cache[name];
  if (hit && now() - hit.at < ttlMs) return hit.value;
  const value = load();
  const fresh = Object.fromEntries(Object.entries(readJson(file)).filter(([, entry]) => now() - entry.at < 3_600_000));
  writeJson(file, { ...fresh, [name]: { at: now(), value } });
  return value;
}

// The interval between polls: at least a minute, jittered so parallel waits do not fire together.
export function pollSeconds(requested, random = Math.random) {
  const base = Math.max(quotaDefaults.pollSeconds, requested);
  return base * (1 + quotaDefaults.pollJitter * random());
}
