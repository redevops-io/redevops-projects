import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pill } from "../components/Pill";
import type { Section } from "../nav";
import { TodayApiError, classifyConnectionError, type DataClient } from "../data/client";
import type { BatchRequest, CaptureItem, Health, TodayDetail, TodayFeed, TodayItem, TodayLifecycle, TodayRecipient, TodayState } from "../data/types";

// Today — the default landing (CONTROL_SURFACES_UX plan §3). One ranked queue of what needs a human, in
// domain language, with the next safe action beside it. Every state, priority, approval and digest is rendered
// as the server sent it; this view never derives them. Approving binds the exact payload the user reviewed.

const PROJECT = "customer-ops";
const BUDGET = 7;                       // visible "needs your decision" rows before "Show more" (none are dropped)
const SNOOZES: { label: string; seconds: number }[] = [
  { label: "1 hour", seconds: 3600 }, { label: "Tomorrow", seconds: 86400 }, { label: "3 days", seconds: 3 * 86400 }, { label: "Next week", seconds: 7 * 86400 },
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

// Render defensively: older or partial deployments may omit lists; a missing array must never take the screen down.
function normalizeDetail(d: Partial<TodayDetail> & TodayItem): TodayDetail {
  return { ...d, why: d.why ?? d.reason ?? "", evidence: Array.isArray(d.evidence) ? d.evidence : [],
    history: Array.isArray(d.history) ? d.history : [], action: d.action ?? null, receipt: d.receipt ?? null,
    lifecycle: d.lifecycle ?? { suggested: true, approved: false, sent: false, delivery_verified: false, outcome_observed: false },
    source_refs: Array.isArray(d.source_refs) ? d.source_refs : [] } as TodayDetail;
}

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

export function Today({ client, go, onCount, focusItem, onFocused }: { client: DataClient; go: (s: Section) => void; onCount?: (n: number) => void; focusItem?: string | null; onFocused?: () => void }) {
  const [feed, setFeed] = useState<TodayFeed | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<TodayDetail | null>(null);
  const [targets, setTargets] = useState<string[] | undefined>(undefined);
  const [identity, setIdentity] = useState<string | undefined>(undefined);
  // the full recipient list as first loaded, so a recipient the user unticks stays visible and can be re-ticked
  const [roster, setRoster] = useState<{ to: TodayRecipient[]; skipped: { id: string; label: string; reason: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: Health; text: string } | null>(null);
  const [query, setQuery] = useState("");                       // find a customer or item (nothing is hidden by the 7-row budget while searching)
  const findRef = useRef<HTMLInputElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  // Quick Capture: one field. The system decides where it goes; capturing never sends or approves anything.
  const [text, setText] = useState("");
  const [capBusy, setCapBusy] = useState(false);
  const [capNote, setCapNote] = useState<{ tone: Health; text: string; open?: string } | null>(null);
  const [intake, setIntake] = useState<CaptureItem[]>([]);
  const capRef = useRef<HTMLInputElement>(null);
  // Batch triage: reversible actions only. Approving an external send is never offered here — one exact payload at a time.
  const [selectMode, setSelectMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchNote, setBatchNote] = useState<{ tone: Health; text: string; token?: string } | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  const loadFeed = useCallback(async () => {
    try {
      const f = await client.getToday(PROJECT);
      if (!live.current) return f;
      setFeed(f); setErr(null); setLoadError(null);
      onCount?.(f.counts.needs_action ?? 0);
      return f;
    } catch (e) { if (live.current) { setErr(String((e as Error).message ?? e)); setLoadError(e); } return null; }
  }, [client, onCount]);
  useEffect(() => { void loadFeed(); }, [loadFeed]);
  // A runtime that is merely down comes back by itself: retry with a gentle backoff until the first load succeeds.
  useEffect(() => {
    if (feed || !err || !classifyConnectionError(loadError).retryable) return;
    const t = setTimeout(() => void loadFeed(), 5_000);
    return () => clearTimeout(t);
  }, [feed, err, loadError, loadFeed]);
  // The item a deep link / notification asked for. Kept in a ref the moment it is consumed: the parent clears its `focusItem`
  // prop and this component's `sel` update are two separate state updates, and React does NOT guarantee they land in the same
  // render (under load the parent's null arrived first, and the default selection below overwrote the deep link — seen as a
  // ~1-in-8 flake, reproduced and captured). The default selection must never depend on that ordering.
  const requested = useRef<string | null>(null);
  useEffect(() => {      // a notification opened Today on a specific item
    if (focusItem && feed?.items.some((i) => i.id === focusItem)) { requested.current = focusItem; setSel(focusItem); onFocused?.(); }
    else if (focusItem && feed) { void loadFeed(); }
  }, [focusItem, feed, onFocused, loadFeed]);
  const loadIntake = useCallback(async () => {
    try {
      const l = await client.listCaptures(PROJECT);
      // Intake holds only what has no home in Today yet: waiting on one answer, or an investigation candidate.
      // A scheduled reminder and a note linked to a case already live in Today.
      if (live.current) setIntake(l.filter((c) => c.status === "needs_clarification" || c.routing?.kind === "investigation_candidate"));
    } catch { /* intake is optional; the queue still works */ }
  }, [client]);
  useEffect(() => { void loadIntake(); }, [loadIntake]);

  const selectable = (it: TodayItem) => it.kind === "case" || it.kind === "reminder";
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  async function runBatch(req: Omit<BatchRequest, "item_ids">, done: string) {
    if (batchBusy || !picked.length) return;
    setBatchBusy(true); setBatchNote(null); setCapNote(null);
    try {
      const r = await client.batchToday(PROJECT, { ...req, item_ids: picked });
      if (!live.current) return;
      const failed = r.results.filter((x) => !x.ok);
      const why = failed.length ? ` ${failed.length} couldn't be changed: ${[...new Set(failed.map((f) => f.detail ?? f.error))].join("; ")}` : "";
      setBatchNote({ tone: failed.length ? "warn" : "ok", text: `${done} ${r.ok_count} item${r.ok_count === 1 ? "" : "s"}.${why}`, token: r.undo?.token });
      setPicked(failed.map((f) => f.id)); setLabel("");
      await loadFeed();
      if (sel) await loadDetail(sel);
    } catch (e) { if (live.current) setBatchNote({ tone: "bad", text: (e as Error).message ?? String(e) }); }
    finally { if (live.current) setBatchBusy(false); }
  }
  async function undoBatch(token: string) {
    try {
      const r = await client.undoBatch(PROJECT, token);
      const skipped = r.results.filter((x) => !x.restored).length;
      setBatchNote({ tone: skipped ? "warn" : "ok", text: `Undone for ${r.restored_count} item${r.restored_count === 1 ? "" : "s"}.${skipped ? ` ${skipped} had changed since, so they were left as you set them.` : ""}` });
      await loadFeed(); if (sel) await loadDetail(sel);
    } catch (e) { setBatchNote({ tone: "bad", text: (e as Error).message ?? String(e) }); }
  }

  async function submitCapture() {
    const t = text.trim();
    if (!t || capBusy) return;
    setCapBusy(true); setCapNote(null);
    try {
      const c = await client.capture(PROJECT, t);
      if (!live.current) return;
      setText("");
      const r = c.routing;
      if (c.duplicate) setCapNote({ tone: "mut", text: "You already captured this — kept the original." });
      else if (r?.kind === "case") setCapNote({ tone: "ok", text: `Linked to “${r.title}”. It needs your attention — review it on the right. Nothing has been sent.`, open: r.item_id });
      else if (r?.kind === "reminder") setCapNote({ tone: "ok", text: `Reminder set for ${new Date((r.due ?? 0) * 1000).toUTCString().slice(0, 22)} UTC. It will appear here when it's due.`, open: r.in_today_now ? r.item_id : undefined });
      else if (r?.kind === "investigation_candidate") setCapNote({ tone: "ok", text: "Saved as something to investigate. It stays in Intake until there's a next action." });
      else setCapNote({ tone: "warn", text: c.question?.text ?? "Saved to Intake — I need one detail from you." });
      await loadFeed(); await loadIntake();
      if (r?.kind === "case" && r.item_id) setSel(r.item_id);                  // go straight to the thing to review
    } catch (e) { if (live.current) setCapNote({ tone: "bad", text: (e as Error).message ?? String(e) }); }
    finally { if (live.current) setCapBusy(false); }
  }
  async function resolveIntake(c: CaptureItem, caseId: string) {
    try {
      const r = await client.resolveCapture(PROJECT, c.id, caseId);
      setCapNote({ tone: "ok", text: `Linked to “${r.routing?.title ?? "the case"}”. Nothing has been sent.` });
      await loadFeed(); await loadIntake();
      if (r.routing?.item_id) setSel(r.routing.item_id);
    } catch (e) { setCapNote({ tone: "bad", text: (e as Error).message ?? String(e) }); }
  }
  async function archiveIntake(c: CaptureItem) {
    try { await client.archiveCapture(PROJECT, c.id); await loadIntake(); } catch (e) { setCapNote({ tone: "bad", text: (e as Error).message ?? String(e) }); }
  }

  const loadDetail = useCallback(async (id: string, t?: string[], ident?: string) => {
    try {
      const d = await client.getTodayItem(PROJECT, id, { targets: t, identityId: ident });
      if (live.current) {
        setDetail(normalizeDetail(d));
        if (!t && !ident) setRoster(d.action ? { to: d.action.to, skipped: d.action.skipped } : null);
      }
    } catch (e) { if (live.current) setNote({ tone: "bad", text: String((e as Error).message ?? e) }); }
  }, [client]);

  // open the first item by default; reset the per-item choices when the selection changes
  useEffect(() => {
    if (!feed) return;
    if (focusItem && feed.items.some((i) => i.id === focusItem)) return;        // a deep link / notification chose the item; don't override it
    if (!sel || !feed.items.some((i) => i.id === sel)) {
      // an item was asked for but its selection has not been applied yet (see `requested`): honour it instead of the default
      const asked = requested.current && feed.items.some((i) => i.id === requested.current) ? requested.current : null;
      requested.current = null;
      setSel(asked ?? feed.items.find((i) => i.state === "needs_action")?.id ?? feed.items[0]?.id ?? null);
    }
  }, [feed, sel, focusItem]);
  useEffect(() => {
    setTargets(undefined); setIdentity(undefined); setNote(null); setDetail(null); setRoster(null);
    if (sel) void loadDetail(sel);
  }, [sel, loadDetail]);

  const allItems = feed?.items ?? [];
  const q = query.trim().toLowerCase();
  const items = useMemo(() => (q ? allItems.filter((i) => `${i.user_title} ${i.reason} ${i.owner ?? ""} ${i.category ?? ""}`.toLowerCase().includes(q)) : allItems), [allItems, q]);
  const budgetOn = !q && !showAll;                              // while searching, show every match
  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, items: items.filter((i) => g.states.includes(i.state)) })), [items]);
  const flat = useMemo(() => grouped.flatMap((g) => g.items.filter((it) => (g.id !== "decide" || !budgetOn || g.items.indexOf(it) < BUDGET) && (g.id !== "done" || showDone || !!q))), [grouped, budgetOn, showDone, q]);

  // keyboard triage: j/k (or arrows) move through the queue
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "c") { e.preventDefault(); capRef.current?.focus(); return; }
      if (e.key === "/") { e.preventDefault(); findRef.current?.focus(); return; }
      if (e.key === "x" && sel) {
        const it = flat.find((f) => f.id === sel);
        if (it && selectable(it)) { e.preventDefault(); setSelectMode(true); togglePick(sel); }
        return;
      }
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
    setBusy(true); setNote(null); setCapNote(null);               // the "Linked to… nothing has been sent" note is about a moment that has passed
    try {
      const d = await fn();
      if (!live.current) return;
      // The response says what happened (state, replayed); the detail pane is always re-read from the server, so a
      // deployment that answers an action with less than a full detail can never break the screen.
      setNote({ tone: d.state === "failed" ? "bad" : "ok", text: ok(d) });
      await Promise.all([loadFeed(), loadDetail(sel, targets, identity)]);
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

  if (err && !feed) {
    const p = classifyConnectionError(loadError);
    return (
      <section className="content" role="alert"><h1 className="h">Today</h1>
        <div className="card"><div className="bd">
          <div className="t">{p.kind === "error" ? "Couldn't load Today" : p.title}</div>
          <div className="s">{p.kind === "error" ? err : p.detail}</div>
          {p.retryable && <div className="actions"><button className="btn sm" onClick={() => void loadFeed()}>Try again</button><span className="s">Retrying automatically…</span></div>}
        </div></div>
      </section>
    );
  }
  if (!feed) return <section className="content"><div className="placeholder" role="status">Loading…</div></section>;

  const row = (it: TodayItem) => (
    <div className="trowwrap" key={it.id}>
      {selectMode && (
        <input type="checkbox" className="pick" checked={picked.includes(it.id)} disabled={!selectable(it)}
          aria-label={`Select: ${it.user_title}`} title={selectable(it) ? undefined : "Comes from a live signal — resolve it where it originates"}
          onChange={() => togglePick(it.id)} />
      )}
    <button className="trow" aria-current={sel === it.id} onClick={() => { setSel(it.id); setCapNote(null); }}>
      <span className="grow">
        <span className="t">{it.user_title}</span>
        <span className="s">{it.state === "waiting" || it.state === "failed" || it.resurfaced ? (it.status_line || it.reason) : it.reason}</span>
      </span>
      <span className="meta">
        {it.deadline != null && <span className="due">{due(it.deadline, feed.generated_at)}</span>}
        <Pill tone={it.state === "failed" ? "bad" : TIER_TONE[it.priority.tier] ?? "mut"}>{it.state === "failed" ? "Failed" : it.resurfaced ? "Follow up" : it.priority.tier === "high" ? "High" : it.priority.tier === "medium" ? "Medium" : "Low"}</Pill>
      </span>
    </button>
    </div>
  );

  return (
    <section className="content today">
      <div>
        <div className="eyebrow">Today</div>
        <h1 className="h" aria-live="polite">{feed.headline}</h1>
        {feed.basis === "sample" && <div className="banner">Sample data — actions here are simulated; nothing leaves this app.</div>}
        <form className="capture" onSubmit={(e) => { e.preventDefault(); void submitCapture(); }}>
          <label htmlFor="capture-input" className="sr">Quick capture</label>
          <input id="capture-input" ref={capRef} value={text} maxLength={2000} disabled={capBusy} autoComplete="off"
            placeholder="Capture anything — a reminder, a note about a customer, something to send…"
            onChange={(e) => setText(e.target.value)} />
          <button className="btn pri" type="submit" disabled={capBusy || !text.trim()}>{capBusy ? "Saving…" : "Capture"}</button>
        </form>
        {allItems.length > 0 && (
          <div className="find">
            <label htmlFor="find-input" className="sr">Find a customer or item</label>
            <input id="find-input" ref={findRef} type="search" value={query} autoComplete="off" placeholder="Find a customer or item…"
              onChange={(e) => setQuery(e.target.value)} />
            <span className="s" role="status" aria-live="polite">{q ? `${items.length} match${items.length === 1 ? "" : "es"}` : ""}</span>
          </div>
        )}
        {capNote && (
          <div className={`banner ${capNote.tone}`} role="status">{capNote.text}
            {capNote.open && <> <button className="btn sm" type="button" onClick={() => setSel(capNote.open!)}>Open</button></>}</div>
        )}
      </div>

      <div className="split">
        <section className="queue" aria-label="Work that needs attention">
          {items.length > 0 && (
            <div className="batchbar">
              <button className="btn sm" aria-pressed={selectMode} onClick={() => { setSelectMode(!selectMode); setPicked([]); setBatchNote(null); }}>
                {selectMode ? "Done selecting" : "Select items"}
              </button>
              {selectMode && <span className="s">{picked.length ? `${picked.length} selected` : "Pick items to snooze, dismiss, assign or categorize together."}</span>}
            </div>
          )}
          {selectMode && picked.length > 0 && (
            <div className="card batchtools" role="group" aria-label="Batch actions">
              <div className="bd">
                <label className="snooze s">Snooze
                  <select aria-label="Snooze selected" disabled={batchBusy} value="" onChange={(e) => { const v = Number(e.target.value); if (v) void runBatch({ action: "snooze", seconds: v }, "Snoozed"); }}>
                    <option value="">…</option>{SNOOZES.map((s) => <option key={s.seconds} value={s.seconds}>{s.label}</option>)}
                  </select>
                </label>
                <button className="btn sm" disabled={batchBusy} onClick={() => void runBatch({ action: "dismiss" }, "Dismissed")}>Dismiss</button>
                <input aria-label="Label for assign or categorize" className="lbl" placeholder="Name or label" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
                <button className="btn sm" disabled={batchBusy || !label.trim()} onClick={() => void runBatch({ action: "assign", assignee: label }, "Assigned")}>Assign</button>
                <button className="btn sm" disabled={batchBusy || !label.trim()} onClick={() => void runBatch({ action: "categorize", category: label }, "Categorized")}>Categorize</button>
                <div className="s grow">Approvals are reviewed one item at a time.</div>
              </div>
            </div>
          )}
          {batchNote && (
            <div className={`banner ${batchNote.tone}`} role="status">{batchNote.text}
              {batchNote.token && <> <button className="btn sm" onClick={() => void undoBatch(batchNote.token!)}>Undo</button></>}</div>
          )}
          {allItems.length > 0 && items.length === 0 && <div className="card"><div className="bd">No items match “{query.trim()}”. <button className="btn sm" onClick={() => setQuery("")}>Clear</button></div></div>}
          {allItems.length === 0 && <div className="card"><div className="bd">Nothing needs you right now.</div></div>}
          {grouped.map((g) => {
            if (!g.items.length) return null;
            const isDone = g.id === "done", isDecide = g.id === "decide";
            const visible = isDecide && budgetOn ? g.items.slice(0, BUDGET) : g.items;
            return (
              <div className="card" key={g.id}>
                <div className="hd"><Pill tone={g.tone}>{g.title}</Pill><span className="eyebrow" style={{ marginLeft: "auto" }}>{g.items.length}</span></div>
                <div className="bd">
                  {isDone && !showDone && !q
                    ? <button className="btn sm" onClick={() => setShowDone(true)}>Show {g.items.length} finished</button>
                    : visible.map(row)}
                  {isDecide && !q && g.items.length > BUDGET && (
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
          {intake.length > 0 && (
            <div className="card" aria-label="Intake">
              <div className="hd"><Pill tone="mut">Captured, not in Today</Pill><span className="eyebrow" style={{ marginLeft: "auto" }}>{intake.length}</span></div>
              <div className="bd">
                {intake.map((c) => (
                  <div className="row intake" key={c.id}>
                    <div className="grow">
                      <div className="t">{c.content}</div>
                      {c.status === "needs_clarification" && c.question && <div className="s">{c.question.text}</div>}
                      {c.status === "classified" && <div className="s">{c.suggested_action?.label ?? "Saved."} Not in Today until there's a next action.</div>}
                      {c.status === "needs_clarification" && c.question && c.question.options.length > 0 && (
                        <div className="opts">{c.question.options.map((o) => <button key={o.case_id} className="btn sm" onClick={() => void resolveIntake(c, o.case_id)}>{o.label}</button>)}</div>
                      )}
                    </div>
                    <button className="btn sm" onClick={() => void archiveIntake(c)} aria-label={`Archive: ${c.content}`}>Archive</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="s hint">Tips: j / k move through the queue · c captures · / finds · x selects.</div>
        </section>

        <aside className="detail card" aria-label="Item details">
          {!detail && note ? (
            <div className="bd"><div className={`banner ${note.tone}`} role="alert">{note.text}</div>
              <div className="actions"><button className="btn sm" onClick={() => { if (sel) { setNote(null); void loadDetail(sel); } }}>Try again</button></div></div>
          ) : !detail ? <div className="bd placeholder" role="status">{sel ? "Loading…" : "Select an item."}</div> : (
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
              ) : detail.kind === "reminder" ? (
                <div className="sec"><div className="eyebrow">Suggested next step</div><p>Do it, then mark it done.</p></div>
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
                      (d) => d.state === "failed" ? d.status_line ?? "Not sent." : d.replayed ? "Already sent — nothing was sent again." : "Approved and sent. It comes back to your queue if there's no response.")}>
                    {busy ? "Working…" : detail.state === "failed" ? "Review & retry" : "Approve & send"}
                  </button>
                )}
                {detail.resurfaced && <span className="s">No response yet — it is back in your queue so it is not lost.</span>}
                {detail.kind === "reminder" && detail.state !== "dismissed" && (
                  <button className="btn pri" disabled={busy} onClick={() => run(() => client.dismissToday(PROJECT, detail.id), () => "Marked done.")}>Mark done</button>
                )}
                {!act && detail.kind === "signal" && <button className="btn" onClick={() => go("attention")}>Open in Attention</button>}
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
