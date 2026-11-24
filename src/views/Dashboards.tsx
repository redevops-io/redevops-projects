import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bars, DataTable, Funnel, Matrix, SeriesTable, Stacked, StatTile, TimeSeries, fmt } from "../components/charts";
import { Pill } from "../components/Pill";
import type { Section } from "../components/Rail";
import { classifyConnectionError, type DataClient } from "../data/client";
import type { DashAction, DashCatalog, DashDrill, DashFilters, DashLayout, DashPanel, DashRow, DashSource, DashView, Dashboard, MatrixRow } from "../data/dashboards";
import type { Health } from "../data/types";

// Dashboards — analytical projections the runtime computed over what is connected. This view decides nothing: every
// number, status, freshness and "not known" is rendered as the runtime sent it; a click on a number lists the records
// behind it, and an action hands the finding to Sidekick, Today or the owning product's own governed route.

const SRC_TONE: Record<string, Health> = { ok: "ok", stale: "warn", unavailable: "bad", not_connected: "mut", unauthorized: "mut", gated: "mut" };
const SRC_WORD: Record<string, string> = { ok: "", stale: "stale", unavailable: "not answering", not_connected: "not connected", unauthorized: "no access", gated: "not enabled" };
const RANGES = [7, 30, 90];
const LS_LAYOUT = "redevops.dash.layout.";
const LS_LAST = "redevops.dash.last";

