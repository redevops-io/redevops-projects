import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import { Pill } from "../components/Pill";
import type { WorkflowSummary, WorkflowState } from "../data/types";

const STATE_PILL: Record<WorkflowState, { tone: "run" | "mut"; label: string }> = {
  active: { tone: "run", label: "Active" },
  scheduled: { tone: "run", label: "Scheduled" },
  paused: { tone: "mut", label: "Paused" },
};

const DETAIL_TABS = ["Overview", "Steps", "Apps", "Sources", "Policy", "Schedule", "Runs"] as const;

// A logical step list rendered as a flowline of nodes joined by arrows. The nodes are the
// logical intent; the Mission plan resolves them to physical providers at run time.
function Flowline({ steps }: { steps: string[] }) {
  return (
    <div className="flowline">
      {steps.map((s, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="n">{s}</span>
          {i < steps.length - 1 ? <span className="ar">→</span> : null}
        </span>
      ))}
    </div>
  );
}

const RECENT_RUNS: { id: string; note: string; tone: "warn" | "ok"; label: string }[] = [
  { id: "#4821", note: "Refund Sarah Chen · $129", tone: "warn", label: "Waiting approval" },
  { id: "#4818", note: "Refund Marcus Lee · $54", tone: "ok", label: "Completed" },
  { id: "#4805", note: "Refund Dana Okafor · $312", tone: "ok", label: "Completed" },
];

const APP_PILLS: { name: string; tone: "ok" | "run" }[] = [
  { name: "WhatsApp", tone: "run" },
  { name: "HubSpot", tone: "ok" },
  { name: "Slack", tone: "ok" },
  { name: "Polar", tone: "ok" },
];

// Evidence this pattern reads (doc §15). apps = actions · sources = evidence.
const SOURCE_PILLS: { name: string; tone: "ok" | "warn" }[] = [
  { name: "Customer policy docs", tone: "ok" },
  { name: "HubSpot customer history", tone: "ok" },
  { name: "Support Postgres", tone: "ok" },
];

