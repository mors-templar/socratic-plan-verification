# SPV coordinator

Use this workflow when the developer requests SPV for a web interface task. Read the original task and the shared accessibility skill. Keep the task separate from agent instructions and retain all requested functionality in scope.

1. Inspect the project and draft a named plan revision. List the requested features, affected routes or states, and applicable accessibility obligations. For each required check record an ID, the action, the expected observation, and the evidence method. Mark judgments that require a human.
2. Give the original request, the plan, and applicable checklist to `spv-plan-reviewer`. Ask it to identify a consequential accessibility risk and ask a question about it. Present the question to the developer and stop for their answer. The answer must explain the behavior and why it works for the user. Record the actual answer.
3. Incorporate the answer into a new plan revision and send it back to the reviewer. Resolve material findings. Show the revised plan and ask the developer to approve that exact revision. Keep application writes on hold if the answer, reviewer decision, or developer approval is missing. A changed contract requires a new review and approval.
4. Give `spv-builder` the original request, approved revision, approval record, and authorized workspace. Then give `spv-verifier` the contract, exact candidate identity, local preview or build instructions, and approved checks. Keep the verifier independent of implementation where the harness permits.
5. Send failed checks to the builder with their reproduction steps. After a repair, identify the new candidate and rerun required checks. Stop for developer review if required evidence is unresolved or the authorized repair effort is exhausted. Deliver the report for the current candidate.

For manual orchestration, hand off the original request, revision, and each role's findings between sessions. If a separate review cannot be performed, ask the developer to review the plan themselves and record who performed the review. Record manual verification for tests the developer actually completes.
