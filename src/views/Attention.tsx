import { useEffect, useState } from "react";
import { Pill } from "../components/Pill";
import type { Section } from "../components/Rail";
import type { DataClient } from "../data/client";
import type { AttentionItem, AttentionKind, Health } from "../data/types";

// P3 — one cross-Runtime "what needs me" queue. Every item is an AttentionItem projection
// (source_ref · kind · consequence · actions), grouped by kind into cards. Projects renders
// the truth the Runtimes surfaced; the action buttons route the user to where they resolve it.

type GroupKey = "approval" | "reconnect" | "clarification";

const GROUPS: { key: GroupKey; tone: Health; label: string; kinds: AttentionKind[] }[] = [
  { key: "approval", tone: "warn", label: "Approvals · Governance", kinds: ["approval"] },
  { key: "reconnect", tone: "bad", label: "Connectors", kinds: ["reconnect"] },
  { key: "clarification", tone: "mut", label: "Discovery · Clarifications",
    kinds: ["discovery_review", "clarification", "unmatched_identity"] },
];

// Where an item's primary action takes the user.
function destination(kind: AttentionKind): Section | null {
  if (kind === "reconnect") return "apps";
  if (kind === "discovery_review") return "discovery";
  if (kind === "approval") return "missions";
  return null; // clarification / unmatched_identity — no-op for now
}

export function Attention({ client, go }: { client: DataClient; go: (s: Section) => void }) {
  const [items, setItems] = useState<AttentionItem[] | null>(null);

  useEffect(() => {
    let live = true;
    client.getAttention("customer-ops").then((a) => { if (live) setItems(a); });
    return () => { live = false; };
  }, [client]);

  if (!items) return <section className="content">Loading…</section>;

  return (
    <section className="content">
      <div>
        <div className="eyebrow">Everything the system can't or shouldn't resolve without you</div>
        <h1 className="h">Attention</h1>
      </div>

      {GROUPS.map((g) => {
        const group = items
          .filter((it) => g.kinds.includes(it.kind))
          .sort((a, b) => b.priority - a.priority);
        if (group.length === 0) return null;
        return (
          <div className="card" key={g.key}>
            <div className="hd">
              <Pill tone={g.tone}>{g.label}</Pill>
              <span className="eyebrow" style={{ marginLeft: "auto" }}>{group.length}</span>
            </div>
            <div className="bd">
              {group.map((it) => {
                const dest = destination(it.kind);
                return (
                  <div className="row" key={it.id}>
                    <div className="grow">
                      <div className="t">{it.title}</div>
                      <div className="s">{it.reason} · {it.consequence}</div>
                    </div>
                    <button className="btn sm pri" onClick={() => { if (dest) go(dest); }}>
                      {it.available_actions[0] ?? "Review"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="demoflag">One queue, many Runtimes — each item is an AttentionItem (source_ref · kind · consequence · actions).</div>
    </section>
  );
}
