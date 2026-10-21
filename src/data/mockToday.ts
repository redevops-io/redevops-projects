// A contract-faithful stand-in for the Today API (agentic_os/today.py) so the UI runs standalone and its tests
// can exercise the same rules the server enforces: the approval binds an exact digest (stale → 409), a repeat
// approve never re-sends, a failed send is `failed` (never done) and needs a fresh digest, recipients without
// consent are excluded, an ambiguous identity blocks the send, a send alone never closes work.
import type { CaptureItem, TodayDetail, TodayFeed, TodayItem, TodayItemOptions, TodayLifecycle, TodayState } from "./types";

export class TodayApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

interface Target { id: string; label: string; address: string; consent: boolean; why?: string }
interface Case {
  id: string; domain: string; title: string; reason: string; tier: "high" | "medium" | "low"; score: number;
  channel: string; targets: Target[]; subject: string; body: string; outcome: string; deadlineDays: number | null;
  evidence: { kind: string; label: string; observed_at: number; ref: string }[];
  connectorOk: boolean; identities: { id: string; label: string; email: string; detail: string }[];
  topics: string[]; surfaced: boolean;
  // ledger
  attempt: number; phase: "suggested" | "sent" | "failed" | "outcome" | "dismissed";
  snoozedUntil: number; followUpAt: number; sentDigest: string; sends: number; failure: string; verified: boolean;
  history: { at: number; kind: string; text: string }[]; receiptId: string;
}

const DAY = 86400;
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return "sha256:" + (h >>> 0).toString(16).padStart(8, "0"); };

function seed(now: number): Case[] {
  const ev = (kind: string, label: string, ago: number, ref: string) => ({ kind, label, observed_at: now - ago, ref });
  const base = { attempt: 0, phase: "suggested" as const, snoozedUntil: 0, followUpAt: 0, sentDigest: "", sends: 0, failure: "", verified: false, history: [{ at: now, kind: "suggested", text: "Suggested from connected channels" }], receiptId: "", connectorOk: true, identities: [] as Case["identities"], topics: [] as string[], surfaced: true };
  return [
    { ...base, id: "case-travel", domain: "travel", title: "Visa documents missing — Taylor trip", reason: "Departure in 8 days; the passport scan and visa form have not been received.", tier: "high", score: 0.95, channel: "whatsapp", deadlineDays: 8,
      targets: [{ id: "taylor", label: "Taylor Brooks", address: "+1 555 0101", consent: true }], subject: "", body: "Hi Taylor — to finish your visa we still need a clear passport scan and the signed visa form. Could you send them by Friday? Thanks!", outcome: "Documents received and validated",
      evidence: [ev("message", "WhatsApp: \"I'll send the docs soon\"", 7200, "wa:msg:7712"), ev("record", "Booking TRIP-88: visa documents 0 of 2 received", 600, "booking:TRIP-88")], topics: ["passport", "visa", "documents", "docs", "form", "scan"] },
    { ...base, id: "case-lisbon", domain: "travel", title: "Visa documents missing — Jordan Lee, Lisbon trip", reason: "Departure in 12 days; the passport scan has not been received.", tier: "medium", score: 0.85, channel: "whatsapp", deadlineDays: 12, surfaced: false,
      topics: ["passport", "visa", "documents", "docs", "form", "scan", "lisbon"], targets: [{ id: "jordan", label: "Jordan Lee", address: "+1 555 0177", consent: true }], subject: "", body: "Hi Jordan — for your Lisbon visa we still need a clear passport scan. Could you send it this week? Thanks!", outcome: "Documents received and validated",
      evidence: [ev("record", "Booking TRIP-91: visa documents 1 of 2 received", 3 * DAY, "booking:TRIP-91")] },
    { ...base, id: "case-clinic", domain: "clinic", title: "3 patients haven't confirmed tomorrow's appointment", reason: "Confirmation is due by 6pm; unconfirmed slots can't be refilled after that.", tier: "high", score: 0.9, channel: "sms", deadlineDays: 0.4,
      targets: [{ id: "p1", label: "A. Novak", address: "+1 555 0142", consent: true }, { id: "p2", label: "R. Idris", address: "+1 555 0143", consent: true }, { id: "p3", label: "M. Ortega", address: "+1 555 0144", consent: false, why: "No reminder consent on file" }],
      subject: "", body: "Reminder: you have an appointment tomorrow. Reply YES to confirm or call us to reschedule.", outcome: "Confirmation reply observed", evidence: [ev("record", "Schedule: 3 of 14 appointments unconfirmed", 900, "sched:tomorrow")], topics: ["appointment", "confirm", "confirmed", "reminder"] },
    { ...base, id: "case-quote", domain: "sales", title: "Quote hasn't been answered — Acme", reason: "Quote #Q-310 was sent 6 days ago with no reply; buyers usually decide within a week.", tier: "medium", score: 0.7, channel: "email", deadlineDays: null,
      targets: [{ id: "acme", label: "Dana Whitfield (Acme)", address: "dana@acme.example", consent: true }], subject: "Following up on quote Q-310", body: "Hi Dana — checking in on quote Q-310. Happy to adjust scope or walk through it on a call.", outcome: "Reply or order observed",
      evidence: [ev("record", "Quote Q-310 sent, no reply (6 days)", 6 * DAY, "quote:Q-310"), ev("policy", "Follow-up allowed: no discount change", 60, "policy:followup")], topics: ["quote", "q-310", "proposal", "pricing"] },
    { ...base, id: "case-invoice", domain: "receivables", title: "Invoice #1042 is past due — customer hasn't replied", reason: "Net-30 passed 5 days ago. The WhatsApp connection expired, so a reminder can't be sent yet.", tier: "medium", score: 0.6, channel: "whatsapp", deadlineDays: null, connectorOk: false,
      targets: [{ id: "c1", label: "Kestrel Ltd accounts", address: "+44 20 5550 1042", consent: true }], subject: "", body: "Hi — a friendly reminder that invoice #1042 is now past due. Could you let us know the payment date?", outcome: "Payment reconciled", evidence: [ev("record", "Invoice #1042 overdue by 5 days", 300, "invoice:1042")], topics: ["invoice", "1042", "payment", "overdue"] },
    { ...base, id: "case-sam", domain: "receivables", title: "Reminder for Sam Rivera — two customers share this name", reason: "Choose which Sam Rivera before anything is sent.", tier: "medium", score: 0.5, channel: "email", deadlineDays: null,
      targets: [{ id: "sam", label: "Sam Rivera", address: "", consent: true }], subject: "Payment reminder", body: "Hi Sam — a quick reminder about your open invoice.", outcome: "Payment reconciled", evidence: [ev("record", "Two contacts match \"Sam Rivera\"", 120, "identity:sam")],
      identities: [{ id: "sam-a", label: "Sam Rivera", email: "sam@harbor.example", detail: "Harbor Co · invoice #1050" }, { id: "sam-b", label: "Sam Rivera", email: "sam.r@northwind.example", detail: "Northwind · no open invoice" }] },
  ];
}

