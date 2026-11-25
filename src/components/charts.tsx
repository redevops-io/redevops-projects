// Dependency-free chart primitives for the dashboards (plain SVG + HTML, themed by the existing status tokens).
// Colour is never the only carrier: every series has a legend label, every status cell a glyph and a word, and every
// chart can be read as a table. A null value is drawn as a gap or "Not known", never as zero.
import { useState, type ReactNode } from "react";
import type { DashColumn, DashItem, DashMetric, DashRow, DashSeries, MatrixRow } from "../data/dashboards";
import type { Health } from "../data/types";

const TONE_VAR: Record<string, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", run: "var(--run)", mut: "var(--line-2)" };
const CURRENCY = /^[A-Z]{3}$/;

// A link taken from another system's data is opened only if it is plain http(s); the runtime drops the rest too.
export function safeHref(url: string | undefined | null): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function fmt(v: number | null | undefined, unit = ""): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const n = abs >= 1e6 ? `${(v / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M` : abs >= 1e4 ? `${(v / 1e3).toFixed(abs >= 1e5 ? 0 : 1)}k`
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: abs < 10 && !Number.isInteger(v) ? 2 : 1 }).format(v);
  if (unit === "%") return `${n}%`;
  if (CURRENCY.test(unit)) return `${unit} ${n}`;
  return unit ? `${n} ${unit}` : n;
}

/** The exact value, for a table: a tile may say "31.3k", the table behind it says 31,287. A table is where a number is checked. */
export function exact(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
}

const UNKNOWN: Record<string, string> = {
  source_unavailable: "The source is not answering", unauthorized: "You do not have access to this", not_connected: "Not connected",
  no_data: "No data in this range", no_traceability: "No traceability yet",
};