function ago(now: number, at: number): string {
  if (!at) return "";
  const s = Math.max(0, Math.round(now - at));
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}
function when(at: number): string {
  return at ? new Date(at * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—";
}
function readLayout(id: string): DashLayout {
  try { return JSON.parse(localStorage.getItem(LS_LAYOUT + id) || "{}") as DashLayout; } catch { return {}; }
}
function writeLayout(id: string, l: DashLayout) {
  try { localStorage.setItem(LS_LAYOUT + id, JSON.stringify(l)); } catch { /* a convenience only */ }
}
function arrange(panels: DashPanel[], l: DashLayout): DashPanel[] {
  const order = l.order ?? [];
  const rank = (p: DashPanel) => { const i = order.indexOf(p.id); return i < 0 ? order.length + panels.indexOf(p) : i; };
  return [...panels].sort((a, b) => rank(a) - rank(b));
}

export interface DashboardsProps {
  client: DataClient;
  go: (s: Section, item?: string) => void;
  ask: (text: string, send: boolean, objectRef?: string) => void;
  initial?: string | null;
  onContext?: (objectRef: string | undefined, project: string) => void;
}

export function Dashboards({ client, go, ask, initial, onContext }: DashboardsProps) {
  const [catalog, setCatalog] = useState<DashCatalog | null>(null);
  const [problem, setProblem] = useState<string>("");
  const [id, setId] = useState<string>("");
  const [filters, setFilters] = useState<DashFilters>({ days: 30 });
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [views, setViews] = useState<DashView[]>([]);
  const [viewId, setViewId] = useState("");
  const [layout, setLayout] = useState<DashLayout>({});
  const [customize, setCustomize] = useState(false);
  const [tables, setTables] = useState<Record<string, boolean>>({});
  const [drill, setDrill] = useState<{ key: string; label: string } | null>(null);
  const [notice, setNotice] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    client.getDashboardCatalog().then((c) => {
      if (!live) return;
      setCatalog(c);
      let last = "";
      try { last = localStorage.getItem(LS_LAST) || ""; } catch { /* ignore */ }
      const want = [initial, last].find((x) => x && c.dashboards.some((d) => d.id === x));
      setId(want || c.dashboards[0]?.id || "");
    }).catch((e) => { if (live) setProblem(classifyConnectionError(e).kind === "incompatible" ? "This deployment does not provide dashboards yet. Update the runtime, then reconnect." : classifyConnectionError(e).title); });
    return () => { live = false; };
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (initial && catalog?.dashboards.some((d) => d.id === initial)) setId(initial); }, [initial, catalog]);

  // switching dashboard: its remembered layout, its saved views, and the default view if there is one
  useEffect(() => {
    if (!id) return;
    let live = true;
    setLayout(readLayout(id)); setViewId(""); setDrill(null); setCustomize(false);
    try { localStorage.setItem(LS_LAST, id); } catch { /* ignore */ }
    client.listDashboardViews(id).then((v) => {
      if (!live) return;
      setViews(v);
      const def = v.find((x) => x.is_default);
      if (def) { setViewId(def.id); setFilters({ days: 30, ...def.filters }); setLayout(def.layout ?? {}); }
    }).catch(() => { if (live) setViews([]); });
    return () => { live = false; };
  }, [client, id]);

  const load = useCallback((fresh = false) => {
    if (!id) return;
    const mine = ++seq.current;
    setLoading(true);
    client.getDashboard(id, filters, fresh).then((d) => { if (mine === seq.current) { setDash(d); setProblem(""); } })
      .catch((e) => { if (mine === seq.current) { const p = classifyConnectionError(e); setDash(null); setProblem(p.kind === "unauthenticated" ? "You do not have access to this dashboard or project." : p.title); } })
      .finally(() => { if (mine === seq.current) setLoading(false); });
  }, [client, id, filters]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { onContext?.(id ? `dashboard:${id}${drill ? `#${drill.key}` : ""}` : undefined, filters.project ?? ""); }, [id, drill, filters.project]); // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (patch: DashFilters) => { setFilters((f) => ({ ...f, ...patch })); setViewId(""); };
  const pick = (next: string) => { setId(next); go("dashboards", next); };
  const changeLayout = (l: DashLayout) => { setLayout(l); if (id) writeLayout(id, l); setViewId(""); };
  const openDrill = (key: string, label: string) => setDrill({ key, label });

  const panels = useMemo(() => (dash ? arrange(dash.panels, layout) : []), [dash, layout]);
  const hidden = new Set(layout.hidden ?? []);
  const move = (pid: string, by: number) => {
    const ids = panels.map((p) => p.id), i = ids.indexOf(pid), j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    changeLayout({ ...layout, order: ids });
  };
  const toggleHidden = (pid: string) => changeLayout({ ...layout, hidden: hidden.has(pid) ? [...hidden].filter((x) => x !== pid) : [...hidden, pid] });

  async function saveView() {
    const current = views.find((v) => v.id === viewId);
    const name = window.prompt("Name this view", current?.name ?? "");
    if (!name || !name.trim()) return;
    try {
      const v = await client.saveDashboardView({ id: current && current.name === name.trim() ? current.id : undefined, name, dashboard: id, filters, layout, is_default: current?.is_default ?? false });
      setViews((all) => [...all.filter((x) => x.id !== v.id), v].sort((a, b) => a.name.localeCompare(b.name)));
      setViewId(v.id); setNotice(`Saved “${v.name}”.`);
    } catch (e) { setNotice((e as Error).message || "The view could not be saved."); }
  }
  async function makeDefault() {
    const v = views.find((x) => x.id === viewId);
    if (!v) return;
    try {
      const out = await client.saveDashboardView({ id: v.id, name: v.name, dashboard: v.dashboard, filters: v.filters, layout: v.layout, is_default: !v.is_default });
      setViews((all) => all.map((x) => (x.id === out.id ? out : out.is_default ? { ...x, is_default: false } : x)));
      setNotice(out.is_default ? `“${out.name}” opens by default.` : `“${out.name}” is no longer the default.`);
    } catch (e) { setNotice((e as Error).message || "The view could not be changed."); }
  }
  async function removeView() {
    const v = views.find((x) => x.id === viewId);
    if (!v || !window.confirm(`Delete the view “${v.name}”?`)) return;
    try {
      await client.deleteDashboardView(v.id);
      setViews((all) => all.filter((x) => x.id !== v.id)); setViewId(""); setNotice(`Deleted “${v.name}”.`);
    } catch (e) { setNotice((e as Error).message || "The view could not be deleted."); }
  }
  function applyView(vid: string) {
    setViewId(vid);
    const v = views.find((x) => x.id === vid);
    if (v) { setFilters({ days: 30, ...v.filters }); setLayout(v.layout ?? {}); }
  }

  if (problem && !catalog) return <section className="content"><h1 className="h">Dashboards</h1><div className="card"><div className="bd dash-empty">{problem}</div></div></section>;
  if (!catalog) return <section className="content"><div className="placeholder" role="status">Loading dashboards…</div></section>;
  if (catalog.dashboards.length === 0) {
    return (
      <section className="content">
        <div><div className="eyebrow">Dashboards</div><h1 className="h">Nothing to chart yet</h1></div>
        <div className="card"><div className="bd dash-empty">
          {catalog.access.scoped ? "You have not been given access to any dashboard on this deployment." : "A dashboard appears as soon as the application it reads is connected."}
          {catalog.not_connected.length > 0 && <ul className="connectlist">{catalog.not_connected.map((d) => <li key={d.id}><b>{d.title}</b> — connect {d.connect.join(" or ")}</li>)}</ul>}
          <div><button className="btn pri" onClick={() => go("apps")}>Open Connections</button></div>
        </div></div>
      </section>
    );
  }

  const entry = catalog.dashboards.find((d) => d.id === id);
  const projectName = filters.project ? catalog.projects.find((p) => p.id === filters.project)?.name ?? filters.project : "";
  const sample = dash?.sources.some((s) => s.basis === "sample");

  return (
    <section className="content dash">
      <div className="dash-head">
        <div>
          <div className="eyebrow">{projectName ? `Project · ${projectName}` : `Portfolio · ${catalog.projects.length} project${catalog.projects.length === 1 ? "" : "s"}`}</div>
          <h1 className="h">{entry?.title ?? "Dashboards"}</h1>
          {dash?.summary ? <p className="dash-sum">{dash.summary}</p> : entry ? <p className="dash-sum">{entry.about}</p> : null}
        </div>
        <div className="dash-tools">
          <button className="btn sm" onClick={() => ask(`Explain the ${entry?.title ?? "current"} dashboard: what stands out and what should I do first?`, true, `dashboard:${id}`)}>Ask Sidekick</button>
          <button className="btn sm" onClick={() => load(true)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      <div className="dash-tabs" role="tablist" aria-label="Dashboards">
        {catalog.dashboards.map((d) => (
          <button key={d.id} role="tab" aria-selected={d.id === id} onClick={() => pick(d.id)} title={d.about}>{d.title}</button>
        ))}
      </div>

      <form className="dash-filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
        <label>Project
          <select aria-label="Project" value={filters.project ?? ""} onChange={(e) => setF({ project: e.target.value })}>
            <option value="">All projects</option>
            {catalog.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Range
          <select aria-label="Range" value={String(filters.days ?? 30)} onChange={(e) => setF({ days: Number(e.target.value), since: undefined, until: undefined })}>
            {RANGES.map((d) => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </label>
        {(["product", "environment", "platform"] as const).map((k) => (dash?.facets[k]?.length || filters[k]) ? (
          <label key={k}>{k[0].toUpperCase() + k.slice(1)}
            <select aria-label={k[0].toUpperCase() + k.slice(1)} value={filters[k] ?? ""} onChange={(e) => setF({ [k]: e.target.value })}>
              <option value="">All</option>
              {[...new Set([...(dash?.facets[k] ?? []), ...(filters[k] ? [filters[k] as string] : [])])].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
        ) : null)}
        <span className="grow" />
        <label>View
          <select value={viewId} onChange={(e) => applyView(e.target.value)} aria-label="Saved view">
            <option value="">{views.length ? "Unsaved view" : "No saved views"}</option>
            {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.is_default ? " (default)" : ""}</option>)}
          </select>
        </label>
        <button type="button" className="btn sm" onClick={() => void saveView()}>Save view</button>
        {viewId && <button type="button" className="btn sm" onClick={() => void makeDefault()}>{views.find((v) => v.id === viewId)?.is_default ? "Unset default" : "Make default"}</button>}
        {viewId && <button type="button" className="btn sm" onClick={() => void removeView()}>Delete</button>}
        <button type="button" className="btn sm" aria-pressed={customize} onClick={() => setCustomize((c) => !c)}>{customize ? "Done" : "Customize"}</button>
      </form>
      <div className="sr" role="status" aria-live="polite">{notice}</div>
      {notice && <div className="dash-notice" aria-hidden="true">{notice}</div>}

      {!dash && !problem && <div className="dash-skeleton" role="status">Loading {entry?.title ?? "dashboard"}…</div>}
      {dash && (
        <div className="dash-sources" role="group" aria-label="Data sources">
          {dash.sources.map((s) => <SourceChip key={s.id} s={s} now={dash.generated_at} />)}
          {sample && <span className="pill mut"><span className="dot" />Example data</span>}
          {dash.advanced.map((a) => <a key={a.url} className="chiplink" href={a.url} target="_blank" rel="noreferrer noopener">{a.label} ↗</a>)}
        </div>
      )}
      {dash?.withheld.partial && <div className="dash-banner">{dash.withheld.detail}</div>}
      {problem && <div className="dash-banner bad" role="alert">{problem}</div>}
      {dash?.empty && <div className="card"><div className="bd dash-empty">{dash.empty}{dash.sources.filter((s) => s.remedy).map((s) => <div key={s.id} className="s">{s.label}: {s.remedy}</div>)}</div></div>}

      {dash && (
        <div className="dash-grid" aria-busy={loading}>
          {panels.filter((p) => customize || !hidden.has(p.id)).map((p, i) => (
            <PanelCard key={p.id} p={p} dash={dash} onDrill={openDrill} asTable={!!tables[p.id]} onTable={() => setTables((t) => ({ ...t, [p.id]: !t[p.id] }))}
              customize={customize} hidden={hidden.has(p.id)} onHide={() => toggleHidden(p.id)} onUp={i > 0 ? () => move(p.id, -1) : undefined}
              onDown={i < panels.length - 1 ? () => move(p.id, 1) : undefined} />
          ))}
        </div>
      )}
      {!customize && hidden.size > 0 && dash && <div className="demoflag">{hidden.size} panel{hidden.size === 1 ? "" : "s"} hidden in this view · <button className="linkish" onClick={() => setCustomize(true)}>Customize</button></div>}
      {catalog.not_connected.length > 0 && (
        <div className="demoflag">{catalog.not_connected.length} more dashboard{catalog.not_connected.length === 1 ? "" : "s"} appear when their applications are connected: {catalog.not_connected.map((d) => d.title).join(", ")}. <button className="linkish" onClick={() => go("apps")}>Open Connections</button></div>
      )}
      {!catalog.history.durable && <div className="demoflag">History is kept in memory on this deployment and starts again after a restart.</div>}

      {drill && dash && <DrillDrawer client={client} dashboard={dash} at={drill} filters={filters} onClose={() => setDrill(null)} go={go} ask={ask} />}
    </section>
  );
}

function SourceChip({ s, now }: { s: DashSource; now: number }) {
  const word = SRC_WORD[s.state];
  const fresh = s.state === "ok" || s.state === "stale" ? ago(now, s.observed_at) : "";
  return (
    <span className="srcchip" title={[s.detail, s.remedy].filter(Boolean).join(" — ") || `${s.records} record(s) read`}>
      <Pill tone={SRC_TONE[s.state] ?? "mut"}>{s.label}{word ? ` · ${word}` : ""}{fresh ? ` · read ${fresh}` : ""}</Pill>
    </span>
  );
}

function PanelCard({ p, dash, onDrill, asTable, onTable, customize, hidden, onHide, onUp, onDown }: {
  p: DashPanel; dash: Dashboard; onDrill: (key: string, label: string) => void; asTable: boolean; onTable: () => void;
  customize: boolean; hidden: boolean; onHide: () => void; onUp?: () => void; onDown?: () => void;
}) {
  const down = p.sources.map((sid) => dash.sources.find((s) => s.id === sid)).filter((s): s is DashSource => !!s && s.state !== "ok");
  const chartable = p.kind === "timeseries" || p.kind === "stacked";
  let body;
  if (p.empty) body = <div className="dash-empty">{p.empty}</div>;
  else if (p.kind === "stats") body = <div className="stats">{p.metrics.map((m) => <StatTile key={m.id} m={m} onDrill={onDrill} />)}</div>;
  else if (asTable && chartable) body = <SeriesTable x={p.x} series={p.series} />;
  else if (p.kind === "timeseries") body = <TimeSeries x={p.x} series={p.series} unit={p.unit} />;
  else if (p.kind === "stacked") body = <Stacked x={p.x} series={p.series} onDrill={onDrill} />;
  else if (p.kind === "bars") body = <Bars items={p.items} unit={p.unit} onDrill={onDrill} />;
  else if (p.kind === "funnel") body = <Funnel items={p.items} onDrill={onDrill} />;
  else if (p.kind === "matrix") body = <Matrix columns={p.columns} rows={p.rows as MatrixRow[]} onDrill={onDrill} />;
  else body = <DataTable columns={p.columns} rows={p.rows as DashRow[]} onDrill={onDrill} />;
  return (
    <div className={`card panel span${p.span} ${hidden ? "is-hidden" : ""}`} data-panel={p.id}>
      <div className="hd">
        <h2 className="ptitle">{p.title}</h2>
        {down.map((s) => <Pill key={s.id} tone={SRC_TONE[s.state] ?? "mut"}>{s.label} {SRC_WORD[s.state]}</Pill>)}
        <span className="grow" />
        {chartable && !p.empty && !customize && <button className="btn sm" aria-pressed={asTable} onClick={onTable}>{asTable ? "Chart" : "Table"}</button>}
        {customize && (
          <span className="ptools">
            <button className="btn sm" onClick={onUp} disabled={!onUp} aria-label={`Move ${p.title} earlier`}>↑</button>
            <button className="btn sm" onClick={onDown} disabled={!onDown} aria-label={`Move ${p.title} later`}>↓</button>
            <button className="btn sm" onClick={onHide}>{hidden ? "Show" : "Hide"}</button>
          </span>
        )}
      </div>
      <div className="bd">{body}{p.note && <p className="pnote">{p.note}</p>}</div>
    </div>
  );
}

function DrillDrawer({ client, dashboard, at, filters, onClose, go, ask }: {
  client: DataClient; dashboard: Dashboard; at: { key: string; label: string }; filters: DashFilters; onClose: () => void;
  go: (s: Section, item?: string) => void; ask: (text: string, send: boolean, objectRef?: string) => void;
}) {
  const [data, setData] = useState<DashDrill | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    setData(null); setErr(""); setMsg("");
    client.getDashboardDrill(dashboard.id, at.key, filters).then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setErr(classifyConnectionError(e).kind === "unavailable" ? "The runtime is not answering." : (e as Error).message || "These records could not be read."); });
    return () => { live = false; };
  }, [client, dashboard.id, at.key, filters]);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(a: DashAction) {
    if (a.kind === "sidekick") { ask(a.prompt ?? "", a.send !== false, a.ref); return; }
    if (a.kind === "navigate") { go((a.section ?? "today") as Section); return; }
    setBusy(a.label); setMsg("");
    try {
      if (a.kind === "track") { await client.trackDashboardFinding(dashboard.id, at.key, filters); setMsg("Added to your intake in Today. Nothing was sent or changed."); }
      else if (a.kind === "product") {
        if (!window.confirm(a.confirm ?? `${a.label}?`)) return;
        await client.runDashboardAction(a);
        setMsg(`${a.label}: requested. It appears in Today and Missions as the product records it.`);
      }
    } catch (e) {
      const p = classifyConnectionError(e);
      setMsg(p.kind === "unauthenticated" ? "This is a person's decision: sign in to Projects with an account the product knows, then try again." : (e as Error).message || p.title);
    } finally { setBusy(""); }
  }

  const cols = data?.columns ?? [];
  return (
    <>
      <div className="backdrop open" onClick={onClose} />
      <aside className="drill" role="dialog" aria-modal="true" aria-label={`Records: ${data?.title ?? at.label}`}>
        <div className="hd">
          <div><div className="eyebrow">{dashboard.title} · records</div><h2 className="ptitle">{data?.title ?? at.label}</h2></div>
          <button ref={closeRef} className="x" onClick={onClose} aria-label="Close records">✕</button>
        </div>
        <div className="body">
          {err && <div className="dash-banner bad" role="alert">{err}</div>}
          {!data && !err && <div className="placeholder" role="status">Loading records…</div>}
          {data && (
            <>
              <p className="dsum"><b className="tnum">{data.total}</b> record{data.total === 1 ? "" : "s"}{data.truncated ? ` (showing the latest ${data.records.length})` : ""}. {data.note}</p>
              <div className="dash-sources" role="group" aria-label="Sources of these records">{data.sources.map((s) => <SourceChip key={s.id} s={s} now={data.generated_at} />)}</div>
              <div className="dactions">
                {data.actions.map((a) => <button key={a.label} className={`btn sm ${a.kind === "product" ? "pri" : ""}`} disabled={!!busy} title={a.detail ?? ""} onClick={() => void run(a)}>{busy === a.label ? "Working…" : a.label}</button>)}
              </div>
              <div role="status" aria-live="polite" className={msg ? "dash-notice" : "sr"}>{msg}</div>
              {data.records.length === 0 ? <div className="dash-empty">No record is behind this number.</div> : (
                <div className="tablewrap" tabIndex={0} role="region" aria-label="Records, scrolls sideways">
                  <table className="dtable">
                    <thead><tr><th scope="col">Record</th><th scope="col">Status</th>{cols.map((c) => <th key={c} scope="col">{c.replace(/_/g, " ")}</th>)}<th scope="col">When</th><th scope="col">Source</th><th scope="col"><span className="sr">Open</span></th></tr></thead>
                    <tbody>
                      {data.records.map((r) => (
                        <tr key={`${r.source}:${r.id}`}>
                          <td>{r.title || r.id}</td>
                          <td>{r.status.replace(/_/g, " ").toLowerCase() || "—"}</td>
                          {cols.map((c) => { const v = r.fields[c]; return <td key={c}>{v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? fmt(v) : String(v)}</td>; })}
                          <td className="tnum">{when(r.at)}</td>
                          <td className="mono ref">{r.ref}</td>
                          <td className="r">{r.url ? <a href={r.url} target="_blank" rel="noreferrer noopener" aria-label={`Open ${r.title || r.id} in its application`}>Open ↗</a> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
