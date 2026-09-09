import { Pill } from "../components/Pill";
import type { Section } from "../components/Rail";
import type { ProjectOverview, WorkflowState } from "../data/types";

const WF_TONE: Record<WorkflowState, "run" | "mut"> = { active: "run", scheduled: "run", paused: "mut" };

export function Overview({ data, go }: { data: ProjectOverview; go: (s: Section) => void }) {
  return (
    <section className="content">
      <div><div className="eyebrow">{data.project.name} · live</div>
        <h1 className="h">What's happening across the whole Project</h1></div>

      <div className="grid2">
        <div className="card">
          <div className="hd"><Pill tone="warn">Needs you</Pill><span className="eyebrow" style={{ marginLeft: "auto" }}>{data.attention.length}</span></div>
          <div className="bd">
            {data.attention.map((a) => (
              <div className="row" key={a.id}>
                <div className="grow"><div className="t">{a.title}</div><div className="s">{a.reason}</div></div>
                <button className="btn sm pri" onClick={() => go(a.kind === "reconnect" ? "apps" : a.kind === "discovery_review" ? "discovery" : "attention")}>
                  {a.available_actions[0] ?? "Review"}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="hd"><span className="eyebrow">Active missions</span>
            <span style={{ marginLeft: "auto" }}><Pill tone="run">{data.missions.filter((m) => m.state === "running").length} running</Pill></span></div>
          <div className="bd">
            {data.missions.filter((m) => m.state !== "completed").slice(0, 3).map((m) => (
              <div className="row" key={m.id}>
                <div className="grow"><div className="t">{m.title}</div><div className="s">{m.workflow}</div></div>
                {m.state === "needs" ? <Pill tone="warn">Approval</Pill> : <span className="s tnum">{m.progress}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="hd"><span className="eyebrow">Workflows</span><button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => go("workflows")}>Open</button></div>
          <div className="bd">
            {data.workflows.map((w) => (
              <div className="row" key={w.id}>
                <div className="grow"><div className="t">{w.name}</div><div className="s">{w.runsNote}</div></div>
                <Pill tone={WF_TONE[w.state]}>{w.state[0].toUpperCase() + w.state.slice(1)}</Pill>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="hd"><span className="eyebrow">Discovery</span><button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => go("discovery")}>Open</button></div>
          <div className="bd">
            {data.discovery.slice(0, 2).map((d) => (
              <div className="row" key={d.id}>
                <div className="grow"><div className="t">{d.title}</div><div className="s">{d.detail}</div></div>
                {d.needsReview ? <Pill tone="warn">Review</Pill> : <Pill tone="mut">Noted</Pill>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="hd"><span className="eyebrow">Connected apps</span><button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => go("apps")}>Manage</button></div>
        <div className="bd">
          <div className="row" style={{ flexWrap: "wrap" }}>
            {data.apps.map((a) => (
              <Pill key={a.provider} tone={a.health}>{a.display_name}{a.health === "mut" ? " · not connected" : ""}</Pill>
            ))}
          </div>
        </div>
      </div>

      <div className="demoflag">Overview composes projections across Missions · Workflows · Discovery · Apps — example data via the mock Projects API client.</div>
    </section>
  );
}
