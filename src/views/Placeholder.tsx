// Titled placeholders for sections that port from the prototype next (P2–P8). The shell,
// nav, projections and Sidekick are P1; these keep navigation whole meanwhile.
const COPY: Record<string, { eyebrow: string; title: string; note: string }> = {
  missions: { eyebrow: "One governed execution of a workflow", title: "Missions", note: "P2 — Mission list + detail (Summary · Tasks · Evidence · Timeline · Graph · World State · EXPLAIN · Replay), from getMissions()." },
  workflows: { eyebrow: "Reusable operating patterns", title: "Workflows", note: "P5 — list + detail (Overview · Steps · Apps · Policy · Schedule · Runs) with per-step capability/provider/authority/verification, from getWorkflows()." },
  attention: { eyebrow: "Everything the system can't resolve without you", title: "Attention", note: "P3 — the cross-runtime AttentionItem queue, from getAttention()." },
  discovery: { eyebrow: "What the system found, changed, inferred or flagged", title: "Discovery", note: "P6 — findings + evidence cross-linked to Workflows and Missions, from getDiscovery()." },
  apps: { eyebrow: "Connected capabilities", title: "Apps", note: "P4 — setup cards rendering ProviderSetupGuide + SetupState + broker credential flow + verify_setup, from getApps()." },
  activity: { eyebrow: "Projection of the event ledger across Runtimes", title: "Activity", note: "P8 — cross-runtime event stream with filters, from getActivity()." },
  settings: { eyebrow: "Project-level durable configuration", title: "Settings", note: "General · Members · Authority · Models · Security · Retention." },
};

export function Placeholder({ section }: { section: string }) {
  const c = COPY[section] ?? { eyebrow: "", title: section, note: "" };
  return (
    <section className="content">
      <div><div className="eyebrow">{c.eyebrow}</div><h1 className="h">{c.title}</h1></div>
      <div className="card"><div className="bd" style={{ paddingTop: 14 }}>
        <p className="placeholder">{c.note}</p>
        <p className="placeholder" style={{ marginTop: 8 }}>Ask Sidekick from here — it already carries this section as context.</p>
      </div></div>
    </section>
  );
}
