import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import { Pill } from "../components/Pill";
import type { EvidenceItem, MissionDetail, MissionState, MissionSummary } from "../data/types";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

type Filter = "all" | MissionState;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "needs", label: "Needs attention" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
  { id: "failed", label: "Failed" },
];

const STATE_PILL: Record<MissionState, { tone: "warn" | "run" | "ok" | "bad" | "mut"; label: string }> = {
  needs: { tone: "warn", label: "Waiting approval" },
  running: { tone: "run", label: "Running" },
  completed: { tone: "ok", label: "Completed" },
  failed: { tone: "bad", label: "Failed" },
  scheduled: { tone: "mut", label: "Scheduled" },
};

const DETAIL_TABS = ["Summary", "Tasks", "Evidence", "Timeline", "Graph", "World State", "EXPLAIN", "Replay"];

interface Step { label: string; mark: "done" | "now" | "todo"; pill?: string; }

// Illustrative traces per mission. #4821 gets the full refund trace; others a generic done trace.
function traceFor(m: MissionSummary): Step[] {
  if (m.id === "4821") {
    return [
      { label: "WhatsApp message received", mark: "done" },
      { label: "HubSpot customer identified", mark: "done" },
      { label: "Stripe charge found", mark: "done" },
      { label: "Refund approval", mark: "now", pill: "tier 4" },
      { label: "Execute refund", mark: "todo" },
      { label: "Verify refund", mark: "todo" },
      { label: "Reply to customer", mark: "todo" },
    ];
  }
  return [
    { label: "Started", mark: "done" },
    { label: "Executed steps", mark: "done" },
    { label: "Completed", mark: "done" },
  ];
}

