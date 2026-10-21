import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "../components/Pill";
import type { Section } from "../components/Rail";
import { TodayApiError, type DataClient } from "../data/client";
import type { Health, TodayDetail, TodayFeed, TodayItem, TodayLifecycle, TodayRecipient, TodayState } from "../data/types";

// Today — the default landing (CONTROL_SURFACES_UX plan §3). One ranked queue of what needs a human, in
// domain language, with the next safe action beside it. Every state, priority, approval and digest is rendered
// as the server sent it; this view never derives them. Approving binds the exact payload the user reviewed.

const PROJECT = "customer-ops";
const BUDGET = 7;                       // visible "needs your decision" rows before "Show more" (none are dropped)
const SNOOZES: { label: string; seconds: number }[] = [
  { label: "1 hour", seconds: 3600 }, { label: "Tomorrow", seconds: 86400 }, { label: "3 days", seconds: 3 * 86400 },
];
const STEPS: { key: keyof TodayLifecycle; label: string }[] = [
  { key: "suggested", label: "Suggested" }, { key: "approved", label: "Approved" }, { key: "sent", label: "Sent" },
  { key: "delivery_verified", label: "Delivery confirmed" }, { key: "outcome_observed", label: "Outcome seen" },
];
const GROUPS: { id: string; title: string; states: TodayState[]; tone: Health }[] = [
  { id: "decide", title: "Needs your decision", states: ["needs_action", "failed"], tone: "warn" },
  { id: "wait", title: "Waiting on others", states: ["waiting", "running"], tone: "run" },
  { id: "later", title: "Scheduled", states: ["scheduled"], tone: "mut" },
  { id: "done", title: "Done", states: ["verified"], tone: "ok" },
];
const TIER_TONE: Record<string, Health> = { high: "bad", medium: "warn", low: "mut" };
const CHANNEL: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

function due(deadline: number | null, now: number): string {
  if (deadline == null) return "";
  const d = deadline - now;
  if (d < 0) return "Overdue";
  if (d < 86400) return `Due in ${Math.max(1, Math.round(d / 3600))}h`;
  const days = Math.round(d / 86400);
  return `Due in ${days} day${days === 1 ? "" : "s"}`;
}

function Stepper({ lc, failed }: { lc: TodayLifecycle; failed: boolean }) {
  return (
    <ol className="lifecycle" aria-label="Progress of this action">
      {STEPS.map((s) => (
        <li key={s.key} className={lc[s.key] ? "on" : failed && s.key === "approved" ? "bad" : ""}>
          <span className="mk" aria-hidden="true">{lc[s.key] ? "✓" : failed && s.key === "approved" ? "✕" : ""}</span>
          <span>{s.label}<span className="sr"> — {lc[s.key] ? "done" : "not yet"}</span></span>
        </li>
      ))}
    </ol>
  );
}