export function Sparkline({ points, tone = "run" }: { points: [string, number | null][]; tone?: Health }) {
  const vals = points.map((p) => p[1]).filter((v): v is number => v !== null);
  if (vals.length < 2) return null;
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1, w = 96, h = 26;
  let d = "", pen = false;
  points.forEach(([, v], i) => {
    if (v === null) { pen = false; return; }
    const x = (i / (points.length - 1)) * (w - 4) + 2, y = h - 3 - ((v - lo) / span) * (h - 6);
    d += `${pen ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`; pen = true;
  });
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img"
      aria-label={`Trend over ${points.length} days, from ${fmt(vals[0])} to ${fmt(vals[vals.length - 1])}`}>
      <path d={d} fill="none" stroke={TONE_VAR[tone] ?? TONE_VAR.run} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function StatTile({ m, onDrill }: { m: DashMetric; onDrill?: (key: string, label: string) => void }) {
  const known = m.value !== null;
  const better = m.delta === null || !m.good || m.delta === 0 ? "" : (m.delta > 0) === (m.good === "up") ? "ok" : "bad";
  const body = (
    <>
      <span className="lbl">{m.label}</span>
      <span className={`val tnum ${known ? "" : "unk"}`}>{known ? fmt(m.value, m.unit) : "Not known"}</span>
      {known && m.tone !== "mut" && <span className={`state ${m.tone}`}><i aria-hidden="true" />{m.tone === "ok" ? "On track" : m.tone === "warn" ? "Watch" : m.tone === "bad" ? "Needs action" : "Active"}</span>}
      <span className="note">{known ? m.note : (UNKNOWN[m.unknown] ?? "Not known") + (m.note ? ` — ${m.note}` : "")}</span>
      {m.trend.length > 1 && (
        <span className="trend"><Sparkline points={m.trend} tone={better === "bad" ? "bad" : better === "ok" ? "ok" : "run"} />
          {m.delta !== null && <span className={`delta tnum ${better}`}>{m.delta > 0 ? "+" : ""}{fmt(m.delta, m.unit === "%" ? "pt" : "")} over {m.trend.length} d</span>}</span>
      )}
    </>
  );
  return m.drill && known && onDrill
    ? <button className="stat" onClick={() => onDrill(m.drill, m.label)} aria-label={`${m.label}: ${fmt(m.value, m.unit)}. Show the records`}>{body}</button>
    : <div className="stat">{body}</div>;
}

export function Legend({ series }: { series: { label: string; tone: Health }[] }) {
  if (series.length < 2) return null;
  return <div className="legend">{series.map((s) => <span key={s.label}><i style={{ background: TONE_VAR[s.tone] }} aria-hidden="true" />{s.label}</span>)}</div>;
}

// Stacked columns over time (one or more series on ONE axis). Hover or focus a column for the exact figures.
export function TimeSeries({ x, series, unit }: { x: string[]; series: DashSeries[]; unit: string }) {
  const [at, setAt] = useState<number | null>(null);
  const totals = x.map((_, i) => series.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals), W = 640, H = 170, padL = 4, padB = 18, colW = (W - padL) / Math.max(1, x.length);
  const barW = Math.max(2, Math.min(26, colW - 2));
  const ticks = x.length <= 8 ? x.map((_, i) => i) : [0, Math.floor(x.length / 3), Math.floor((2 * x.length) / 3), x.length - 1];
  const short = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : s);
  const i = at ?? x.length - 1;
  return (
    <div className="chart">
      <div className="readout tnum" aria-live="off">
        <b>{x[i]}</b>{series.map((s) => <span key={s.id}> · {s.label} {fmt(s.values[i], unit === "results" || unit === "cases" || unit === "missions" || unit === "posts" || unit === "conversations" ? "" : unit)}</span>)}
        <span className="mx"> · peak {fmt(max, "")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${series.map((s) => s.label).join(", ")} per period, ${x.length} periods`} preserveAspectRatio="none" onMouseLeave={() => setAt(null)}>
        <line x1="0" x2={W} y1={H - padB} y2={H - padB} stroke="var(--line-2)" strokeWidth="1" />
        {x.map((label, c) => {
          let y = H - padB;
          const cx = padL + c * colW + (colW - barW) / 2;
          return (
            <g key={label} onMouseEnter={() => setAt(c)}>
              <rect x={padL + c * colW} y="0" width={colW} height={H - padB} fill={at === c ? "var(--panel-2)" : "transparent"} />
              {series.map((s) => {
                const v = s.values[c] ?? 0;
                if (!v) return null;
                const h = Math.max(2, (v / max) * (H - padB - 6));
                y -= h;
                return <rect key={s.id} x={cx} y={y + 1} width={barW} height={Math.max(1, h - 1)} rx="2" fill={TONE_VAR[s.tone]} />;
              })}
            </g>
          );
        })}
        {ticks.map((t) => <text key={t} x={padL + t * colW + colW / 2} y={H - 4} textAnchor={t === 0 ? "start" : t === x.length - 1 ? "end" : "middle"} fontSize="11" fill="var(--muted)">{short(x[t])}</text>)}
      </svg>
      <Legend series={series} />
    </div>
  );
}

export function Bars({ items, unit, onDrill }: { items: DashItem[]; unit: string; onDrill?: (key: string, label: string) => void }) {
  const max = Math.max(1, ...items.map((i) => i.value ?? 0));
  return (
    <div className="hbars">
      {items.map((it) => {
        const inner = (
          <>
            <span className="l">{it.label}{it.note ? <small> · {it.note}</small> : null}</span>
            <span className="t"><i style={{ width: `${it.value === null ? 0 : Math.max(1.5, (it.value / max) * 100)}%`, background: TONE_VAR[it.tone] }} /></span>
            <span className="v tnum">{it.value === null ? "Not known" : fmt(it.value, unit === "visitors" ? "" : unit)}</span>
          </>
        );
        return it.drill && onDrill && it.value !== null
          ? <button key={it.label} className="hbar" onClick={() => onDrill(it.drill!, it.label)} aria-label={`${it.label}: ${fmt(it.value, unit)}. Show the records`}>{inner}</button>
          : <div key={it.label} className="hbar">{inner}</div>;
      })}
    </div>
  );
}

export function Funnel({ items, onDrill }: { items: DashItem[]; onDrill?: (key: string, label: string) => void }) {
  return <Bars items={items.map((it, i) => ({ ...it, note: i > 0 && items[i - 1].value && it.value !== null ? `${Math.round((it.value / (items[i - 1].value as number)) * 100)}% of ${items[i - 1].label.toLowerCase()}${it.note ? ` · ${it.note}` : ""}` : it.note }))} unit="" onDrill={onDrill} />;
}

// One horizontal bar per category, split by series. Segments are buttons when records sit behind them.
export function Stacked({ x, series, onDrill }: { x: string[]; series: DashSeries[]; onDrill?: (key: string, label: string) => void }) {
  return (
    <div className="stacked">
      {x.map((cat, c) => {
        const total = series.reduce((s, r) => s + (r.values[c] ?? 0), 0);
        return (
          <div className="srow" key={cat}>
            <div className="l">{cat}<small className="tnum"> · {total}</small></div>
            <div className="segs" role="group" aria-label={cat}>
              {series.map((s) => {
                const v = s.values[c] ?? 0;
                if (!v) return null;
                const key = s.drills?.[c];
                const style = { flexGrow: v, background: TONE_VAR[s.tone] };
                const text = `${s.label}: ${v}`;
                return key && onDrill
                  ? <button key={s.id} className={`seg ${s.tone}`} style={style} title={text} aria-label={`${cat}, ${text}. Show the records`} onClick={() => onDrill(key, `${cat} · ${s.label}`)}><span>{v}</span></button>
                  : <span key={s.id} className={`seg ${s.tone}`} style={style} title={text}><span>{v}</span></span>;
              })}
            </div>
          </div>
        );
      })}
      <Legend series={series} />
    </div>
  );
}

const GLYPH: Record<string, [string, string]> = {
  passed: ["✓", "Passed"], failed: ["✕", "Failed"], blocked: ["!", "Blocked"], unexecuted: ["○", "Not executed"], unsupported: ["–", "Unsupported"], none: ["", "Not planned"],
};

export function Matrix({ columns, rows, onDrill }: { columns: DashColumn[]; rows: MatrixRow[]; onDrill?: (key: string, label: string) => void }) {
  return (
    <div className="tablewrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
      <table className="matrix">
        <thead><tr><th scope="col">Suite</th>{columns.map((c) => <th key={c.id} scope="col">{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.cells.map((cell, i) => {
                const [glyph, word] = GLYPH[cell.status] ?? ["", cell.status];
                const inner = <><span className="g" aria-hidden="true">{glyph}</span><span className="tnum">{cell.label}</span><span className="sr"> {word}</span></>;
                return (
                  <td key={columns[i]?.id ?? i} className={`mc ${cell.status}`} title={`${word}${cell.label ? ` · ${cell.label} passed` : ""}`}>
                    {cell.drill && onDrill ? <button onClick={() => onDrill(cell.drill, `${r.label} · ${columns[i]?.label}`)}>{inner}</button> : cell.status === "none" ? <span className="sr">Not planned</span> : inner}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="legend">{Object.entries(GLYPH).filter(([k]) => k !== "none").map(([k, [g, w]]) => <span key={k}><i className={`mc ${k}`} aria-hidden="true">{g}</i>{w}</span>)}</div>
    </div>
  );
}

export function DataTable({ columns, rows, onDrill }: { columns: DashColumn[]; rows: DashRow[]; onDrill?: (key: string, label: string) => void }) {
  const cell = (v: string | number | null | undefined): ReactNode => (v === null || v === undefined || v === "" ? <span className="nk">—</span> : typeof v === "number" ? exact(v) : v);
  return (
    <div className="tablewrap" tabIndex={0} role="region" aria-label="Table, scrolls sideways">
      <table className="dtable">
        <thead><tr>{columns.map((c) => <th key={c.id} scope="col" className={c.align === "right" ? "r" : ""}>{c.label}</th>)}<th scope="col"><span className="sr">Open</span></th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={r.tone || ""}>
              {columns.map((c, j) => (
                <td key={c.id} className={`${c.align === "right" ? "r tnum" : ""}`}>
                  {j === 0 && r.tone ? <i className={`rowdot ${r.tone}`} aria-hidden="true" /> : null}
                  {j === 0 && r.drill && onDrill ? <button className="linkish" onClick={() => onDrill(r.drill!, String(r.cells[c.id] ?? ""))}>{cell(r.cells[c.id])}</button> : cell(r.cells[c.id])}
                </td>
              ))}
              <td className="r">{safeHref(r.url) ? <a href={safeHref(r.url)} target="_blank" rel="noreferrer noopener" aria-label={`Open ${String(r.cells[columns[0].id] ?? "record")} in its application`}>Open ↗</a> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The same numbers as a table, for any chart panel.
export function SeriesTable({ x, series }: { x: string[]; series: DashSeries[] }) {
  return (
    <div className="tablewrap tall" tabIndex={0} role="region" aria-label="Table, scrolls">
      <table className="dtable">
        <thead><tr><th scope="col">Period</th>{series.map((s) => <th key={s.id} scope="col" className="r">{s.label}</th>)}</tr></thead>
        <tbody>{x.map((label, i) => <tr key={label}><td>{label}</td>{series.map((s) => <td key={s.id} className="r tnum">{exact(s.values[i])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
