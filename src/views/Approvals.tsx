import { useCallback, useEffect, useState } from "react";
import type { ApprovalCard, ApprovalListing, DesktopApi } from "../data/desktop";

// What agents on this computer have asked to change, and the person's decision. The card, its words, what may be done and
// every refusal come from the app's one approval service; this screen shows them and sends the person's choice together
// with the digest of exactly what was shown.
const POLL_MS = 3000;
const when = (s: number | null) => (s ? new Date(s * 1000).toLocaleString() : "");
const who = (c: ApprovalCard) => c.requester_label || c.requested_by;

function parseItem(item: string | null): { source: string; id: string } | null {
  const m = /^([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+)$/.exec(item ?? "");
  return m ? { source: m[1], id: m[2] } : null;
}

export function Approvals({ desktop, item, open, onChanged }: {
  desktop: DesktopApi; item: string | null; open: (item: string | null) => void; onChanged?: (waiting: number) => void;
}) {
  const [listing, setListing] = useState<ApprovalListing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picked = parseItem(item);

  const load = useCallback(async () => {
    try {
      const l = await desktop.approvals();
      setListing(l); setError(null); onChanged?.(l.waiting.length);
    } catch (e) { setError((e as Error).message); }
  }, [desktop, onChanged]);

  useEffect(() => { void load(); const t = setInterval(() => void load(), POLL_MS * 3); return () => clearInterval(t); }, [load]);

  if (picked) return <Review desktop={desktop} source={picked.source} id={picked.id} back={() => { open(null); void load(); }} />;

  const row = (c: ApprovalCard) => (
    <div className="row" key={c.ref}>
      <div className="grow">
        <div className="t">{c.title}</div>
        <div className="s">{c.application} · asked by {who(c)} · {c.waiting ? `waits until ${when(c.expires_at)}` : c.state_words}</div>
      </div>
      <button className="btn sm" onClick={() => open(`${c.source}:${c.id}`)} aria-label={`${c.waiting ? "Review" : "Open"}: ${c.title}`}>{c.waiting ? "Review" : "Open"}</button>
    </div>
  );
  return (
    <section className="content">
      <div><div className="eyebrow">Nothing changes until you decide it here</div><h1 className="h">Approvals</h1></div>
      {error && <div className="card" role="alert"><div className="bd"><p>{error}</p></div></div>}
      {!listing && !error && <div className="placeholder" role="status">Loading…</div>}
      {listing && (
        <>
          {listing.problems.map((p) => <p key={p} role="alert">{p}</p>)}
          <div className="card"><div className="hd"><h2 className="eyebrow">Waiting for you</h2></div><div className="bd">
            {listing.waiting.length === 0 ? <div className="placeholder">Nothing is waiting. Connected agents' proposals appear here.</div> : listing.waiting.map(row)}
          </div></div>
          <div className="card"><div className="hd"><h2 className="eyebrow">Recent</h2></div><div className="bd">
            {listing.recent.length === 0 ? <div className="placeholder">No decisions yet.</div> : listing.recent.map(row)}
          </div></div>
        </>
      )}
    </section>
  );
}

function Facts({ rows, label }: { rows: { label: string; value: string }[]; label: string }) {
  return (
    <table className="facts" aria-label={label}><tbody>
      {rows.map((r, i) => <tr key={`${r.label}-${i}`}><th scope="row">{r.label}</th><td>{r.value}</td></tr>)}
    </tbody></table>
  );
}

function Review({ desktop, source, id, back }: { desktop: DesktopApi; source: string; id: string; back: () => void }) {
  const [card, setCard] = useState<ApprovalCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setCard(await desktop.approval(source, id)); } catch (e) { setMessage((e as Error).message); }
  }, [desktop, source, id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {                                       // an approved long action runs as a job: follow it to its end
    if (!card?.running) return;
    const t = setTimeout(() => void load(), POLL_MS);
    return () => clearTimeout(t);
  }, [card, load]);

  async function decide(decision: string) {
    if (!card) return;
    setBusy(true); setMessage(null);
    try { setCard(await desktop.decide(source, id, decision, card.digest, attested)); }
    catch (e) { setMessage(`Not done: ${(e as Error).message}`); await load(); }
    finally { setBusy(false); }
  }

  const label: Record<string, string> = { approve: "Approve", reject: "Reject", execute: "Execute" };
  return (
    <section className="content">
      <p><button className="btn sm" onClick={back}>All approvals</button></p>
      {message && <div className="card" role="alert"><div className="bd"><p>{message}</p></div></div>}
      {!card ? <div className="placeholder" role="status">Loading…</div> : (
        <>
          <div><div className="eyebrow">{card.application} · asked by {who(card)}</div><h1 className="h">{card.title}</h1></div>
          <p role="status"><strong>{card.state_words}</strong></p>
          <div className="card"><div className="bd">
            <Facts rows={card.changes} label="What is proposed" />
            {card.tables.map((t) => (
              <table className="facts" key={t.title} aria-label={t.title}>
                <thead><tr>{t.columns.map((c) => <th scope="col" key={c}>{c}</th>)}</tr></thead>
                <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
              </table>
            ))}
            {card.technical && <details><summary>Full technical definition (exactly what is approved)</summary><pre className="technical" tabIndex={0}>{card.technical}</pre></details>}
          </div></div>
          {card.outcome.length > 0 && <div className="card"><div className="hd"><h2 className="eyebrow">What happened</h2></div><div className="bd"><Facts rows={card.outcome} label="What happened" /></div></div>}
          {card.blocked && <p role="note">{card.blocked}</p>}
          {card.waiting && card.attestation && (
            <label><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} /> {card.attestation}</label>
          )}
          {card.decisions.length > 0 && (
            <div className="actions">
              {card.decisions.map((d) => (
                <button key={d} className={`btn${d === "reject" ? "" : " pri"}`} disabled={busy || (d !== "reject" && !!card.attestation && !attested)} onClick={() => void decide(d)}>{label[d] ?? d}</button>
              ))}
              {busy && <span role="status">Working…</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
