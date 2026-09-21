import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import type { DeploymentInspection, DeploymentFinding, GovernedActionView, Health } from "../data/types";
import { Pill } from "../components/Pill";

// Presentation-only tone maps. The LABEL rendered is always the projection's own string — these only
// pick a colour. The card never re-derives severity, approval, verification or provider state.
const SEV_TONE: Record<string, Health> = { critical: "bad", high: "bad", medium: "warn", low: "run" };
const APPROVAL_TONE: Record<string, Health> = { authorized: "ok", pending: "warn", denied: "bad" };
const VERIFY_TONE: Record<string, Health> = { verified: "ok", abstained: "warn", refuted: "bad", "n/a": "mut" };
const RECEIPT_TONE: Record<string, Health> = { SUCCEEDED: "ok", HELD: "warn", FAILED: "bad" };
const tone = (m: Record<string, Health>, k: string): Health => m[k] ?? "mut";

const SEV_ORDER = ["critical", "high", "medium", "low"];

export function Inspection({ client, ask }:
  { client: DataClient; go: (s: Section) => void; ask?: (p: string) => void }) {
  const [data, setData] = useState<DeploymentInspection | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    client.getDeploymentInspection("customer-ops").then(setData).catch((e) => setErr(String(e)));
  }, [client]);

  if (err) return <section className="content"><div className="placeholder">Couldn't load the inspection — {err}</div></section>;
  if (!data) return <section className="content"><div className="placeholder">Inspecting live deployment…</div></section>;

  const groups = SEV_ORDER.filter((s) => data.findings_by_severity[s]?.length);

  return (
    <section className="content">
      {/* target + connection + the explicit live/simulated boundary */}
      <div className="card">
        <div className="hd">
          <b>{data.mission}</b>
          <Pill tone={data.connected ? "ok" : "bad"}>{data.connected ? "connected" : "unreachable"}</Pill>
          <span className="mono s" style={{ marginLeft: "auto" }}>{data.target}</span>
        </div>
        <div className="bd">
          <div className="row">
            <div className="grow">
              <div className="t">Boundary</div>
              <div className="s">Inspection: <b>{data.boundary.inspection}</b> · Remediation: <b>{data.boundary.remediation}</b></div>
            </div>
            <Pill tone={data.boundary.inspection === "live" ? "run" : "mut"}>
              {data.boundary.inspection === "live" ? "live infra · read-only" : "fixture"}
            </Pill>
          </div>
          {data.kpis.length > 0 && (
            <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
              {data.kpis.map((k, i) => (
                <span key={i} className="pill mut"><span className="dot" />{k.label}: <b style={{ marginLeft: 4 }}>{k.value}</b></span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* findings grouped by the projection's own severity buckets */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd"><b>Findings</b><Pill tone="mut">{data.finding_count} total</Pill></div>
        <div className="bd">
          {data.finding_count === 0 && <div className="s" style={{ padding: "10px 0" }}>No findings — deployment posture is clean.</div>}
          {groups.map((sev) => (
            <div key={sev}>
              {data.findings_by_severity[sev].map((f: DeploymentFinding, i) => (
                <div className="row" key={`${sev}-${i}`}>
                  <div className="grow">
                    <div className="t">{f.kind} <span className="s">· {f.source}</span></div>
                    <div className="s">{f.detail}</div>
                    <div className="s mono" style={{ fontSize: 11 }}>{f.evidence_ref}</div>
                  </div>
                  <Pill tone={tone(SEV_TONE, f.severity)}>{f.severity}</Pill>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* the governed remediation — approval / receipt / verification rendered verbatim */}
      {data.governed_action && <GovernedAction ga={data.governed_action} />}

      {data.proposed_actions.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <div className="hd"><b>Proposed actions</b></div>
          <div className="bd">
            {data.proposed_actions.map((a, i) => (
              <div className="row" key={i}>
                <div className="grow"><div className="t">{a}</div></div>
                {ask && <button className="btn sm" onClick={() => ask(a)}>Ask Sidekick</button>}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function GovernedAction({ ga }: { ga: GovernedActionView }) {
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="hd">
        <b>Governed remediation</b>
        <Pill tone="mut">simulated</Pill>
        <span className="s" style={{ marginLeft: "auto" }}>{ga.capability}</span>
      </div>
      <div className="bd">
        <div className="row">
          <div className="grow"><div className="t">Goal</div><div className="s">{ga.goal}</div></div>
        </div>
        <div className="row">
          <div className="grow"><div className="t">Approval</div><div className="s mono" style={{ fontSize: 11 }}>{ga.approval.decision_id || "—"}</div></div>
          <Pill tone={tone(APPROVAL_TONE, ga.approval.state)}>{ga.approval.state}</Pill>
        </div>
        <div className="row">
          <div className="grow"><div className="t">Receipt</div><div className="s mono" style={{ fontSize: 11 }}>{ga.receipt.receipt_id || "—"}</div></div>
          <Pill tone={tone(RECEIPT_TONE, ga.receipt.status)}>{ga.receipt.status || "—"}</Pill>
        </div>
        <div className="row">
          <div className="grow"><div className="t">Verification</div><div className="s">provider claim vs observed outcome</div></div>
          <Pill tone={tone(VERIFY_TONE, ga.verification)}>{ga.verification || "—"}</Pill>
        </div>
        {ga.evidence_refs.length > 0 && (
          <div className="row">
            <div className="grow"><div className="t">Evidence</div>
              <div className="s mono" style={{ fontSize: 11 }}>{ga.evidence_refs.join(", ")}</div></div>
          </div>
        )}
      </div>
    </div>
  );
}
