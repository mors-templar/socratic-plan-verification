'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { sha256, verifyHtml } = require('./verify.cjs');
const contract = require('./contract.json');

const canonicalAnswer = {
  destination: contract.challenge.destination,
  rationale: 'The delete button disappears with the task. The Tasks heading remains and orients the user to the remaining task list.'
};

const variants = ['good', 'blank', 'focus-leak', 'low-contrast', 'lost-focus'];

function fixtureRunner(variant) {
  if (!variants.includes(variant)) throw new Error(`Unknown fixture: ${variant}`);
  return {
    name: `fixture/${variant}`,
    repairs: 0,
    async plan() {
      return { summary: 'Render the task list, open a named modal, and return focus to the opener on cancel.',
        steps: contract.checks.filter(check => check.id !== contract.challenge.checkId)
          .map(check => ({ id: check.id, approach: check.expected })) };
    },
    async review({ answer }) {
      const accepted = /(?:disappear|remov|no longer)/i.test(answer.rationale) &&
        /(?:remaining|continue|orient|task list)/i.test(answer.rationale);
      return { verdict: accepted ? 'APPROVE' : 'REVISE', explanation: accepted ?
        'The answer links the missing opener to a stable location at the remaining task list.' :
        'Explain why the opener disappears and how the Tasks heading lets keyboard users resume their work.' };
    },
    async build() {
      const html = await fs.readFile(path.join(__dirname, 'dashboard.html'), 'utf8');
      switch (variant) {
        case 'blank': return '<!doctype html><html lang="en"><title>Task dashboard</title><body></body></html>';
        case 'focus-leak': return html.replace('dialog.showModal();', 'dialog.show();')
          .replace("if (event.key !== 'Tab') return;", "if (event.key === 'Escape') { dialog.close(); return; }\n    if (event.key !== 'Tab') return;")
          .replace('(event.shiftKey ? confirm : cancel).focus();', 'opener.focus();');
        case 'low-contrast': return html.replace('color: #445b75;', 'color: #a8afba;');
        case 'lost-focus': return html.replace('heading.focus();', '').replace('(opener.isConnected ? opener : heading).focus();', 'if (opener.isConnected) opener.focus();');
        default: return html;
      }
    }
  };
}

function validDraft(draft) {
  if (typeof draft?.summary !== 'string' || !draft.summary.trim() || !Array.isArray(draft.steps)) return false;
  const expected = contract.checks.filter(check => check.id !== contract.challenge.checkId).map(check => check.id);
  return draft.steps.length === expected.length && expected.every(id => draft.steps.filter(step =>
    step?.id === id && typeof step.approach === 'string' && step.approach.trim()).length === 1);
}

