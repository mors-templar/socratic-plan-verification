'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { verifyHtml } = require('./verify.cjs');
const { canonicalAnswer, checkRun, fixtureRunner, runWorkflow } = require('./workflow.cjs');

function operator(overrides = {}) {
  return { showPlan() {}, answer: async () => canonicalAnswer, showReview() {}, approve: async () => true,
    showVerification() {}, ...overrides };
}

async function run(name, runner, interact = operator()) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spv-test-'));
  const output = path.join(root, name);
  const record = await runWorkflow({ runner, interact, output, answerSource: 'scripted_test' });
  return { output, record };
}

test('a bare approval or a rejected rationale does not open the build gate', async () => {
  const runner = fixtureRunner('good');
  let built = false;
  runner.build = async () => { built = true; };
  const { record, output } = await run('blocked', runner, operator({
    answer: async (challenge, round) => round === 1 ? { destination: 'Approve', rationale: 'Looks good.' } :
      { destination: challenge.destination, rationale: 'This is probably the correct choice.' }
  }));
  assert.equal(record.status, 'BLOCKED');
  assert.equal(built, false);
  assert.equal(record.decisions.length, 3);
  assert(record.decisions.every(decision => decision.review.verdict === 'REVISE'));
  await assert.rejects(fs.access(path.join(output, 'approval.json')), { code: 'ENOENT' });
  await assert.rejects(fs.access(path.join(output, 'attempt-1')), { code: 'ENOENT' });
});

test('a sound answer still requires approval of the revised plan', async () => {
  const runner = fixtureRunner('good');
  let built = false;
  runner.build = async () => { built = true; };
  const { record } = await run('declined', runner, operator({ approve: async () => false }));
  assert.equal(record.status, 'BLOCKED');
  assert.equal(record.decisions[0].review.verdict, 'APPROVE');
  assert.equal(built, false);
});

test('a revised answer reaches the build and the released artifact must match the report', async () => {
  const runner = fixtureRunner('good');
  const review = runner.review;
  runner.review = async input => {
    assert.equal(input.revised.steps.at(-1).id, 'delete-focus');
    assert(input.revised.steps.at(-1).approach.includes(input.answer.rationale));
    return review(input);
  };
  const { record, output } = await run('good', runner, operator({
    answer: async (_, round) => round === 1 ? { destination: 'Delete button', rationale: 'Return focus to the opener.' } : canonicalAnswer
  }));
  assert.deepEqual(record.decisions.map(decision => decision.review.verdict), ['REVISE', 'APPROVE']);
  assert.equal(record.status, 'VERIFIED_IN_SCOPE');
  const { file, artifactSha256 } = await checkRun(output);
  assert.equal(artifactSha256, record.attempts[0].artifactSha256);
  await fs.appendFile(file, '\n<!-- artifact changed -->\n');
  await assert.rejects(checkRun(output), /differs from the recorded evidence/);
});

for (const [variant, failed] of Object.entries({ blank: 'render', 'focus-leak': 'dialog-containment',
  'low-contrast': 'text-contrast', 'lost-focus': 'delete-focus' })) {
  test(`${variant} produces a specific browser failure`, async () => {
    const { record, output } = await run(variant, fixtureRunner(variant));
    const report = JSON.parse(await fs.readFile(path.join(output, 'attempt-1', 'verification.json'), 'utf8'));
    assert.equal(record.status, 'BLOCKED');
    assert.deepEqual(report.checks.filter(check => check.status === 'FAIL').map(check => check.id), [failed]);
    assert.equal(report.checks.filter(check => check.status === 'UNAVAILABLE').length, variant === 'blank' ? 5 : 0);
    await assert.rejects(checkRun(output), /no verified build/);
  });
}

test('a repair receives the observed failure and a fresh build must pass', async () => {
  const runner = fixtureRunner('lost-focus');
  const first = runner.build;
  runner.repairs = 1;
  runner.build = async ({ previous }) => {
    if (!previous) return first();
    assert.deepEqual(previous.checks.map(check => check.id), ['delete-focus']);
    return fixtureRunner('good').build();
  };
  const { record, output } = await run('repair', runner);
  assert.deepEqual(record.attempts.map(attempt => attempt.status), ['BLOCKED', 'VERIFIED_IN_SCOPE']);
  assert.notEqual(record.attempts[0].artifactSha256, record.attempts[1].artifactSha256);
  assert.equal((await checkRun(output)).artifactSha256, record.attempts[1].artifactSha256);
});

test('an unreachable modal does not hide a confirmed entry contrast failure', async () => {
  const lowContrast = await fixtureRunner('low-contrast').build();
  const html = lowContrast.replace('dialog.showModal();', 'return;');
  const report = await verifyHtml(Buffer.from(html));
  assert.equal(report.status, 'BLOCKED');
  assert.deepEqual(report.checks.filter(check => check.status === 'FAIL').map(check => check.id),
    ['dialog-keyboard', 'text-contrast']);
  assert(report.contrast.find(scan => scan.state === 'entry').violations.length);
  assert(report.contrast.find(scan => scan.state === 'modal').error);
});

test('Escape must preserve the task text even if focus returns to the opener', async () => {
  const good = await fixtureRunner('good').build();
  const onClose = "dialog.addEventListener('close', () => {";
  const html = good.replace(onClose, `${onClose}\n` +
    "    if (opener.isConnected) document.querySelector('#proposal').firstChild.textContent = 'Changed task ';");
  const report = await verifyHtml(Buffer.from(html));
  assert.equal(report.status, 'BLOCKED');
  assert.deepEqual(report.checks.filter(check => check.status === 'FAIL').map(check => check.id), ['cancel-focus']);
});