interface Reminder { id: string; text: string; due: number; captureId: string; created: number; done: boolean; snoozedUntil: number }
const STOP = new Set(["the", "a", "an", "and", "or", "to", "of", "for", "on", "in", "at", "is", "it", "my", "me", "i", "we", "they", "he", "she", "this", "that", "has", "have", "had", "not", "yet", "still", "send", "remind"]);
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const words = (s: string) => (s.toLowerCase().match(/[a-z0-9#-]+/g) ?? []);

// Mirrors agentic_os/capture.py: deterministic, rule-based, labelled as such.
function parseDue(text: string, now: number): number | null {
  const t = text.toLowerCase(); const day0 = now - (now % DAY);
  const rel = t.match(/\bin\s+(\d{1,3})\s*(minute|min|hour|hr|day|week)s?\b/);
  if (rel) return now + Number(rel[1]) * ({ minute: 60, min: 60, hour: 3600, hr: 3600, day: DAY, week: 7 * DAY } as Record<string, number>)[rel[2]];
  if (/\btomorrow\b/.test(t)) return day0 + DAY + 9 * 3600;
  if (/\b(today|tonight)\b/.test(t)) { const d = day0 + 17 * 3600; return d > now ? d : day0 + DAY + 9 * 3600; }
  if (/\bnext week\b/.test(t)) return day0 + 7 * DAY + 9 * 3600;
  for (let i = 0; i < 7; i++) if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(t) || new RegExp(`\\b${WEEKDAYS[i].slice(0, 3)}\\b`).test(t)) {
    const wd = (new Date(now * 1000).getUTCDay() + 6) % 7; return day0 + (((i - wd) % 7 + 7) % 7 || 7) * DAY + 9 * 3600;
  }
  return null;
}

export class MockToday {
  private cases: Case[];
  private reminders: Reminder[] = [];
  private captures: CaptureItem[] = [];
  constructor(private clock: () => number = () => Date.now() / 1000) { this.cases = seed(clock()); }

  private find(id: string): Case {
    const c = this.cases.find((x) => x.id === id && x.surfaced);
    if (!c) throw new TodayApiError(404, "not_found", "no such work item");
    return c;
  }
  private pick(c: Case, targets?: string[]) {
    const want = targets?.length ? targets : c.targets.map((t) => t.id);
    const bad = want.filter((w) => !c.targets.some((t) => t.id === w));
    if (bad.length) throw new TodayApiError(422, "unknown_target", `unknown recipient(s): ${bad.join(", ")}`);
    const sel = want.map((w) => c.targets.find((t) => t.id === w)!);
    return { picked: sel.filter((t) => t.consent), skipped: sel.filter((t) => !t.consent).map((t) => ({ id: t.id, label: t.label, reason: t.why ?? "" })) };
  }
  private digestFor(c: Case, to: { id: string; address: string }[]) {
    return hash(JSON.stringify([c.id, c.channel, to.map((t) => [t.id, t.address]), c.subject, c.body, c.attempt, c.connectorOk]));
  }
  private state(c: Case): { state: TodayState; reason: string; resurfaced: boolean } {
    const now = this.clock();
    if (c.phase === "dismissed") return { state: "dismissed", reason: c.reason, resurfaced: false };
    if (c.phase === "outcome") return { state: "verified", reason: `${c.outcome}.`, resurfaced: false };
    if (c.phase === "failed") return { state: "failed", reason: c.failure, resurfaced: false };
    if (c.snoozedUntil > now) return { state: "scheduled", reason: "Snoozed.", resurfaced: false };
    if (c.phase === "sent") return now >= c.followUpAt ? { state: "needs_action", reason: "No response yet — time to follow up.", resurfaced: true } : { state: "waiting", reason: c.reason, resurfaced: false };
    return { state: "needs_action", reason: c.reason, resurfaced: false };
  }
  private view(c: Case): TodayItem {
    const s = this.state(c);
    const sent = c.phase === "sent" || c.phase === "outcome";
    const lifecycle: TodayLifecycle = { suggested: true, approved: c.sends > 0 && c.phase !== "failed", sent, delivery_verified: sent && c.verified, outcome_observed: c.phase === "outcome" };
    const status = c.phase === "suggested" ? "Drafted — nothing has been sent." : c.phase === "failed" ? c.failure : c.phase === "sent" ? "Sent and provider-confirmed — waiting for the customer; no reply or outcome yet." : c.phase === "outcome" ? `${c.outcome}.` : "";
    return {
      id: c.id, kind: "case", user_title: c.title, reason: s.reason, state: s.state, resurfaced: s.resurfaced, simulated: true, domain: c.domain, channel: c.channel,
      priority: { tier: c.tier, score: c.score, reason: s.reason, policy_version: "static-0" },
      next_action: { capability_id: "personal_agent.connected_app_action", plain_language_label: c.phase === "sent" ? "Follow up" : `Send ${c.channel} message`, preview_ref: null, executable: true },
      lifecycle, deadline: c.deadlineDays == null ? null : this.clock() + c.deadlineDays * DAY, owner: "You", source_refs: c.evidence.map((e) => e.ref), evidence_refs: c.evidence.map((e) => e.ref),
      confidence: null, stale: false, status_line: status, approval_ref: c.sends ? "xapr_mock" : null, last_receipt_ref: c.receiptId || null, verification_ref: c.verified ? c.sentDigest : null, outcome_ref: c.phase === "outcome" ? `outcome:${c.id}` : null,
    };
  }

  feed(): TodayFeed {
    const items = [...this.cases.filter((c) => c.surfaced).map((c) => this.view(c)), ...this.reminders.map((r) => this.reminderView(r))];
    const order: TodayState[] = ["needs_action", "waiting", "scheduled", "running", "verified", "failed", "dismissed"];
    items.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || b.priority.score - a.priority.score);
    const counts: TodayFeed["counts"] = {};
    items.forEach((i) => { counts[i.state] = (counts[i.state] ?? 0) + 1; });
    const n = counts.needs_action ?? 0;
    return { project_id: "customer-ops", generated_at: this.clock(), basis: "sample", simulated_actions: true, headline: n ? `${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} your decision.` : "Nothing needs you right now.", counts, items, handled_automatically: 2, abstained: 1 };
  }

  item(id: string, o: TodayItemOptions = {}): TodayDetail {
    const rem = this.reminders.find((r) => r.id === id);
    if (rem) return { ...this.reminderView(rem), why: "You asked to be reminded.", evidence: [{ kind: "capture", label: `Your note: "${rem.text}"`, observed_at: rem.created, ref: "capture:" + rem.captureId }], action: null, history: [{ at: rem.created, kind: "created", text: "Reminder set from your note" }], receipt: null };
    const c = this.find(id);
    const { picked, skipped } = this.pick(c, o.targets);
    const ident = c.identities.find((i) => i.id === o.identityId);
    if (o.identityId && c.identities.length && !ident) throw new TodayApiError(422, "unknown_identity", "that contact is not one of the matches");
    const blocked = c.identities.length && !ident ? "Choose which contact this is before anything can be sent." : !picked.length && !ident ? "No eligible recipients (consent policy)." : "";
    const to = ident ? [{ id: ident.id, label: ident.label, address: ident.email }] : picked.map((t) => ({ id: t.id, label: t.label, address: t.address }));
    const sendable = (c.phase === "suggested" || c.phase === "failed") && !blocked;
    return {
      ...this.view(c), why: c.reason, evidence: c.evidence, history: [...c.history], receipt: c.receiptId ? { status: c.phase === "failed" ? "FAILED" : "SUCCEEDED", receipt_id: c.receiptId } : null,
      action: { kind: "send_message", channel: c.channel, to, skipped, subject: c.subject, body: c.body, payload_digest: sendable ? this.digestFor(c, to) : null, attempt: c.attempt,
        will_happen: to.length ? `Sends ${to.length} ${c.channel} message${to.length === 1 ? "" : "s"} to the recipients above.` : "", nothing_sent_yet: c.phase === "suggested" || c.phase === "failed",
        policy: { decision: "requires_approval", reason: "External message — approval is required." }, blocked_reason: blocked, disambiguate: c.identities, can_approve: sendable },
    };
  }

  approve(id: string, req: { payload_digest: string; targets?: string[]; identity_id?: string }): TodayDetail {
    if (this.reminders.some((r) => r.id === id)) throw new TodayApiError(409, "not_executable", "a reminder has nothing to send");
    const c = this.find(id);
    if (c.phase === "sent" || c.phase === "outcome") {            // idempotent: never a second send
      if (req.payload_digest !== c.sentDigest) throw new TodayApiError(409, "stale_approval", "this item was already acted on with different content");
      return { ...this.item(id), replayed: true };
    }
    const { picked } = this.pick(c, req.targets);
    const ident = c.identities.find((i) => i.id === req.identity_id);
    if (c.identities.length && !ident) throw new TodayApiError(409, "identity_ambiguous", "choose which contact this is before sending");
    if (!picked.length && !ident) throw new TodayApiError(422, "no_eligible_recipients", "no recipient passes the consent policy");
    const to = ident ? [{ id: ident.id, address: ident.email }] : picked.map((t) => ({ id: t.id, address: t.address }));
    const digest = this.digestFor(c, to);
    if (digest !== req.payload_digest) throw new TodayApiError(409, "stale_approval", "the content or recipients changed since you reviewed it — review again");
    c.sends += 1; c.receiptId = `rcpt_${c.id}_${c.attempt}`;
    if (!c.connectorOk) {
      c.attempt += 1; c.phase = "failed"; c.failure = "Not sent — the connection needs attention.";
      c.history.push({ at: this.clock(), kind: "failed", text: c.failure });
    } else {
      c.phase = "sent"; c.verified = true; c.sentDigest = digest; c.followUpAt = this.clock() + 3 * DAY;
      c.history.push({ at: this.clock(), kind: "approved", text: "Approved by you" }, { at: this.clock(), kind: "sent", text: "Sent through the governed path" }, { at: this.clock(), kind: "verified", text: "Provider confirmed delivery (independently verified)" });
    }
    return { ...this.item(id, { targets: req.targets, identityId: req.identity_id }), replayed: false };
  }

  snooze(id: string, seconds: number): TodayDetail {
    if (seconds < 60 || seconds > 30 * DAY) throw new TodayApiError(422, "bad_snooze", "snooze must be between 1 minute and 30 days");
    const rem = this.reminders.find((r) => r.id === id);
    if (rem) { rem.snoozedUntil = this.clock() + seconds; return this.item(id); }
    const c = this.find(id); c.snoozedUntil = this.clock() + seconds; return this.item(id);
  }
  dismiss(id: string): TodayDetail {
    const rem = this.reminders.find((r) => r.id === id);
    if (rem) { rem.done = true; return this.item(id); }
    const c = this.find(id);
    if (c.phase === "sent" || c.phase === "outcome") throw new TodayApiError(409, "already_sent", "a sent item can't be dismissed; wait for the outcome");
    c.phase = "dismissed"; return this.item(id);
  }
  simulateOutcome(id: string): TodayDetail {
    const c = this.find(id);
    if (c.phase !== "sent") throw new TodayApiError(409, "nothing_sent", "no outcome can be observed before a verified send");
    c.phase = "outcome"; c.history.push({ at: this.clock(), kind: "outcome", text: `${c.outcome} (simulated)` }); return this.item(id);
  }

  // ── Quick Capture (mirrors agentic_os/capture.py) ──
  private reminderView(r: Reminder): TodayItem {
    const now = this.clock();
    const state: TodayState = r.done ? "dismissed" : r.snoozedUntil > now ? "scheduled" : now < r.due ? "scheduled" : "needs_action";
    const reason = r.done ? "Done." : state === "needs_action" ? "Your reminder is due." : "Reminder set.";
    return { id: r.id, kind: "reminder", user_title: `Reminder: ${r.text}`, reason, state, simulated: true,
      priority: { tier: "medium", score: 0.6, reason, policy_version: "static-0" },
      next_action: { capability_id: null, plain_language_label: "Mark done", preview_ref: null, executable: false },
      lifecycle: { suggested: true, approved: false, sent: false, delivery_verified: false, outcome_observed: false },
      deadline: r.due, owner: "You", source_refs: ["capture:" + r.captureId], evidence_refs: ["capture:" + r.captureId], confidence: null, stale: false,
      approval_ref: null, last_receipt_ref: null, verification_ref: null, outcome_ref: null };
  }
  private entities(): string[] {
    const out = new Set<string>();
    for (const c of this.cases) for (const t of [...c.targets, ...c.identities]) for (const w of t.label.match(/[A-Za-z][A-Za-z'-]+/g) ?? []) if (w.length > 2 && !STOP.has(w.toLowerCase())) out.add(w);
    return [...out];
  }
  private matches(text: string, ents: string[]) {
    const ws = new Set(words(text).filter((w) => !STOP.has(w))); const el = new Set(ents.map((e) => e.toLowerCase()));
    return this.cases.map((c) => {
      const names = new Set([...c.targets, ...c.identities].flatMap((t) => words(t.label)));
      const ent = [...el].some((e) => names.has(e)) ? 1 : 0, topic = c.topics.some((t) => ws.has(t)) ? 1 : 0;
      return { case_id: c.id, label: c.title, score: Math.round((0.6 * ent + 0.4 * topic) * 100) / 100 };
    }).filter((m) => m.score > 0).sort((a, b) => b.score - a.score || a.case_id.localeCompare(b.case_id));
  }
  capture(content: string, source = "manual"): CaptureItem {
    const text = content.trim();
    if (!text) throw new TodayApiError(422, "empty", "write something to capture");
    if (text.length > 2000) throw new TodayApiError(413, "too_long", "a capture is limited to 2000 characters");
    const norm = text.toLowerCase().replace(/\s+/g, " ");
    const prior = this.captures.find((c) => c.status !== "archived" && c.source === source && c.content.toLowerCase().replace(/\s+/g, " ") === norm);
    if (prior) return { ...prior, duplicate: true };
    const now = this.clock(), low = text.toLowerCase(), ents = this.entities().filter((e) => new RegExp(`\\b${e.toLowerCase()}\\b`).test(low));
    const ws = new Set(words(low));
    let intent = "unclear", confidence = 0.2, due: number | null = null;
    const rem = low.match(/^\s*(please\s+)?remind me\s+(to|about|that)?\s*(.+)$/);
    if (rem) { intent = "reminder"; due = parseDue(low, now); confidence = due ? 0.9 : 0.55; }
    else if (/^\s*(please\s+)?(send|email|text|message|whatsapp|forward)\b/.test(low)) { intent = "draft_action"; confidence = 0.8; }
    else if (/^\s*(please\s+)?(investigate|find out|look into|figure out)\b/.test(low) || /^\s*why\b/.test(low)) { intent = "investigation"; confidence = 0.8; }
    else if (/\b(still|hasn'?t|haven'?t|not yet|never|missing|no reply|didn'?t|did not|waiting (for|on)|asked for|received|sent me)\b/.test(low) && (ents.length || ["passport", "visa", "documents", "docs", "invoice", "quote", "payment"].some((w) => ws.has(w)))) { intent = "case_update"; confidence = ents.length ? 0.85 : 0.65; }
    const id = "cap_" + (this.captures.length + 1).toString(36).padStart(4, "0");
    const item: CaptureItem = { id, source, content: text, captured_at: now, status: "new", version: 1,
      classification: { intent, confidence, entities: ents, method: "rules (no model)", reasons: [] }, suggested_action: null, question: null, routing: null,
      linked_entity_refs: [], evidence_refs: [], events: [{ at: now, kind: "captured", text: `Captured from ${source}`, version: 1 }, { at: now, kind: "classified", text: `Understood as ${intent} (rules (no model))`, version: 2 }] };
    this.captures.push(item);
    const ask = (q: string, options: { case_id: string; label: string }[], why: string) => { item.status = "needs_clarification"; item.question = { text: q, why, options }; item.routing = { kind: "intake", in_today_now: false }; item.events.push({ at: now, kind: "needs_clarification", text: q, version: item.events.length + 1 }); };
    if (intent === "reminder") {
      if (due == null) ask("When should I remind you?", [], "reminder");
      else {
        const body = text.replace(/^\s*(please\s+)?remind me\s+(to|about|that)?\s*/i, "").trim(); const rid = "rem-" + id;
        this.reminders.push({ id: rid, text: body, due, captureId: id, created: now, done: false, snoozedUntil: 0 });
        item.status = "classified"; item.linked_entity_refs = [rid]; item.suggested_action = { kind: "reminder", due };
        item.routing = { kind: "reminder", item_id: rid, due, in_today_now: due <= now };
      }
    } else if (intent === "investigation") {
      item.status = "classified"; item.suggested_action = { kind: "investigate", label: "Investigate: " + text }; item.routing = { kind: "investigation_candidate", in_today_now: false };
    } else if (intent === "case_update" || intent === "draft_action") {
      const all = this.matches(text, ents), good = all.filter((m) => m.score >= 0.6);
      if (!good.length) ask(all.length ? "Which case is this about?" : "I couldn't tie this to an existing case. Who or what is it about?", all.slice(0, 4), "match");
      else if (good.length > 1 && good[0].score - good[1].score <= 0.1) ask("This could be more than one case — which one?", good.slice(0, 4), "match");
      else this.link(item, good[0].case_id);
    } else ask("I wasn't sure what to do with this. Is it a reminder, an update on a case, or something to send?", [], "unclear");
    return { ...item };
  }
  private link(item: CaptureItem, caseId: string) {
    const c = this.cases.find((x) => x.id === caseId)!;
    if (!c.evidence.some((e) => e.ref === "capture:" + item.id)) c.evidence.push({ kind: "capture", label: `Your note: "${item.content}"`, observed_at: item.captured_at, ref: "capture:" + item.id });
    if (!c.surfaced) { c.surfaced = true; c.reason = `You noted this is outstanding. ${c.reason}`; }
    item.status = "classified"; item.question = null; item.linked_entity_refs = [caseId]; item.evidence_refs = ["capture:" + item.id];
    item.suggested_action = { kind: "review_case", label: item.classification?.intent === "draft_action" ? "Review the draft and approve it" : "Review the suggested follow-up", approval_required: true };
    item.routing = { kind: "case", item_id: caseId, title: c.title, in_today_now: true };
    item.events.push({ at: this.clock(), kind: "routed", text: `Linked to “${c.title}” as evidence`, version: item.events.length + 1 });
  }
  listCaptures(status?: string): CaptureItem[] { return this.captures.filter((c) => c.status !== "archived" && (!status || c.status === status)).map((c) => ({ ...c })).reverse(); }
  resolveCapture(id: string, caseId: string): CaptureItem {
    const c = this.captures.find((x) => x.id === id);
    if (!c) throw new TodayApiError(404, "not_found", "no such capture");
    if (c.status !== "needs_clarification" || !c.question?.options.length) throw new TodayApiError(409, "nothing_to_resolve", "this capture is not waiting on a case choice");
    if (!c.question.options.some((o) => o.case_id === caseId)) throw new TodayApiError(422, "not_an_option", "choose one of the suggested cases");
    this.link(c, caseId); return { ...c };
  }
  archiveCapture(id: string): CaptureItem {
    const c = this.captures.find((x) => x.id === id);
    if (!c) throw new TodayApiError(404, "not_found", "no such capture");
    c.status = "archived"; return { ...c };
  }
}
