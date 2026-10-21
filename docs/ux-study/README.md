# Moderated UX study — protocol

**What this is:** a kit to run a small moderated study (about five representative, non-technical people) on the current Today-first
interface. It is **prepared, not run.** Automated tests and axe prove structure and behaviour; they cannot show that a person
understands the workflow. This study can.

**The question:** *Can a non-technical operator open the app, see who or what needs attention, take the next safe action, and
correctly understand what did and did not happen — without learning Projects, Missions, approvals, digests or connectors?*

> n = 5 is **qualitative discovery**, not statistics. Use it to find confusion and fix it, then re-test. The thresholds below are
> targets to aim at, not claims that five people can prove.

## 1. Who

Five people who are **not** engineers and do not use ReDevOps. Aim for a spread, with at least two from a workflow like the original
complaint: a travel/booking agent or coordinator; a clinic/front-desk administrator; a small-business owner who chases invoices or
quotes; one person who uses a screen reader (see the checklist). Exclude anyone who builds software or has seen the product.

Screener (yes/no): sends customer messages for work · chases documents, payments or confirmations · currently tracks it in a
notebook, spreadsheet or inbox · is *not* a developer / IT admin.

## 2. Before each session

* **Tell them the truth:** *"This is a practice workspace with made-up customers. Nothing you do sends a real message."* The app also
  says so in a banner — do not let that be the only place. Do not let anyone leave believing a real message went out.
* Consent (read aloud, one page): purpose; screen + voice recording (optional); they can stop any time; recordings are kept for the
  analysis only and deleted after; their name is not in the notes (use P1–P5); no personal data about *them* is needed.
* Setup: fresh sample workspace per participant (new browser profile / new desktop session — the sample ledger is per session);
  1280×800 window; think-aloud practice with an unrelated page first.
* Run on **both** surfaces across the group: ~3 on the browser, ~2 on the desktop shell (T7 is desktop-only).

## 3. During

One facilitator, one note-taker. Read tasks verbatim ([TASKS.md](TASKS.md)); do not name screens or buttons. Let silence work.
Record per task: **completed unassisted (Y/N)**, time, errors (wrong clicks, wrong belief), **assists** (level 1 = "what are you
looking for?", 2 = point at an area, 3 = tell them) and a 1–7 ease rating (SEQ). After the tasks run the
[comprehension quiz](COMPREHENSION_QUIZ.md) *before* explaining anything.

## 4. What counts (targets, from the UX plan)

| Measure | Target to aim for | Source |
|---|---|---|
| Unassisted completion on the three flagship tasks (T1, T2, T4) | ≥ 90% after iteration | plan §11 |
| Can tell *proposed / approved / sent / delivery confirmed / outcome seen* apart | ≥ 95% on the quiz | plan §11 |
| Median time to identify the next action for a clear exception | ≤ 10 s | plan §11 |
| Manual fields to capture a follow-up | ≤ 2 interactions, 1 typed sentence | plan §11 |
| Anyone believes a *simulated* send was real | **0** | this kit |
| Anyone believes "sent" means "they replied / it worked" | **0** | this kit |

A single participant who confuses *sent* with *outcome* is a product bug, not a participant error.

## 5. Also required before calling the UI production-ready

* The **screen-reader pass** and the **toast-overlap test** in [SCREEN_READER_AND_TOAST_CHECKLIST.md](SCREEN_READER_AND_TOAST_CHECKLIST.md).
* Compare against the previous Projects/Sidekick screen on the same tasks if you want a *relative* claim — without that baseline the
  numbers above are absolute only. (T1 on the old UI: "find which customer is missing a document".)

## 6. Output

Fill [UX_TASK_BASELINE.csv](UX_TASK_BASELINE.csv) (one row per participant × task). Then write one page: what confused people
(verbatim quotes), the top five fixes by frequency × severity, and which targets were missed. Re-run after fixes with new people.
