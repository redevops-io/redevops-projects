import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import { Pill } from "../components/Pill";
import type { DiscoveryFinding } from "../data/types";

const TABS = ["Findings", "Evidence", "Sources", "Changes", "History"] as const;
type Tab = (typeof TABS)[number];

// Source systems that feed Discovery — shown as Pills under the Sources tab.
const SOURCES: { label: string; tone: "ok" | "run" | "warn" | "mut" }[] = [
  { label: "Stripe", tone: "ok" },
  { label: "HubSpot", tone: "ok" },
  { label: "Slack", tone: "ok" },
  { label: "WhatsApp", tone: "warn" },
  { label: "Context Runtime", tone: "run" },
];

export function Discovery({ client, go }: { client: DataClient; go: (s: Section) => void }) {
  const [findings, setFindings] = useState<DiscoveryFinding[] | null>(null);
  const [tab, setTab] = useState<Tab>("Findings");

  useEffect(() => {
    client.getDiscovery("customer-ops").then(setFindings);
  }, [client]);

  if (!findings) {
    return (
      <section className="content"><div className="placeholder">Loading…</div></section>
    );
  }

  return (
    <section className="content">
      <div>
        <div className="eyebrow">What the system found, changed, inferred or flagged</div>
        <h1 className="h">Discovery</h1>
      </div>

      <div className="tabsrow">
        {TABS.map((t) => (
          <button key={t} aria-selected={t === tab} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Findings" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Findings</span>
            <span className="eyebrow" style={{ marginLeft: "auto" }}>{findings.length}</span></div>
          <div className="bd">
            {findings.map((f) => (
              <div className="finding" key={f.id}>
                <div className="row" style={{ padding: 0, border: 0 }}>
                  <div className="grow"><span className="t">{f.title}</span></div>
                  {f.needsReview
                    ? <Pill tone="warn">Needs review</Pill>
                    : <Pill tone="mut">Noted</Pill>}
                </div>
                <div className="s">
                  {f.detail}{f.confidence ? ` · Confidence: ${f.confidence}` : ""}
                </div>
                <div className="links">
                  {f.affects.workflows.map((w) => (
                    <span className="chiplink" key={`wf-${w}`} onClick={() => go("workflows")}>Workflow: {w}</span>
                  ))}
                  {f.affects.missions.map((m) => (
                    <span className="chiplink" key={`ms-${m}`} onClick={() => go("missions")}>Mission #{m}</span>
                  ))}
                  {f.affects.scheduled > 0 ? (
                    <span className="chiplink" onClick={() => go("missions")}>Scheduled Missions ({f.affects.scheduled})</span>
                  ) : null}
                  <span className="chiplink" onClick={() => {}}>Ask Sidekick</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "Evidence" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Evidence</span></div>
          <div className="bd">
            <div className="s">{findings.length} evidence changes — each pinned with provenance + identity</div>
          </div>
        </div>
      ) : null}

      {tab === "Sources" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Sources</span></div>
          <div className="bd">
            <div className="row" style={{ flexWrap: "wrap" }}>
              {SOURCES.map((s) => (
                <Pill key={s.label} tone={s.tone}>{s.label}</Pill>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "Changes" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">Changes</span></div>
          <div className="bd">
            <div className="s">what moved, when, and which work it touches</div>
          </div>
        </div>
      ) : null}

      {tab === "History" ? (
        <div className="card">
          <div className="hd"><span className="eyebrow">History</span></div>
          <div className="bd">
            <div className="s">past findings + how they were resolved</div>
          </div>
        </div>
      ) : null}

      <div className="demoflag">Discovery is a first-class Runtime surface — cross-linked to the Workflows and Missions it affects.</div>
    </section>
  );
}
