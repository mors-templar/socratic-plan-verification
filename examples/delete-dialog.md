# Example task: delete a dashboard item

Start with the [SPV prompt](../START.md) and this synthetic request:

> Add a confirmation dialog for deleting a task. Open it from the task row. Escape cancels without deleting anything. Confirming removes only the selected task. Keep the remaining list usable with the keyboard.

A reviewer can ask: “Confirming deletion removes the control that opened the dialog. Where should focus go next, and why?”

One reasoned answer is to move focus to the Tasks heading if the deleted opener is gone. The heading provides a stable location and lets the user continue through the remaining tasks. If the surrounding interface instead supports a more useful next-row target, document that choice and what happens when no rows remain.

Example checks to approve before implementation:

| ID | Action | Expected observation |
| --- | --- | --- |
| D1 | Focus the delete button and press Enter | A named modal opens and focus moves to its cancel action |
| D2 | Use Tab and Shift+Tab | Focus stays within the modal while it is open |
| D3 | Press Escape | Modal closes, the task remains, and focus returns to the opener |
| D4 | Reopen the modal and confirm with the keyboard | Only the selected task disappears and focus reaches the approved fallback |
| D5 | Scan the list and open modal, then review uncertain findings | Required contrast checks pass or receive an explicit follow-up |

Name the final plan revision when you approve it. In the report, record the actual focused element after each action. If you cannot inspect contrast, mark D5 as unassessed and keep the report in review.