async function runWorkflow({ runner, interact, output, answerSource }) {
  await fs.mkdir(output);
  const contractBytes = await fs.readFile(path.join(__dirname, 'contract.json'));
  const verifierBytes = await fs.readFile(path.join(__dirname, 'verify.cjs'));
  const record = { schemaVersion: 1, contract: contract.id, contractSha256: sha256(contractBytes),
    verifierSha256: sha256(verifierBytes), runner: runner.name, answerSource,
    startedAt: new Date().toISOString(), decisions: [], attempts: [] };
  const save = (name, data) => fs.writeFile(path.join(output, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  const finish = async (status, reason) => {
    Object.assign(record, { status, reason, finishedAt: new Date().toISOString() });
    await save('run.json', record);
    return record;
  };
  try {
    const draft = await runner.plan();
    await save('draft.json', draft);
    if (!validDraft(draft)) return await finish('BLOCKED', 'Invalid or incomplete draft.');
    interact.showPlan(draft);

    let approved;
    for (let round = 1; round <= 3; round++) {
      const answer = await interact.answer(contract.challenge, round);
      if (!answer) return await finish('BLOCKED', 'Developer ended plan review.');
      const destination = String(answer.destination ?? '').trim();
      const rationale = String(answer.rationale ?? '').trim();
      const normalized = { destination, rationale };
      const usable = destination.toLowerCase() === contract.challenge.destination.toLowerCase() &&
        rationale.length >= 12 && rationale.length <= 1200 && !/^(approve|yes|looks good)[.!\s]*$/i.test(rationale);
      const revised = { ...draft, steps: [...draft.steps, { id: contract.challenge.checkId,
        approach: `Focus the Tasks heading after the removed opener disappears. ${rationale}` }] };
      const review = usable ? await runner.review({ revised, answer: normalized }) :
        { verdict: 'REVISE', explanation: 'Name the Tasks heading and explain why it is a logical fallback.' };
      if (!['APPROVE', 'REVISE'].includes(review?.verdict) || typeof review.explanation !== 'string' || !review.explanation.trim()) {
        return await finish('BLOCKED', 'The reviewer returned an invalid decision.');
      }
      const decision = { round, question: contract.challenge.question, answer: normalized, review };
      record.decisions.push(decision);
      await save(`review-${round}.json`, decision);
      interact.showReview(review);
      if (review.verdict === 'APPROVE') {
        approved = { ...revised, decision };
        break;
      }
    }
    if (!approved) return await finish('BLOCKED', 'The required question remains unresolved.');
    const revision = { contractSha256: record.contractSha256, plan: approved };
    const approvedPlanSha256 = sha256(JSON.stringify(revision));
    await save('revised-plan.json', revision);
    if (!await interact.approve(revision, approvedPlanSha256)) {
      return await finish('BLOCKED', 'Developer did not approve the revised plan.');
    }
    record.approvedPlanSha256 = approvedPlanSha256;
    await save('approval.json', { approvedPlanSha256, answerSource, at: new Date().toISOString() });

    let previous = null;
    for (let attempt = 1; attempt <= runner.repairs + 1; attempt++) {
      const html = await runner.build({ revision, previous });
      if (typeof html !== 'string' || !html.trim() || Buffer.byteLength(html) > 256_000) {
        return await finish('BLOCKED', 'The builder returned an absent or oversized HTML artifact.');
      }
      const folder = `attempt-${attempt}`;
      const file = path.join(output, folder, 'index.html');
      await fs.mkdir(path.dirname(file));
      await fs.writeFile(file, html, { flag: 'wx' });
      const report = await verifyHtml(await fs.readFile(file));
      report.contractSha256 = record.contractSha256;
      report.verifierSha256 = record.verifierSha256;
      report.approvedPlanSha256 = approvedPlanSha256;
      await save(`${folder}/verification.json`, report);
      record.attempts.push({ folder, status: report.status, artifactSha256: report.artifactSha256,
        issues: report.checks.filter(check => check.status !== 'PASS').map(check => check.id) });
      interact.showVerification(report, attempt);
      const contrastFindings = report.contrast.flatMap(scan => [...scan.violations, ...scan.incomplete].flatMap(rule =>
        rule.nodes.map(node => ({ state: scan.state, rule: rule.id, target: node.target, detail: node.failureSummary }))));
      const repairable = report.status === 'BLOCKED' || (report.status === 'REVIEW_REQUIRED' && contrastFindings.length > 0);
      if (!repairable || attempt > runner.repairs) {
        return await finish(report.status, 'See the final verification report for scoped outcomes.');
      }
      previous = { html, checks: report.checks.filter(check => ['FAIL', 'REVIEW_REQUIRED'].includes(check.status)),
        pageErrors: report.pageErrors, contrastFindings };
    }
  } catch (error) {
    return await finish('REVIEW_REQUIRED', `Workflow tool error: ${error.message.slice(0, 500)}`);
  }
}

async function checkRun(output) {
  const read = async name => JSON.parse(await fs.readFile(path.join(output, name), 'utf8'));
  const run = await read('run.json');
  if (run.status !== 'VERIFIED_IN_SCOPE') throw new Error('This run has no verified build.');
  const attempt = run.attempts.at(-1);
  if (!/^attempt-[1-3]$/.test(attempt?.folder) || attempt.status !== 'VERIFIED_IN_SCOPE') {
    throw new Error('The final attempt is missing or unverified.');
  }
  const approval = await read('approval.json');
  const revision = await read('revised-plan.json');
  const report = await read(`${attempt.folder}/verification.json`);
  const file = path.join(output, attempt.folder, 'index.html');
  const artifact = sha256(await fs.readFile(file));
  const plan = sha256(JSON.stringify(revision));
  const contractHash = sha256(await fs.readFile(path.join(__dirname, 'contract.json')));
  const verifierHash = sha256(await fs.readFile(path.join(__dirname, 'verify.cjs')));
  const agrees = (key, value, ...records) => records.every(record => record[key] === value);
  if (report.status !== 'VERIFIED_IN_SCOPE' ||
      !agrees('artifactSha256', artifact, attempt, report) ||
      !agrees('approvedPlanSha256', plan, run, approval, report) ||
      !agrees('contractSha256', contractHash, run, revision, report) ||
      !agrees('verifierSha256', verifierHash, run, report) ||
      !contract.checks.every(check => report.checks.some(result => result.id === check.id && result.status === 'PASS'))) {
    throw new Error('The build, approval, policy, or verifier differs from the recorded evidence.');
  }
  return { file, artifactSha256: artifact };
}

module.exports = { canonicalAnswer, checkRun, fixtureRunner, runWorkflow, variants };