export function Missions({ client }: { client: DataClient; go: (s: Section) => void }) {
  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [detail, setDetail] = useState<MissionDetail | null>(null);

  useEffect(() => {
    client.getMissions("customer-ops").then(setMissions);
  }, [client]);

  useEffect(() => {
    if (selectedId) client.getMissionDetail("customer-ops", selectedId).then(setDetail);
    else setDetail(null);
  }, [client, selectedId]);

  // The provider-UI activation gate: a human flips the sequence on in the provider, and the
  // Mission resumes — observe → verify → sent. (Mirrors resume_outreach.)
  function activateSequence() {
    setDetail((d) => d && ({
      ...d,
      steps: d.steps.map((s) =>
        s.capability === "outreach.sequence.activate" ? { ...s, status: "done", why: "activated by a human in the provider UI" }
        : s.capability === "outreach.observe" ? { ...s, status: "done", why: "status=active → sent through the warmed mailbox" }
        : s.capability === "verify.delivery" ? { ...s, status: "done", why: "delivered · ExecutionReceipt issued" }
        : s),
    }));
  }

  if (!missions) {
    return (
      <section className="content"><div className="placeholder">Loading…</div></section>
    );
  }

  const selected = selectedId ? missions.find((m) => m.id === selectedId) ?? null : null;

  if (selected) {
    const steps = traceFor(selected);
    return (
      <section className="content">
        <div>
          <button className="btn sm" onClick={() => { setSelectedId(null); setConfirm(null); }}>← Back to missions</button>
        </div>
        <div>
          <div className="eyebrow">{selected.workflow}</div>
          <h1 className="h">{selected.title}</h1>
        </div>

        <div className="tabsrow">
          {DETAIL_TABS.map((t, i) => (
            <button key={t} aria-selected={i === activeTab} onClick={() => setActiveTab(i)}>{t}</button>
          ))}
        </div>

        <div className="card">
          <div className="hd"><span className="eyebrow">Step trace</span>
            <span style={{ marginLeft: "auto" }}><Pill tone={STATE_PILL[selected.state].tone}>{STATE_PILL[selected.state].label}</Pill></span></div>
          <div className="bd">
            <ul className="steps-trace">
              {steps.map((s, i) => (
                <li key={i}>
                  <span className={`mk ${s.mark}`}>{s.mark === "done" ? "✓" : s.mark === "now" ? "●" : "○"}</span>
                  <span className="grow">{s.label}</span>
                  {s.pill ? <Pill tone="warn">{s.pill}</Pill> : null}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {detail && detail.steps.length ? (
          <div className="card">
            <div className="hd"><span className="eyebrow">Actions · what ran and why</span></div>
            <div className="bd">
              <ul className="steps-trace">
                {detail.steps.map((s) => (
                  <li key={s.n} style={{ alignItems: "flex-start" }}>
                    <span className={`mk ${s.status === "done" ? "done" : s.status === "waiting" ? "now" : "todo"}`}>
                      {s.status === "done" ? "✓" : s.status === "waiting" ? "●" : "○"}</span>
                    <span className="grow">
                      <span className="mono">{s.capability}</span> → {s.provider}
                      <div className="s">{s.why}</div>
                    </span>
                    {s.status === "waiting" && s.capability === "outreach.sequence.activate"
                      ? <button className="btn sm pri" onClick={activateSequence}>Activate in provider UI</button>
                      : s.tier >= 4 ? <Pill tone="warn">tier {s.tier}</Pill> : null}
                  </li>
                ))}
              </ul>
              <div className="s" style={{ marginTop: 6 }}>Available: see <b>Apps</b>. Used above; the “why” is the EXPLAIN.</div>
            </div>
          </div>
        ) : null}

        {detail && detail.context_used.length ? (
          <div className="card">
            <div className="hd"><span className="eyebrow">Context used · evidence &amp; why</span></div>
            <div className="bd">
              {detail.context_used.map((e: EvidenceItem) => (
                <div className="row" key={e.source_id} style={{ alignItems: "flex-start" }}>
                  <div className="grow">
                    <div className="t">{e.source_name} <span className="s">· {e.provider}</span></div>
                    <div className="s">
                      {e.evidence_kind === "query" && e.retrieved
                        ? `${e.retrieved.count} records retrieved · observed ${fmtTime(e.retrieved.observed_at)}`
                        : e.identity
                        ? `${e.refs[0]?.summary ?? "file"}${e.identity.version ? " · " + e.identity.version : ""}${e.identity.fingerprint ? " · " + e.identity.fingerprint : ""}`
                        : "evidence"}
                    </div>
                    <div className="s" style={{ marginTop: 4, opacity: 0.85 }}>Why: {e.why}</div>
                    {e.preview ? (
                      <img src={e.preview} alt={e.source_name}
                        style={{ marginTop: 10, maxWidth: 360, width: "100%", borderRadius: 10, border: "1px solid var(--line)" }} />
                    ) : null}
                  </div>
                  <Pill tone={e.evidence_kind === "query" ? "run" : "mut"}>{e.evidence_kind}</Pill>
                  <button className="btn sm">Inspect</button>
                </div>
              ))}
              <div className="s" style={{ marginTop: 8 }}>{detail.context_plan_note}</div>
              <div className="s" style={{ marginTop: 4 }}>Available: see <b>Sources</b>. Used above; the “why” is the Context Plan.</div>
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="hd"><span className="eyebrow">Actions</span></div>
          <div className="bd">
            <div className="row">
              <button className="btn pri sm" onClick={() => setConfirm("Approved — the refund will execute under a GovernedEnvelope.")}>Approve</button>
              <button className="btn sm" onClick={() => setConfirm("Rejected — no money moves; the customer is notified.")}>Reject</button>
              <button className="btn sm" onClick={() => setConfirm("Ask Sidekick: why does this need approval?")}>Ask Sidekick</button>
            </div>
            {confirm ? <div className="s" style={{ marginTop: 8 }}>{confirm}</div> : null}
          </div>
        </div>

        <div className="demoflag">Human-readable first; Runtime inspection one click deeper.</div>
      </section>
    );
  }

  const shown = filter === "all" ? missions : missions.filter((m) => m.state === filter);

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Missions</div>
        <h1 className="h">Everything running, waiting, and scheduled</h1>
      </div>

      <div className="tabsrow">
        {FILTERS.map((f) => (
          <button key={f.id} aria-selected={f.id === filter} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="hd"><span className="eyebrow">{FILTERS.find((f) => f.id === filter)!.label}</span>
          <span className="eyebrow" style={{ marginLeft: "auto" }}>{shown.length}</span></div>
        <div className="bd">
          {shown.length === 0 ? <div className="placeholder">No missions in this state.</div> : shown.map((m) => (
            <div className="row" key={m.id} onClick={() => { setSelectedId(m.id); setActiveTab(0); setConfirm(null); }} style={{ cursor: "pointer" }}>
              <div className="grow"><div className="t">{m.title}</div><div className="s">{m.workflow}</div></div>
              <div className="colw">{m.progress}</div>
              <Pill tone={STATE_PILL[m.state].tone}>{STATE_PILL[m.state].label}</Pill>
            </div>
          ))}
        </div>
      </div>

      <div className="demoflag">Human-readable first; Runtime inspection one click deeper.</div>
    </section>
  );
}
