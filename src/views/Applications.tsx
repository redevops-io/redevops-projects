import { useCallback, useEffect, useState } from "react";
import type { AppField, DesktopApi, ImportReview, InstalledApp, OpenApp } from "../data/desktop";

// Installed applications. An application is data an agent described and a person approved: it is drawn here from its
// definition (no code of its own runs), and its records stay on this computer.
const shown = (v: unknown) => (v === true ? "yes" : v === false ? "no" : v === null || v === undefined ? "" : String(v));
const label = (n: string) => n.replace(/_/g, " ");

export function Applications({ desktop, item, open, toApprovals }: {
  desktop: DesktopApi; item: string | null; open: (item: string | null) => void; toApprovals: () => void;
}) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { setApps(await desktop.applications()); setError(null); } catch (e) { setError((e as Error).message); }
  }, [desktop]);
  useEffect(() => { void load(); }, [load, item]);

  if (item) return <One desktop={desktop} id={item} back={() => open(null)} toApprovals={toApprovals} />;
  return (
    <section className="content">
      <div><div className="eyebrow">Installed on this computer, after your approval</div><h1 className="h">Applications</h1></div>
      {error && <p role="alert">{error}</p>}
      <div className="card"><div className="bd">
        {!apps ? <div className="placeholder" role="status">Loading…</div> : apps.length === 0
          ? <div className="placeholder">No application yet. A connected agent can propose one; it appears under Approvals.</div>
          : apps.map((a) => (
            <div className="row" key={a.app_id}>
              <div className="grow"><div className="t">{a.name}</div><div className="s">{a.summary} · version {a.version}</div></div>
              <button className="btn sm" onClick={() => open(a.app_id)} aria-label={`Open ${a.name}`}>Open</button>
            </div>
          ))}
      </div></div>
      <Bring desktop={desktop} done={(id) => { void load(); open(id); }} />
    </section>
  );
}

function Bring({ desktop, done }: { desktop: DesktopApi; done: (id: string) => void }) {
  const [text, setText] = useState("");
  const [review, setReview] = useState<{ bundle: unknown; said: ImportReview } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function look(e: React.FormEvent) {
    e.preventDefault(); setError(null); setReview(null);
    let bundle: unknown;
    try { bundle = JSON.parse(text); } catch { setError("That is not an exported application."); return; }
    try { setReview({ bundle, said: await desktop.reviewImport(bundle) }); } catch (x) { setError((x as Error).message); }
  }
  async function install() {
    if (!review) return;
    try { const r = await desktop.importApp(review.bundle, review.said.digest); setReview(null); setText(""); done(r.app_id); }
    catch (x) { setError((x as Error).message); }
  }
  return (
    <div className="card"><div className="hd"><h2 className="eyebrow">Bring an application from another installation</h2></div><div className="bd">
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(e) => void look(e)} className="form">
        <label>Exported file <input type="file" accept=".json,application/json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void f.text().then((t) => { setText(t); setReview(null); }); }} /></label>
        <label>Or paste it <textarea rows={4} value={text} onChange={(e) => { setText(e.target.value); setReview(null); }} /></label>
        <button className="btn" type="submit" disabled={!text.trim()}>Review</button>
      </form>
      {review && (
        <div>
          <h3>{review.said.name}</h3>
          <table className="facts" aria-label="What arrives"><tbody>{review.said.rows.map((r, i) => <tr key={i}><th scope="row">{r.label}</th><td>{r.value}</td></tr>)}</tbody></table>
          <details><summary>Full technical definition (exactly what is installed)</summary><pre className="technical" tabIndex={0}>{review.said.technical}</pre></details>
          <p><button className="btn pri" onClick={() => void install()}>Install with these records</button> <button className="btn" onClick={() => setReview(null)}>Cancel</button></p>
        </div>
      )}
    </div></div>
  );
}

function Input({ field, value, set }: { field: AppField; value: unknown; set: (v: unknown) => void }) {
  const need = !!field.required && field.type !== "boolean";
  if (field.type === "long_text") return <textarea rows={3} required={need} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />;
  if (field.type === "choice") return <select required={need} value={String(value ?? "")} onChange={(e) => set(e.target.value)}><option value="" />{(field.choices ?? []).map((c) => <option key={c}>{c}</option>)}</select>;
  if (field.type === "boolean") return <input type="checkbox" checked={value === true} onChange={(e) => set(e.target.checked)} />;
  const kind = field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
  return <input type={kind} step={field.type === "number" ? "any" : undefined} required={need} value={String(value ?? "")} onChange={(e) => set(e.target.value)} />;
}

