import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import type { Health } from "../data/types";
import { Pill } from "../components/Pill";
import { useLoad } from "../hooks/useLoad";
import { Loading, LoadError } from "../components/LoadState";

// The source status STRING comes straight from the projection; tone only colours it. Availability is
// never re-derived client-side.
function sourceTone(status: string): Health {
  if (status.startsWith("AVAILABLE")) return status.includes("policy-scoped") ? "run" : "ok";
  return "mut";   // UNAVAILABLE / unverified
}

export function SocialIntel({ client, ask }:
  { client: DataClient; go: (s: Section) => void; ask?: (p: string) => void }) {
  const L = useLoad("social", () => client.getSocialIntelligence("customer-ops"), [client]);
  const data = L.data;
  if (!data) return L.problem ? <LoadError problem={L.problem} onRetry={L.retry} what="Social Intelligence" /> : <Loading what="Loading social intelligence…" />;

  const o = data.opportunities;
  // Rendered verbatim from the projection — complaint ≠ solution-seeking ≠ purchase-intent, and UNKNOWN
  // is its own line, never collapsed into a boolean.
  const counts: { label: string; value: number; tone: Health }[] = [
    { label: "Observations", value: data.observations, tone: "mut" },
    { label: "Problem signals", value: o.problem_signals, tone: "run" },
    { label: "Solution-seeking", value: o.solution_seeking, tone: "run" },
    { label: "Purchase intent", value: o.commercial_intent_evidence, tone: "ok" },
    { label: "Intent unknown", value: o.unknown_commercial_intent, tone: "warn" },
    { label: "Market signals", value: data.market_signals, tone: "mut" },
  ];

  return (
    <section className="content">
      <div className="card">
        <div className="hd">
          <b>{data.mission}</b>
          {data.data_source && <Pill tone="mut">{data.data_source.startsWith("fixture") ? "demo corpus" : "live"}</Pill>}
        </div>
        <div className="bd">
          <div className="t" style={{ marginTop: 8 }}>Providers</div>
          {data.sources.map((s, i) => (
            <div className="row" key={i}>
              <div className="grow"><div className="t">{s.source}</div></div>
              <Pill tone={sourceTone(s.status)}>{s.status}</Pill>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd"><b>Signals</b><span className="s" style={{ marginLeft: "auto" }}>a complaint is not solution-seeking; solution-seeking is not purchase intent</span></div>
        <div className="bd">
          {counts.map((c, i) => (
            <div className="row" key={i}>
              <div className="grow"><div className="t">{c.label}</div></div>
              <Pill tone={c.tone}>{c.value}</Pill>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd"><b>Next</b></div>
        <div className="bd">
          <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
            {ask && <button className="btn sm pri" onClick={() => ask("Draft useful replies to the solution-seeking discussions")}>Draft response</button>}
            {ask && <button className="btn sm" onClick={() => ask("Create a content mission from the recurring market signal")}>Create mission</button>}
            {ask && <button className="btn sm" onClick={() => ask("Track the recurring topic across sources")}>Track topic</button>}
          </div>
          {data.proposed_actions.length > 0 && (
            <div className="s" style={{ marginTop: 8 }}>Suggested: {data.proposed_actions.join(" · ")}</div>
          )}
        </div>
      </div>
    </section>
  );
}
