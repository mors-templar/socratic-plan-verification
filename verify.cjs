'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const contract = require('./contract.json');

const url = 'http://spv-candidate.invalid/';
const viewport = { width: 1280, height: 720 };
const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function dashboard(page) {
  const button = (name, within = page) => within.getByRole('button', { name, exact: true });
  const heading = name => page.getByRole('heading', { name, exact: true });
  const dialog = page.getByRole('dialog', { name: 'Delete task?', exact: true });
  return { title: heading('Task dashboard'), heading: heading('Tasks'), dialog,
    opener: button('Delete Review proposal'), cancel: button('Cancel', dialog),
    confirm: button('Confirm deletion', dialog), task: page.getByText(/^Review proposal(?: Delete Review proposal)?$/),
    other: page.getByText('Check budget', { exact: true }) };
}

async function focused(locator, message) {
  assert(await locator.evaluate(element => element === element.ownerDocument.activeElement), message);
}

async function showDialog(ui) {
  await ui.opener.press('Enter');
  await ui.dialog.waitFor({ state: 'visible' });
}

async function openDialog(ui) {
  await showDialog(ui);
  assert(await ui.confirm.isVisible(), 'Confirmation control is missing.');
  await focused(ui.cancel, 'Initial focus is not on Cancel.');
}

async function dismissDialog(page, dialog, key) {
  const dismissal = await dialog.evaluateHandle(element => {
    if (!(element instanceof HTMLDialogElement)) return null;
    const state = { element, closed: false };
    element.addEventListener('close', () => { state.closed = true; }, { once: true });
    return state;
  });
  try {
    await page.keyboard.press(key);
    await dialog.waitFor({ state: 'hidden' });
    // A native dialog can become hidden before its close handlers update the page.
    await page.waitForFunction(state => !state || state.closed || !state.element.isConnected, dismissal);
  } finally {
    await dismissal.dispose();
  }
}

async function check(report, id, verify) {
  try {
    report.checks.push({ id, status: 'PASS', observed: await verify() });
    return true;
  } catch (error) {
    report.checks.push({ id, status: 'FAIL', observed: error.message.slice(0, 600) });
    return false;
  }
}

async function checkContrast(report, page, ui) {
  for (const state of ['entry', 'modal']) {
    try {
      await page.goto(url);
      if (state === 'modal') await showDialog(ui);
      const { violations, incomplete, testEngine } = await new AxeBuilder({ page })
        .withRules(['color-contrast']).analyze();
      report.contrast.push({ state, testEngine, violations, incomplete });
    } catch (error) {
      report.contrast.push({ state, violations: [], incomplete: [], error: error.message.slice(0, 600) });
    }
  }
  const failures = report.contrast.flatMap(scan => scan.violations.flatMap(rule => rule.nodes)).length;
  const unresolved = report.contrast.flatMap(scan => scan.incomplete.flatMap(rule => rule.nodes)).length;
  const unavailable = report.contrast.filter(scan => scan.error).map(scan => scan.state);
  const status = failures ? 'FAIL' : unresolved || unavailable.length ? 'REVIEW_REQUIRED' : 'PASS';
  const counts = `${failures} detected and ${unresolved} unresolved nodes.`;
  const observed = unavailable.length ? `${counts} Scan unavailable in ${unavailable.join(', ')}.` : counts;
  report.checks.push({ id: 'text-contrast', status, observed });
}

async function verifyHtml(bytes) {
  const report = { artifactSha256: sha256(bytes), viewport, browser: null,
    playwright: require('playwright/package.json').version, checks: [], contrast: [],
    pageErrors: [], blockedRequests: [], toolError: null };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    report.browser = browser.version();
    const context = await browser.newContext({ serviceWorkers: 'block', viewport, acceptDownloads: false });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', route => {
      const request = route.request();
      if (request.url() === url && request.method() === 'GET' && request.isNavigationRequest()) {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', headers: { 'Content-Security-Policy': csp }, body: bytes });
      }
      report.blockedRequests.push(request.resourceType());
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(1600);
    page.setDefaultNavigationTimeout(5000);
    page.on('pageerror', error => report.pageErrors.push(error.message.slice(0, 600)));
    const ui = dashboard(page);
    const renders = await check(report, 'render', async () => {
      const response = await page.goto(url);
      assert(response?.ok() && page.url() === url, 'The candidate did not load.');
      assert(await ui.title.isVisible() && await ui.heading.isVisible() && await ui.opener.isVisible() && await ui.task.isVisible() &&
        await ui.other.isVisible(), 'The dashboard or required task controls are missing.');
      assert.equal(report.pageErrors.length, 0, 'A browser exception occurred.');
      return 'Dashboard, Tasks heading, opener, and second task are visible.';
    });
    if (renders) {
      const dialogOpened = await check(report, 'dialog-keyboard', async () => {
        await openDialog(ui);
        return 'Enter opened Delete task? with focus on Cancel.';
      });
      if (dialogOpened) {
        await check(report, 'dialog-containment', async () => {
          await page.keyboard.press('Shift+Tab');
          await focused(ui.confirm, 'Shift+Tab did not wrap from Cancel to Confirm deletion.');
          await page.keyboard.press('Tab');
          await focused(ui.cancel, 'Tab did not wrap from Confirm deletion to Cancel.');
          return 'Both directions wrapped within the open dialog.';
        });
        await check(report, 'cancel-focus', async () => {
          await page.goto(url);
          await openDialog(ui);
          await dismissDialog(page, ui.dialog, 'Escape');
          assert(await ui.task.isVisible() && await ui.other.isVisible(), 'Escape did not preserve both tasks.');
          await focused(ui.opener, 'Escape did not restore focus to the opener.');
          return 'Escape closed the dialog, preserved both tasks, and restored focus to the opener.';
        });
        await check(report, 'delete-focus', async () => {
          await page.goto(url);
          await openDialog(ui);
          await page.keyboard.press('Tab');
          await focused(ui.confirm, 'Tab did not reach the confirmation button from Cancel.');
          await dismissDialog(page, ui.dialog, 'Enter');
          assert.equal(await ui.opener.count(), 0, 'The opener remains after confirmation.');
          assert.equal(await ui.task.count(), 0, 'The deleted task remains.');
          assert(await ui.other.isVisible(), 'Deletion removed the remaining task.');
          await focused(ui.heading, 'Confirmation did not focus the Tasks heading.');
          return 'Confirmation removed the task and opener. Focus moved to Tasks.';
        });
      }
      await checkContrast(report, page, ui);
    }
  } catch (error) {
    report.toolError = error.message.slice(0, 600);
  } finally {
    await browser?.close();
  }
  const observed = new Map(report.checks.map(result => [result.id, result]));
  report.checks = contract.checks.map(requirement => ({ ...requirement,
    ...(observed.get(requirement.id) ?? { status: 'UNAVAILABLE', observed: 'The required state or verifier was unavailable.' }) }));
  report.status = report.checks.some(result => result.status === 'FAIL') || report.pageErrors.length ? 'BLOCKED' :
    report.toolError || report.checks.some(result => result.status !== 'PASS') ? 'REVIEW_REQUIRED' : 'VERIFIED_IN_SCOPE';
  return report;
}

module.exports = { sha256, verifyHtml };
