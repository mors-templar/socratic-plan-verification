# SPV workflow and role handoffs

SPV joins two decisions. The plan gate asks the developer to reason about a task-specific accessibility risk and approve the revised plan. The build gate checks what the user can do on the candidate.

| Stage | Input | Record to pass forward |
| --- | --- | --- |
| Draft | Original request and project context | Plan revision, features, states, required checks |
| Review | Original request, checklist, and proposed revision | Specific question, developer answer, reviewer verdict on revised plan |
| Approve | Reviewed revision | Explicit developer approval identifying the revision |
| Build | Approved revision and authorized workspace | Candidate identity and preview instructions |
| Verify | Candidate and approved checks | Per-check result, evidence, and scoped verdict |
| Repair | Failed check and reproduction steps | New candidate identity and a new verification report |

## Manual handoff

Use the [starter prompt](../START.md) in your primary session. If your harness has no subagents, open a separate chat for the [plan reviewer](../agents/spv-plan-reviewer.md). Attach its instructions, the original request, plan, and checklist. Bring its question back to the developer. Send the revised plan and the answer back to that reviewer. Approve the exact revision in the coordinator session once its material findings are resolved.

Provide the approved revision and approval to the [builder](../agents/spv-builder.md). Pass the candidate and agreed checks to the [verifier](../agents/spv-verifier.md). In a chat-only harness, run the browser steps yourself and supply actual observations. The verifier marks missing evidence as unassessed and returns it to the coordinator.

## Record format

A plan can be a short Markdown table with `Check ID | Route or state | Action | Expected result | Evidence method`. Include the original task, plan revision, reviewer question and verdict, and developer approval.

A verification report can use `Check ID | Candidate | Action | Observed result | Evidence | Status`. Record the test environment and link to useful output. Use `BLOCKED` for a required failure, `REVIEW_REQUIRED` for missing required evidence, or `VERIFIED_IN_SCOPE` when every required check passes. The report applies to the candidate identified in it.

## Paper figure

The diagram in the README is Figure 2 from *From Guidance to Verification: Improving Web Accessibility in Agentic Software Development*. It shows the setup, plan draft, reviewer and developer approval, implementation, build verification, and delivery. A review can send the plan back for revision or stop the build. Verification can send the build for repair and retesting or hold it for review.
