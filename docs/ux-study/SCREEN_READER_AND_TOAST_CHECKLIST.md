# Screen-reader pass and toast-overlap test

Automated checks (axe, in CI-style runs) found structure problems and none remain, but they cannot tell whether the experience
*reads sensibly aloud*. This is a manual pass. Record **pass / fail / note** per line; any fail on a flagship task blocks "production-ready".

## A. Screen reader (do it with a real user of one if possible)
Use **VoiceOver + Safari/desktop shell (macOS)** and **NVDA + Firefox/Chrome (Windows)**. Keyboard only (no mouse).

| Check | What good looks like |
|---|---|
| Landmarks / skip link | First Tab stop is "Skip to content"; Primary and Settings navigations are announced by name |
| Today headline | "5 things need your decision" is announced when the list loads/changes (polite live region), not repeated on every poll |
| Queue | Each row's name carries its title; state and priority are announced as **text**, not colour; selection state announced |
| Detail pane | Heading hierarchy sensible; the message preview, recipient list and "Nothing has been sent yet" are all read before the Approve button |
| Approve | Button name is "Approve & send" (not just "Approve"); while working it announces "Working…"; **the result is announced** ("Approved and sent…") without moving focus unexpectedly |
| Progress line | Reads as "Suggested — done / Approved — done / Sent — done / Delivery confirmed — done / Outcome seen — not yet" |
| Failure | "Not sent — the connection needs attention" is announced as an alert, and the next step ("Review & retry") is reachable |
| Capture | Field is labelled "Quick capture"; the confirmation is announced; `c` shortcut doesn't fire while typing in a field |
| Batch select | Each checkbox is named "Select: <title>"; "N selected" announced; the group is named "Batch actions"; disabled items say why |
| Toasts | Announced politely, **do not steal focus**; Dismiss buttons are named for their item; "and N more" is reachable |
| Connection states (desktop) | The connection screen announces "The runtime isn't responding… your work is safe" and the recovery |
| Zoom/reflow | 200% zoom and 320 CSS px: no loss of content or function, no horizontal page scroll |
| Reduced motion | With "reduce motion" on, nothing animates that matters |

## B. Toast overlap (desktop-size windows)
Two toasts max on desktop, one on phones, by design — so a notification doesn't hide what's being read. Verify it with people.

1. Window sizes: 1024×700, 1280×720, 1440×900. Trigger 3+ notifications (snooze items so they wake, or use the sample's initial burst).
2. Open an item and screenshot with toasts visible. **Measure** the share of the *detail pane* covered and whether the message
   preview or the Approve button is ever covered.
3. During T2 ask: *"Did anything get in the way of reading the message?"* Note whether a toast was in the way and whether they could dismiss it.
4. Pass = the message preview and the Approve button are never covered at 1280×720, and no participant reports being blocked.
   If it fails: move toasts to a bell/popover (don't float over content) — decide from this data, not from taste.
