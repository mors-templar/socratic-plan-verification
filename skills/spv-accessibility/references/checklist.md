# Accessibility checklist for web tasks

Select only applicable outcomes. Record the feature, state, and test that apply. Use the linked standards to check exact requirements and exceptions. The examples describe outcomes and possible checks.

| Area | What to check | Evidence |
| --- | --- | --- |
| Keyboard | Reach and operate controls with the keyboard. Check focus order, visible focus, and whether users can leave components. | Exercise Tab, Shift+Tab, and component-specific keys. Observe the active element and focus indicator. |
| Dialogs and dynamic focus | Name a dialog, check initial focus and exit, and return focus to the opener or an appropriate fallback if it disappears. | Open, cancel, and confirm with the keyboard. Record the final focused element and what stays visible. |
| Names and state | Give controls accessible names and expose their role and current state. Prefer native controls when they meet the behavior. | Inspect the accessibility tree and operate the control in each relevant state. |
| Forms and feedback | Provide labels, identify errors, and make important status changes available to users. | Trigger invalid and valid submissions. Verify associations and use assistive technology if announcement behavior is required. |
| Contrast and color | Check text and meaningful UI contrast. Convey state or meaning with more than color alone. | Scan relevant states and measure uncertain combinations manually. |
| Zoom and reflow | Check that content and controls remain usable at the widths and zoom levels applicable to the task. | Resize and zoom. Try the full journey and check for obscured content or controls. |
| Content and media | Use meaningful headings, labels, and alternatives. Check motion or media controls where applicable. | Inspect the page structure and perform the relevant manual checks. |

Use [WCAG 2.2](https://www.w3.org/TR/WCAG22/) for success criteria and [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) for interaction patterns.
