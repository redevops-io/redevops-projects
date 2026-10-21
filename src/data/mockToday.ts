// A contract-faithful stand-in for the Today API (agentic_os/today.py) so the UI runs standalone and its tests
// can exercise the same rules the server enforces: the approval binds an exact digest (stale → 409), a repeat
// approve never re-sends, a failed send is `failed` (never done) and needs a fresh digest, recipients without
// consent are excluded, an ambiguous identity blocks the send, a send alone never closes work.
import type { TodayDetail, TodayFeed, TodayItem, TodayItemOptions, TodayLifecycle, TodayState } from "./types";

export class TodayApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

interface Target { id: string; label: string; address: string; consent: boolean; why?: string }
interface Case {
  id: string; domain: string; title: string; reason: string; tier: "high" | "medium" | "low"; score: number;
  channel: string; targets: Target[]; subject: string; body: string; outcome: string; deadlineDays: number | null;
  evidence: { kind: string; label: string; observed_at: number; ref: string }[];
  connectorOk: boolean; identities: { id: string; label: string; email: string; detail: string }[];
  // ledger
  attempt: number; phase: "suggested" | "sent" | "failed" | "outcome" | "dismissed";
  snoozedUntil: number; followUpAt: number; sentDigest: string; sends: number; failure: string; verified: boolean;
  history: { at: number; kind: string; text: string }[]; receiptId: string;
}

const DAY = 86400;
const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return "sha256:" + (h >>> 0).toString(16).padStart(8, "0"); };

function seed(now: number): Case[] {
  const ev = (kind: string, label: string, ago: number, ref: string) => ({ kind, label, observed_at: now - ago, ref });
  const base = { attempt: 0, phase: "suggested" as const, snoozedUntil: 0, followUpAt: 0, sentDigest: "", sends: 0, failure: "", verified: false, history: [{ at: now, kind: "suggested", text: "Suggested from connected channels" }], receiptId: "", connectorOk: true, identities: [] as Case["identities"] };
  return [
    { ...base, id: "case-travel", domain: "travel", title: "Visa documents missing — Taylor trip", reason: "Departure in 8 days; the passport scan and visa form have not been received.", tier: "high", score: 0.95, channel: "whatsapp", deadlineDays: 8,
      targets: [{ id: "taylor", label: "Taylor Brooks", address: "+1 555 0101", consent: true }], subject: "", body: "Hi Taylor — to finish your visa we still need a clear passport scan and the signed visa form. Could you send them by Friday? Thanks!", outcome: "Documents received and validated",
      evidence: [ev("message", "WhatsApp: \"I'll send the docs soon\"", 7200, "wa:msg:7712"), ev("record", "Booking TRIP-88: visa documents 0 of 2 received", 600, "booking:TRIP-88")] },
    { ...base, id: "case-clinic", domain: "clinic", title: "3 patients haven't confirmed tomorrow's appointment", reason: "Confirmation is due by 6pm; unconfirmed slots can't be refilled after that.", tier: "high", score: 0.9, channel: "sms", deadlineDays: 0.4,
      targets: [{ id: "p1", label: "A. Novak", address: "+1 555 0142", consent: true }, { id: "p2", label: "R. Idris", address: "+1 555 0143", consent: true }, { id: "p3", label: "M. Ortega", address: "+1 555 0144", consent: false, why: "No reminder consent on file" }],
      subject: "", body: "Reminder: you have an appointment tomorrow. Reply YES to confirm or call us to reschedule.", outcome: "Confirmation reply observed", evidence: [ev("record", "Schedule: 3 of 14 appointments unconfirmed", 900, "sched:tomorrow")] },
    { ...base, id: "case-quote", domain: "sales", title: "Quote hasn't been answered — Acme", reason: "Quote #Q-310 was sent 6 days ago with no reply; buyers usually decide within a week.", tier: "medium", score: 0.7, channel: "email", deadlineDays: null,
      targets: [{ id: "acme", label: "Dana Whitfield (Acme)", address: "dana@acme.example", consent: true }], subject: "Following up on quote Q-310", body: "Hi Dana — checking in on quote Q-310. Happy to adjust scope or walk through it on a call.", outcome: "Reply or order observed",
      evidence: [ev("record", "Quote Q-310 sent, no reply (6 days)", 6 * DAY, "quote:Q-310"), ev("policy", "Follow-up allowed: no discount change", 60, "policy:followup")] },
    { ...base, id: "case-invoice", domain: "receivables", title: "Invoice #1042 is past due — customer hasn't replied", reason: "Net-30 passed 5 days ago. The WhatsApp connection expired, so a reminder can't be sent yet.", tier: "medium", score: 0.6, channel: "whatsapp", deadlineDays: null, connectorOk: false,
      targets: [{ id: "c1", label: "Kestrel Ltd accounts", address: "+44 20 5550 1042", consent: true }], subject: "", body: "Hi — a friendly reminder that invoice #1042 is now past due. Could you let us know the payment date?", outcome: "Payment reconciled", evidence: [ev("record", "Invoice #1042 overdue by 5 days", 300, "invoice:1042")] },
    { ...base, id: "case-sam", domain: "receivables", title: "Reminder for Sam Rivera — two customers share this name", reason: "Choose which Sam Rivera before anything is sent.", tier: "medium", score: 0.5, channel: "email", deadlineDays: null,
      targets: [{ id: "sam", label: "Sam Rivera", address: "", consent: true }], subject: "Payment reminder", body: "Hi Sam — a quick reminder about your open invoice.", outcome: "Payment reconciled", evidence: [ev("record", "Two contacts match \"Sam Rivera\"", 120, "identity:sam")],
      identities: [{ id: "sam-a", label: "Sam Rivera", email: "sam@harbor.example", detail: "Harbor Co · invoice #1050" }, { id: "sam-b", label: "Sam Rivera", email: "sam.r@northwind.example", detail: "Northwind · no open invoice" }] },
  ];
}

export class MockToday {
  private cases: Case[];
  constructor(private clock: () => number = () => Date.now() / 1000) { this.cases = seed(clock()); }

  private find(id: string): Case {
    const c = this.cases.find((x) => x.id === id);
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
    const items = this.cases.map((c) => this.view(c));
    const order: TodayState[] = ["needs_action", "waiting", "scheduled", "running", "verified", "failed", "dismissed"];
    items.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || b.priority.score - a.priority.score);
    const counts: TodayFeed["counts"] = {};
    items.forEach((i) => { counts[i.state] = (counts[i.state] ?? 0) + 1; });
    const n = counts.needs_action ?? 0;
    return { project_id: "customer-ops", generated_at: this.clock(), basis: "sample", simulated_actions: true, headline: n ? `${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} your decision.` : "Nothing needs you right now.", counts, items, handled_automatically: 2, abstained: 1 };
  }

  item(id: string, o: TodayItemOptions = {}): TodayDetail {
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
    const c = this.find(id); c.snoozedUntil = this.clock() + seconds; return this.item(id);
  }
  dismiss(id: string): TodayDetail {
    const c = this.find(id);
    if (c.phase === "sent" || c.phase === "outcome") throw new TodayApiError(409, "already_sent", "a sent item can't be dismissed; wait for the outcome");
    c.phase = "dismissed"; return this.item(id);
  }
  simulateOutcome(id: string): TodayDetail {
    const c = this.find(id);
    if (c.phase !== "sent") throw new TodayApiError(409, "nothing_sent", "no outcome can be observed before a verified send");
    c.phase = "outcome"; c.history.push({ at: this.clock(), kind: "outcome", text: `${c.outcome} (simulated)` }); return this.item(id);
  }
}
