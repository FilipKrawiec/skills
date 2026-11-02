import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function buildAfkReport({ runId, model, outcome, summary }) {
  return [
    '### AFK run report',
    '',
    `- Run ID: \`${runId}\`; model: \`${model}\`.`,
    `- Pi process: **${outcome}**.`,
    '- Report method: Pi workflow extension called the Node workflow CLI.',
    '',
    '### Outcome',
    '',
    summary.trim().slice(0, 8000) || 'Pi settled without a final text response.',
    '',
  ].join('\n');
}

function finalText(ctx) {
  const entry = ctx.sessionManager.getLeafEntry();
  if (entry?.type !== 'message' || entry.message?.role !== 'assistant') return '';
  const content = entry.message.content;
  if (typeof content === 'string') return content;
  return (content || []).filter(part => part.type === 'text').map(part => part.text).join('\n');
}

export function blockedWorkflowCommand(command) {
  const shell = command.replace(/\\\r?\n/g, ' ')
    .replace(/\$'((?:\\.|[^'])*)'/g, (_match, value) => value.replace(/\\x([\da-f]{1,2})/gi, (_hex, digits) => String.fromCharCode(Number.parseInt(digits, 16))).replace(/\\([\\'"`])/g, '$1'))
    .replace(/\\([\s\S])/g, '$1')
    .replace(/['"`]/g, '');
  if (/(?:^|[\s;&|()])[^\s;&|]*(?:\$\([^)]*\)|\$\{[^}]*\}|\$[A-Za-z_]\w*)[^\s;&|]*[ \t]+(?:(?![;&|\n]).)*(?:\bcommit\b|\bpush\b|\bissue\s+(?:comment|close|reopen|edit|create|delete|transfer)\b|\bproject\s+(?:item-edit|item-create|item-archive)\b|\bapi\b(?:(?![;&|\n]).)*(?:-X\s*|--method(?:=|\s+))(?:POST|PATCH|PUT|DELETE)\b)/i.test(shell)) {
    return 'Use the workflow tool for commits, pushes and GitHub writes; dynamic shell commands cannot bypass actor and scope checks.';
  }
  if (/(?:^|[\s;&|()'"`])(?:[^\s;&|()'"`]+\/)?git\s+(?:(?:-C|-c)\s+[^\s;&|]+\s+|--(?:no-pager|paginate|no-replace-objects|literal-pathspecs|bare)\s+|--(?:git-dir|work-tree|namespace|exec-path)(?:=[^\s;&|]+|\s+[^\s;&|]+)\s+)*(?:commit|push)(?:\s|$)/i.test(shell)) {
    return 'Use the workflow tool for commits and pushes; it applies the assigned-path and actor checks.';
  }
  const gh = /(?:^|[\s;&|()'"`])(?:[^\s;&|()'"`]+\/)?gh\b/;
  const ghMatch = gh.exec(shell);
  const ghTail = ghMatch ? shell.slice(ghMatch.index + ghMatch[0].length) : '';
  const ghMutations = /\bissue\s+(?:(?:--repo|-R)\s+[^\s;&|]+\s+)*(?:comment|close|reopen|edit|create|delete|transfer)\b/i;
  const ghProjectMutation = /\bproject\s+(?:(?:--repo|-R)\s+[^\s;&|]+\s+)*(?:item-edit|item-create|item-archive)\b/i;
  const ghApiMutation = /\bapi\b(?:(?![;&|\n]).)*?(?:-X\s*|--method(?:=|\s+))(?:POST|PATCH|PUT|DELETE)\b/i;
  if (ghMatch && (ghMutations.test(ghTail) || ghProjectMutation.test(ghTail) || ghApiMutation.test(ghTail))) {
    return 'Use the workflow tool for GitHub writes; it validates the actor and binds writes to the assigned issue.';
  }
  return null;
}

function runWorkflowCli(cli, args, cwd) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`Workflow CLI rejected the action (exit ${result.status ?? 'unknown'}).`);
  return result.stdout.trim();
}

function issueComment(cli, issue, body, cwd) {
  const directory = mkdtempSync(join(cwd, '.workflow-comment-'));
  try {
    const file = join(directory, 'comment.md');
    writeFileSync(file, body, { mode: 0o600 });
    return runWorkflowCli(cli, ['issue', 'comment', '--number', issue, '--body-file', file], cwd);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function executeWorkflowAction(params, ctx) {
  const { WORKFLOW_CLI_PATH: cli, WORKFLOW_ISSUE_NUMBER: issue, WORKFLOW_CLOSE_REQUEST_PATH: closeRequestPath, WORKFLOW_RUN_ID: runId } = process.env;
  if (!cli) throw new Error('AFK host did not provide the workflow CLI path');
  const cwd = ctx.cwd || process.cwd();
  if (params.action === 'issue-status') {
    if (!/^[1-9]\d*$/.test(issue || '') || !['BACKLOG', 'TODO', 'PROGRESS', 'REVIEW', 'DONE'].includes(params.value)) throw new Error('Issue status requires a bound AFK issue and valid status');
    return runWorkflowCli(cli, ['issue', 'status', '--number', issue, '--value', params.value], cwd);
  }
  if (params.action === 'issue-close') {
    if (!/^[1-9]\d*$/.test(issue || '')) throw new Error('Issue close requires a bound AFK issue');
    if (!closeRequestPath || !runId) throw new Error('AFK host did not provide a deferred close request path');
    const request = JSON.stringify({ runId, issue });
    if (existsSync(closeRequestPath)) {
      if (readFileSync(closeRequestPath, 'utf8') !== request) throw new Error('A different close request already exists for this run');
    } else writeFileSync(closeRequestPath, request, { mode: 0o600, flag: 'wx' });
    return 'Close request queued; the host will close the issue after it posts the report and releases the hold.';
  }
  if (params.action === 'commit') {
    if (typeof params.message !== 'string' || !params.message.trim() || !Array.isArray(params.paths) || !params.paths.length || !params.paths.every(path => typeof path === 'string' && path)) throw new Error('Commit requires a message and explicit paths');
    return runWorkflowCli(cli, ['commit', '--message', params.message, '--', ...params.paths], cwd);
  }
  if (params.action === 'push') return runWorkflowCli(cli, ['push', ...(params.ownerBootstrap ? ['--owner-bootstrap'] : [])], cwd);
  throw new Error('Unsupported workflow action');
}

export default function (pi) {
  pi.on('before_agent_start', event => {
    const readOnly = process.env.WORKFLOW_READ_ONLY === 'true';
    const mode = readOnly
      ? 'This held issue has no writable paths. Treat it as a read-only workflow check: use the supplied Hold/Work and issue criteria, do not edit files, run project tests, stage/commit/push, or post extra issue comments. The extension posts one final report. When the read-only acceptance is satisfied, request issue closure once through workflow and finish immediately.'
      : 'Handle only the assigned Hold/Work item. Use workflow for commits, pushes and issue status/closure; never run raw git commit/push or gh issue writes. The extension posts one final report. Request closure only after work and checks pass, then finish immediately; the host releases the hold and closes after report verification.';
    return {
      systemPrompt: `${event.systemPrompt}\n\nAFK runtime: ${mode} Search files with rg or rg --files; recursive find has stalled this host. Do not poll issue state or wait for closure.`,
    };
  });

  pi.on('tool_call', event => {
    if (event.toolName !== 'bash' || typeof event.input?.command !== 'string') return;
    if (/(^|[\s;&|])find(?:\s|$)/.test(event.input.command)) {
      return { block: true, reason: 'Use rg or rg --files for repository searches; recursive find is blocked because it stalled this AFK host.' };
    }
    const reason = blockedWorkflowCommand(event.input.command);
    if (reason) return { block: true, reason };
  });

  pi.registerTool({
    name: 'workflow',
    label: 'Workflow',
    description: 'Run actor-validated commits, pushes, and issue status or deferred close through the Node workflow CLI.',
    promptSnippet: 'Use the Node workflow CLI for commits, pushes and issue status or deferred close',
    promptGuidelines: ['Use workflow for every commit, push, or issue status/closure; issue-close queues closure for the host after settlement, so finish your response instead of polling for closure. The extension posts one final issue report automatically.'],
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['issue-status', 'issue-close', 'commit', 'push'] },
        value: { type: 'string', enum: ['BACKLOG', 'TODO', 'PROGRESS', 'REVIEW', 'DONE'] },
        message: { type: 'string' },
        paths: { type: 'array', items: { type: 'string' }, minItems: 1 },
        ownerBootstrap: { type: 'boolean' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const output = executeWorkflowAction(params, ctx);
      return { content: [{ type: 'text', text: output || 'Workflow CLI completed.' }], details: {} };
    },
  });

  let reportPosted = false;
  pi.on('agent_settled', (event, ctx) => {
    if (reportPosted) return;
    const { WORKFLOW_CLI_PATH: cli, WORKFLOW_RUN_ID: runId, WORKFLOW_ISSUE_NUMBER: issue, WORKFLOW_MODEL: model } = process.env;
    if (!cli || !runId || !model || !/^[1-9]\d*$/.test(issue || '')) return;
    try {
      const output = issueComment(cli, issue, buildAfkReport({ runId, model, outcome: event.aborted ? 'aborted' : 'completed', summary: finalText(ctx) }), ctx.cwd || process.cwd());
      reportPosted = true;
      console.log(output || `AFK report posted on issue #${issue}`);
    } catch (error) {
      process.exitCode = 1;
      console.error(`AFK report failed through the Node workflow CLI: ${error.message}`);
    }
  });
}
