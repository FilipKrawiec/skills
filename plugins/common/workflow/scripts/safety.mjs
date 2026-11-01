import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';

function api(repo, endpoint, options = {}) {
  const args = ['api', '--hostname', 'github.com'];
  if (options.method) args.push('-X', options.method);
  args.push(repo ? `repos/${repo}/${endpoint}` : endpoint);
  if (options.body) args.push('--input', '-');
  const result = spawnSync('gh', args, { encoding: 'utf8', input: options.body ? JSON.stringify(options.body) : undefined, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error((result.stderr || '').trim() || `gh api ${endpoint} failed`);
  return result.stdout ? JSON.parse(result.stdout) : null;
}
function optionalApi(repo, endpoint) { try { return api(repo, endpoint); } catch { return null; } }
function compare(name, actual, expected, drift) {
  if (actual === expected) console.log(`ok     ${name}`);
  else { console.log(`DRIFT  ${name}: is '${actual}', want '${expected}'`); drift.value = true; }
}
function csv(values) { return values.map(value => JSON.stringify(value)).join(','); }
export function rulesetOkay(ruleset, releaseAppId) {
  const include = ruleset.conditions?.ref_name?.include || [];
  const exclude = ruleset.conditions?.ref_name?.exclude || [];
  const bypass = ruleset.bypass_actors || [];
  const ruleTypes = (ruleset.rules || []).map(rule => rule.type);
  const validApps = bypass.filter(actor => actor.actor_type === 'Integration');
  const invalidBypass = bypass.some(actor => {
    if (actor.actor_type === 'RepositoryRole' && actor.actor_id === 5) return false;
    if (actor.actor_type !== 'Integration' || actor.actor_id === 15368) return true;
    return releaseAppId != null && actor.actor_id !== releaseAppId;
  });
  return include.includes('refs/tags/v*') && include.includes('refs/tags/rc/*') && exclude.length === 0
    && validApps.length <= 1 && !invalidBypass
    && ['creation', 'update', 'deletion'].every(rule => ruleTypes.includes(rule));
}
export function validateCodeowners(contents, cfg) {
  let rules = 0, invalid = false, wildcard = false;
  for (const line of contents.split(/\r?\n/)) {
    const parts = line.replace(/#.*/, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    rules++;
    if (parts.length !== 2 || ![cfg.reviewer, cfg.owner].some(login => `@${login}`.toLowerCase() === parts[1].toLowerCase())) invalid = true;
    if (parts[0] === '*' && parts[1].toLowerCase() === `@${cfg.reviewer}`.toLowerCase()) wildcard = true;
  }
  return wildcard && rules > 0 && !invalid;
}
function tagRuleset(repo, releaseAppId) {
  try {
    const items = api(repo, 'rulesets?per_page=100');
    return (Array.isArray(items) ? items : []).some(item => {
      if (item.target !== 'tag' || item.enforcement !== 'active') return false;
      try { return rulesetOkay(api(repo, `rulesets/${item.id}`), releaseAppId); } catch { return false; }
    });
  } catch { return false; }
}
function identities(cfg) {
  const names = [cfg.owner, cfg.implementer, cfg.reviewer];
  if (names.some(value => typeof value !== 'string' || !/^[A-Za-z0-9-]+$/.test(value)) || new Set(names.map(value => value.toLowerCase())).size !== 3) throw new Error('Configure identities.implementer and distinct owner/Reviewer rules in .github/CODEOWNERS');
  if (!Array.isArray(cfg.requiredChecks) || !cfg.requiredChecks.length || !cfg.requiredChecks.every(value => typeof value === 'string' && value.trim())) throw new Error('Configure required checks in GitHub or set github.requiredChecks when the default verify check does not apply');
}
function ownerOnly(cfg) {
  const actor = api('', 'user').login;
  if (actor?.toLowerCase() !== cfg.owner.toLowerCase()) throw new Error(`apply requires the configured owner ${cfg.owner}; authenticated actor is ${actor || 'unknown'}`);
}
function apply(cfg, base) {
  ownerOnly(cfg);
  const repo = cfg.repo;
  api(repo, '', { method: 'PATCH', body: { allow_squash_merge: true, allow_merge_commit: false, allow_rebase_merge: false, allow_auto_merge: true, delete_branch_on_merge: true } });
  api(repo, 'actions/permissions/workflow', { method: 'PUT', body: { default_workflow_permissions: 'read', can_approve_pull_request_reviews: false } });
  const releaseAppId = cfg.releaseAppId;
  if (!tagRuleset(repo, releaseAppId)) {
    const bypass_actors = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
    if (releaseAppId != null) bypass_actors.push({ actor_id: releaseAppId, actor_type: 'Integration', bypass_mode: 'always' });
    api(repo, 'rulesets', { method: 'POST', body: { name: 'release tags', target: 'tag', enforcement: 'active', conditions: { ref_name: { include: ['refs/tags/v*', 'refs/tags/rc/*'], exclude: [] } }, bypass_actors, rules: ['creation', 'update', 'deletion'].map(type => ({ type })) } });
  }
  const userExists = login => { try { api(repo, `collaborators/${login}/permission`); return true; } catch { return false; } };
  if (userExists(cfg.implementer) && userExists(cfg.reviewer)) {
    for (const login of [cfg.implementer, cfg.reviewer]) api(repo, `collaborators/${login}`, { method: 'PUT', body: { permission: 'push' } });
    api(repo, `branches/${encodeURIComponent(base)}/protection`, { method: 'PUT', body: {
      required_status_checks: { strict: false, contexts: cfg.requiredChecks }, enforce_admins: false,
      required_pull_request_reviews: { required_approving_review_count: 1, require_code_owner_reviews: true, require_last_push_approval: true, dismiss_stale_reviews: true },
      restrictions: null, required_linear_history: true, allow_force_pushes: false, allow_deletions: false, required_conversation_resolution: true,
    } });
  } else console.log(`skipped: create ${cfg.implementer} and ${cfg.reviewer}, then apply again for collaborators and reviews`);
}
function role(repo, login) {
  try {
    const permission = api(repo, `collaborators/${login}/permission`).role_name;
    if (permission === 'write') return permission;
  } catch {}
  try {
    const invitations = api(repo, 'invitations');
    if (invitations.some(invite => invite.invitee?.login?.toLowerCase() === login.toLowerCase())) return 'invited, not yet accepted';
  } catch {}
  return 'none';
}
function protectionStatus(repo, base) { return optionalApi(repo, `branches/${encodeURIComponent(base)}/protection`); }
function check(cfg, base) {
  const repo = cfg.repo;
  const drift = { value: false };
  const settings = api(repo, '');
  compare('merge methods', csv([settings.allow_squash_merge, settings.allow_merge_commit, settings.allow_rebase_merge, settings.allow_auto_merge, settings.delete_branch_on_merge]), 'true,false,false,true,true', drift);
  const actions = api(repo, 'actions/permissions/workflow');
  compare('actions token', csv([actions.default_workflow_permissions, actions.can_approve_pull_request_reviews]), '"read",false', drift);
  const tags = tagRuleset(repo, cfg.releaseAppId);
  compare('release tag ruleset for v* and rc/*', tags ? 'yes' : 'no', 'yes', drift);
  let ownerRole = 'none';
  try { ownerRole = api(repo, `collaborators/${cfg.owner}/permission`).role_name; } catch {}
  compare(`${cfg.owner} role`, ownerRole, 'admin', drift);
  for (const login of [cfg.implementer, cfg.reviewer]) compare(`${login} role`, role(repo, login), 'write', drift);
  const protectedBranch = protectionStatus(repo, base);
  const reviews = protectedBranch?.required_pull_request_reviews;
  compare(`${base} reviews`, reviews ? csv([reviews.required_approving_review_count, reviews.require_code_owner_reviews, reviews.require_last_push_approval, reviews.dismiss_stale_reviews]) : 'missing', '1,true,true,true', drift);
  const actualChecks = (protectedBranch?.required_status_checks?.contexts || []).toSorted();
  compare(`${base} status checks`, actualChecks.join(','), [...cfg.requiredChecks].sort().join(','), drift);
  compare(`${base} history and threads`, protectedBranch ? csv([protectedBranch.required_linear_history?.enabled, protectedBranch.required_conversation_resolution?.enabled]) : 'missing', 'true,true', drift);
  compare(`${base} force pushes and deletions`, protectedBranch ? csv([protectedBranch.allow_force_pushes?.enabled, protectedBranch.allow_deletions?.enabled]) : 'missing', 'false,false', drift);
  compare(`${base} admins excluded`, String(protectedBranch?.enforce_admins?.enabled ?? 'missing'), 'false', drift);
  const secrets = optionalApi(repo, 'actions/secrets');
  compare('repository secrets', String(secrets?.total_count ?? 'unavailable'), '0', drift);
  const environments = optionalApi(repo, 'environments')?.environments || [];
  for (const environment of environments) {
    const ownerReview = (environment.protection_rules || []).some(rule => rule.type === 'required_reviewers' && rule.reviewers?.some(reviewer => reviewer.type === 'User' && reviewer.reviewer?.login?.toLowerCase() === cfg.owner.toLowerCase()));
    if (ownerReview) { compare(`environment ${environment.name}`, 'safe', 'safe', drift); continue; }
    const policy = environment.deployment_branch_policy;
    if (policy?.custom_branch_policies !== true) { compare(`environment ${environment.name}`, `deploys from ${policy ? 'protected branches' : 'any branch'} without owner review`, 'safe', drift); continue; }
    const rules = optionalApi(repo, `environments/${encodeURIComponent(environment.name)}/deployment-branch-policies`)?.branch_policies || [];
    const other = rules.filter(rule => !((rule.type === 'branch' && rule.name === base) || (rule.type === 'tag' && (/^v[^/]*$/.test(rule.name) || /^rc\/[^/]*$/.test(rule.name)) && !rule.name.includes('**'))));
    const tagCount = rules.filter(rule => rule.type === 'tag').length;
    const safe = other.length === 0 && (tagCount === 0 || tags);
    compare(`environment ${environment.name}`, safe ? 'safe' : `deploys from ${other.map(rule => rule.name).join(',') || 'release tags without the ruleset'} without owner review`, 'safe', drift);
  }
  const codeownerErrors = optionalApi(repo, `codeowners/errors?ref=${encodeURIComponent(base)}`);
  compare('CODEOWNERS syntax', codeownerErrors ? String(codeownerErrors.errors?.length ?? 'unavailable') : 'unavailable', '0', drift);
  const codeownersPaths = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
  let contents = '';
  for (const path of codeownersPaths) {
    try { contents = Buffer.from(api(repo, `contents/${path}?ref=${encodeURIComponent(base)}`).content, 'base64').toString('utf8'); break; } catch {}
  }
  compare('Every CODEOWNERS rule has one recognized owner', validateCodeowners(contents, cfg) ? 'yes' : 'no', 'yes', drift);
  return drift.value ? 1 : 0;
}
export function safetyCommand(args, lanes) {
  const [mode, ...rest] = args;
  if (!['check', 'apply'].includes(mode) || rest.length) throw new Error('Usage: workflow safety <check|apply>');
  if (!lanes.repo || !lanes.owner || !lanes.implementer || !lanes.reviewer) throw new Error('Set origin, identities.implementer and .github/CODEOWNERS');
  if (lanes.releaseAppId != null && (!Number.isSafeInteger(lanes.releaseAppId) || lanes.releaseAppId < 1 || lanes.releaseAppId === 15368)) throw new Error('github.releaseAppId must be a valid non-GitHub-Actions integration id');
  identities(lanes);
  const base = lanes.base || api(lanes.repo, '').default_branch;
  if (mode === 'apply') apply(lanes, base);
  return check(lanes, base);
}
