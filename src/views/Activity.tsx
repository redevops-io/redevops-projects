import { useEffect, useState } from "react";
import type { DataClient } from "../data/client";
import type { Section } from "../components/Rail";
import type { ActivityEvent, SourceRuntime } from "../data/types";

// The Activity view (P8) renders the event ledger projected across Runtimes. Each event
// carries its source_runtime provenance, so the filter row is a lens onto one Runtime's
// contribution to the shared, immutable ledger — never a separate store.
type Filter = "all" | SourceRuntime;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mission", label: "Missions" },
  { id: "discovery", label: "Discovery" },
  { id: "connector", label: "Apps" },
  { id: "governance", label: "Governance" },
];

export function Activity({ client }: { client: DataClient; go: (s: Section) => void }) {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    client.getActivity("customer-ops").then(setEvents);
  }, [client]);

  if (!events) {
    return (
      <section className="content"><div className="placeholder">Loading…</div></section>
    );
  }

  const shown = filter === "all" ? events : events.filter((e) => e.source_runtime === filter);

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Projection of the event ledger across Runtimes</div>
        <h1 className="h">Activity</h1>
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
          {shown.length === 0 ? <div className="placeholder">No events for this Runtime.</div> : shown.map((e) => (
            <div className="row" key={e.id}>
              <div className="mono s" style={{ width: 56 }}>{e.time}</div>
              <div className="grow">{e.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="demoflag">One immutable ledger; each filter is a lens onto a Runtime's contribution — example data via the mock Projects API client.</div>
    </section>
  );
}