function AddForm({ fields, submit, add }: { fields: AppField[]; submit: string; add: (values: Record<string, unknown>) => Promise<boolean> }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === "boolean") out[f.name] = v === true;
      else if (v !== undefined && v !== "") out[f.name] = f.type === "number" ? Number(v) : v;
    }
    if (await add(out)) setValues({});
  }
  return (
    <form onSubmit={(e) => void send(e)} className="form">
      {fields.map((f) => <label key={f.name}>{label(f.name)} <Input field={f} value={values[f.name]} set={(v) => setValues((s) => ({ ...s, [f.name]: v }))} /></label>)}
      <button className="btn pri" type="submit">{submit}</button>
      <span className="s">Saved at once, on this computer.</span>
    </form>
  );
}

function One({ desktop, id, back, toApprovals }: { desktop: DesktopApi; id: string; back: () => void; toApprovals: () => void }) {
  const [app, setApp] = useState<OpenApp | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ url: string; name: string } | null>(null);
  const load = useCallback(async () => {
    try { setApp(await desktop.application(id)); } catch (e) { setError((e as Error).message); }
  }, [desktop, id]);
  useEffect(() => { void load(); }, [load]);

  async function exportIt() {
    setError(null);
    try {
      const { name, text } = await desktop.exportApp(id);
      setSaved({ name, url: URL.createObjectURL(new Blob([text], { type: "application/json" })) });
    } catch (e) { setError((e as Error).message); }
  }

  if (!app) return <section className="content"><p><button className="btn sm" onClick={back}>All applications</button></p>{error ? <p role="alert">{error}</p> : <div className="placeholder" role="status">Loading…</div>}</section>;
  const d = app.definition;
  const view = d.views.find((v) => v.id === viewId) ?? d.views[0];
  const fieldsOf = (c: string) => d.state.collections.find((x) => x.name === c)?.fields ?? [];
  return (
    <section className="content">
      <p><button className="btn sm" onClick={back}>All applications</button></p>
      <div><div className="eyebrow">Version {app.version} · installed by {app.installed_by}</div><h1 className="h">{d.name}</h1><p className="s">{d.summary}</p></div>
      {error && <p role="alert">{error}</p>}
      {app.changed_capabilities.length > 0 && <p role="note">Some of what this application uses changed since it was approved: {app.changed_capabilities.map((c) => `${c.capability}: ${c.change}`).join("; ")}.</p>}
      {d.views.length > 1 && <div className="tabsrow" role="tablist">{d.views.map((v) => <button role="tab" key={v.id} aria-selected={v.id === view.id} onClick={() => setViewId(v.id)}>{v.title}</button>)}</div>}
      <div className="card"><div className="hd"><h2 className="eyebrow">{view.title}</h2></div><div className="bd">
        {view.blocks.map((b, i) => {
          if (b.type === "text") return <p key={i} className="prewrap">{b.text}</p>;
          if (b.type === "records") {
            const rows = app.records[b.collection!] ?? [];
            return rows.length === 0 ? <div key={i} className="placeholder">No {label(b.collection!)} yet.</div> : (
              <div key={i} className="scroll" tabIndex={0}><table className="facts" aria-label={label(b.collection!)}>
                <thead><tr>{(b.columns ?? []).map((c) => <th scope="col" key={c}>{label(c)}</th>)}<th scope="col">updated by</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.id}>{(b.columns ?? []).map((c) => <td key={c}>{shown(r.values[c])}</td>)}<td className="s">{r.updated_by}</td></tr>)}</tbody>
              </table></div>
            );
          }
          if (b.type === "form") return <AddForm key={i} fields={fieldsOf(b.collection!)} submit={b.submit ?? "Add"} add={async (values) => {
            setError(null);
            try { await desktop.addRecord(id, b.collection!, values); await load(); return true; }
            catch (e) { setError(`Not added: ${(e as Error).message}`); return false; }
          }} />;
          return <p key={i}><button className="btn sm" onClick={toApprovals}>See what waits for approval</button></p>;
        })}
      </div></div>
      <p>
        <button className="btn" onClick={() => void exportIt()}>Export this application with its records</button>{" "}
        {saved && <a href={saved.url} download={saved.name}>Save {saved.name}</a>}
      </p>
    </section>
  );
}
