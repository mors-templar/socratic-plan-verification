'use strict';

const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const { parseArgs } = require('node:util');
const { codexRunner } = require('./codex.cjs');
const { canonicalAnswer, checkRun, fixtureRunner, runWorkflow, variants } = require('./workflow.cjs');

const safe = value => String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
const usage = 'Usage: node cli.cjs [--runner fixture|codex] [--variant good|blank|focus-leak|low-contrast|lost-focus]\n' +
  '                    [--model ID] [--scripted] [--output DIRECTORY]\n' +
  '       node cli.cjs --demo [--output DIRECTORY]\n' +
  '       node cli.cjs --check-run DIRECTORY';

function operator(rl, quiet = false) {
  return {
    showPlan(plan) {
      if (quiet) return;
      console.log(`\nDraft plan\n${safe(plan.summary)}`);
      for (const step of plan.steps) console.log(`  ${safe(step.id)}: ${safe(step.approach)}`);
    },
    async answer(challenge) {
      if (!rl) return canonicalAnswer;
      console.log(`\nReviewer question\n${challenge.question}`);
      const destination = await rl.question('Focus destination (empty to stop): ');
      if (!destination.trim()) return null;
      return { destination, rationale: await rl.question('Why is that a useful destination? ') };
    },
    showReview(review) {
      if (!quiet) console.log(`${review.verdict}: ${safe(review.explanation)}`);
    },
    async approve(revision, hash) {
      if (!rl) return true;
      const steps = revision.plan.steps;
      console.log(`\nRevised plan ${hash.slice(0, 12)}\n${safe(steps.at(-1).approach)}`);
      return (await rl.question('Type APPROVE to start the build: ')).trim() === 'APPROVE';
    },
    showVerification(report, attempt) {
      if (quiet) return;
      console.log(`\nBuild ${attempt}: ${report.status}`);
      for (const result of report.checks) console.log(`  ${result.status} ${result.id}: ${safe(result.observed)}`);
    }
  };
}

async function main() {
  const { values } = parseArgs({ options: {
    runner: { type: 'string', default: 'fixture' }, variant: { type: 'string' }, model: { type: 'string' },
    output: { type: 'string' }, demo: { type: 'boolean' }, scripted: { type: 'boolean' },
    'check-run': { type: 'string' }, help: { type: 'boolean' }
  } });
  if (values.help) return console.log(usage);
  if (values['check-run']) {
    const { file, artifactSha256 } = await checkRun(path.resolve(values['check-run']));
    console.log(`VERIFIED_IN_SCOPE ${artifactSha256}\n${file}`);
    return;
  }
  if (!['fixture', 'codex'].includes(values.runner) || (values.model && values.runner !== 'codex') ||
      (values.variant && (values.runner !== 'fixture' || !variants.includes(values.variant))) ||
      (values.demo && (values.runner !== 'fixture' || values.variant))) throw new Error(usage);
  const home = path.join(__dirname, 'runs');
  const output = values.output ? path.resolve(values.output) : path.join(home, randomUUID());
  if (!values.output) await fs.mkdir(home, { recursive: true });
  if (values.demo) {
    await fs.mkdir(output);
    for (const variant of variants) {
      const run = await runWorkflow({ runner: fixtureRunner(variant), interact: operator(null, true),
        output: path.join(output, variant), answerSource: 'scripted_fixture' });
      console.log(`${variant.padEnd(12)} ${run.status}`);
      if (run.status !== (variant === 'good' ? 'VERIFIED_IN_SCOPE' : 'BLOCKED')) process.exitCode = 1;
    }
    console.log(`Evidence: ${output}`);
    return;
  }
  if (!values.scripted && !process.stdin.isTTY) throw new Error('Use an interactive terminal or opt into --scripted for engineering replay.');
  const rl = values.scripted ? null : readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const runner = values.runner === 'codex' ? codexRunner({ output, model: values.model }) : fixtureRunner(values.variant ?? 'good');
    console.log(`Run evidence: ${output}`);
    const run = await runWorkflow({ runner, interact: operator(rl), output,
      answerSource: values.scripted ? 'scripted_fixture' : 'interactive_operator' });
    console.log(`${run.status}: ${safe(run.reason)}`);
    process.exitCode = { VERIFIED_IN_SCOPE: 0, BLOCKED: 2, REVIEW_REQUIRED: 3 }[run.status];
  } finally {
    rl?.close();
  }
}

main().catch(error => { console.error(safe(error.message)); process.exitCode = 1; });
