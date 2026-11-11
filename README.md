# Socratic Plan Verification

Socratic Plan Verification (SPV) checks a proposed design before code generation and checks the resulting artifact before delivery. This prototype applies the workflow to one accessibility task in a synthetic dashboard.

The task deletes an item through a modal dialog. The developer explains where keyboard focus should move when the dialog's opener disappears. A reviewer checks that answer before the developer approves the revised plan. Playwright and axe-core then check the candidate.

## Quick start

Use Node.js 22 or later, npm, and Git. GitHub Actions runs the fixture checks on Windows with Node.js 24.

```powershell
git clone https://github.com/mors-templar/socratic-plan-verification.git
cd socratic-plan-verification
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run demo
```

Use npm and npx without the .cmd suffix in a POSIX shell. The demo runs locally with scripted fixture answers and requires no model account. It should verify one candidate and block four.

| Fixture | Expected decision | Deciding check |
| --- | --- | --- |
| good | VERIFIED_IN_SCOPE | All six checks pass |
| blank | BLOCKED | Dashboard fails to render |
| focus-leak | BLOCKED | Focus escapes the modal |
| low-contrast | BLOCKED | Text contrast fails |
| lost-focus | BLOCKED | Focus misses the Tasks heading after deletion |

## Run the workflow

Run an interactive fixture and follow the review prompts.

```powershell
npm.cmd start
```

1. Read the draft and answer the focus question. Give a reason for your answer.
2. Review the decision and revise the answer if requested. Type APPROVE to approve the revised plan.
3. Inspect the browser report for the saved candidate. The live adapter can use observed failures to attempt up to two repairs.

The six checks cover rendering, keyboard opening, focus containment, Escape and focus restoration, focus after deletion, and text contrast. VERIFIED_IN_SCOPE covers those checks in the tested browser states. A known failure blocks delivery. Missing or inconclusive evidence can require review. A scoped pass does not establish full Web Content Accessibility Guidelines (WCAG) conformance.

## Optional live Codex run

Install and authenticate the Codex CLI and make the codex executable available on PATH. The live adapter sends the synthetic task and your review answer to Codex and saves the recorded responses locally.

```powershell
npm.cmd start -- --runner codex
```

Add --model ID to request a model. Add --scripted for an engineering replay with a scripted answer and approval. The default live adapter starts separate planner, reviewer, and builder sessions. Run npm.cmd start -- --help for the full option list.

## Check a run

The CLI prints the evidence directory. By default, it writes under runs/, which Git ignores. Keep custom output directories outside the checkout or under runs/.

| File | What it records |
| --- | --- |
| draft.json and review-*.json | Plan, challenge, answers, and review decisions |
| revised-plan.json and approval.json | Approved revision and its SHA-256 digest |
| attempt-*/index.html and verification.json | Candidate, browser observations, and artifact digest |
| run.json | Decision history and final status |
| codex-*.json | Recorded response, session identifier, and usage for a live call |

```powershell
npm.cmd start -- --check-run 'runs/RUN_ID'
```

Replace RUN_ID with the printed directory name. For a demo, use runs/RUN_ID/good. The command checks that the current candidate, approval, contract, and verifier match the saved evidence. It assumes a trusted local evidence directory.

Exit codes for a single run are 0 for VERIFIED_IN_SCOPE, 2 for BLOCKED, 3 for REVIEW_REQUIRED, and 1 for a command error.

## Develop and test

```powershell
npm.cmd test
npm.cmd run demo
```

| File | Purpose |
| --- | --- |
| contract.json | Dashboard request, focus challenge, and check definitions |
| workflow.cjs | Review, approval, build, repair, and evidence checks |
| verify.cjs | Chromium and axe-core checks |
| codex.cjs | Optional Codex CLI adapter |
| cli.cjs | Interactive and scripted entry points |
| dashboard.html and prototype.test.cjs | Synthetic fixture and regression tests |

Update the contract, fixture, and browser assertions together when you change the dashboard task. Keep generated candidates, session logs, and benchmark artifacts out of commits.