export function Today({ client, go, onCount }: { client: DataClient; go: (s: Section) => void; onCount?: (n: number) => void }) {
  const [feed, setFeed] = useState<TodayFeed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<TodayDetail | null>(null);
  const [targets, setTargets] = useState<string[] | undefined>(undefined);
  const [identity, setIdentity] = useState<string | undefined>(undefined);
  // the full recipient list as first loaded, so a recipient the user unticks stays visible and can be re-ticked
  const [roster, setRoster] = useState<{ to: TodayRecipient[]; skipped: { id: string; label: string; reason: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: Health; text: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const loadFeed = useCallback(async () => {
    try {
      const f = await client.getToday(PROJECT);
      if (!live.current) return f;
      setFeed(f); setErr(null);
      onCount?.(f.counts.needs_action ?? 0);
      return f;
    } catch (e) { if (live.current) setErr(String((e as Error).message ?? e)); return null; }
  }, [client, onCount]);
  useEffect(() => { void loadFeed(); }, [loadFeed]);

  const loadDetail = useCallback(async (id: string, t?: string[], ident?: string) => {
    try {
      const d = await client.getTodayItem(PROJECT, id, { targets: t, identityId: ident });
      if (live.current) {
        setDetail(d);
        if (!t && !ident) setRoster(d.action ? { to: d.action.to, skipped: d.action.skipped } : null);
      }
    } catch (e) { if (live.current) setNote({ tone: "bad", text: String((e as Error).message ?? e) }); }
  }, [client]);

  // open the first item by default; reset the per-item choices when the selection changes
  useEffect(() => {
    if (!feed) return;
    if (!sel || !feed.items.some((i) => i.id === sel)) setSel(feed.items.find((i) => i.state === "needs_action")?.id ?? feed.items[0]?.id ?? null);
  }, [feed, sel]);
  useEffect(() => {
    setTargets(undefined); setIdentity(undefined); setNote(null); setDetail(null); setRoster(null);
    if (sel) void loadDetail(sel);
  }, [sel, loadDetail]);

  const items = feed?.items ?? [];
  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, items: items.filter((i) => g.states.includes(i.state)) })), [items]);
  const flat = useMemo(() => grouped.flatMap((g) => g.items.filter((it) => (g.id !== "decide" || showAll || g.items.indexOf(it) < BUDGET) && (g.id !== "done" || showDone))), [grouped, showAll, showDone]);

  // keyboard triage: j/k (or arrows) move through the queue
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
      if (!dir || !flat.length) return;
      e.preventDefault();
      const i = flat.findIndex((x) => x.id === sel);
      setSel(flat[Math.min(flat.length - 1, Math.max(0, i + dir))].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, sel]);

  const refreshAll = async (id: string) => { await loadFeed(); await loadDetail(id, targets, identity); };

  async function run(fn: () => Promise<TodayDetail>, ok: (d: TodayDetail) => string) {
    if (busy || !sel) return;
    setBusy(true); setNote(null);
    try {
      const d = await fn();
      if (!live.current) return;
      setDetail(d); setNote({ tone: d.state === "failed" ? "bad" : "ok", text: ok(d) });
      await loadFeed();
    } catch (e) {
      const ae = e as TodayApiError;
      if (ae.code === "stale_approval") {
        setNote({ tone: "warn", text: "This changed since you reviewed it, so nothing was sent. The preview has been refreshed — please review it again." });
        await refreshAll(sel);
      } else setNote({ tone: "bad", text: ae.message ?? String(e) });
    } finally { if (live.current) setBusy(false); }
  }

  const act = detail?.action ?? null;
  const toggleTarget = (id: string) => {
    if (!detail || !act) return;
    const cur = targets ?? (roster?.to ?? act.to).map((t) => t.id);
    const order = (roster?.to ?? act.to).map((t) => t.id);
    const picked = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    const next = order.filter((x) => picked.includes(x));          // keep the roster's order, whatever was ticked last
    setTargets(next); void loadDetail(detail.id, next, identity);
  };
  const chooseIdentity = (id: string) => { setIdentity(id); if (detail) void loadDetail(detail.id, targets, id); };

  if (err && !feed) return (
    <section className="content" role="alert"><h1 className="h">Today</h1>
      <div className="card"><div className="bd">Couldn't load Today. <button className="btn sm" onClick={() => void loadFeed()}>Try again</button><div className="s">{err}</div></div></div>
    </section>
  );
  if (!feed) return <section className="content"><div className="placeholder" role="status">Loading…</div></section>;

  const row = (it: TodayItem) => (
    <button key={it.id} className="trow" aria-current={sel === it.id} onClick={() => setSel(it.id)}>
      <span className="grow">
        <span className="t">{it.user_title}</span>
        <span className="s">{it.state === "waiting" || it.state === "failed" || it.resurfaced ? (it.status_line || it.reason) : it.reason}</span>
      </span>
      <span className="meta">
        {it.deadline != null && <span className="due">{due(it.deadline, feed.generated_at)}</span>}
        <Pill tone={it.state === "failed" ? "bad" : TIER_TONE[it.priority.tier] ?? "mut"}>{it.state === "failed" ? "Failed" : it.resurfaced ? "Follow up" : it.priority.tier === "high" ? "High" : it.priority.tier === "medium" ? "Medium" : "Low"}</Pill>
      </span>
    </button>
  );

  return (
    <section className="content today">
      <div>
        <div className="eyebrow">Today</div>
        <h1 className="h" aria-live="polite">{feed.headline}</h1>
        {feed.basis === "sample" && <div className="banner">Sample data — actions here are simulated; nothing leaves this app.</div>}
      </div>

      <div className="split">
        <div className="queue" role="list" aria-label="Work that needs attention">
          {items.length === 0 && <div className="card"><div className="bd">Nothing needs you right now.</div></div>}
          {grouped.map((g) => {
            if (!g.items.length) return null;
            const isDone = g.id === "done", isDecide = g.id === "decide";
            const visible = isDecide && !showAll ? g.items.slice(0, BUDGET) : g.items;
            return (
              <div className="card" key={g.id}>
                <div className="hd"><Pill tone={g.tone}>{g.title}</Pill><span className="eyebrow" style={{ marginLeft: "auto" }}>{g.items.length}</span></div>
                <div className="bd">
                  {isDone && !showDone
                    ? <button className="btn sm" onClick={() => setShowDone(true)}>Show {g.items.length} finished</button>
                    : visible.map(row)}
                  {isDecide && g.items.length > BUDGET && (
                    <button className="btn sm" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show ${g.items.length - BUDGET} more`}</button>
                  )}
                </div>
              </div>
            );
          })}
          {feed.handled_automatically > 0 && (
            <div className="card"><div className="hd"><Pill tone="ok">Handled automatically</Pill><span className="eyebrow" style={{ marginLeft: "auto" }}>{feed.handled_automatically}</span></div>
              <div className="bd s">{feed.handled_automatically} routine item{feed.handled_automatically === 1 ? " was" : "s were"} handled within policy; {feed.abstained} judged too low-value to interrupt you.</div></div>
          )}
          <div className="s hint">Tip: j / k to move through the queue.</div>
        </div>

        <aside className="detail card" aria-label="Item details">
          {!detail ? <div className="bd placeholder" role="status">{sel ? "Loading…" : "Select an item."}</div> : (
            <div className="bd">
              <div className="hd2">
                <h2 className="dt">{detail.user_title}</h2>
                {detail.deadline != null && <span className="due">{due(detail.deadline, feed.generated_at)}</span>}
              </div>
              <div className="sec"><div className="eyebrow">Why this matters</div><p>{detail.why}</p></div>
              {detail.evidence.length > 0 && (
                <div className="sec"><div className="eyebrow">What I observed</div>
                  <ul className="plain">{detail.evidence.map((e) => <li key={e.ref}>{e.label}</li>)}</ul></div>
              )}

              {act ? (
                <div className="sec">
                  <div className="eyebrow">Suggested next step</div>
                  <div className="preview" aria-label="Message preview">
                    <div className="s">{CHANNEL[act.channel] ?? act.channel} · To {act.to.length ? act.to.map((t) => t.label + (t.address ? ` (${t.address})` : "")).join(", ") : "—"}</div>
                    {act.subject && <div className="t">{act.subject}</div>}
                    <p className="msgbody">{act.body}</p>
                  </div>

                  {detail.state === "needs_action" || detail.state === "failed" || detail.state === "scheduled" ? (
                    <>
                      {roster && (roster.to.length + roster.skipped.length > 1) && (
                        <fieldset className="recips"><legend className="s">Send to</legend>
                          {[...roster.to.map((t) => ({ ...t, off: false, why: "" })), ...roster.skipped.map((t) => ({ id: t.id, label: t.label, address: "", off: true, why: t.reason }))].map((t) => (
                            <label key={t.id} className={t.off ? "off" : ""}>
                              <input type="checkbox" checked={!t.off && (targets ? targets.includes(t.id) : true)} disabled={t.off} onChange={() => toggleTarget(t.id)} />
                              {t.label}{t.off ? <span className="s"> — skipped: {t.why}</span> : null}
                            </label>
                          ))}
                        </fieldset>
                      )}
                      {act.disambiguate.length > 0 && (
                        <fieldset className="recips"><legend className="s">Which contact is this?</legend>
                          {act.disambiguate.map((d) => (
                            <label key={d.id}><input type="radio" name="identity" checked={identity === d.id} onChange={() => chooseIdentity(d.id)} />
                              {d.label} <span className="s">— {d.email} · {d.detail}</span></label>
                          ))}
                        </fieldset>
                      )}
                      {act.blocked_reason && <div className="banner warn" role="status">{act.blocked_reason}</div>}
                      <div className="s">{act.will_happen} {act.nothing_sent_yet && "Nothing has been sent yet."} {act.policy.reason}</div>
                    </>
                  ) : null}
                </div>
              ) : (
                <div className="sec"><div className="eyebrow">Suggested next step</div><p>{detail.next_action.plain_language_label}</p>
                  <div className="s">This comes from a cross-app signal; resolve it where it originates.</div></div>
              )}

              <div className="sec status" role="status">
                <Stepper lc={detail.lifecycle} failed={detail.state === "failed"} />
                {detail.status_line && <div className={`statusline ${detail.state}`}>{detail.status_line}</div>}
              </div>

              {note && <div className={`banner ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

              <div className="actions">
                {act && (detail.state === "needs_action" || detail.state === "failed" || detail.state === "scheduled") && !detail.resurfaced && detail.lifecycle.sent === false && (
                  <button className="btn pri" disabled={busy || !act.can_approve}
                    onClick={() => run(() => client.approveToday(PROJECT, detail.id, { payload_digest: act.payload_digest!, targets, identity_id: identity }),
                      (d) => d.state === "failed" ? d.status_line ?? "Not sent." : d.replayed ? "Already sent — nothing was sent again." : "Approved and sent. I'll follow up if there's no response.")}>
                    {busy ? "Working…" : detail.state === "failed" ? "Review & retry" : "Approve & send"}
                  </button>
                )}
                {detail.resurfaced && <span className="s">No response yet — it is back in your queue so it is not lost.</span>}
                {!act && <button className="btn" onClick={() => go("attention")}>Open in Attention</button>}
                {detail.state !== "verified" && detail.state !== "dismissed" && (
                  <label className="snooze s">Snooze
                    <select aria-label="Snooze" disabled={busy} value="" onChange={(e) => { const v = Number(e.target.value); if (v) void run(() => client.snoozeToday(PROJECT, detail.id, v), () => "Snoozed — it will come back."); }}>
                      <option value="">…</option>{SNOOZES.map((s) => <option key={s.seconds} value={s.seconds}>{s.label}</option>)}
                    </select>
                  </label>
                )}
                {act && !detail.lifecycle.sent && detail.state !== "dismissed" && (
                  <button className="btn" disabled={busy} onClick={() => run(() => client.dismissToday(PROJECT, detail.id), () => "Dismissed.")}>Dismiss</button>
                )}
                {feed.simulated_actions && detail.lifecycle.sent && !detail.lifecycle.outcome_observed && (
                  <button className="btn" disabled={busy} onClick={() => run(() => client.simulateTodayOutcome(PROJECT, detail.id), () => "Outcome recorded (simulated).")}>Simulate: customer responded</button>
                )}
              </div>

              <details className="tech"><summary>Technical details</summary>
                <div className="kv"><span className="k">item</span><span className="mono">{detail.id}</span>
                  <span className="k">source</span><span className="mono">{detail.source_refs.join(", ") || "—"}</span>
                  {act?.payload_digest && <><span className="k">approval binds</span><span className="mono">{act.payload_digest}</span></>}
                  {detail.approval_ref && <><span className="k">approval</span><span className="mono">{detail.approval_ref}</span></>}
                  {detail.last_receipt_ref && <><span className="k">receipt</span><span className="mono">{detail.last_receipt_ref}</span></>}
                  <span className="k">priority</span><span>{detail.priority.tier} · policy {detail.priority.policy_version}</span></div>
                {detail.history.length > 0 && <ul className="plain">{detail.history.map((h, i) => <li key={i}><span className="mono">{h.kind}</span> — {h.text}</li>)}</ul>}
              </details>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
