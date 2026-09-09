import { useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import { Pill } from "../components/Pill";

// Settings — project-level durable configuration. No Runtime projection to load; these are
// the project's standing policy facts. Kept on the same ({ client, go }) prop signature as
// every other view so App can route to it uniformly, though it consumes neither.
const TABS = ["General", "Members", "Authority", "Models", "Security", "Retention"] as const;
type Tab = (typeof TABS)[number];

export function Settings(_props: { client: DataClient; go: (s: Section) => void }) {
  const [tab, setTab] = useState<Tab>("General");

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Project-level durable configuration</div>
        <h1 className="h">Settings</h1>
      </div>

      <div className="tabsrow">
        {TABS.map((t) => (
          <button key={t} aria-selected={t === tab} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      <div className="card">
        <div className="hd"><span className="eyebrow">{tab}</span></div>
        <div className="bd">
          {tab === "General" && (
            <>
              <div className="row">
                <div className="grow"><div className="t">Project</div></div>
                <div className="s">Customer Operations</div>
              </div>
              <div className="row">
                <div className="grow"><div className="t">Approval policy</div>
                  <div className="s">Refunds require approval · outreach bounded</div></div>
                <Pill tone="ok">Active</Pill>
              </div>
            </>
          )}

          {tab === "Members" && (
            <div className="row">
              <div className="grow">2 admins · 1 operator — maker ≠ checker on consequential actions</div>
            </div>
          )}

          {tab === "Authority" && (
            <div className="row">
              <div className="grow">Per-capability authority envelopes · kill switch · autonomy progression.</div>
            </div>
          )}

          {tab === "Models" && (
            <div className="row">
              <div className="grow">Adaptive model · local-first where possible.</div>
            </div>
          )}

          {tab === "Security" && (
            <div className="row">
              <div className="grow"><div className="t">Credential broker</div>
                <div className="mono s">secret:// · keys never enter chat, logs, or model context</div></div>
              <Pill tone="ok">Secured</Pill>
            </div>
          )}

          {tab === "Retention" && (
            <div className="row">
              <div className="grow">Immutable event ledger · content-addressed evidence · retention policy.</div>
            </div>
          )}
        </div>
      </div>

      <div className="demoflag">Durable project configuration — example values in this standalone build.</div>
    </section>
  );
}
