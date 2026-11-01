#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const prompt = process.argv[2] || '';
const match = prompt.match(/'([^']+)'/);
let url;
try { url = new URL(match?.[1]); } catch { process.exit(1); }
if (url.protocol !== 'https:' || url.hostname !== 'github.com' || (url.port && url.port !== '443')) process.exit(1);
if (/^Username for /i.test(prompt)) {
  process.stdout.write('x-access-token\n');
} else if (/^Password for /i.test(prompt) && /^[A-Za-z0-9-]+$/.test(process.env.WORKFLOW_IMPLEMENTER || '')) {
  const env = { ...process.env };
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  delete env.GH_HOST;
  const token = spawnSync('gh', ['auth', 'token', '--hostname', 'github.com', '--user', env.WORKFLOW_IMPLEMENTER], { env, encoding: 'utf8' });
  if (token.error || token.status !== 0 || !token.stdout.trim() || /\s/.test(token.stdout.trim())) process.exit(1);
  const secret = token.stdout.trim();
  const identity = spawnSync('gh', ['api', '--hostname', 'github.com', 'user', '--jq', '.login'], { env: { ...env, GH_TOKEN: secret }, encoding: 'utf8' });
  if (identity.error || identity.status !== 0 || identity.stdout.trim().toLowerCase() !== env.WORKFLOW_IMPLEMENTER.toLowerCase()) process.exit(1);
  process.stdout.write(`${secret}\n`);
} else process.exit(1);