export function Workflows({ client }: { client: DataClient; go: (s: Section) => void }) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof DETAIL_TABS)[number]>("Overview");

  useEffect(() => {
    client.getWorkflows("customer-ops").then(setWorkflows);
  }, [client]);

  if (!workflows) {
    return <section className="content"><div className="placeholder">Loading…</div></section>;
  }

  const selected = selectedId ? workflows.find((w) => w.id === selectedId) ?? null : null;

  if (selected) {
    const isRefund = selected.id === "refund";
    return (
      <section className="content">
        <div>
          <button className="btn sm" onClick={() => { setSelectedId(null); setTab("Overview"); }}>← Workflows</button>
        </div>
        <div>
          <div className="eyebrow">Workflow</div>
          <h1 className="h">{selected.name}</h1>
        </div>

        <div className="tabsrow">
          {DETAIL_TABS.map((t) => (
            <button key={t} aria-selected={t === tab} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        {tab === "Overview" && (
          <div className="card">
            <div className="hd"><span className="eyebrow">What this pattern does</span></div>
            <div className="bd">
              <p className="s">
                This is a reusable operating pattern — a logical sequence of intents. The planner
                resolves each step to physical providers when a Mission runs it, so the pattern
                stays stable while the Runtime chooses execution.
              </p>
              <Flowline steps={selected.steps} />
              <div className="s" style={{ marginTop: 8 }}>
                Logical intent above; the Mission plan resolves it physically — see a Mission's Graph / EXPLAIN.
              </div>
            </div>
          </div>
        )}

        {tab === "Steps" && (
          <div className="card">
            <div className="hd"><span className="eyebrow">Steps</span></div>
            <div className="bd">
              <ul className="steps-trace">
                {selected.steps.map((s, i) => (
                  <li key={i}>
                    <span className="mk done">✓</span>
                    <span className="grow">{s}</span>
                  </li>
                ))}
              </ul>
              {isRefund && (
                <div className="kv">
                  <span className="k">capability</span><span className="mono">billing.refund.execute</span>
                  <span className="k">provider</span><span>Stripe</span>
                  <span className="k">authority</span><span>tier 4 · approval required</span>
                  <span className="k">verification</span><span>re-read the refund after execution</span>
                  <span className="k">retry policy</span><span>none — money-moving step, fail closed</span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "Apps" && (
          <div className="card">
            <div className="hd"><span className="eyebrow">Apps this workflow recruits</span></div>
            <div className="bd">
              <div className="row" style={{ flexWrap: "wrap" }}>
                {APP_PILLS.map((a) => <Pill key={a.name} tone={a.tone}>{a.name}</Pill>)}
              </div>
              <div className="s" style={{ marginTop: 8 }}>Illustrative — the planner recruits providers by capability.</div>
            </div>
          </div>
        )}

        {tab === "Sources" && (
          <div className="card">
            <div className="hd"><span className="eyebrow">Evidence this workflow reads</span></div>
            <div className="bd">
              <div className="row" style={{ flexWrap: "wrap" }}>
                {SOURCE_PILLS.map((s) => <Pill key={s.name} tone={s.tone}>{s.name}</Pill>)}
              </div>
              <div className="s" style={{ marginTop: 8 }}>
                Apps are the actions this pattern can take; sources are the evidence it may read. Both are governed separately.
              </div>
            </div>
          </div>
        )}

        {tab === "Policy" && (
          <div className="card">
            <div className="hd"><span className="eyebrow">Policy</span></div>
            <div className="bd">
              <div className="kv">
                <span className="k">refund</span><span>approval required below $500, two approvers above</span>
                <span className="k">sending</span><span>test mode</span>
                <span className="k">bounds</span><span>1 refund / customer / 24h</span>
              </div>
              <button className="btn sm" onClick={() => { /* no-op demo */ }}>Change with Sidekick</button>
            </div>
          </div>
        )}

        {tab === "Schedule" && (
          <div className="card">
            <div className="hd"><span className="eyebrow">Schedule</span></div>
            <div className="bd">
              <div className="s">{selected.cadence}</div>
            </div>
          </div>
        )}

        {tab === "Runs" && (
          <div className="card">
            <div className="hd"><span className="eyebrow">Recent runs</span></div>
            <div className="bd">
              {RECENT_RUNS.map((r) => (
                <div className="row" key={r.id}>
                  <div className="grow"><div className="t">{r.id}</div><div className="s">{r.note}</div></div>
                  <Pill tone={r.tone}>{r.label}</Pill>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="demoflag">
          WorkflowDefinition → Mission → Mission Plan: the logical pattern stays stable while the Runtime chooses execution.
        </div>
      </section>
    );
  }

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Reusable operating patterns</div>
        <h1 className="h">Workflows</h1>
      </div>

      <div className="card">
        <div className="hd"><span className="eyebrow">Patterns</span>
          <span className="eyebrow" style={{ marginLeft: "auto" }}>{workflows.length}</span></div>
        <div className="bd">
          {workflows.map((w) => {
            const sp = STATE_PILL[w.state];
            return (
              <div className="row" key={w.id}>
                <div className="grow">
                  <div className="t">{w.name}</div>
                  <Flowline steps={w.steps} />
                  <div className="s">{w.runsNote}</div>
                </div>
                <Pill tone={sp.tone}>{sp.label}</Pill>
                <button className="btn sm pri" onClick={() => { setSelectedId(w.id); setTab("Overview"); }}>Open</button>
                <button className="btn sm">{w.state === "paused" ? "Run now" : "Pause"}</button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="demoflag">
        WorkflowDefinition → Mission → Mission Plan: the logical pattern stays stable while the Runtime chooses execution.
      </div>
    </section>
  );
}
