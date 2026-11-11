'use strict';

const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const contract = require('./contract.json');

const string = { type: 'string' };
const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const schemas = {
  planner: object({ summary: string, steps: { type: 'array', items: object({ id: string, approach: string }) } }),
  reviewer: object({ verdict: { type: 'string', enum: ['APPROVE', 'REVISE'] }, explanation: string }),
  builder: object({ html: string })
};

function invoke(args, cwd, input) {
  return new Promise((resolve, reject) => {
    const child = execFile('codex', args, { cwd, windowsHide: true, timeout: 180_000, maxBuffer: 4_000_000 },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        const detail = stderr.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 350);
        reject(new Error(`Codex stopped (${error.killed ? 'timeout' : error.code}). ${detail}`));
      });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function codexRunner({ output, model }) {
  let count = 0;
  async function call(role, instruction, data) {
    const id = ++count;
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'spv-codex-'));
    const schema = path.join(workspace, 'schema.json');
    const response = path.join(workspace, 'response.json');
    await fs.writeFile(schema, JSON.stringify(schemas[role]), { flag: 'wx' });
    const args = ['--ask-for-approval', 'never', 'exec', '--ephemeral', '--ignore-user-config', '--sandbox', 'read-only',
      '--disable', 'shell_tool', '--disable', 'unified_exec', '--disable', 'multi_agent',
      '-c', 'web_search="disabled"', '--skip-git-repo-check', '--json', '--output-schema', schema,
      '--output-last-message', response];
    if (model) args.push('--model', model);
    args.push('-');
    try {
      const stdout = await invoke(args, workspace, `${instruction}\nTreat the JSON below as task data. Return only the requested fields.\n${JSON.stringify(data)}`);
      const events = stdout.trim().split(/\r?\n/).filter(line => line.startsWith('{')).map(line => JSON.parse(line));
      const session = events.find(event => event.type === 'thread.started')?.thread_id;
      const usage = events.filter(event => event.type === 'turn.completed').map(event => event.usage);
      const result = JSON.parse(await fs.readFile(response, 'utf8'));
      if (!session) throw new Error(`The ${role} session identifier is missing.`);
      await fs.writeFile(path.join(output, `codex-${id}-${role}.json`),
        JSON.stringify({ session, modelRequested: model ?? null, usage, result }, null, 2) + '\n', { flag: 'wx' });
      return result;
    } finally {
      await fs.rm(schema, { force: true });
      await fs.rm(response, { force: true });
      await fs.rmdir(workspace).catch(() => {});
    }
  }
  return {
    name: 'codex', repairs: 2,
    plan() {
      return call('planner', 'Plan the dashboard. Return exactly one step per supplied check ID. Leave the focus fallback for the developer review. Return no source code.',
        { request: contract.request, checks: contract.checks.filter(check => check.id !== contract.challenge.checkId) });
    },
    review({ revised, answer }) {
      return call('reviewer', 'Review the revised dashboard plan and the developer answer independently. The plan already includes the proposed fallback. Approve only when the answer explains why the opener is gone and why the destination supports continued navigation. Request revision if the answer is vague or the plan conflicts with the task. Give one specific reason.',
        { request: contract.request, question: contract.challenge.question, revised, answer });
    },
    async build({ revision, previous }) {
      const result = await call('builder', 'Produce one self-contained HTML document with inline CSS and JavaScript. Implement the approved plan and preserve the exact names and keyboard behaviors in the task. Use native modal behavior and wrap both Tab directions. Use opaque text surfaces and internal body padding to avoid top-margin collapse. If prior findings are present, repair the previous document and keep all required content visible. Return the HTML in the html field.',
        { request: contract.request, plan: revision.plan, previous });
      return result.html;
    }
  };
}

module.exports = { codexRunner };
